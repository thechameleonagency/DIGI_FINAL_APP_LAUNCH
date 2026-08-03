import type { CustomerSale, CustomerSalePaymentMode, PharmacyInventoryItem } from '../../../domain/entities/types';
import { nowIso } from '../../../domain/utils/clock';
import { db } from '../../db';
import {
  assignSaleToRoute,
  updateRouteStopStatus,
  upsertDeliveryArea,
  upsertPharmacyRoute,
} from '../../../services/pharmacyDeliveryService';
import {
  collectCustomerSalePayment,
  createCustomerSale,
  returnCustomerSaleLines,
  saleCreditOutstanding,
  voidCustomerSale,
} from '../../../services/salesService';
import { assertOk } from '../assert';
import { advanceBusinessDay, advanceDays } from '../chronology';
import { CAST } from '../cast';
import { getWorldCtx, type TraderParty } from '../context';

const PAY_MODES: CustomerSalePaymentMode[] = ['Cash', 'UPI', 'Credit', 'Cash', 'UPI', 'Credit', 'UPI', 'Cash'];

const CUSTOMERS = [
  'Walk-in Customer',
  'Ravi Patel',
  'Meena Shah',
  'Arjun Desai',
  'Sunita Iyer',
  'Kabir Khan',
  'Pooja Nair',
  'Imran Sheikh',
  'Latika Bose',
  'Home Delivery — Farhan',
  'Home Delivery — Kavita',
  'Home Delivery — Yusuf',
  'Credit Account — Gupta Clinic',
  'Credit Account — City Care',
  'Sneha More',
];

function unitPriceFor(item: PharmacyInventoryItem, i: number): number {
  const base = 18 + (i % 7) * 3.5;
  return Math.round(base * 100) / 100;
}

function pinsForPharmacy(party: TraderParty): string[] {
  const cast =
    party.key === 'pharmacyA'
      ? CAST.pharmacyA
      : party.key === 'pharmacyB'
        ? CAST.pharmacyB
        : party.key === 'pharmacyC'
          ? CAST.pharmacyC
          : undefined;
  const primary = cast?.site.pincode ?? party.business.pincode ?? '400001';
  const n = Number(primary);
  if (!Number.isFinite(n)) return [primary];
  return [primary, String(n + 1).padStart(6, '0'), String(n + 2).padStart(6, '0')];
}

async function sellableInventory(pharmacyId: string): Promise<PharmacyInventoryItem[]> {
  const today = nowIso().slice(0, 10);
  return (await db.pharmacyInventory.where('pharmacyId').equals(pharmacyId).toArray()).filter(
    (item) => item.onHand > 0 && (!item.expiryDate || item.expiryDate.slice(0, 10) > today),
  );
}

async function seedSalesForPharmacy(party: TraderParty, salesTarget: number): Promise<CustomerSale[]> {
  const created: CustomerSale[] = [];
  let inv = await sellableInventory(party.business.id);
  if (!inv.length) return created;

  for (let i = 0; i < salesTarget && inv.length; i++) {
    if (i % 4 === 0) advanceBusinessDay();
    else if (i % 7 === 3) advanceDays(1);

    inv = await sellableInventory(party.business.id);
    if (!inv.length) break;

    const item = inv[i % inv.length]!;
    const qty = Math.min(item.onHand, 1 + (i % 2));
    if (qty <= 0) continue;

    const paymentMode = PAY_MODES[i % PAY_MODES.length]!;
    const homeDelivery = i % 3 !== 0; // ~2/3 HD so board has work; rest walk-in
    const customerName = CUSTOMERS[i % CUSTOMERS.length]!;
    const phone =
      paymentMode === 'Credit' || homeDelivery
        ? `98${String(10000000 + (i * 17 + party.key.length * 100) % 89999999).padStart(8, '0')}`
        : undefined;

    const sale = assertOk(
      `08-sale.create.${party.key}.${i}`,
      await createCustomerSale({
        actor: party.user,
        pharmacy: party.business,
        customerName,
        phone,
        paymentMode,
        homeDelivery,
        address: homeDelivery
          ? `${12 + i} Seed Lane, ${party.business.city ?? 'Mumbai'} ${pinsForPharmacy(party)[0]}`
          : undefined,
        lines: [{ inventoryId: item.id, qty, unitPrice: unitPriceFor(item, i) }],
      }),
    ).data;
    created.push(sale);
  }
  return created;
}

async function seedDeliveryOps(party: TraderParty, sales: CustomerSale[]): Promise<void> {
  if (!party.delivery) {
    throw new Error(`[worldSeed:08] delivery staff missing for ${party.key}`);
  }

  const area = assertOk(
    `08-area.${party.key}`,
    await upsertDeliveryArea({
      actor: party.user,
      pharmacy: party.business,
      name: `${party.business.city ?? 'City'} North Zone`,
      pins: pinsForPharmacy(party),
    }),
  ).data;

  const route = assertOk(
    `08-route.${party.key}`,
    await upsertPharmacyRoute({
      actor: party.user,
      pharmacy: party.business,
      name: `${party.key} Morning Route`,
      areaId: area.id,
      assigneeUserId: party.delivery.id,
    }),
  ).data;

  const hdSales = sales.filter((s) => s.homeDelivery && s.status === 'Completed');
  // Leave ~30% unassigned for the delivery board
  const toAssign = hdSales.filter((_, i) => i % 3 !== 2);

  for (let i = 0; i < toAssign.length; i++) {
    const sale = toAssign[i]!;
    assertOk(
      `08-assign.${party.key}.${i}`,
      await assignSaleToRoute({
        actor: party.user,
        pharmacy: party.business,
        saleId: sale.id,
        routeId: route.id,
      }),
    );
  }

  const freshRoute = (await db.pharmacyRoutes.get(route.id))!;
  const pending = freshRoute.stops.filter((s) => s.status === 'Pending');

  for (let i = 0; i < pending.length; i++) {
    const stop = pending[i]!;
    advanceDays(i % 2 === 0 ? 0 : 1);
    if (i === 1) {
      // One failed stop → returns to Unassigned pool
      assertOk(
        `08-stop.fail.${party.key}`,
        await updateRouteStopStatus({
          actor: party.delivery,
          pharmacy: party.business,
          routeId: route.id,
          saleId: stop.saleId,
          status: 'Failed',
          failReason: 'Customer not available — seed probe',
        }),
      );
      continue;
    }
    if (i === pending.length - 1 && pending.length > 3) {
      // Leave the last stop Pending on the route
      break;
    }
    assertOk(
      `08-stop.delivered.${party.key}.${i}`,
      await updateRouteStopStatus({
        actor: party.delivery,
        pharmacy: party.business,
        routeId: route.id,
        saleId: stop.saleId,
        status: 'Delivered',
      }),
    );
  }
}

async function seedSaleMutations(party: TraderParty, sales: CustomerSale[]): Promise<void> {
  const walkIn = sales.find((s) => !s.homeDelivery && s.paymentMode !== 'Credit' && s.status === 'Completed');
  if (walkIn) {
    advanceBusinessDay();
    assertOk(
      `08-void.${party.key}`,
      await voidCustomerSale({
        actor: party.user,
        pharmacy: party.business,
        saleId: walkIn.id,
        reason: 'Wrong customer / duplicate entry — seed void',
      }),
    );
  }

  const returnable = sales.find(
    (s) =>
      s.id !== walkIn?.id &&
      s.status === 'Completed' &&
      !s.homeDelivery &&
      s.lines.some((l) => l.qty - l.returnedQty >= 1),
  );
  if (returnable) {
    const line = returnable.lines.find((l) => l.qty - l.returnedQty >= 1)!;
    advanceBusinessDay();
    assertOk(
      `08-return.${party.key}`,
      await returnCustomerSaleLines({
        actor: party.user,
        pharmacy: party.business,
        saleId: returnable.id,
        returns: [{ productRef: line.productRef, qty: 1 }],
        reason: 'Customer changed mind — seed return',
      }),
    );
  }

  const credit = sales.find((s) => s.paymentMode === 'Credit' && s.status === 'Completed');
  if (credit) {
    const live = (await db.customerSales.get(credit.id))!;
    const due = saleCreditOutstanding(live);
    if (due > 0) {
      advanceBusinessDay();
      const partial = Math.round(Math.min(due * 0.5, due) * 100) / 100;
      assertOk(
        `08-collect.${party.key}`,
        await collectCustomerSalePayment({
          actor: party.user,
          pharmacy: party.business,
          saleId: live.id,
          amount: Math.max(0.01, partial),
          note: 'Partial collection — seed',
        }),
      );
    }
  }
}

/** Phase 8 — Pharmacy retail & customer delivery (Session D). */
export async function seedRetailDeliveryPhase(): Promise<void> {
  const pharmacies = getWorldCtx().pharmacies.filter((p) => p.business.accountStatus === 'Active');
  const allSales: { party: TraderParty; sales: CustomerSale[] }[] = [];

  // Spread ~45 sales across pharmacies with GRN stock
  const withStock: TraderParty[] = [];
  for (const party of pharmacies) {
    const inv = await sellableInventory(party.business.id);
    if (inv.length) withStock.push(party);
  }
  if (!withStock.length) {
    throw new Error('[worldSeed:08] no pharmacy inventory after GRN — cannot seed retail');
  }

  const perPharmacy = Math.max(14, Math.ceil(45 / withStock.length));
  for (const party of withStock) {
    advanceBusinessDay();
    const sales = await seedSalesForPharmacy(party, perPharmacy);
    allSales.push({ party, sales });
  }

  for (const { party, sales } of allSales) {
    await seedSaleMutations(party, sales);
  }

  for (const { party, sales } of allSales) {
    advanceBusinessDay();
    await seedDeliveryOps(party, sales);
  }
}

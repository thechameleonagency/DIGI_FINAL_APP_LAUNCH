import type { Address } from '../../../domain/entities/types';
import { machines } from '../../../domain/machines/transitions';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { db } from '../../db';
import { setCartLine } from '../../../services/catalogueService';
import { updateConnectionCreditTerms } from '../../../services/connectionService';
import { placeOrder } from '../../../services/orderService';
import { updatePlatformSettings } from '../../../services/platformSettingsService';
import {
  createPurchaseOrder,
  receivePurchaseOrder,
  transitionPurchaseOrder,
  upsertSupplier,
} from '../../../services/procurementService';
import { reactivateBusiness, suspendBusiness } from '../../../services/verificationService';
import { assertOk } from '../assert';
import { advanceBusinessDay } from '../chronology';
import { getWorldCtx, pharmacyByKey, requireAdmin, stockistByKey } from '../context';

function deliveryAddress(pharmacyId: string, fallback: Address): Promise<Address> {
  return db.businesses.get(pharmacyId).then((biz) => {
    const saved = biz?.deliveryAddresses?.find((a) => a.isDefault) ?? biz?.deliveryAddresses?.[0];
    if (saved) return saved;
    return fallback;
  });
}

/** Phase 11 — Edge / gate stress (Session D). Expect failures; leave world consistent. */
export async function seedEdgeCasesPhase(): Promise<void> {
  const { user: admin, business: platform } = requireAdmin();
  const pharmacyA = pharmacyByKey('pharmacyA');
  const stockistA = stockistByKey('stockistA');
  const ctx = getWorldCtx();

  // --- DeliveryStaff cannot placeOrder ---
  if (!pharmacyA.delivery) {
    throw new Error('[worldSeed:11] pharmacyA delivery staff missing');
  }
  {
    const deny = await placeOrder({
      actor: pharmacyA.delivery,
      pharmacy: pharmacyA.business,
      stockistId: stockistA.business.id,
      address: await deliveryAddress(pharmacyA.business.id, {
        id: 'seed-addr',
        label: 'Shop',
        line1: pharmacyA.business.address,
        city: pharmacyA.business.city,
        state: pharmacyA.business.state,
        pincode: pharmacyA.business.pincode,
        isDefault: true,
      }),
      idempotencyKey: makeIdempotencyKey('world-edge-delivery-place', pharmacyA.delivery.id),
    });
    if (deny.ok) {
      throw new Error('[worldSeed:11-delivery-place] expected DeliveryStaff placeOrder to fail');
    }
  }

  // --- Quarantined batch receive deny ---
  {
    const quarantined = await db.batches
      .where('stockistId')
      .equals(stockistA.business.id)
      .filter((b) => b.status === 'Quarantined')
      .first();
    if (quarantined) {
      let supplier = await db.suppliers.where('stockistId').equals(stockistA.business.id).first();
      if (!supplier) {
        supplier = assertOk(
          '11-q.supplier',
          await upsertSupplier({
            actor: stockistA.user,
            stockist: stockistA.business,
            name: 'Edge Probe Supplier',
            contact: '9899900099',
          }),
        ).data;
      }
      const po = assertOk(
        '11-q.po',
        await createPurchaseOrder({
          actor: stockistA.user,
          stockist: stockistA.business,
          supplierId: supplier.id,
          lines: [{ productId: quarantined.productId, qty: 5, expectedCost: 9 }],
        }),
      ).data;
      assertOk(
        '11-q.sent',
        await transitionPurchaseOrder({
          actor: stockistA.user,
          stockist: stockistA.business,
          poId: po.id,
          to: 'Sent',
        }),
      );
      const denied = await receivePurchaseOrder({
        actor: stockistA.user,
        stockist: stockistA.business,
        poId: po.id,
        lines: [
          {
            productId: quarantined.productId,
            qty: 1,
            batchNumber: quarantined.batchNumber,
            expiryDate: quarantined.expiryDate.slice(0, 10),
            cost: 9,
          },
        ],
      });
      if (denied.ok) {
        throw new Error('[worldSeed:11-quarantine-recv] expected receive into Quarantined batch to fail');
      }
      // Leave PO Sent (consistent) — do not receive with a different batch here
    }
  }

  // --- Credit over-limit placeOrder deny ---
  {
    const conn = [...ctx.connections.values()].find(
      (c) => c.pharmacyId === pharmacyA.business.id && c.stockistId === stockistA.business.id && c.status === 'Active',
    );
    if (conn) {
      const prevDays = conn.creditDays ?? 30;
      const prevLimit = conn.creditLimit ?? 200_000;
      assertOk(
        '11-credit.lower',
        await updateConnectionCreditTerms({
          actor: stockistA.user,
          stockist: stockistA.business,
          connectionId: conn.id,
          creditDays: prevDays,
          creditLimit: 1,
          reason: 'Seed probe — temporarily clamp credit limit',
        }),
      );

      const productIds = ctx.productIdsByStockist.get(stockistA.business.id) ?? [];
      const product = (await db.products.bulkGet(productIds)).find((p) => p && p.status === 'Active');
      if (product) {
        assertOk(
          '11-credit.cart',
          await setCartLine({
            actor: pharmacyA.user,
            pharmacy: pharmacyA.business,
            stockistId: stockistA.business.id,
            productId: product.id,
            qty: Math.max(product.moq ?? 1, 10),
          }),
        );
        const over = await placeOrder({
          actor: pharmacyA.user,
          pharmacy: pharmacyA.business,
          stockistId: stockistA.business.id,
          address: await deliveryAddress(pharmacyA.business.id, {
            id: 'seed-addr-2',
            label: 'Shop',
            line1: pharmacyA.business.address,
            city: pharmacyA.business.city,
            state: pharmacyA.business.state,
            pincode: pharmacyA.business.pincode,
            isDefault: true,
          }),
          paymentMode: 'Credit',
          idempotencyKey: makeIdempotencyKey('world-edge-credit-over', pharmacyA.user.id),
        });
        if (over.ok) {
          throw new Error('[worldSeed:11-credit] expected placeOrder over credit limit to fail');
        }
      }

      assertOk(
        '11-credit.restore',
        await updateConnectionCreditTerms({
          actor: stockistA.user,
          stockist: stockistA.business,
          connectionId: conn.id,
          creditDays: prevDays,
          creditLimit: prevLimit > 1 ? prevLimit : 200_000,
          reason: 'Seed probe — restore credit limit after deny check',
        }),
      );
    }
  }

  // --- Credit on Pay-First-only connection must fail ORD_NOT_CIRCLE ---
  {
    const pharmacyB = pharmacyByKey('pharmacyB');
    const stockistB = stockistByKey('stockistB');
    const productIds = ctx.productIdsByStockist.get(stockistB.business.id) ?? [];
    const product = (await db.products.bulkGet(productIds)).find((p) => p && p.status === 'Active');
    if (product) {
      assertOk(
        '11-notCircle.cart',
        await setCartLine({
          actor: pharmacyB.user,
          pharmacy: pharmacyB.business,
          stockistId: stockistB.business.id,
          productId: product.id,
          qty: Math.max(product.moq ?? 1, 1),
        }),
      );
      const denied = await placeOrder({
        actor: pharmacyB.user,
        pharmacy: pharmacyB.business,
        stockistId: stockistB.business.id,
        address: await deliveryAddress(pharmacyB.business.id, {
          id: 'seed-addr-not-circle',
          label: 'Shop',
          line1: pharmacyB.business.address,
          city: pharmacyB.business.city,
          state: pharmacyB.business.state,
          pincode: pharmacyB.business.pincode,
          isDefault: true,
        }),
        paymentMode: 'Credit',
        idempotencyKey: makeIdempotencyKey('world-edge-not-circle', pharmacyB.user.id),
      });
      if (denied.ok) {
        throw new Error('[worldSeed:11-notCircle] expected Credit on Pay-First connection to fail');
      }
      if (!denied.ok && denied.code !== 'ORD_NOT_CIRCLE') {
        throw new Error(`[worldSeed:11-notCircle] expected ORD_NOT_CIRCLE, got ${denied.code}`);
      }
    }
  }

  // --- Maintenance mode on → placeOrder fail → off ---
  advanceBusinessDay();
  {
    const productIds = ctx.productIdsByStockist.get(stockistA.business.id) ?? [];
    const product = (await db.products.bulkGet(productIds)).find((p) => p && p.status === 'Active');
    if (product) {
      assertOk(
        '11-maint.cart',
        await setCartLine({
          actor: pharmacyA.user,
          pharmacy: pharmacyA.business,
          stockistId: stockistA.business.id,
          productId: product.id,
          qty: Math.max(product.moq ?? 1, 1),
        }),
      );
    }
  }
  assertOk(
    '11-maint.on',
    await updatePlatformSettings({
      actor: admin,
      adminBusiness: platform,
      patch: { maintenanceMode: true },
    }),
  );
  {
    const blocked = await placeOrder({
      actor: pharmacyA.user,
      pharmacy: pharmacyA.business,
      stockistId: stockistA.business.id,
      address: await deliveryAddress(pharmacyA.business.id, {
        id: 'seed-addr-3',
        label: 'Shop',
        line1: pharmacyA.business.address,
        city: pharmacyA.business.city,
        state: pharmacyA.business.state,
        pincode: pharmacyA.business.pincode,
        isDefault: true,
      }),
      idempotencyKey: makeIdempotencyKey('world-edge-maint', pharmacyA.user.id),
    });
    if (blocked.ok) {
      throw new Error('[worldSeed:11-maint] expected placeOrder under maintenance to fail');
    }
  }
  assertOk(
    '11-maint.off',
    await updatePlatformSettings({
      actor: admin,
      adminBusiness: platform,
      patch: { maintenanceMode: false },
    }),
  );

  // --- Suspend then reactivate pending pharmacy (preserve cast logins) ---
  const pending = ctx.pendingPharmacy;
  if (pending) {
    advanceBusinessDay();
    assertOk(
      '11-suspend.pending',
      await suspendBusiness({
        actor: admin,
        adminBusiness: platform,
        targetBusinessId: pending.business.id,
        reason: 'Seed probe — temporary suspend of pending pharmacy',
      }),
    );
    advanceBusinessDay();
    assertOk(
      '11-reactivate.pending',
      await reactivateBusiness({
        actor: admin,
        adminBusiness: platform,
        targetBusinessId: pending.business.id,
      }),
    );
    const refreshed = await db.businesses.get(pending.business.id);
    if (refreshed) {
      pending.business = refreshed;
      ctx.pendingPharmacy = pending;
    }
  }

  // --- Illegal machine probes (no DB writes) ---
  const probes: { ok: boolean }[] = [
    machines.order('Delivered', 'Pending'),
    machines.order('Cancelled', 'Accepted'),
    machines.payment('Approved', 'Submitted'),
    machines.invoice('Paid', 'Issued'),
    machines.batch('Recalled', 'Available'),
    machines.ticket('Closed', 'Open'),
    machines.connection('Cancelled', 'Active'),
  ];
  for (const p of probes) {
    if (p.ok) {
      throw new Error('[worldSeed:11-machines] expected illegal transition probe to fail');
    }
  }

  // Sanity: maintenance remains off
  const settings = await db.platformSettings.get('platform');
  if (settings?.maintenanceMode) {
    throw new Error('[worldSeed:11] maintenanceMode left on after edge probes');
  }
}

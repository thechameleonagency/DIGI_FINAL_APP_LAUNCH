import { nowIso } from '../../../domain/utils/clock';
import { db } from '../../db';
import {
  createPurchaseBill,
  createPurchaseOrder,
  createSupplierReturn,
  listRequiredStock,
  receivePurchaseOrder,
  sendSupplierReturn,
  settleSupplierReturn,
  transitionPurchaseOrder,
  upsertSupplier,
} from '../../../services/procurementService';
import { assertOk } from '../assert';
import { advanceBusinessDay, advanceDays } from '../chronology';
import { getWorldCtx, type TraderParty } from '../context';

function expiryPlusDays(days: number): string {
  const d = new Date(nowIso());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function productIdsFor(stockist: TraderParty): Promise<string[]> {
  const fromCtx = getWorldCtx().productIdsByStockist.get(stockist.business.id) ?? [];
  if (fromCtx.length) {
    const products = (await db.products.bulkGet(fromCtx)).filter((p) => p && p.status === 'Active');
    return products.map((p) => p!.id);
  }
  return (await db.products.where('stockistId').equals(stockist.business.id).toArray())
    .filter((p) => p.status === 'Active')
    .map((p) => p.id);
}

async function seedSuppliers(stockist: TraderParty): Promise<string[]> {
  const names = [
    { name: `${stockist.business.name} Primary Supplier`, contact: '9811100001', gst: '27AABCU9603R1ZM' },
    { name: `${stockist.business.name} Secondary Pharma Co`, contact: '9811100002', gst: '27AACCF5846J1Z8' },
    { name: `${stockist.business.name} Emergency Wholesaler`, contact: '9811100003' },
  ];
  const ids: string[] = [];
  for (let i = 0; i < names.length; i++) {
    advanceBusinessDay();
    const row = names[i]!;
    const sup = assertOk(
      `09-sup.${stockist.key}.${i}`,
      await upsertSupplier({
        actor: stockist.user,
        stockist: stockist.business,
        name: row.name,
        contact: row.contact,
        gst: row.gst,
        terms: i === 0 ? 'Net 30' : 'Net 15',
        active: true,
      }),
    ).data;
    ids.push(sup.id);
  }
  return ids;
}

async function createAndSendPo(
  stockist: TraderParty,
  supplierId: string,
  productIds: string[],
  tag: string,
  lineCount: number,
): Promise<string> {
  const lines = [];
  for (let i = 0; i < lineCount && i < productIds.length; i++) {
    const productId = productIds[(i * 3 + tag.length) % productIds.length]!;
    lines.push({
      productId,
      qty: 10 + ((i + tag.length) % 15),
      expectedCost: 8 + i * 1.25,
    });
  }
  const po = assertOk(
    `09-po.create.${tag}`,
    await createPurchaseOrder({
      actor: stockist.user,
      stockist: stockist.business,
      supplierId,
      lines,
    }),
  ).data;
  advanceDays(1);
  assertOk(
    `09-po.sent.${tag}`,
    await transitionPurchaseOrder({
      actor: stockist.user,
      stockist: stockist.business,
      poId: po.id,
      to: 'Sent',
    }),
  );
  return po.id;
}

async function receiveFull(
  stockist: TraderParty,
  poId: string,
  tag: string,
  opts?: { overReceipt?: boolean },
): Promise<void> {
  const po = (await db.purchaseOrders.get(poId))!;
  const lines = po.lines.map((l, i) => {
    const remaining = Math.max(0, l.qty - l.receivedQty);
    const qty = opts?.overReceipt && i === 0 ? remaining + 3 : remaining;
    return {
      productId: l.productId,
      qty: Math.max(1, qty),
      batchNumber: `PO-${tag}-L${i}`,
      expiryDate: expiryPlusDays(365 + i * 30),
      cost: l.expectedCost,
    };
  });
  assertOk(
    `09-po.recv.${tag}`,
    await receivePurchaseOrder({
      actor: stockist.user,
      stockist: stockist.business,
      poId,
      lines,
      confirmOverReceipt: opts?.overReceipt,
    }),
  );
}

async function receivePartialThenFull(stockist: TraderParty, poId: string, tag: string): Promise<void> {
  const po = (await db.purchaseOrders.get(poId))!;
  const first = po.lines[0]!;
  const half = Math.max(1, Math.floor(first.qty / 2));
  advanceDays(1);
  assertOk(
    `09-po.partial.${tag}`,
    await receivePurchaseOrder({
      actor: stockist.user,
      stockist: stockist.business,
      poId,
      lines: [
        {
          productId: first.productId,
          qty: half,
          batchNumber: `PO-${tag}-PART`,
          expiryDate: expiryPlusDays(400),
          cost: first.expectedCost,
        },
      ],
    }),
  );
  advanceDays(2);
  await receiveFull(stockist, poId, `${tag}-rest`);
}

async function seedBillsAndReturns(
  stockist: TraderParty,
  supplierId: string,
  poIds: string[],
  tag: string,
): Promise<void> {
  advanceBusinessDay();
  const amount = 5_000 + poIds.length * 1_250;
  assertOk(
    `09-bill.${tag}`,
    await createPurchaseBill({
      actor: stockist.user,
      stockist: stockist.business,
      supplierId,
      billNo: `PB-${tag}-${poIds.length}`,
      date: nowIso().slice(0, 10),
      amount,
      poIds,
      notes: 'World seed supplier bill',
    }),
  );

  // Return a small qty from a batch created by PO receive for this stockist
  const batch = await db.batches
    .where('stockistId')
    .equals(stockist.business.id)
    .filter((b) => b.status === 'Available' && b.onHand - b.reserved >= 1)
    .first();
  if (!batch) return;

  advanceDays(1);
  const ret = assertOk(
    `09-sret.create.${tag}`,
    await createSupplierReturn({
      actor: stockist.user,
      stockist: stockist.business,
      supplierId,
      lines: [{ batchId: batch.id, qty: 1, reason: 'Damaged outer pack — seed return' }],
    }),
  ).data;
  advanceDays(1);
  assertOk(
    `09-sret.send.${tag}`,
    await sendSupplierReturn({
      actor: stockist.user,
      stockist: stockist.business,
      id: ret.id,
    }),
  );
  advanceDays(2);
  assertOk(
    `09-sret.settle.${tag}`,
    await settleSupplierReturn({
      actor: stockist.user,
      stockist: stockist.business,
      id: ret.id,
      settledNote: 'Credit note received from supplier — seed settle',
    }),
  );
}

async function seedStockistProcurement(stockist: TraderParty, index: number): Promise<number> {
  const supplierIds = await seedSuppliers(stockist);
  const productIds = await productIdsFor(stockist);
  if (productIds.length < 2) {
    throw new Error(`[worldSeed:09] ${stockist.key} needs active products for POs`);
  }

  let poCount = 0;
  const primary = supplierIds[0]!;
  const secondary = supplierIds[1]!;

  // Full receive
  advanceBusinessDay();
  const poFull = await createAndSendPo(stockist, primary, productIds, `${stockist.key}-full-${index}`, 3);
  advanceDays(2);
  await receiveFull(stockist, poFull, `${stockist.key}-full`);
  poCount++;

  // Partial then complete
  advanceBusinessDay();
  const poPartial = await createAndSendPo(stockist, secondary, productIds, `${stockist.key}-part-${index}`, 2);
  await receivePartialThenFull(stockist, poPartial, `${stockist.key}-part`);
  poCount++;

  // Over-receipt once (first stockist only globally via index===0)
  advanceBusinessDay();
  const poOver = await createAndSendPo(stockist, primary, productIds, `${stockist.key}-over-${index}`, 2);
  advanceDays(1);
  if (index === 0) {
    await receiveFull(stockist, poOver, `${stockist.key}-over`, { overReceipt: true });
  } else {
    await receiveFull(stockist, poOver, `${stockist.key}-over-plain`);
  }
  poCount++;

  // Extra POs for volume (leave one Sent without receive for UI)
  for (let i = 0; i < 3; i++) {
    advanceBusinessDay();
    const sid = supplierIds[i % supplierIds.length]!;
    const poId = await createAndSendPo(
      stockist,
      sid,
      productIds,
      `${stockist.key}-extra-${i}`,
      2 + (i % 2),
    );
    poCount++;
    if (i < 2) {
      advanceDays(1);
      await receiveFull(stockist, poId, `${stockist.key}-extra-${i}`);
    }
  }

  // Required-stock driven sample if any
  const required = await listRequiredStock(stockist.business.id);
  if (required.length) {
    advanceBusinessDay();
    const lines = required.slice(0, 3).map((r) => ({
      productId: r.productId,
      qty: Math.max(r.suggestedQty, 5),
      expectedCost: 10,
    }));
    const po = assertOk(
      `09-po.required.${stockist.key}`,
      await createPurchaseOrder({
        actor: stockist.user,
        stockist: stockist.business,
        supplierId: primary,
        lines,
      }),
    ).data;
    assertOk(
      `09-po.required.sent.${stockist.key}`,
      await transitionPurchaseOrder({
        actor: stockist.user,
        stockist: stockist.business,
        poId: po.id,
        to: 'Sent',
      }),
    );
    poCount++;
  }

  await seedBillsAndReturns(stockist, primary, [poFull, poPartial], stockist.key);
  return poCount;
}

/** Phase 9 — Procurement (Session D). */
export async function seedProcurementPhase(): Promise<void> {
  const stockists = getWorldCtx().stockists.filter((s) => s.business.accountStatus === 'Active');
  let total = 0;
  for (let i = 0; i < stockists.length; i++) {
    total += await seedStockistProcurement(stockists[i]!, i);
  }
  if (total < 10) {
    throw new Error(`[worldSeed:09] expected 10+ POs, got ${total}`);
  }
}

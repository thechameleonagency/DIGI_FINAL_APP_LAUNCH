import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import {
  createPurchaseBill,
  createPurchaseOrder,
  createSupplierReturn,
  deleteOrDeactivateSupplier,
  listRequiredStock,
  receivePurchaseOrder,
  sendSupplierReturn,
  settleSupplierReturn,
  transitionPurchaseOrder,
  upsertSupplier,
} from './procurementService';

async function seedStockist() {
  const owner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
  await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: owner.id });
  await db.catalogues.put({
    id: 'cat-st',
    stockistId: 'biz-st',
    status: 'Active',
    updatedAt: new Date().toISOString(),
  });
  await makeProduct('biz-st', 'prod-1');
  return { actor: owner, stockist: (await db.businesses.get('biz-st'))! };
}

async function makeSupplier(actor: Awaited<ReturnType<typeof seedStockist>>['actor'], stockist: Awaited<ReturnType<typeof seedStockist>>['stockist'], name = 'Local Pharma Dist') {
  const sup = await upsertSupplier({ actor, stockist, name, contact: '9000011111' });
  expect(sup.ok).toBe(true);
  if (!sup.ok) throw new Error('supplier');
  return sup.data;
}

async function sentPo(
  actor: Awaited<ReturnType<typeof seedStockist>>['actor'],
  stockist: Awaited<ReturnType<typeof seedStockist>>['stockist'],
  supplierId: string,
  lines: { productId: string; qty: number; expectedCost: number }[],
) {
  const po = await createPurchaseOrder({ actor, stockist, supplierId, lines });
  expect(po.ok).toBe(true);
  if (!po.ok) throw new Error('po');
  const sent = await transitionPurchaseOrder({ actor, stockist, poId: po.data.id, to: 'Sent' });
  expect(sent.ok).toBe(true);
  if (!sent.ok) throw new Error('sent');
  return sent.data;
}

describe('procurementService (Wave 8 / CF-17)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('PO receive increments stock via movement (AC-Q07)', async () => {
    const { actor, stockist } = await seedStockist();
    const sup = await makeSupplier(actor, stockist);
    const po = await sentPo(actor, stockist, sup.id, [{ productId: 'prod-1', qty: 20, expectedCost: 8 }]);
    const recv = await receivePurchaseOrder({
      actor,
      stockist,
      poId: po.id,
      lines: [{ productId: 'prod-1', qty: 20, batchNumber: 'B1', expiryDate: '2030-01-01', cost: 8 }],
    });
    expect(recv.ok).toBe(true);
    if (!recv.ok) return;
    expect(recv.data.status).toBe('Received');
    const batch = await db.batches.where('productId').equals('prod-1').first();
    expect(batch?.onHand).toBe(20);
    const mov = await db.inventoryMovements.filter((m) => m.sourceDocType === 'PO').first();
    expect(mov?.qty).toBe(20);
    const n = await db.notifications.filter((x) => x.code === 'N-308').first();
    expect(n).toBeTruthy();
  });

  it('refuses receive into Quarantined batch and writes nothing (atomicity)', async () => {
    const { actor, stockist } = await seedStockist();
    await makeProduct('biz-st', 'prod-2');
    const ts = new Date().toISOString();
    await db.batches.add({
      id: 'batch-q',
      productId: 'prod-1',
      stockistId: 'biz-st',
      batchNumber: 'Q1',
      expiryDate: '2030-01-01',
      onHand: 3,
      reserved: 0,
      status: 'Quarantined',
      createdAt: ts,
      updatedAt: ts,
    });
    const sup = await makeSupplier(actor, stockist);
    const po = await sentPo(actor, stockist, sup.id, [
      { productId: 'prod-1', qty: 10, expectedCost: 8 },
      { productId: 'prod-2', qty: 5, expectedCost: 4 },
    ]);
    const recv = await receivePurchaseOrder({
      actor,
      stockist,
      poId: po.id,
      lines: [
        { productId: 'prod-2', qty: 5, batchNumber: 'OK-NEW', expiryDate: '2030-06-01' },
        { productId: 'prod-1', qty: 5, batchNumber: 'Q1', expiryDate: '2030-01-01' },
      ],
    });
    expect(recv.ok).toBe(false);
    if (!recv.ok) expect(recv.code).toBe('PO_BATCH_STATUS');
    expect(await db.batches.where('productId').equals('prod-2').count()).toBe(0);
    expect((await db.batches.get('batch-q'))?.onHand).toBe(3);
    expect(await db.inventoryMovements.count()).toBe(0);
    expect((await db.purchaseOrders.get(po.id))?.status).toBe('Sent');
  });

  it('refuses receive into Recalled batch', async () => {
    const { actor, stockist } = await seedStockist();
    const ts = new Date().toISOString();
    await db.batches.add({
      id: 'batch-r',
      productId: 'prod-1',
      stockistId: 'biz-st',
      batchNumber: 'R1',
      expiryDate: '2030-01-01',
      onHand: 1,
      reserved: 0,
      status: 'Recalled',
      createdAt: ts,
      updatedAt: ts,
    });
    const sup = await makeSupplier(actor, stockist);
    const po = await sentPo(actor, stockist, sup.id, [{ productId: 'prod-1', qty: 5, expectedCost: 1 }]);
    const recv = await receivePurchaseOrder({
      actor,
      stockist,
      poId: po.id,
      lines: [{ productId: 'prod-1', qty: 2, batchNumber: 'R1', expiryDate: '2030-01-01' }],
    });
    expect(recv.ok).toBe(false);
    if (!recv.ok) expect(recv.code).toBe('PO_BATCH_STATUS');
  });

  it('blocks split-line over-receipt without confirm (edge)', async () => {
    const { actor, stockist } = await seedStockist();
    const sup = await makeSupplier(actor, stockist);
    const po = await sentPo(actor, stockist, sup.id, [{ productId: 'prod-1', qty: 10, expectedCost: 1 }]);
    const recv = await receivePurchaseOrder({
      actor,
      stockist,
      poId: po.id,
      lines: [
        { productId: 'prod-1', qty: 7, batchNumber: 'A', expiryDate: '2030-01-01' },
        { productId: 'prod-1', qty: 7, batchNumber: 'B', expiryDate: '2030-01-01' },
      ],
    });
    expect(recv.ok).toBe(false);
    if (!recv.ok) expect(recv.code).toBe('PO_OVER');
    expect(await db.batches.count()).toBe(0);
  });

  it('partial receive then close; cancel blocked on PartiallyReceived', async () => {
    const { actor, stockist } = await seedStockist();
    const sup = await makeSupplier(actor, stockist);
    const po = await sentPo(actor, stockist, sup.id, [{ productId: 'prod-1', qty: 10, expectedCost: 1 }]);
    const recv = await receivePurchaseOrder({
      actor,
      stockist,
      poId: po.id,
      lines: [{ productId: 'prod-1', qty: 4, batchNumber: 'P1', expiryDate: '2030-01-01' }],
    });
    expect(recv.ok).toBe(true);
    if (!recv.ok) return;
    expect(recv.data.status).toBe('PartiallyReceived');
    const cancel = await transitionPurchaseOrder({ actor, stockist, poId: po.id, to: 'Cancelled' });
    expect(cancel.ok).toBe(false);
    if (!cancel.ok) expect(cancel.code).toBe('PO_CANCEL_PARTIAL');
    const closed = await transitionPurchaseOrder({ actor, stockist, poId: po.id, to: 'Closed' });
    expect(closed.ok).toBe(true);
  });

  it('DeliveryStaff denied supplier/PO/receive (roles)', async () => {
    const { stockist } = await seedStockist();
    const boy = await makeActor({ id: 'u-boy', businessId: 'biz-st', role: 'DeliveryStaff' });
    const sup = await upsertSupplier({ actor: boy, stockist, name: 'X', contact: '1' });
    expect(sup.ok).toBe(false);
    if (!sup.ok) expect(sup.code).toBe('PERM_DENIED');
    const po = await createPurchaseOrder({
      actor: boy,
      stockist,
      supplierId: 'nope',
      lines: [{ productId: 'prod-1', qty: 1, expectedCost: 1 }],
    });
    expect(po.ok).toBe(false);
    if (!po.ok) expect(po.code).toBe('PERM_DENIED');
    const recv = await receivePurchaseOrder({
      actor: boy,
      stockist,
      poId: 'nope',
      lines: [{ productId: 'prod-1', qty: 1, batchNumber: 'B', expiryDate: '2030-01-01' }],
    });
    expect(recv.ok).toBe(false);
    if (!recv.ok) expect(recv.code).toBe('PERM_DENIED');
  });

  it('inactive supplier cannot create PO; empty lines fail', async () => {
    const { actor, stockist } = await seedStockist();
    const created = await makeSupplier(actor, stockist);
    const empty = await createPurchaseOrder({ actor, stockist, supplierId: created.id, lines: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('PO_LINES');
    await db.suppliers.update(created.id, { active: false });
    const po = await createPurchaseOrder({
      actor,
      stockist,
      supplierId: created.id,
      lines: [{ productId: 'prod-1', qty: 1, expectedCost: 1 }],
    });
    expect(po.ok).toBe(false);
    if (!po.ok) expect(po.code).toBe('PO_SUP');
  });

  it('deactivates supplier with open PO; deletes when none (empty/edge)', async () => {
    const { actor, stockist } = await seedStockist();
    const sup = await makeSupplier(actor, stockist);
    await createPurchaseOrder({
      actor,
      stockist,
      supplierId: sup.id,
      lines: [{ productId: 'prod-1', qty: 1, expectedCost: 1 }],
    });
    const deactivated = await deleteOrDeactivateSupplier({ actor, stockist, id: sup.id });
    expect(deactivated.ok).toBe(true);
    if (deactivated.ok && deactivated.data !== true) expect(deactivated.data.active).toBe(false);

    const lone = await makeSupplier(actor, stockist, 'Lone Dist');
    const deleted = await deleteOrDeactivateSupplier({ actor, stockist, id: lone.id });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.data).toBe(true);
    expect(await db.suppliers.get(lone.id)).toBeUndefined();
  });

  it('purchase bill happy + validation fail', async () => {
    const { actor, stockist } = await seedStockist();
    const sup = await makeSupplier(actor, stockist);
    const bill = await createPurchaseBill({
      actor,
      stockist,
      supplierId: sup.id,
      billNo: 'INV-1',
      date: '2026-08-01',
      amount: 500,
    });
    expect(bill.ok).toBe(true);
    const bad = await createPurchaseBill({
      actor,
      stockist,
      supplierId: sup.id,
      billNo: '',
      date: '2026-08-01',
      amount: 0,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BILL_NO');
  });

  it('blocks supplier return over available qty (E-CF-17c)', async () => {
    const { actor, stockist } = await seedStockist();
    const ts = new Date().toISOString();
    await db.batches.add({
      id: 'batch-1',
      productId: 'prod-1',
      stockistId: 'biz-st',
      batchNumber: 'X',
      expiryDate: '2030-01-01',
      onHand: 5,
      reserved: 0,
      status: 'Available',
      createdAt: ts,
      updatedAt: ts,
    });
    const sup = await makeSupplier(actor, stockist, 'S');
    const ret = await createSupplierReturn({
      actor,
      stockist,
      supplierId: sup.id,
      lines: [{ batchId: 'batch-1', qty: 9, reason: 'Near expiry' }],
    });
    expect(ret.ok).toBe(false);
    if (!ret.ok) expect(ret.code).toBe('SRET_QTY');
  });

  it('supplier return send is atomic across lines; settle requires note', async () => {
    const { actor, stockist } = await seedStockist();
    await makeProduct('biz-st', 'prod-2');
    const ts = new Date().toISOString();
    await db.batches.bulkAdd([
      {
        id: 'b-a',
        productId: 'prod-1',
        stockistId: 'biz-st',
        batchNumber: 'A',
        expiryDate: '2030-01-01',
        onHand: 5,
        reserved: 0,
        status: 'Available',
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'b-b',
        productId: 'prod-2',
        stockistId: 'biz-st',
        batchNumber: 'B',
        expiryDate: '2030-01-01',
        onHand: 2,
        reserved: 0,
        status: 'Available',
        createdAt: ts,
        updatedAt: ts,
      },
    ]);
    const sup = await makeSupplier(actor, stockist);
    const draft = await createSupplierReturn({
      actor,
      stockist,
      supplierId: sup.id,
      lines: [
        { batchId: 'b-a', qty: 3, reason: 'Damaged' },
        { batchId: 'b-b', qty: 2, reason: 'Short dated' },
      ],
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    // Force second line to fail at send time by draining stock after draft.
    await db.batches.update('b-b', { onHand: 0 });
    const failed = await sendSupplierReturn({ actor, stockist, id: draft.data.id });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe('SRET_QTY');
    expect((await db.batches.get('b-a'))?.onHand).toBe(5);
    expect((await db.supplierReturns.get(draft.data.id))?.status).toBe('Draft');

    await db.batches.update('b-b', { onHand: 2 });
    const sent = await sendSupplierReturn({ actor, stockist, id: draft.data.id });
    expect(sent.ok).toBe(true);
    expect((await db.batches.get('b-a'))?.onHand).toBe(2);
    expect((await db.batches.get('b-b'))?.onHand).toBe(0);

    const noNote = await settleSupplierReturn({ actor, stockist, id: draft.data.id, settledNote: '  ' });
    expect(noNote.ok).toBe(false);
    if (!noNote.ok) expect(noNote.code).toBe('SRET_NOTE');
    const settled = await settleSupplierReturn({
      actor,
      stockist,
      id: draft.data.id,
      settledNote: 'Credit note CN-9',
    });
    expect(settled.ok).toBe(true);
    if (settled.ok) expect(settled.data.status).toBe('Settled');
  });

  it('listRequiredStock ignores quarantined qty and empty when no reorder', async () => {
    const { stockist } = await seedStockist();
    expect(await listRequiredStock(stockist.id)).toEqual([]);
    await db.products.update('prod-1', { reorderLevel: 20 });
    const ts = new Date().toISOString();
    await db.batches.add({
      id: 'q-only',
      productId: 'prod-1',
      stockistId: 'biz-st',
      batchNumber: 'Q',
      expiryDate: '2030-01-01',
      onHand: 50,
      reserved: 0,
      status: 'Quarantined',
      createdAt: ts,
      updatedAt: ts,
    });
    const need = await listRequiredStock(stockist.id);
    expect(need).toHaveLength(1);
    expect(need[0]?.onHand).toBe(0);
    expect(need[0]?.suggestedQty).toBeGreaterThan(0);
  });

  it('rejects return against missing supplier', async () => {
    const { actor, stockist } = await seedStockist();
    const ts = new Date().toISOString();
    await db.batches.add({
      id: 'batch-x',
      productId: 'prod-1',
      stockistId: 'biz-st',
      batchNumber: 'X',
      expiryDate: '2030-01-01',
      onHand: 2,
      reserved: 0,
      status: 'Available',
      createdAt: ts,
      updatedAt: ts,
    });
    const ret = await createSupplierReturn({
      actor,
      stockist,
      supplierId: 'missing',
      lines: [{ batchId: 'batch-x', qty: 1, reason: 'x' }],
    });
    expect(ret.ok).toBe(false);
    if (!ret.ok) expect(ret.code).toBe('SRET_SUP');
  });
});

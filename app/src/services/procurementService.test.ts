import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import {
  createPurchaseOrder,
  createSupplierReturn,
  receivePurchaseOrder,
  transitionPurchaseOrder,
  upsertSupplier,
} from './procurementService';

describe('procurementService (CF-17)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Owner' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: owner.id });
    await db.catalogues.put({
      id: 'cat-st',
      stockistId: 'biz-st',
      status: 'Active',
      updatedAt: new Date().toISOString(),
    });
    await makeProduct('biz-st', 'prod-1');
  });

  it('PO receive increments stock via movement (AC-Q07)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const sup = await upsertSupplier({
      actor,
      stockist,
      name: 'Local Pharma Dist',
      contact: '9000011111',
    });
    expect(sup.ok).toBe(true);
    if (!sup.ok) return;
    const po = await createPurchaseOrder({
      actor,
      stockist,
      supplierId: sup.data.id,
      lines: [{ productId: 'prod-1', qty: 20, expectedCost: 8 }],
    });
    expect(po.ok).toBe(true);
    if (!po.ok) return;
    await transitionPurchaseOrder({ actor, stockist, poId: po.data.id, to: 'Sent' });
    const recv = await receivePurchaseOrder({
      actor,
      stockist,
      poId: po.data.id,
      lines: [
        {
          productId: 'prod-1',
          qty: 20,
          batchNumber: 'B1',
          expiryDate: '2030-01-01',
          cost: 8,
        },
      ],
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

  it('blocks supplier return over available qty (E-CF-17c)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
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
    const sup = await upsertSupplier({ actor, stockist, name: 'S', contact: '9' });
    expect(sup.ok).toBe(true);
    if (!sup.ok) return;
    const ret = await createSupplierReturn({
      actor,
      stockist,
      supplierId: sup.data.id,
      lines: [{ batchId: 'batch-1', qty: 9, reason: 'Near expiry' }],
    });
    expect(ret.ok).toBe(false);
    if (!ret.ok) expect(ret.code).toBe('SRET_QTY');
  });
});

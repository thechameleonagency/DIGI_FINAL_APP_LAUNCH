import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { adjustStock, stockIn } from './inventoryService';

describe('inventoryService (T-1)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('stockIn creates Available batch and movement', async () => {
    const owner = await makeActor({ id: 'so', businessId: 'biz-s', role: 'Owner' });
    const biz = await makeBusiness({ id: 'biz-s', type: 'Stockist', ownerUserId: owner.id });
    const product = await makeProduct(biz.id);
    const res = await stockIn({
      actor: owner,
      stockist: biz,
      productId: product.id,
      batchNumber: 'B1',
      expiryDate: '2099-01-01',
      qty: 100,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.onHand).toBe(100);
      expect(res.data.status).toBe('Available');
    }
    const moves = await db.inventoryMovements.toArray();
    expect(moves).toHaveLength(1);
    expect(moves[0]?.type).toBe('StockIn');
  });

  it('rejects duplicate batch number', async () => {
    const owner = await makeActor({ id: 'so2', businessId: 'biz-s2', role: 'Owner' });
    const biz = await makeBusiness({ id: 'biz-s2', type: 'Stockist', ownerUserId: owner.id });
    const product = await makeProduct(biz.id, 'prod-2');
    await stockIn({
      actor: owner,
      stockist: biz,
      productId: product.id,
      batchNumber: 'DUP',
      expiryDate: '2099-01-01',
      qty: 10,
    });
    const res = await stockIn({
      actor: owner,
      stockist: biz,
      productId: product.id,
      batchNumber: 'dup',
      expiryDate: '2099-06-01',
      qty: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BATCH_DUP');
  });

  it('adjustStock cannot drive onHand negative', async () => {
    const owner = await makeActor({ id: 'so3', businessId: 'biz-s3', role: 'Owner' });
    const biz = await makeBusiness({ id: 'biz-s3', type: 'Stockist', ownerUserId: owner.id });
    const product = await makeProduct(biz.id, 'prod-3');
    const created = await stockIn({
      actor: owner,
      stockist: biz,
      productId: product.id,
      batchNumber: 'B3',
      expiryDate: '2099-01-01',
      qty: 5,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await adjustStock({
      actor: owner,
      stockist: biz,
      batchId: created.data.id,
      delta: -10,
      reason: 'damage',
    });
    expect(res.ok).toBe(false);
  });
});

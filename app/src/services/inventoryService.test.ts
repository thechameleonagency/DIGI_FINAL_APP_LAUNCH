import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { localTodayKey } from '../domain/utils/dateKeys';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { adjustStock, stockAdd, stockIn } from './inventoryService';

describe('inventoryService (T-1)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('stockIn creates Available batch and movement', async () => {
    const owner = await makeActor({ id: 'so', businessId: 'biz-s', role: 'Stockist' });
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

  it('stockIn sets Expired when expiry is before today', async () => {
    const owner = await makeActor({ id: 'so-exp', businessId: 'biz-sexp', role: 'Stockist' });
    const biz = await makeBusiness({ id: 'biz-sexp', type: 'Stockist', ownerUserId: owner.id });
    const product = await makeProduct(biz.id, 'prod-exp');
    const res = await stockIn({
      actor: owner,
      stockist: biz,
      productId: product.id,
      batchNumber: 'OLD',
      expiryDate: '2000-01-01',
      qty: 5,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe('Expired');
    const today = localTodayKey();
    const sameDay = await stockIn({
      actor: owner,
      stockist: biz,
      productId: product.id,
      batchNumber: 'TODAY',
      expiryDate: today,
      qty: 2,
    });
    expect(sameDay.ok).toBe(true);
    if (sameDay.ok) expect(sameDay.data.status).toBe('Available');
  });

  it('rejects duplicate batch number', async () => {
    const owner = await makeActor({ id: 'so2', businessId: 'biz-s2', role: 'Stockist' });
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
    const owner = await makeActor({ id: 'so3', businessId: 'biz-s3', role: 'Stockist' });
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

  it('stockAdd keeps separate pharmacy rows per batch', async () => {
    const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id });
    const a = await stockAdd({
      actor: ph,
      pharmacy: biz,
      productId: 'sku-1',
      productName: 'Dolo',
      qty: 10,
      batchNumber: 'B-A',
      expiryDate: '2030-01-01',
      reason: 'in',
    });
    const b = await stockAdd({
      actor: ph,
      pharmacy: biz,
      productId: 'sku-1',
      productName: 'Dolo',
      qty: 4,
      batchNumber: 'B-B',
      expiryDate: '2031-06-01',
      reason: 'in',
    });
    expect(a.ok && b.ok).toBe(true);
    const rows = await db.pharmacyInventory.where({ pharmacyId: biz.id, productId: 'sku-1' }).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.batchNumber).sort()).toEqual(['B-A', 'B-B']);
  });

  it('DeliveryStaff cannot stockIn', async () => {
    const owner = await makeActor({ id: 'so4', businessId: 'biz-s4', role: 'Stockist' });
    const biz = await makeBusiness({ id: 'biz-s4', type: 'Stockist', ownerUserId: owner.id });
    const ds = await makeActor({ id: 'ds4', businessId: biz.id, role: 'DeliveryStaff' });
    const product = await makeProduct(biz.id, 'prod-4');
    const res = await stockIn({
      actor: ds,
      stockist: biz,
      productId: product.id,
      batchNumber: 'B4',
      expiryDate: '2099-01-01',
      qty: 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('PERM_DENIED');
  });
});

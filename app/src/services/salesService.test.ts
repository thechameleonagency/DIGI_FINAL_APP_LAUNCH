import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { createCustomerSale, voidCustomerSale } from './salesService';

describe('salesService (CF-05)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id, name: 'CarePlus' });
    await db.pharmacyInventory.add({
      id: 'inv-1',
      pharmacyId: 'biz-ph',
      productId: 'prod-1',
      productName: 'Dolo 650',
      batchNumber: 'B1',
      expiryDate: '2028-01-01',
      onHand: 5,
      updatedAt: new Date().toISOString(),
    });
  });

  it('cannot drive stock negative (AC-Q06)', async () => {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const res = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'Walk-in',
      paymentMode: 'Cash',
      lines: [{ inventoryId: 'inv-1', qty: 9, unitPrice: 20 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/insufficient|negative/i);
    expect((await db.pharmacyInventory.get('inv-1'))?.onHand).toBe(5);
  });

  it('records sale and void restores stock', async () => {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const created = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'Ravi',
      paymentMode: 'UPI',
      lines: [{ inventoryId: 'inv-1', qty: 2, unitPrice: 25 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.saleNo).toMatch(/^SALE-/);
    expect((await db.pharmacyInventory.get('inv-1'))?.onHand).toBe(3);

    const voided = await voidCustomerSale({
      actor,
      pharmacy,
      saleId: created.data.id,
      reason: 'Wrong entry',
    });
    expect(voided.ok).toBe(true);
    expect((await db.pharmacyInventory.get('inv-1'))?.onHand).toBe(5);
  });

  it('blocks expired inventory', async () => {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    await db.pharmacyInventory.put({
      id: 'inv-exp',
      pharmacyId: 'biz-ph',
      productId: 'prod-2',
      productName: 'Old Syrup',
      expiryDate: '2020-01-01',
      onHand: 3,
      updatedAt: new Date().toISOString(),
    });
    const res = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'X',
      paymentMode: 'Cash',
      lines: [{ inventoryId: 'inv-exp', qty: 1, unitPrice: 10 }],
    });
    expect(res.ok).toBe(false);
  });
});

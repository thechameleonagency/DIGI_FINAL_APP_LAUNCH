import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import {
  collectCustomerSalePayment,
  createCustomerSale,
  returnCustomerSaleLines,
  saleCreditOutstanding,
  voidCustomerSale,
} from './salesService';
import { nowIso } from '../domain/utils/clock';

describe('salesService (CF-05)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    await makeActor({ id: 'u-del', businessId: 'biz-ph', role: 'DeliveryStaff', name: 'Rider' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id, name: 'CarePlus' });
    await db.pharmacyInventory.add({
      id: 'inv-1',
      pharmacyId: 'biz-ph',
      productId: 'prod-1',
      productName: 'Dolo 650',
      batchNumber: 'B1',
      expiryDate: '2028-01-01',
      onHand: 5,
      updatedAt: nowIso(),
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
      updatedAt: nowIso(),
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

  it('requires phone for credit sales', async () => {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const res = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'Credit Cust',
      paymentMode: 'Credit',
      lines: [{ inventoryId: 'inv-1', qty: 1, unitPrice: 20 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('SALE_CREDIT_PHONE');
  });

  it('return lines restore stock and clamp credit collections', async () => {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const created = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'Meera',
      phone: '9876543210',
      paymentMode: 'Credit',
      lines: [{ inventoryId: 'inv-1', qty: 4, unitPrice: 10 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.amountCollected).toBe(0);
    expect(saleCreditOutstanding(created.data)).toBe(40);

    const collected = await collectCustomerSalePayment({
      actor,
      pharmacy,
      saleId: created.data.id,
      amount: 30,
    });
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    expect(saleCreditOutstanding(collected.data)).toBe(10);

    const returned = await returnCustomerSaleLines({
      actor,
      pharmacy,
      saleId: created.data.id,
      returns: [{ productRef: 'prod-1', qty: 2 }],
      reason: 'Customer returned',
    });
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    expect(returned.data.status).toBe('PartiallyReturned');
    expect((await db.pharmacyInventory.get('inv-1'))?.onHand).toBe(3); // 5-4+2
    // Net remaining revenue 20; collected clamped to 20
    expect(returned.data.amountCollected).toBe(20);
    expect(saleCreditOutstanding(returned.data)).toBe(0);
  });

  it('DeliveryStaff cannot record, void, return, or collect sales', async () => {
    const rider = (await db.users.get('u-del'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const create = await createCustomerSale({
      actor: rider,
      pharmacy,
      customerName: 'X',
      paymentMode: 'Cash',
      lines: [{ inventoryId: 'inv-1', qty: 1, unitPrice: 10 }],
    });
    expect(create.ok).toBe(false);

    const pharmacist = (await db.users.get('u-ph'))!;
    const sale = await createCustomerSale({
      actor: pharmacist,
      pharmacy,
      customerName: 'Y',
      phone: '9000000001',
      paymentMode: 'Credit',
      lines: [{ inventoryId: 'inv-1', qty: 1, unitPrice: 10 }],
    });
    expect(sale.ok).toBe(true);
    if (!sale.ok) return;

    expect(
      (await voidCustomerSale({ actor: rider, pharmacy, saleId: sale.data.id, reason: 'nope' })).ok,
    ).toBe(false);
    expect(
      (
        await returnCustomerSaleLines({
          actor: rider,
          pharmacy,
          saleId: sale.data.id,
          returns: [{ productRef: 'prod-1', qty: 1 }],
          reason: 'nope',
        })
      ).ok,
    ).toBe(false);
    expect(
      (await collectCustomerSalePayment({ actor: rider, pharmacy, saleId: sale.data.id, amount: 5 })).ok,
    ).toBe(false);
  });

  it('home delivery requires address and starts Unassigned', async () => {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const missing = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'Z',
      paymentMode: 'Cash',
      homeDelivery: true,
      lines: [{ inventoryId: 'inv-1', qty: 1, unitPrice: 10 }],
    });
    expect(missing.ok).toBe(false);

    const okSale = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'Z',
      paymentMode: 'Cash',
      homeDelivery: true,
      address: '12 MG Road',
      lines: [{ inventoryId: 'inv-1', qty: 1, unitPrice: 10 }],
    });
    expect(okSale.ok).toBe(true);
    if (!okSale.ok) return;
    expect(okSale.data.deliveryStatus).toBe('Unassigned');
  });
});

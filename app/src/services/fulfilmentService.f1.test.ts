import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { db } from '../data/db';
import { acceptOrder, recordManualOrder } from './orderService';
import {
  allocateOrder,
  createAndDispatchDelivery,
  issueInvoice,
  packOrder,
  returnFailedDeliveryToStockist,
  updateDeliveryStatus,
} from './fulfilmentService';

async function seedPlatform() {
  await db.platformSettings.put({
    id: 'platform',
    maintenanceMode: false,
    billAheadAllowed: false,
    returnWindowDays: 7,
    inviteTtlDays: 7,
    updatedAt: new Date().toISOString(),
  } as never);
}

describe('fulfilment F1 fixes', () => {
  beforeEach(async () => {
    await clearDb();
    await seedPlatform();
  });

  it('accepts offline managed orders without Active connection row', async () => {
    const stockistUser = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    const stockist = await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stockistUser.id });
    await db.catalogues.add({
      id: 'cat-1',
      stockistId: stockist.id,
      status: 'Active',
      updatedAt: new Date().toISOString(),
    } as never);
    const productId = 'prod-1';
    await db.products.add({
      id: productId,
      stockistId: stockist.id,
      name: 'Para 500',
      sku: 'P500',
      packSize: '10s',
      status: 'Active',
      moq: 1,
      mrp: 20,
      gstPercent: 12,
      ptr: 10,
      updatedAt: new Date().toISOString(),
    } as never);
    await db.managedPharmacies.add({
      id: 'mp-1',
      stockistId: stockist.id,
      name: 'Offline Chemist',
      status: 'OfflineOnly',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const created = await recordManualOrder({
      actor: stockistUser,
      stockist,
      managedPharmacyId: 'mp-1',
      lines: [{ productId, qty: 2 }],
      idempotencyKey: 'idem-offline-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const accepted = await acceptOrder({
      actor: stockistUser,
      stockist,
      orderId: created.data.id,
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(['Accepted', 'PartiallyAccepted']).toContain(accepted.data.status);
  });

  it('blocks double dispatch and resets order on failed restock', async () => {
    const stockistUser = await makeActor({ id: 'u-st2', businessId: 'biz-st2', role: 'Stockist' });
    const stockist = await makeBusiness({ id: 'biz-st2', type: 'Stockist', ownerUserId: stockistUser.id });
    const pharmacyUser = await makeActor({ id: 'u-ph2', businessId: 'biz-ph2', role: 'Pharmacist' });
    const pharmacy = await makeBusiness({ id: 'biz-ph2', type: 'Pharmacy', ownerUserId: pharmacyUser.id });
    await db.connections.add({
      id: 'conn-1',
      pharmacyId: pharmacy.id,
      stockistId: stockist.id,
      status: 'Active',
      creditLimit: 1_000_000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);
    await db.catalogues.add({
      id: 'cat-2',
      stockistId: stockist.id,
      status: 'Active',
      updatedAt: new Date().toISOString(),
    } as never);
    const productId = 'prod-2';
    await db.products.add({
      id: productId,
      stockistId: stockist.id,
      name: 'Amox',
      sku: 'A500',
      packSize: '10s',
      status: 'Active',
      moq: 1,
      mrp: 50,
      gstPercent: 12,
      ptr: 30,
      updatedAt: new Date().toISOString(),
    } as never);
    const batchId = 'batch-2';
    const expiry = new Date(Date.now() + 86400000 * 400).toISOString().slice(0, 10);
    await db.batches.add({
      id: batchId,
      stockistId: stockist.id,
      productId,
      batchNumber: 'B1',
      expiryDate: expiry,
      onHand: 20,
      reserved: 0,
      status: 'Available',
      updatedAt: new Date().toISOString(),
    } as never);

    const orderId = 'ord-2';
    const ts = new Date().toISOString();
    await db.orders.add({
      id: orderId,
      orderNo: 'ORD-T2',
      pharmacyId: pharmacy.id,
      stockistId: stockist.id,
      connectionId: 'conn-1',
      status: 'Accepted',
      lines: [
        {
          id: 'ol-1',
          productId,
          productName: 'Amox',
          sku: 'A500',
          packSize: '10s',
          qty: 5,
          acceptedQty: 5,
          unitPrice: 30,
          mrp: 50,
          gstPercent: 12,
          lineSubtotal: 150,
          lineTax: 18,
          lineTotal: 168,
        },
      ],
      subtotal: 150,
      taxTotal: 18,
      grandTotal: 168,
      deliveryAddress: {
        id: 'a1',
        label: 'Main',
        line1: '1 Main',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
        isDefault: true,
      },
      source: 'Platform',
      statusHistory: [],
      placedBy: pharmacyUser.id,
      placedAt: ts,
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    } as never);

    const alloc = await allocateOrder({ actor: stockistUser, stockist, orderId });
    expect(alloc.ok).toBe(true);
    const packed = await packOrder({ actor: stockistUser, stockist, orderId });
    expect(packed.ok).toBe(true);
    const inv = await issueInvoice({ actor: stockistUser, stockist, orderId });
    expect(inv.ok).toBe(true);

    const d1 = await createAndDispatchDelivery({ actor: stockistUser, stockist, orderId });
    expect(d1.ok).toBe(true);
    const d2 = await createAndDispatchDelivery({ actor: stockistUser, stockist, orderId });
    expect(d2.ok).toBe(false);
    if (!d2.ok) expect(d2.code).toBe('DEL_EXISTS');

    if (!d1.ok) return;
    await db.deliveries.update(d1.data.id, { status: 'Assigned', assignedTo: stockistUser.id });
    const failed = await updateDeliveryStatus({
      actor: stockistUser,
      stockist,
      deliveryId: d1.data.id,
      status: 'OutForDelivery',
    });
    expect(failed.ok).toBe(true);
    const fail = await updateDeliveryStatus({
      actor: stockistUser,
      stockist,
      deliveryId: d1.data.id,
      status: 'Failed',
      failReason: 'Closed',
    });
    expect(fail.ok).toBe(true);
    const restock = await returnFailedDeliveryToStockist({
      actor: stockistUser,
      stockist,
      deliveryId: d1.data.id,
    });
    expect(restock.ok).toBe(true);
    const order = await db.orders.get(orderId);
    expect(order?.status).toBe('Packed');
    expect(order?.deliveryId).toBeUndefined();
    const batchAfter = await db.batches.get(batchId);
    expect(batchAfter?.onHand).toBe(20);
    expect(batchAfter?.reserved).toBe(5);
  });

  it('rejects allocate overrides that over-reserve', async () => {
    const stockistUser = await makeActor({ id: 'u-st3', businessId: 'biz-st3', role: 'Stockist' });
    const stockist = await makeBusiness({ id: 'biz-st3', type: 'Stockist', ownerUserId: stockistUser.id });
    const pharmacyUser = await makeActor({ id: 'u-ph3', businessId: 'biz-ph3', role: 'Pharmacist' });
    const pharmacy = await makeBusiness({ id: 'biz-ph3', type: 'Pharmacy', ownerUserId: pharmacyUser.id });
    await db.connections.add({
      id: 'conn-3',
      pharmacyId: pharmacy.id,
      stockistId: stockist.id,
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);
    const productId = 'prod-3';
    await db.products.add({
      id: productId,
      stockistId: stockist.id,
      name: 'Cetriz',
      sku: 'C10',
      packSize: '10s',
      status: 'Active',
      moq: 1,
      mrp: 20,
      gstPercent: 12,
      ptr: 10,
      updatedAt: new Date().toISOString(),
    } as never);
    const batchId = 'batch-3';
    const expiry = new Date(Date.now() + 86400000 * 400).toISOString().slice(0, 10);
    await db.batches.add({
      id: batchId,
      stockistId: stockist.id,
      productId,
      batchNumber: 'B3',
      expiryDate: expiry,
      onHand: 50,
      reserved: 0,
      status: 'Available',
      updatedAt: new Date().toISOString(),
    } as never);
    const orderId = 'ord-3';
    const lineId = 'ol-3';
    const ts = new Date().toISOString();
    await db.orders.add({
      id: orderId,
      orderNo: 'ORD-T3',
      pharmacyId: pharmacy.id,
      stockistId: stockist.id,
      connectionId: 'conn-3',
      status: 'Accepted',
      lines: [
        {
          id: lineId,
          productId,
          productName: 'Cetriz',
          sku: 'C10',
          packSize: '10s',
          qty: 5,
          acceptedQty: 5,
          unitPrice: 10,
          mrp: 20,
          gstPercent: 12,
          lineSubtotal: 50,
          lineTax: 6,
          lineTotal: 56,
        },
      ],
      subtotal: 50,
      taxTotal: 6,
      grandTotal: 56,
      deliveryAddress: {
        id: 'a3',
        label: 'Main',
        line1: '1 Main',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
        isDefault: true,
      },
      source: 'Platform',
      statusHistory: [],
      placedBy: pharmacyUser.id,
      placedAt: ts,
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    } as never);

    const res = await allocateOrder({
      actor: stockistUser,
      stockist,
      orderId,
      overrides: { [lineId]: [{ batchId, qty: 9 }] },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('ALLOC_OVER');
  });
});

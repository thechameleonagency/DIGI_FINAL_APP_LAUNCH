import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import type { Order } from '../domain/entities/types';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { bulkIssueInvoices } from './fulfilmentService';
import { nowIso } from '../domain/utils/clock';

function packedOrder(id: string, orderNo: string, invoiceId?: string): Order {
  const ts = nowIso();
  return {
    id,
    orderNo,
    pharmacyId: 'biz-ph',
    stockistId: 'biz-st',
    connectionId: 'conn-1',
    status: 'Packed',
    source: 'Platform',
    lines: [
      {
        id: `line-${id}`,
        productId: 'prod-1',
        productName: 'Dolo',
        sku: 'SKU-1',
        packSize: '10s',
        mrp: 15,
        qty: 10,
        acceptedQty: 10,
        allocatedQty: 10,
        packedQty: 10,
        unitPrice: 10,
        gstPercent: 12,
        lineSubtotal: 100,
        lineTax: 12,
        lineTotal: 112,
      },
    ],
    subtotal: 100,
    taxTotal: 12,
    grandTotal: 112,
    placedAt: ts,
    placedBy: 'u-ph',
    deliveryAddress: {
      id: 'addr-1',
      label: 'Shop',
      line1: '1 Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    },
    invoiceId,
    statusHistory: [],
    createdAt: ts,
    updatedAt: ts,
    version: 1,
    idempotencyKey: `idem-${id}`,
  };
}

describe('bulkIssueInvoices (CF-16)', () => {
  beforeEach(async () => {
    await clearDb();
    const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Stockist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id });
    const st = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: st.id });
    const ts = nowIso();
    await db.connections.add({
      id: 'conn-1',
      pharmacyId: 'biz-ph',
      stockistId: 'biz-st',
      status: 'Active',
      creditDays: 30,
      requestedAt: ts,
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
    });
    await db.platformSettings.put({
      id: 'platform',
      billAheadAllowed: false,
      roundingMode: 'nearest',
      updatedAt: ts,
    } as never);
    await db.orders.bulkAdd([packedOrder('ord-1', 'ORD-1'), packedOrder('ord-2', 'ORD-2')]);
  });

  it('issues invoices for each selected order independently', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await bulkIssueInvoices({ actor, stockist, orderIds: ['ord-1', 'ord-2'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.successCount).toBe(2);
    expect(await db.invoices.count()).toBe(2);
  });

  it('reports failure for already-invoiced order while others succeed (E-CF-16a)', async () => {
    await db.orders.put(packedOrder('ord-3', 'ORD-3', 'inv-existing'));
    await db.invoices.add({
      id: 'inv-existing',
      invoiceNo: 'INV-EXIST',
      orderId: 'ord-3',
      stockistId: 'biz-st',
      pharmacyId: 'biz-ph',
      status: 'Issued',
      lines: [],
      subtotal: 1,
      taxTotal: 0,
      roundOff: 0,
      grandTotal: 1,
      outstanding: 1,
      paidAmount: 0,
      creditApplied: 0,
      statusHistory: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      version: 1,
    });
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await bulkIssueInvoices({ actor, stockist, orderIds: ['ord-1', 'ord-3'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.successCount).toBe(1);
    expect(res.data.failureCount).toBe(1);
    const failed = res.data.results.find((r) => r.orderId === 'ord-3');
    expect(failed?.ok).toBe(false);
    expect(failed?.code).toBe('INV_EXISTS');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import {
  fileCounterfeitReport,
  issueCounterfeitRecall,
  startCounterfeitInvestigation,
} from './counterfeitService';

const ts = '2026-04-01T10:00:00.000Z';

describe('counterfeitService (CF-24)', () => {
  beforeEach(async () => {
    await clearDb();
    const admin = await makeActor({ id: 'u-admin', businessId: 'biz-plat', role: 'Admin' });
    await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id, name: 'Platform' });
    const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id, name: 'CarePlus' });
    const st = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Owner' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: st.id, name: 'MedRoute' });
    await makeProduct('biz-st', 'prod-1');
    await db.batches.add({
      id: 'batch-1',
      productId: 'prod-1',
      stockistId: 'biz-st',
      batchNumber: 'B-100',
      expiryDate: '2027-01-01',
      onHand: 100,
      reserved: 10,
      status: 'Available',
      createdAt: ts,
      updatedAt: ts,
    });
    await db.orders.add({
      id: 'ord-1',
      orderNo: 'ORD-1',
      pharmacyId: 'biz-ph',
      stockistId: 'biz-st',
      connectionId: 'conn-1',
      status: 'Allocated',
      lines: [
        {
          id: 'line-1',
          productId: 'prod-1',
          productName: 'Test Dolo',
          sku: 'SKU-1',
          packSize: '10s',
          qty: 10,
          allocatedQty: 10,
          unitPrice: 10,
          mrp: 15,
          gstPercent: 12,
          lineSubtotal: 100,
          lineTax: 12,
          lineTotal: 112,
          batchAllocations: [{ batchId: 'batch-1', batchNumber: 'B-100', qty: 10, expiryDate: '2027-01-01' }],
        },
      ],
      subtotal: 100,
      taxTotal: 12,
      grandTotal: 112,
      deliveryAddress: {
        id: 'addr-1',
        label: 'Store',
        line1: '1 Test',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
      },
      idempotencyKey: 'ik',
      statusHistory: [],
      placedBy: 'u-ph',
      placedAt: ts,
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    });
  });

  it('files report and notifies admins (N-311)', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const res = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Packaging looks forged and seal broken',
      productId: 'prod-1',
      batchId: 'batch-1',
    });
    expect(res.ok).toBe(true);
    const notes = await db.notifications.toArray();
    expect(notes.some((n) => n.code === 'N-311')).toBe(true);
  });

  it('links duplicate reports on same batch (E-CF-24b)', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const st = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;

    const a = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'First report about forged packaging',
      batchId: 'batch-1',
    });
    const b = await fileCounterfeitReport({
      actor: st,
      business: stockist,
      description: 'Second report same batch suspected fake',
      batchId: 'batch-1',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok) return;
    await startCounterfeitInvestigation({ actor: admin, platform, id: a.data.id });
    const linked = await db.counterfeitReports.get(b.ok ? b.data.id : '');
    expect(linked?.status).toBe('Investigating');
    expect(linked?.linkedReportId).toBe(a.data.id);
  });

  it('issues recall, releases reservations, flags orders (E-CF-24a)', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const filed = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Suspected counterfeit batch on shelf',
      batchId: 'batch-1',
      productId: 'prod-1',
    });
    expect(filed.ok).toBe(true);
    if (!filed.ok) return;
    await startCounterfeitInvestigation({ actor: admin, platform, id: filed.data.id });
    const recall = await issueCounterfeitRecall({ actor: admin, platform, id: filed.data.id });
    expect(recall.ok).toBe(true);
    if (!recall.ok) return;
    expect(recall.data.flaggedOrderIds).toContain('ord-1');
    const batch = await db.batches.get('batch-1');
    expect(batch?.status).toBe('Recalled');
    expect(batch?.reserved).toBe(0);
    const order = await db.orders.get('ord-1');
    expect(order?.lines[0].batchAllocations?.length ?? 0).toBe(0);
    const notes = await db.notifications.toArray();
    expect(notes.some((n) => n.code === 'N-313')).toBe(true);
  });
});

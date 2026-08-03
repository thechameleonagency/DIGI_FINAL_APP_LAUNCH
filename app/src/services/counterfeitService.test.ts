import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { hydrateCounters } from '../data/counters';
import { nextNumber, resetCounters, yearPrefix } from '../domain/utils/ids';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { createAndDispatchDelivery } from './fulfilmentService';
import {
  addCounterfeitNote,
  dismissCounterfeitReport,
  fileCounterfeitReport,
  issueCounterfeitRecall,
  resolveCounterfeitReport,
  startCounterfeitInvestigation,
} from './counterfeitService';

const ts = '2026-04-01T10:00:00.000Z';

async function seedBase() {
  const admin = await makeActor({ id: 'u-admin', businessId: 'biz-plat', role: 'SupportManager' });
  await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id, name: 'Platform' });
  const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
  await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id, name: 'CarePlus' });
  const st = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
  await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: st.id, name: 'MedRoute' });
  await makeProduct('biz-st', 'prod-1');
  await makeProduct('biz-st', 'prod-2');
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
}

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    orderNo: 'ORD-1',
    pharmacyId: 'biz-ph',
    stockistId: 'biz-st',
    connectionId: 'conn-1',
    status: 'Allocated' as const,
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
    ...overrides,
  };
}

describe('counterfeitService (CF-24)', () => {
  beforeEach(async () => {
    await clearDb();
    resetCounters();
    await seedBase();
    await db.orders.add(orderFixture());
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

  it('rejects batch/product mismatch and invalid seller', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const mismatch = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Batch does not match product selected',
      productId: 'prod-2',
      batchId: 'batch-1',
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe('CF_PROD_BATCH');

    const badSeller = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Seller id does not exist at all',
      sellerBusinessId: 'missing-biz',
    });
    expect(badSeller.ok).toBe(false);
    if (!badSeller.ok) expect(badSeller.code).toBe('CF_SELLER');

    const wrongType = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Seller must be a stockist not pharmacy',
      sellerBusinessId: 'biz-ph',
    });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.code).toBe('CF_SELLER');
  });

  it('hydrates CF series so report numbers stay unique after reload', async () => {
    const y = yearPrefix();
    await db.counterfeitReports.add({
      id: 'cf-existing',
      reportNo: `CF-${y}-0005`,
      reporterBusinessId: 'biz-ph',
      description: 'Existing seeded report description',
      evidenceFileIds: [],
      status: 'Reported',
      internalNotes: [],
      createdAt: ts,
      updatedAt: ts,
    });
    resetCounters();
    await hydrateCounters();
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const res = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'New report after counter hydrate',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.reportNo).toBe(`CF-${y}-0006`);
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

  it('issues recall, releases reservations, notifies open-order pharmacies (E-CF-24a)', async () => {
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
    expect(notes.some((n) => n.code === 'N-313' && n.businessId === 'biz-st')).toBe(true);
    expect(notes.some((n) => n.code === 'N-313' && n.businessId === 'biz-ph')).toBe(true);
  });

  it('demotes Packed orders and refuses phantom dispatch', async () => {
    await db.orders.put(
      orderFixture({
        status: 'Packed',
        invoiceId: 'inv-1',
        lines: [
          {
            id: 'line-1',
            productId: 'prod-1',
            productName: 'Test Dolo',
            sku: 'SKU-1',
            packSize: '10s',
            qty: 10,
            allocatedQty: 10,
            packedQty: 10,
            unitPrice: 10,
            mrp: 15,
            gstPercent: 12,
            lineSubtotal: 100,
            lineTax: 12,
            lineTotal: 112,
            batchAllocations: [
              { batchId: 'batch-1', batchNumber: 'B-100', qty: 10, expiryDate: '2027-01-01' },
            ],
          },
        ],
      }),
    );
    await db.batches.update('batch-1', { reserved: 10 });

    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const st = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;

    const filed = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Packed order recall path test case',
      batchId: 'batch-1',
    });
    expect(filed.ok).toBe(true);
    if (!filed.ok) return;
    await startCounterfeitInvestigation({ actor: admin, platform, id: filed.data.id });
    const recall = await issueCounterfeitRecall({ actor: admin, platform, id: filed.data.id });
    expect(recall.ok).toBe(true);

    const order = await db.orders.get('ord-1');
    expect(order?.status).toBe('Accepted');
    expect(order?.lines[0].batchAllocations?.length ?? 0).toBe(0);
    expect(order?.lines[0].packedQty).toBe(0);

    // Force Packed + empty allocs to assert dispatch guard
    await db.orders.update('ord-1', {
      status: 'Packed',
      lines: [{ ...order!.lines[0], packedQty: 10, batchAllocations: [] }],
    });
    const dispatch = await createAndDispatchDelivery({
      actor: st,
      stockist,
      orderId: 'ord-1',
    });
    expect(dispatch.ok).toBe(false);
    if (!dispatch.ok) expect(dispatch.code).toBe('DEL_NO_ALLOC');
  });

  it('allows recall of Depleted batches', async () => {
    await db.batches.update('batch-1', { status: 'Depleted', onHand: 0, reserved: 0 });
    await db.orders.clear();
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    // Delivered order still holds allocation history for N-313 fan-out
    await db.orders.add(
      orderFixture({
        id: 'ord-delivered',
        status: 'Delivered',
      }),
    );
    const filed = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Fully shipped batch still needs recall',
      batchId: 'batch-1',
    });
    expect(filed.ok).toBe(true);
    if (!filed.ok) return;
    await startCounterfeitInvestigation({ actor: admin, platform, id: filed.data.id });
    const recall = await issueCounterfeitRecall({ actor: admin, platform, id: filed.data.id });
    expect(recall.ok).toBe(true);
    expect((await db.batches.get('batch-1'))?.status).toBe('Recalled');
    const notes = await db.notifications.toArray();
    expect(notes.some((n) => n.code === 'N-313' && n.businessId === 'biz-ph')).toBe(true);
  });

  it('cascades dismiss/resolve to linked reports and audits notes', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const st = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;

    const a = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Primary report for cascade dismiss',
      batchId: 'batch-1',
    });
    const b = await fileCounterfeitReport({
      actor: st,
      business: stockist,
      description: 'Linked duplicate for cascade dismiss',
      batchId: 'batch-1',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    await startCounterfeitInvestigation({ actor: admin, platform, id: a.data.id });

    const noteRes = await addCounterfeitNote({
      actor: admin,
      platform,
      id: a.data.id,
      note: 'Lab check pending',
    });
    expect(noteRes.ok).toBe(true);
    const noteAudits = await db.auditLogs.filter((x) => x.action === 'counterfeit.note').toArray();
    expect(noteAudits.length).toBeGreaterThan(0);

    const dismissed = await dismissCounterfeitReport({
      actor: admin,
      platform,
      id: a.data.id,
      reason: 'False alarm after lab',
    });
    expect(dismissed.ok).toBe(true);
    expect((await db.counterfeitReports.get(b.data.id))?.status).toBe('Dismissed');
    const n314 = await db.notifications.filter((n) => n.code === 'N-314').toArray();
    expect(n314.some((n) => n.businessId === 'biz-ph')).toBe(true);
    expect(n314.some((n) => n.businessId === 'biz-st')).toBe(true);

    // Resolve cascade path
    await db.notifications.clear();
    await db.counterfeitReports.clear();
    await db.batches.update('batch-1', { status: 'Available', onHand: 100, reserved: 10 });
    const c = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Primary for resolve cascade path',
      batchId: 'batch-1',
    });
    const d = await fileCounterfeitReport({
      actor: st,
      business: stockist,
      description: 'Sibling for resolve cascade path',
      batchId: 'batch-1',
    });
    if (!c.ok || !d.ok) return;
    await startCounterfeitInvestigation({ actor: admin, platform, id: c.data.id });
    await issueCounterfeitRecall({ actor: admin, platform, id: c.data.id });
    const resolved = await resolveCounterfeitReport({
      actor: admin,
      platform,
      id: c.data.id,
      note: 'Network recall complete',
    });
    expect(resolved.ok).toBe(true);
    expect((await db.counterfeitReports.get(d.data.id))?.status).toBe('Resolved');

    const investigatingResolve = await resolveCounterfeitReport({
      actor: admin,
      platform,
      id: c.data.id,
      note: 'should fail',
    });
    expect(investigatingResolve.ok).toBe(false);
  });

  it('guides resolve from Investigating with CF_RESOLVE', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const filed = await fileCounterfeitReport({
      actor: owner,
      business: biz,
      description: 'Trying to resolve without recall',
      batchId: 'batch-1',
    });
    if (!filed.ok) return;
    await startCounterfeitInvestigation({ actor: admin, platform, id: filed.data.id });
    const res = await resolveCounterfeitReport({
      actor: admin,
      platform,
      id: filed.data.id,
      note: 'premature',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('CF_RESOLVE');
  });
});

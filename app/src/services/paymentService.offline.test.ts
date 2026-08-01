import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { recordOfflinePayment, reviewPayment } from './paymentService';

describe('recordOfflinePayment (CF-13)', () => {
  beforeEach(async () => {
    await clearDb();
    const phOwner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phOwner.id, name: 'CarePlus' });
    const stOwner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Owner' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stOwner.id, name: 'MedRoute' });
    const ts = new Date().toISOString();
    await db.connections.add({
      id: 'conn-1',
      pharmacyId: 'biz-ph',
      stockistId: 'biz-st',
      status: 'Active',
      requestedAt: ts,
      statusHistory: [{ from: 'Requested', to: 'Active', at: ts, actorId: 'u-st' }],
      createdAt: ts,
      updatedAt: ts,
    });
    await db.invoices.add({
      id: 'inv-1',
      invoiceNo: 'INV-1',
      orderId: 'ord-1',
      stockistId: 'biz-st',
      pharmacyId: 'biz-ph',
      status: 'Issued',
      lines: [],
      subtotal: 100,
      taxTotal: 12,
      roundOff: 0,
      grandTotal: 112,
      outstanding: 112,
      paidAmount: 0,
      creditApplied: 0,
      issuedAt: ts,
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    });
  });

  it('creates Submitted payment with recordedBy=Stockist and N-305 (AC-Q04)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await recordOfflinePayment({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      amount: 112,
      method: 'Cash',
      reference: 'CASH-001',
      allocations: [{ invoiceId: 'inv-1', amount: 112 }],
      idempotencyKey: 'offline-1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('Submitted');
    expect(res.data.recordedBy).toBe('Stockist');
    const inv = await db.invoices.get('inv-1');
    expect(inv?.outstanding).toBe(112);
    const n = await db.notifications.filter((x) => x.code === 'N-305').first();
    expect(n).toBeTruthy();
  });

  it('updates outstanding only after approval', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const created = await recordOfflinePayment({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      amount: 50,
      method: 'UPI',
      allocations: [{ invoiceId: 'inv-1', amount: 50 }],
      idempotencyKey: 'offline-2',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const approved = await reviewPayment({
      actor,
      stockist,
      paymentId: created.data.id,
      decision: 'Approved',
    });
    expect(approved.ok).toBe(true);
    const inv = await db.invoices.get('inv-1');
    expect(inv?.paidAmount).toBe(50);
    expect(inv?.outstanding).toBe(62);
  });

  it('flags duplicate reference (E-CF-13b)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const first = await recordOfflinePayment({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      amount: 10,
      method: 'NEFT',
      reference: 'DUP-REF',
      allocations: [{ invoiceId: 'inv-1', amount: 10 }],
      idempotencyKey: 'offline-3a',
    });
    expect(first.ok).toBe(true);
    const second = await recordOfflinePayment({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      amount: 10,
      method: 'NEFT',
      reference: 'DUP-REF',
      allocations: [{ invoiceId: 'inv-1', amount: 10 }],
      idempotencyKey: 'offline-3b',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('PAY_REF_DUP');
  });
});

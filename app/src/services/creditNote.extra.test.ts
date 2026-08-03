import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { issueAdvanceCreditNote, issueGoodwillCreditNote, recordOfflinePayment, reviewPayment } from './paymentService';
import { nowIso } from '../domain/utils/clock';

describe('Goodwill & Advance credit notes (CF-39)', () => {
  beforeEach(async () => {
    await clearDb();
    const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Stockist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id });
    const st = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: st.id });
    const ts = nowIso();
    await db.connections.add({
      id: 'c1',
      pharmacyId: 'biz-ph',
      stockistId: 'biz-st',
      status: 'Active',
      requestedAt: ts,
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
    });
    await db.invoices.add({
      id: 'inv-1',
      invoiceNo: 'INV-1',
      orderId: 'o1',
      stockistId: 'biz-st',
      pharmacyId: 'biz-ph',
      status: 'Issued',
      lines: [],
      subtotal: 100,
      taxTotal: 0,
      roundOff: 0,
      grandTotal: 100,
      outstanding: 100,
      paidAmount: 0,
      creditApplied: 0,
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    });
  });

  it('blocks goodwill without reason (E-CF-39a)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await issueGoodwillCreditNote({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      amount: 50,
      reason: '',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('CN_GOODWILL_REASON');
  });

  it('issues goodwill with source badge fields (AC-Q11)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await issueGoodwillCreditNote({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      amount: 25,
      reason: 'Authorised adjustment',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.source).toBe('Goodwill');
    expect(res.data.reason).toBe('Authorised adjustment');
  });

  it('issues advance CN on surplus confirm; blocks over-surplus (E-CF-39b)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const pay = await recordOfflinePayment({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      amount: 150,
      method: 'Cash',
      allocations: [{ invoiceId: 'inv-1', amount: 100 }],
      idempotencyKey: 'pay-surplus',
    });
    expect(pay.ok).toBe(true);
    if (!pay.ok) return;
    const approved = await reviewPayment({
      actor,
      stockist,
      paymentId: pay.data.id,
      decision: 'Approved',
      issueAdvanceCredit: true,
    });
    expect(approved.ok).toBe(true);
    const adv = await db.creditNotes.filter((c) => c.source === 'Advance').first();
    expect(adv?.amount).toBe(50);
    expect(adv?.paymentId).toBe(pay.data.id);

    const over = await issueAdvanceCreditNote({
      actor,
      stockist,
      paymentId: pay.data.id,
      amount: 10,
    });
    expect(over.ok).toBe(false);
  });
});

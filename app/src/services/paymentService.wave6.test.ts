import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { defaultPlatformSettings } from '../data/seed';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import {
  applyCreditNote,
  issueAdvanceCreditNote,
  issueGoodwillCreditNote,
  recordOfflinePayment,
  reviewPayment,
  submitPayment,
  voidInvoice,
  withdrawPayment,
} from './paymentService';
import { sendPaymentReminder } from './reminderService';

const ts = () => new Date().toISOString();

async function seedPair() {
  const phUser = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
  const pharmacy = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phUser.id, name: 'CarePlus' });
  const stUser = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
  const stockist = await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stUser.id, name: 'MedRoute' });
  await db.platformSettings.put(defaultPlatformSettings());
  const now = ts();
  await db.connections.add({
    id: 'conn-1',
    pharmacyId: pharmacy.id,
    stockistId: stockist.id,
    status: 'Active',
    requestedAt: now,
    statusHistory: [{ from: 'Requested', to: 'Active', at: now, actorId: stUser.id }],
    createdAt: now,
    updatedAt: now,
  });
  await db.invoices.add({
    id: 'inv-1',
    invoiceNo: 'INV-1',
    orderId: 'ord-1',
    stockistId: stockist.id,
    pharmacyId: pharmacy.id,
    status: 'Issued',
    lines: [],
    subtotal: 100,
    taxTotal: 12,
    roundOff: 0,
    grandTotal: 112,
    outstanding: 112,
    paidAmount: 0,
    creditApplied: 0,
    issuedAt: now,
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  return { phUser, pharmacy, stUser, stockist };
}

describe('Wave 6 — Money', () => {
  beforeEach(async () => {
    await clearDb();
  });

  describe('roles', () => {
    it('DeliveryStaff cannot submit, record offline, review, void, remind, or issue credit', async () => {
      const { pharmacy, stockist } = await seedPair();
      const phBoy = await makeActor({ id: 'u-ph-ds', businessId: pharmacy.id, role: 'DeliveryStaff' });
      const stBoy = await makeActor({ id: 'u-st-ds', businessId: stockist.id, role: 'DeliveryStaff' });

      const submit = await submitPayment({
        actor: phBoy,
        pharmacy,
        stockistId: stockist.id,
        amount: 50,
        method: 'UPI',
        allocations: [{ invoiceId: 'inv-1', amount: 50 }],
        idempotencyKey: 'w6-ds-submit',
      });
      expect(submit.ok).toBe(false);
      if (!submit.ok) expect(submit.code).toBe('PERM_DENIED');

      const offline = await recordOfflinePayment({
        actor: stBoy,
        stockist,
        pharmacyId: pharmacy.id,
        amount: 50,
        method: 'Cash',
        allocations: [{ invoiceId: 'inv-1', amount: 50 }],
        idempotencyKey: 'w6-ds-off',
      });
      expect(offline.ok).toBe(false);
      if (!offline.ok) expect(offline.code).toBe('PERM_DENIED');

      const pay = await submitPayment({
        actor: (await db.users.get('u-ph'))!,
        pharmacy,
        stockistId: stockist.id,
        amount: 10,
        method: 'UPI',
        allocations: [{ invoiceId: 'inv-1', amount: 10 }],
        idempotencyKey: 'w6-ds-seed-pay',
      });
      expect(pay.ok).toBe(true);
      if (!pay.ok) return;

      const review = await reviewPayment({
        actor: stBoy,
        stockist,
        paymentId: pay.data.id,
        decision: 'Approved',
      });
      expect(review.ok).toBe(false);
      if (!review.ok) expect(review.code).toBe('PERM_DENIED');

      const voided = await voidInvoice({
        actor: stBoy,
        stockist,
        invoiceId: 'inv-1',
        reason: 'mistake',
      });
      expect(voided.ok).toBe(false);
      if (!voided.ok) expect(voided.code).toBe('PERM_DENIED');

      const remind = await sendPaymentReminder({ actor: stBoy, stockist, invoiceId: 'inv-1' });
      expect(remind.ok).toBe(false);
      if (!remind.ok) expect(remind.code).toBe('PERM_DENIED');

      const gw = await issueGoodwillCreditNote({
        actor: stBoy,
        stockist,
        pharmacyId: pharmacy.id,
        amount: 5,
        reason: 'gesture',
      });
      expect(gw.ok).toBe(false);
      if (!gw.ok) expect(gw.code).toBe('PERM_DENIED');
    });
  });

  describe('submit / withdraw', () => {
    it('submits, withdraws Submitted pharmacy payment, blocks stockist-recorded withdraw', async () => {
      const { phUser, pharmacy, stUser, stockist } = await seedPair();
      const submitted = await submitPayment({
        actor: phUser,
        pharmacy,
        stockistId: stockist.id,
        amount: 40,
        method: 'NEFT',
        reference: 'UTR-W6',
        allocations: [{ invoiceId: 'inv-1', amount: 40 }],
        idempotencyKey: 'w6-sub-1',
      });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      expect(submitted.data.status).toBe('Submitted');
      expect(submitted.data.recordedBy).toBe('Pharmacy');

      const withdrawn = await withdrawPayment({
        actor: phUser,
        pharmacy,
        paymentId: submitted.data.id,
        reason: 'wrong amount',
      });
      expect(withdrawn.ok).toBe(true);
      if (!withdrawn.ok) return;
      expect(withdrawn.data.status).toBe('Cancelled');

      const offline = await recordOfflinePayment({
        actor: stUser,
        stockist,
        pharmacyId: pharmacy.id,
        amount: 20,
        method: 'Cash',
        allocations: [{ invoiceId: 'inv-1', amount: 20 }],
        idempotencyKey: 'w6-off-wd',
      });
      expect(offline.ok).toBe(true);
      if (!offline.ok) return;
      const badWithdraw = await withdrawPayment({
        actor: phUser,
        pharmacy,
        paymentId: offline.data.id,
      });
      expect(badWithdraw.ok).toBe(false);
      if (!badWithdraw.ok) expect(badWithdraw.code).toBe('PAY_WITHDRAW_OWNER');
    });

    it('rejects zero amount and over-allocation', async () => {
      const { phUser, pharmacy, stockist } = await seedPair();
      const zero = await submitPayment({
        actor: phUser,
        pharmacy,
        stockistId: stockist.id,
        amount: 0,
        method: 'UPI',
        allocations: [],
        idempotencyKey: 'w6-zero',
      });
      expect(zero.ok).toBe(false);
      if (!zero.ok) expect(zero.code).toBe('PAY_AMOUNT');

      const over = await submitPayment({
        actor: phUser,
        pharmacy,
        stockistId: stockist.id,
        amount: 200,
        method: 'UPI',
        allocations: [{ invoiceId: 'inv-1', amount: 200 }],
        idempotencyKey: 'w6-over',
      });
      expect(over.ok).toBe(false);
      if (!over.ok) expect(over.code).toBe('PAY_ALLOC');
    });
  });

  describe('void invoice', () => {
    it('voids Issued invoice; blocks open payment allocation and settled invoices', async () => {
      const { phUser, pharmacy, stUser, stockist } = await seedPair();
      const openPay = await submitPayment({
        actor: phUser,
        pharmacy,
        stockistId: stockist.id,
        amount: 30,
        method: 'UPI',
        allocations: [{ invoiceId: 'inv-1', amount: 30 }],
        idempotencyKey: 'w6-void-open',
      });
      expect(openPay.ok).toBe(true);
      const blocked = await voidInvoice({
        actor: stUser,
        stockist,
        invoiceId: 'inv-1',
        reason: 'duplicate bill',
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.code).toBe('INV_VOID_OPEN_PAY');

      await withdrawPayment({ actor: phUser, pharmacy, paymentId: openPay.ok ? openPay.data.id : '' });
      const voided = await voidInvoice({
        actor: stUser,
        stockist,
        invoiceId: 'inv-1',
        reason: 'duplicate bill',
      });
      expect(voided.ok).toBe(true);
      if (!voided.ok) return;
      expect(voided.data.status).toBe('Void');
      expect(voided.data.outstanding).toBe(0);

      await db.invoices.add({
        id: 'inv-2',
        invoiceNo: 'INV-2',
        orderId: 'ord-2',
        stockistId: stockist.id,
        pharmacyId: pharmacy.id,
        status: 'Issued',
        lines: [],
        subtotal: 50,
        taxTotal: 0,
        roundOff: 0,
        grandTotal: 50,
        outstanding: 50,
        paidAmount: 0,
        creditApplied: 0,
        statusHistory: [],
        createdAt: ts(),
        updatedAt: ts(),
        version: 1,
      });
      const paidOff = await recordOfflinePayment({
        actor: stUser,
        stockist,
        pharmacyId: pharmacy.id,
        amount: 50,
        method: 'Cash',
        allocations: [{ invoiceId: 'inv-2', amount: 50 }],
        idempotencyKey: 'w6-void-paid',
      });
      expect(paidOff.ok).toBe(true);
      if (!paidOff.ok) return;
      await reviewPayment({ actor: stUser, stockist, paymentId: paidOff.data.id, decision: 'Approved' });
      const settled = await voidInvoice({
        actor: stUser,
        stockist,
        invoiceId: 'inv-2',
        reason: 'too late',
      });
      expect(settled.ok).toBe(false);
      if (!settled.ok) expect(settled.code).toBe('INV_VOID_STATE');
    });
  });

  describe('credit apply + advance', () => {
    it('credit apply respects open payment claims; advance CN requires Approved', async () => {
      const { phUser, pharmacy, stUser, stockist } = await seedPair();
      const cn = await issueGoodwillCreditNote({
        actor: stUser,
        stockist,
        pharmacyId: pharmacy.id,
        amount: 80,
        reason: 'goodwill adjust',
      });
      expect(cn.ok).toBe(true);
      if (!cn.ok) return;

      const claim = await submitPayment({
        actor: phUser,
        pharmacy,
        stockistId: stockist.id,
        amount: 112,
        method: 'UPI',
        allocations: [{ invoiceId: 'inv-1', amount: 112 }],
        idempotencyKey: 'w6-cn-claim',
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) return;

      const applyWhileClaimed = await applyCreditNote({
        actor: phUser,
        business: pharmacy,
        creditNoteId: cn.data.id,
        invoiceId: 'inv-1',
        amount: 10,
      });
      expect(applyWhileClaimed.ok).toBe(false);
      if (!applyWhileClaimed.ok) expect(applyWhileClaimed.code).toBe('CN_APPLY');

      await withdrawPayment({ actor: phUser, pharmacy, paymentId: claim.data.id });

      const offline = await recordOfflinePayment({
        actor: stUser,
        stockist,
        pharmacyId: pharmacy.id,
        amount: 150,
        method: 'Cash',
        allocations: [{ invoiceId: 'inv-1', amount: 112 }],
        idempotencyKey: 'w6-adv-early',
      });
      expect(offline.ok).toBe(true);
      if (!offline.ok) return;
      const earlyAdv = await issueAdvanceCreditNote({
        actor: stUser,
        stockist,
        paymentId: offline.data.id,
        amount: 38,
      });
      expect(earlyAdv.ok).toBe(false);
      if (!earlyAdv.ok) expect(earlyAdv.code).toBe('CN_ADV_STATE');
    });
  });

  describe('maintenance', () => {
    it('pauses review, void, withdraw, and reminders', async () => {
      const { phUser, pharmacy, stUser, stockist } = await seedPair();
      const pay = await submitPayment({
        actor: phUser,
        pharmacy,
        stockistId: stockist.id,
        amount: 25,
        method: 'UPI',
        allocations: [{ invoiceId: 'inv-1', amount: 25 }],
        idempotencyKey: 'w6-maint-pay',
      });
      expect(pay.ok).toBe(true);
      if (!pay.ok) return;

      await db.platformSettings.update('platform', { maintenanceMode: true });

      const review = await reviewPayment({
        actor: stUser,
        stockist,
        paymentId: pay.data.id,
        decision: 'Approved',
      });
      expect(review.ok).toBe(false);
      if (!review.ok) expect(review.code).toBe('MAINTENANCE');

      const withdraw = await withdrawPayment({
        actor: phUser,
        pharmacy,
        paymentId: pay.data.id,
      });
      expect(withdraw.ok).toBe(false);
      if (!withdraw.ok) expect(withdraw.code).toBe('MAINTENANCE');

      const voided = await voidInvoice({
        actor: stUser,
        stockist,
        invoiceId: 'inv-1',
        reason: 'maint',
      });
      expect(voided.ok).toBe(false);
      if (!voided.ok) expect(voided.code).toBe('MAINTENANCE');

      const remind = await sendPaymentReminder({ actor: stUser, stockist, invoiceId: 'inv-1' });
      expect(remind.ok).toBe(false);
      if (!remind.ok) expect(remind.code).toBe('REM_MAINTENANCE');
    });
  });
});

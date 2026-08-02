import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { eligibleReturnQty } from '../ui/components/ReturnLinesForm';
import {
  cancelReturn,
  issueCreditNote,
  recordGoodsReceived,
  reviewReturn,
  submitReturn,
} from './paymentService';
import { runPolicyClock } from './supportService';

const ts = () => new Date().toISOString();

async function seedTrade() {
  const phUser = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
  const stUser = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
  const pharmacy = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phUser.id });
  const stockist = await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stUser.id });
  await makeProduct('biz-st', 'prod-1');
  await db.platformSettings.put({
    id: 'platform',
    returnWindowDays: 7,
    inviteTtlDays: 7,
    verificationSlaHours: 72,
    orderSlaHours: 24,
    paymentSlaHours: 48,
    paymentProofMandatory: false,
    billAheadAllowed: false,
    roundingMode: 'nearest',
    expiryNearDays: 90,
    expiryCriticalDays: 30,
    creditNoteAutoExpire: false,
  });
  const now = ts();
  await db.orders.add({
    id: 'ord-1',
    orderNo: 'ORD-1',
    pharmacyId: 'biz-ph',
    stockistId: 'biz-st',
    connectionId: 'c1',
    status: 'Delivered',
    lines: [
      {
        id: 'ol-1',
        productId: 'prod-1',
        productName: 'Test Dolo',
        sku: 'SKU',
        packSize: '10s',
        qty: 10,
        deliveredQty: 10,
        unitPrice: 100,
        mrp: 120,
        gstPercent: 12,
        lineSubtotal: 1000,
        lineTax: 120,
        lineTotal: 1120,
        batchAllocations: [{ batchId: 'b1', batchNumber: 'BATCH-A', qty: 10, expiryDate: '2027-01-01' }],
      },
    ],
    subtotal: 1000,
    taxTotal: 120,
    grandTotal: 1120,
    deliveryAddress: {
      id: 'addr-1',
      label: 'Shop',
      line1: '1 Test',
      city: 'Pune',
      state: 'MH',
      pincode: '411001',
    },
    idempotencyKey: 'ord-idem-1',
    statusHistory: [
      { from: 'Dispatched', to: 'Delivered', at: now, actorId: 'u-st' },
    ],
    deliveryId: 'del-1',
    invoiceId: 'inv-1',
    placedBy: 'u-ph',
    placedAt: now,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  await db.deliveries.add({
    id: 'del-1',
    deliveryNo: 'DEL-1',
    orderId: 'ord-1',
    stockistId: 'biz-st',
    pharmacyId: 'biz-ph',
    status: 'Delivered',
    lines: [{ productId: 'prod-1', productName: 'Test Dolo', qty: 10, deliveredQty: 10 }],
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
    deliveredAt: now,
  });
  await db.batches.add({
    id: 'b1',
    productId: 'prod-1',
    stockistId: 'biz-st',
    batchNumber: 'BATCH-A',
    expiryDate: '2027-01-01',
    onHand: 90,
    reserved: 0,
    status: 'Available',
    createdAt: now,
    updatedAt: now,
  });
  return { pharmacy, stockist, phUser, stUser };
}

describe('Returns & credit notes hardening', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('rejects re-decide on Closed/Rejected returns', async () => {
    const { pharmacy, stockist, phUser, stUser } = await seedTrade();
    const submitted = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 2, reason: 'Damaged' }],
      idempotencyKey: 'ret-1',
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const approved = await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'Approved',
      approvedQtys: { 'prod-1': 2 },
      disposition: 'Restock',
    });
    expect(approved.ok).toBe(true);
    const cn = await issueCreditNote({ actor: stUser, stockist, returnId: submitted.data.id, idempotencyKey: 'cn-1' });
    expect(cn.ok).toBe(true);
    const again = await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'Rejected',
      reason: 'too late',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('RET_BAD_STATE');
  });

  it('clamps approved qty and blocks all-zero / over-request', async () => {
    const { pharmacy, stockist, phUser, stUser } = await seedTrade();
    const submitted = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 2, reason: 'Damaged' }],
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const over = await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'Approved',
      approvedQtys: { 'prod-1': 999 },
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('RET_APPROVED_QTY');

    const zero = await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'PartiallyApproved',
      approvedQtys: { 'prod-1': 0 },
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.code).toBe('RET_ZERO_APPROVE');

    const neg = await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'Approved',
      approvedQtys: { 'prod-1': -1 },
    });
    expect(neg.ok).toBe(false);
  });

  it('does not bump to UnderReview when reject reason missing', async () => {
    const { pharmacy, stockist, phUser, stUser } = await seedTrade();
    const submitted = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Damaged' }],
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const bad = await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'Rejected',
      reason: '  ',
    });
    expect(bad.ok).toBe(false);
    const ret = await db.returns.get(submitted.data.id);
    expect(ret?.status).toBe('Submitted');
  });

  it('appends Closed history and uses line gstPercent for CN amount', async () => {
    const { pharmacy, stockist, phUser, stUser } = await seedTrade();
    const submitted = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Damaged' }],
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.data.lines[0].gstPercent).toBe(12);
    await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'Approved',
      approvedQtys: { 'prod-1': 1 },
    });
    // Change product GST after approval — CN must still use return line snapshot
    await db.products.update('prod-1', { gstPercent: 5 });
    const cn = await issueCreditNote({ actor: stUser, stockist, returnId: submitted.data.id });
    expect(cn.ok).toBe(true);
    if (!cn.ok) return;
    expect(cn.data.amount).toBe(112); // 100 + 12%
    const ret = await db.returns.get(submitted.data.id);
    expect(ret?.status).toBe('Closed');
    expect(ret?.statusHistory.some((h) => h.to === 'Closed')).toBe(true);
  });

  it('eligible qty uses receivedQty when deliveredQty absent', () => {
    const eligible = eligibleReturnQty(
      { productId: 'p1', qty: 10, receivedQty: 4 },
      [],
    );
    expect(eligible).toBe(4);
  });

  it('enforces return window via statusHistory when delivery missing deliveredAt', async () => {
    const { pharmacy, phUser } = await seedTrade();
    await db.deliveries.update('del-1', { deliveredAt: undefined });
    const old = new Date(Date.now() - 20 * 86400000).toISOString();
    await db.orders.update('ord-1', {
      statusHistory: [{ from: 'Dispatched', to: 'Delivered', at: old, actorId: 'u-st' }],
      deliveryId: undefined,
    });
    const res = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Damaged' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('RET_WINDOW');
  });

  it('fails when no return-window anchor exists', async () => {
    const { pharmacy, phUser } = await seedTrade();
    await db.orders.update('ord-1', {
      deliveryId: undefined,
      statusHistory: [{ from: 'Draft', to: 'Pending', at: ts(), actorId: 'u-ph' }],
    });
    await db.deliveries.delete('del-1');
    const res = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Damaged' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('RET_WINDOW_ANCHOR');
  });

  it('idempotent submitReturn and issueCreditNote', async () => {
    const { pharmacy, stockist, phUser, stUser } = await seedTrade();
    const a = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Damaged' }],
      idempotencyKey: 'same-ret',
    });
    const b = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Damaged' }],
      idempotencyKey: 'same-ret',
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.data.id).toBe(b.data.id);
    await reviewReturn({
      actor: stUser,
      stockist,
      returnId: a.ok ? a.data.id : '',
      decision: 'Approved',
      approvedQtys: { 'prod-1': 1 },
    });
    const c1 = await issueCreditNote({
      actor: stUser,
      stockist,
      returnId: a.ok ? a.data.id : '',
      idempotencyKey: 'same-cn',
    });
    const c2 = await issueCreditNote({
      actor: stUser,
      stockist,
      returnId: a.ok ? a.data.id : '',
      idempotencyKey: 'same-cn',
    });
    expect(c1.ok && c2.ok).toBe(true);
    if (c1.ok && c2.ok) expect(c1.data.id).toBe(c2.data.id);
    const all = await db.creditNotes.toArray();
    expect(all).toHaveLength(1);
  });

  it('cancelReturn moves Submitted to Cancelled', async () => {
    const { pharmacy, phUser } = await seedTrade();
    const submitted = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Damaged' }],
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const cancelled = await cancelReturn({
      actor: phUser,
      pharmacy,
      returnId: submitted.data.id,
      reason: 'mistake',
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.data.status).toBe('Cancelled');
  });

  it('quarantine uses dedicated batch; destroy uses Destroy movement', async () => {
    const { pharmacy, stockist, phUser, stUser } = await seedTrade();
    const submitted = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 2, reason: 'Damaged' }],
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    await reviewReturn({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      decision: 'Approved',
      approvedQtys: { 'prod-1': 2 },
      disposition: 'Quarantine',
    });
    const before = await db.batches.get('b1');
    expect(before?.status).toBe('Available');
    expect(before?.onHand).toBe(90);
    await recordGoodsReceived({
      actor: stUser,
      stockist,
      returnId: submitted.data.id,
      disposition: 'Quarantine',
    });
    const after = await db.batches.get('b1');
    expect(after?.status).toBe('Available');
    expect(after?.onHand).toBe(90);
    const qBatches = await db.batches
      .where('productId')
      .equals('prod-1')
      .filter((b) => b.status === 'Quarantined')
      .toArray();
    expect(qBatches.length).toBe(1);
    expect(qBatches[0].onHand).toBe(2);

    // Separate destroy path on a second return
    const r2 = await submitReturn({
      actor: phUser,
      pharmacy,
      orderId: 'ord-1',
      lines: [{ productId: 'prod-1', qty: 1, reason: 'Expired' }],
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    await reviewReturn({
      actor: stUser,
      stockist,
      returnId: r2.data.id,
      decision: 'Approved',
      approvedQtys: { 'prod-1': 1 },
      disposition: 'Destroy',
    });
    await recordGoodsReceived({
      actor: stUser,
      stockist,
      returnId: r2.data.id,
      disposition: 'Destroy',
    });
    const destroyMoves = await db.inventoryMovements.filter((m) => m.type === 'Destroy').toArray();
    expect(destroyMoves.length).toBe(1);
    expect(destroyMoves[0].qty).toBe(1);
  });

  it('policy clock voids expired CN with audit and N-317', async () => {
    const owner = await makeActor({ id: 'ph-owner', businessId: 'biz-ph2', role: 'Stockist' });
    await makeBusiness({ id: 'biz-ph2', type: 'Pharmacy', ownerUserId: owner.id });
    await makeActor({ id: 'st-owner', businessId: 'biz-st2', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st2', type: 'Stockist', ownerUserId: 'st-owner' });
    await db.platformSettings.put({
      id: 'platform',
      returnWindowDays: 7,
      inviteTtlDays: 7,
      verificationSlaHours: 72,
      orderSlaHours: 24,
      paymentSlaHours: 48,
      paymentProofMandatory: false,
      billAheadAllowed: false,
      roundingMode: 'nearest',
      expiryNearDays: 90,
      expiryCriticalDays: 30,
      creditNoteAutoExpire: true,
      creditNoteExpiryDays: 90,
    });
    const past = new Date(Date.now() - 100 * 86400000).toISOString();
    await db.creditNotes.add({
      id: 'cn-exp',
      creditNoteNo: 'CN-EXP',
      stockistId: 'biz-st2',
      pharmacyId: 'biz-ph2',
      status: 'Issued',
      amount: 50,
      remaining: 50,
      applications: [],
      source: 'Goodwill',
      issuedAt: past,
      expiresAt: past,
      issuedBy: 'st-owner',
      createdAt: past,
      updatedAt: past,
    });
    await runPolicyClock();
    const cn = await db.creditNotes.get('cn-exp');
    expect(cn?.status).toBe('Void');
    expect(cn?.remaining).toBe(0);
    const audits = await db.auditLogs.filter((a) => a.action === 'credit.expire').toArray();
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const notes = await db.notifications.where('userId').equals(owner.id).toArray();
    expect(notes.some((n) => n.code === 'N-317')).toBe(true);
  });
});

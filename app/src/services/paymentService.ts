import type { Business, CreditNote, Payment, ReturnRequest, User } from '../domain/entities/types';
import {
  applyCredit,
  calcPaymentAllocationValidity,
  deriveInvoiceStatus,
  invoiceOutstanding,
  remainingCredit,
  returnLineValue,
} from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { roundMoney } from '../domain/utils/money';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

export async function submitPayment(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  amount: number;
  method: Payment['method'];
  reference?: string;
  proofFileId?: string;
  allocations: { invoiceId: string; amount: number }[];
  notes?: string;
  idempotencyKey: string;
}): Promise<Result<Payment>> {
  const perm = assertCan(params.actor, params.pharmacy, 'payment.submit');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Payment was not submitted.');

  const existing = await db.payments.where('idempotencyKey').equals(params.idempotencyKey).first();
  if (existing) {
    return fail('Duplicate', 'PAY_IDEMPOTENT', 'This payment was already submitted.', 'A duplicate payment was not created.', {
      existingId: existing.id,
      retrySafe: true,
    });
  }

  const settings = await db.platformSettings.get('platform');
  if (settings?.paymentProofMandatory && !params.proofFileId) {
    return fail('Validation', 'PAY_PROOF', 'Payment proof is mandatory.', 'Payment was not submitted.');
  }

  if (params.reference) {
    const dupRef = await db.payments
      .where('reference')
      .equals(params.reference)
      .filter((p) => p.pharmacyId === params.pharmacy.id && p.status !== 'Rejected' && p.status !== 'Cancelled')
      .first();
    if (dupRef) {
      await notifyBusinessUsers(params.stockistId, 'N-055', { reference: params.reference }, { type: 'Payment', id: dupRef.id });
      return fail('Duplicate', 'PAY_REF_DUP', 'Payment reference appears to be a duplicate.', 'Payment was not submitted.', {
        existingId: dupRef.id,
      });
    }
  }

  const allocWithOut: { amount: number; outstanding: number; invoiceId: string; invoiceNo: string }[] = [];
  for (const a of params.allocations) {
    const inv = await db.invoices.get(a.invoiceId);
    if (!inv || inv.pharmacyId !== params.pharmacy.id || inv.stockistId !== params.stockistId) {
      return fail('NotFound', 'PAY_INV', 'Invoice not found for allocation.', 'Payment was not submitted.');
    }
    if (inv.status === 'Void' || inv.status === 'Paid') {
      return fail('BusinessRule', 'PAY_INV_STATE', `Invoice ${inv.invoiceNo} is not payable.`, 'Payment was not submitted.');
    }
    allocWithOut.push({
      amount: a.amount,
      outstanding: invoiceOutstanding(inv),
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
    });
  }

  const validity = calcPaymentAllocationValidity(
    params.amount,
    allocWithOut.map((a) => ({ amount: a.amount, outstanding: a.outstanding })),
  );
  if (!validity.ok) {
    return fail('Validation', 'PAY_ALLOC', validity.reason!, 'Payment was not submitted.');
  }

  const ts = new Date().toISOString();
  const payment: Payment = {
    id: newId(),
    paymentNo: nextNumber('PAY'),
    pharmacyId: params.pharmacy.id,
    stockistId: params.stockistId,
    status: 'Submitted',
    amount: roundMoney(params.amount),
    method: params.method,
    reference: params.reference,
    proofFileId: params.proofFileId,
    allocations: allocWithOut.map((a) => ({ invoiceId: a.invoiceId, invoiceNo: a.invoiceNo, amount: a.amount })),
    notes: params.notes,
    submittedBy: params.actor.id,
    submittedAt: ts,
    recordedBy: 'Pharmacy',
    idempotencyKey: params.idempotencyKey,
    statusHistory: [{ from: 'Draft', to: 'Submitted', at: ts, actorId: params.actor.id }],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.payments.add(payment);
  await notifyBusinessUsers(params.stockistId, 'N-030', { paymentNo: payment.paymentNo }, { type: 'Payment', id: payment.id });
  return ok(payment);
}

/** CF-13: stockist records an off-platform remittance → Submitted, recordedBy=Stockist; outstanding changes only on approve */
export async function recordOfflinePayment(params: {
  actor: User;
  stockist: Business;
  pharmacyId: string;
  amount: number;
  method: Payment['method'];
  reference?: string;
  remittanceDate?: string;
  proofFileId?: string;
  allocations: { invoiceId: string; amount: number }[];
  notes?: string;
  idempotencyKey: string;
}): Promise<Result<Payment>> {
  const perm = assertCan(params.actor, params.stockist, 'payment.recordOffline');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Payment was not recorded.');
  if (params.stockist.type !== 'Stockist') {
    return fail('BusinessRule', 'PAY_ROLE', 'Only stockists can record offline payments.', 'Payment was not recorded.');
  }

  const existing = await db.payments.where('idempotencyKey').equals(params.idempotencyKey).first();
  if (existing) {
    return fail('Duplicate', 'PAY_IDEMPOTENT', 'This payment was already recorded.', 'A duplicate payment was not created.', {
      existingId: existing.id,
      retrySafe: true,
    });
  }

  const pharmacy = await db.businesses.get(params.pharmacyId);
  if (!pharmacy || pharmacy.type !== 'Pharmacy') {
    return fail('NotFound', 'PAY_PHARM', 'Pharmacy not found.', 'Payment was not recorded.');
  }
  if (pharmacy.accountStatus === 'Suspended') {
    return fail('BusinessRule', 'PAY_PHARM_SUSP', 'Pharmacy account is suspended.', 'Payment was not recorded.');
  }
  const conn = await db.connections
    .where('stockistId')
    .equals(params.stockist.id)
    .filter((c) => c.pharmacyId === params.pharmacyId && c.status === 'Active')
    .first();
  if (!conn) {
    return fail('BusinessRule', 'PAY_CONN', 'Active connection required to record a payment.', 'Payment was not recorded.');
  }

  if (params.reference) {
    const dupRef = await db.payments
      .where('reference')
      .equals(params.reference)
      .filter((p) => p.pharmacyId === params.pharmacyId && p.status !== 'Rejected' && p.status !== 'Cancelled')
      .first();
    if (dupRef) {
      return fail('Duplicate', 'PAY_REF_DUP', 'Payment reference appears to be a duplicate.', 'Payment was not recorded.', {
        existingId: dupRef.id,
      });
    }
  }

  const allocWithOut: { amount: number; outstanding: number; invoiceId: string; invoiceNo: string }[] = [];
  for (const a of params.allocations) {
    const inv = await db.invoices.get(a.invoiceId);
    if (!inv || inv.pharmacyId !== params.pharmacyId || inv.stockistId !== params.stockist.id) {
      return fail('NotFound', 'PAY_INV', 'Invoice not found for allocation.', 'Payment was not recorded.');
    }
    if (inv.status === 'Void' || inv.status === 'Paid') {
      return fail('BusinessRule', 'PAY_INV_STATE', `Invoice ${inv.invoiceNo} is not payable.`, 'Payment was not recorded.');
    }
    allocWithOut.push({
      amount: a.amount,
      outstanding: invoiceOutstanding(inv),
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
    });
  }

  const validity = calcPaymentAllocationValidity(
    params.amount,
    allocWithOut.map((a) => ({ amount: a.amount, outstanding: a.outstanding })),
    { allowSurplus: true },
  );
  if (!validity.ok) {
    return fail('Validation', 'PAY_ALLOC', validity.reason!, 'Payment was not recorded.');
  }

  const ts = new Date().toISOString();
  const remittanceNote = params.remittanceDate ? `Remittance date: ${params.remittanceDate}` : undefined;
  const notes = [params.notes?.trim(), remittanceNote].filter(Boolean).join(' · ') || undefined;
  const payment: Payment = {
    id: newId(),
    paymentNo: nextNumber('PAY'),
    pharmacyId: params.pharmacyId,
    stockistId: params.stockist.id,
    status: 'Submitted',
    amount: roundMoney(params.amount),
    method: params.method,
    reference: params.reference,
    proofFileId: params.proofFileId,
    allocations: allocWithOut.map((a) => ({ invoiceId: a.invoiceId, invoiceNo: a.invoiceNo, amount: a.amount })),
    notes,
    submittedBy: params.actor.id,
    submittedAt: ts,
    recordedBy: 'Stockist',
    idempotencyKey: params.idempotencyKey,
    statusHistory: [{ from: 'Draft', to: 'Submitted', at: ts, actorId: params.actor.id }],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.payments.add(payment);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Payment',
    entityId: payment.id,
    action: 'payment.recordOffline',
    after: { paymentNo: payment.paymentNo, recordedBy: 'Stockist', amount: payment.amount },
  });
  await notifyBusinessUsers(params.pharmacyId, 'N-305', { paymentNo: payment.paymentNo }, { type: 'Payment', id: payment.id });
  return ok(payment);
}

export async function reviewPayment(params: {
  actor: User;
  stockist: Business;
  paymentId: string;
  decision: 'Approved' | 'Rejected' | 'OnHold' | 'UnderReview';
  reason?: string;
  /** CF-39: when approving a stockist-recorded payment with surplus, issue Advance CN */
  issueAdvanceCredit?: boolean;
}): Promise<Result<Payment>> {
  const action = params.decision === 'Approved' ? 'payment.approve' : 'payment.reject';
  const perm = assertCan(params.actor, params.stockist, action);
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Payment decision was not saved.');

  const payment = await db.payments.get(params.paymentId);
  if (!payment || payment.stockistId !== params.stockist.id) {
    return fail('NotFound', 'PAY_MISSING', 'Payment not found.', 'Payment decision was not saved.');
  }
  const t = machines.payment(payment.status, params.decision);
  if (!t.ok) return fail('StateConflict', 'PAY_BAD_STATE', t.reason!, 'Payment decision was not saved.');
  if ((params.decision === 'Rejected' || params.decision === 'OnHold') && !params.reason?.trim()) {
    return fail('Validation', 'PAY_REASON', 'Reason is required.', 'Payment decision was not saved.');
  }

  const ts = new Date().toISOString();
  const allocatedSum = roundMoney(payment.allocations.reduce((s, a) => s + a.amount, 0));
  const surplus = roundMoney(payment.amount - allocatedSum);

  if (params.decision === 'Approved' && params.issueAdvanceCredit && surplus > 0.005) {
    if (payment.recordedBy !== 'Stockist') {
      return fail(
        'BusinessRule',
        'CN_ADV_FLOW',
        'Advance credit notes are only for stockist-recorded payments.',
        'Payment was not approved.',
      );
    }
  }

  await db.payments.update(payment.id, {
    status: params.decision,
    reviewedBy: params.actor.id,
    reviewedAt: ts,
    rejectReason: params.decision === 'Rejected' ? params.reason : payment.rejectReason,
    holdReason: params.decision === 'OnHold' ? params.reason : payment.holdReason,
    updatedAt: ts,
    statusHistory: [...payment.statusHistory, { from: payment.status, to: params.decision, at: ts, actorId: params.actor.id, reason: params.reason }],
  });

  if (params.decision === 'Approved') {
    for (const a of payment.allocations) {
      const inv = await db.invoices.get(a.invoiceId);
      if (!inv) continue;
      const paidAmount = roundMoney(inv.paidAmount + a.amount);
      const outstanding = invoiceOutstanding({ ...inv, paidAmount });
      const status = deriveInvoiceStatus({ ...inv, paidAmount });
      await db.invoices.update(inv.id, {
        paidAmount,
        outstanding,
        status,
        updatedAt: ts,
        version: inv.version + 1,
        statusHistory: [...inv.statusHistory, { from: inv.status, to: status, at: ts, actorId: params.actor.id }],
      });
    }
    if (params.issueAdvanceCredit && surplus > 0.005) {
      const adv = await issueAdvanceCreditNote({
        actor: params.actor,
        stockist: params.stockist,
        paymentId: payment.id,
        amount: surplus,
      });
      if (!adv.ok) {
        // Payment already approved — surface advance failure without rolling back settlement
        await writeAudit({
          actorId: params.actor.id,
          actorName: params.actor.name,
          businessId: params.stockist.id,
          entityType: 'Payment',
          entityId: payment.id,
          action: 'payment.advanceCreditFailed',
          reason: adv.message,
        });
      }
    }
    await notifyBusinessUsers(payment.pharmacyId, 'N-031', { paymentNo: payment.paymentNo }, { type: 'Payment', id: payment.id });
  } else if (params.decision === 'Rejected') {
    await notifyBusinessUsers(payment.pharmacyId, 'N-032', { paymentNo: payment.paymentNo, reason: params.reason ?? '' }, {
      type: 'Payment',
      id: payment.id,
    });
  } else if (params.decision === 'OnHold') {
    await notifyBusinessUsers(payment.pharmacyId, 'N-033', { paymentNo: payment.paymentNo, reason: params.reason ?? '' }, {
      type: 'Payment',
      id: payment.id,
    });
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Payment',
    entityId: payment.id,
    action: `payment.${params.decision}`,
    reason: params.reason,
  });
  return ok((await db.payments.get(payment.id))!);
}

export async function submitReturn(params: {
  actor: User;
  pharmacy: Business;
  orderId: string;
  lines: { productId: string; qty: number; reason: string; batchNumber?: string }[];
  evidenceFileIds?: string[];
}): Promise<Result<ReturnRequest>> {
  const perm = assertCan(params.actor, params.pharmacy, 'return.raise');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Return was not submitted.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'RET_ORD', 'Order not found.', 'Return was not submitted.');
  }
  if (!['Delivered', 'PartiallyDelivered', 'Closed'].includes(order.status)) {
    return fail('BusinessRule', 'RET_STATE', 'Returns are only allowed after delivery.', 'Return was not submitted.');
  }

  const settings = await db.platformSettings.get('platform');
  const delivery = order.deliveryId ? await db.deliveries.get(order.deliveryId) : undefined;
  if (delivery?.deliveredAt) {
    const windowDays = settings?.returnWindowDays ?? 7;
    const elapsed = (Date.now() - new Date(delivery.deliveredAt).getTime()) / 86400000;
    if (elapsed > windowDays) {
      return fail('BusinessRule', 'RET_WINDOW', `Return window of ${windowDays} days has expired.`, 'Return was not submitted.');
    }
  }

  const priorReturns = await db.returns.where('orderId').equals(order.id).toArray();
  const priorQty = (productId: string) =>
    priorReturns
      .filter((r) => !['Rejected', 'Cancelled'].includes(r.status))
      .flatMap((r) => r.lines)
      .filter((l) => l.productId === productId)
      .reduce((s, l) => s + (l.approvedQty ?? l.qty), 0);

  const lines = [];
  for (const rl of params.lines) {
    const ol = order.lines.find((l) => l.productId === rl.productId);
    if (!ol) return fail('Validation', 'RET_LINE', 'Product not on order.', 'Return was not submitted.');
    const delivered = ol.deliveredQty ?? ol.receivedQty ?? ol.qty;
    const max = delivered - priorQty(rl.productId);
    if (rl.qty <= 0 || rl.qty > max) {
      return fail('Validation', 'RET_QTY', `Return qty for ${ol.productName} exceeds eligible ${max}.`, 'Return was not submitted.');
    }
    if (!rl.reason.trim()) {
      return fail('Validation', 'RET_REASON', 'Reason is required for each line.', 'Return was not submitted.');
    }
    lines.push({
      productId: rl.productId,
      productName: ol.productName,
      qty: rl.qty,
      unitPrice: ol.unitPrice,
      reason: rl.reason,
      batchNumber: rl.batchNumber ?? ol.batchAllocations?.[0]?.batchNumber,
      deliveryId: order.deliveryId!,
      invoiceId: order.invoiceId,
    });
  }

  const ts = new Date().toISOString();
  const ret: ReturnRequest = {
    id: newId(),
    returnNo: nextNumber('RET'),
    pharmacyId: order.pharmacyId,
    stockistId: order.stockistId,
    orderId: order.id,
    status: 'Submitted',
    lines,
    evidenceFileIds: params.evidenceFileIds ?? [],
    submittedBy: params.actor.id,
    statusHistory: [{ from: 'Draft', to: 'Submitted', at: ts, actorId: params.actor.id }],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.returns.add(ret);
  await notifyBusinessUsers(order.stockistId, 'N-034', { returnNo: ret.returnNo }, { type: 'Return', id: ret.id });
  return ok(ret);
}

export async function reviewReturn(params: {
  actor: User;
  stockist: Business;
  returnId: string;
  decision: 'Approved' | 'PartiallyApproved' | 'Rejected';
  approvedQtys?: Record<string, number>;
  reason?: string;
  disposition?: string;
}): Promise<Result<ReturnRequest>> {
  const perm = assertCan(params.actor, params.stockist, 'return.approve');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Return decision was not saved.');
  const ret = await db.returns.get(params.returnId);
  if (!ret || ret.stockistId !== params.stockist.id) {
    return fail('NotFound', 'RET_MISSING', 'Return not found.', 'Return decision was not saved.');
  }
  const t = machines.return(ret.status === 'Submitted' ? 'UnderReview' : ret.status, params.decision);
  // Allow Submitted -> UnderReview -> decision, or Submitted -> decision via intermediate
  let from = ret.status;
  if (from === 'Submitted') {
    from = 'UnderReview';
    await db.returns.update(ret.id, {
      status: 'UnderReview',
      statusHistory: [...ret.statusHistory, { from: 'Submitted', to: 'UnderReview', at: new Date().toISOString(), actorId: params.actor.id }],
    });
  }
  const t2 = machines.return(from === 'UnderReview' ? 'UnderReview' : ret.status, params.decision);
  if (!t2.ok && !t.ok) {
    const check = machines.return('UnderReview', params.decision);
    if (!check.ok) return fail('StateConflict', 'RET_BAD_STATE', check.reason!, 'Return decision was not saved.');
  }
  if (params.decision === 'Rejected' && !params.reason?.trim()) {
    return fail('Validation', 'RET_REASON', 'Rejection reason is required.', 'Return decision was not saved.');
  }

  const ts = new Date().toISOString();
  const lines = ret.lines.map((l) => ({
    ...l,
    approvedQty:
      params.decision === 'Rejected'
        ? 0
        : (params.approvedQtys?.[l.productId] ?? (params.decision === 'Approved' ? l.qty : l.approvedQty ?? l.qty)),
  }));

  await db.returns.update(ret.id, {
    status: params.decision,
    lines,
    rejectReason: params.reason,
    disposition: params.disposition,
    updatedAt: ts,
    statusHistory: [
      ...(await db.returns.get(ret.id))!.statusHistory,
      { from: 'UnderReview', to: params.decision, at: ts, actorId: params.actor.id, reason: params.reason },
    ],
  });

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Return',
    entityId: ret.id,
    action: `return.${params.decision}`,
    reason: params.reason,
    after: { status: params.decision, returnNo: ret.returnNo, disposition: params.disposition },
  });
  if (params.decision === 'Approved' || params.decision === 'PartiallyApproved') {
    await notifyBusinessUsers(ret.pharmacyId, 'N-035', { returnNo: ret.returnNo }, { type: 'Return', id: ret.id });
  } else {
    await notifyBusinessUsers(ret.pharmacyId, 'N-036', { returnNo: ret.returnNo, reason: params.reason ?? '' }, { type: 'Return', id: ret.id });
  }
  return ok((await db.returns.get(ret.id))!);
}

export async function issueCreditNote(params: {
  actor: User;
  stockist: Business;
  returnId: string;
}): Promise<Result<CreditNote>> {
  const perm = assertCan(params.actor, params.stockist, 'credit.issue');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Credit note was not issued.');
  const ret = await db.returns.get(params.returnId);
  if (!ret || ret.stockistId !== params.stockist.id) {
    return fail('NotFound', 'RET_MISSING', 'Return not found.', 'Credit note was not issued.');
  }
  if (!['Approved', 'PartiallyApproved', 'GoodsReceived'].includes(ret.status)) {
    return fail('BusinessRule', 'CN_STATE', 'Return must be approved before credit note.', 'Credit note was not issued.');
  }
  if (ret.creditNoteId) {
    return fail('Duplicate', 'CN_EXISTS', 'Credit note already issued.', 'A second credit note was not created.', {
      existingId: ret.creditNoteId,
    });
  }

  let amount = 0;
  for (const l of ret.lines) {
    const qty = l.approvedQty ?? 0;
    const product = await db.products.get(l.productId);
    const gst = product?.gstPercent ?? 12;
    amount += returnLineValue(qty, l.unitPrice, gst).lineTotal;
  }
  amount = roundMoney(amount);
  if (amount <= 0) return fail('Validation', 'CN_ZERO', 'Credit amount is zero.', 'Credit note was not issued.');

  const ts = new Date().toISOString();
  const cn: CreditNote = {
    id: newId(),
    creditNoteNo: nextNumber('CN'),
    returnId: ret.id,
    stockistId: ret.stockistId,
    pharmacyId: ret.pharmacyId,
    status: 'Issued',
    amount,
    remaining: amount,
    applications: [],
    source: 'Return',
    issuedAt: ts,
    issuedBy: params.actor.id,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.transaction('rw', db.creditNotes, db.returns, async () => {
    await db.creditNotes.add(cn);
    await db.returns.update(ret.id, { creditNoteId: cn.id, status: 'Closed', updatedAt: ts });
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'CreditNote',
    entityId: cn.id,
    action: 'credit.issue',
    after: { creditNoteNo: cn.creditNoteNo, amount, returnId: ret.id },
  });
  await notifyBusinessUsers(ret.pharmacyId, 'N-037', { creditNoteNo: cn.creditNoteNo, amount: String(amount) }, {
    type: 'CreditNote',
    id: cn.id,
  });
  return ok(cn);
}

/** CF-39: manual goodwill credit note — reason required */
export async function issueGoodwillCreditNote(params: {
  actor: User;
  stockist: Business;
  pharmacyId: string;
  amount: number;
  reason: string;
}): Promise<Result<CreditNote>> {
  const perm = assertCan(params.actor, params.stockist, 'credit.issue');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Credit note was not issued.');
  if (!params.reason.trim()) {
    return fail('Validation', 'CN_GOODWILL_REASON', 'Reason is required for a goodwill credit note.', 'Credit note was not issued.');
  }
  if (params.amount <= 0) return fail('Validation', 'CN_ZERO', 'Credit amount must be positive.', 'Credit note was not issued.');
  const pharmacy = await db.businesses.get(params.pharmacyId);
  if (!pharmacy || pharmacy.type !== 'Pharmacy') {
    return fail('NotFound', 'CN_PHARM', 'Pharmacy not found.', 'Credit note was not issued.');
  }
  const conn = await db.connections
    .where('stockistId')
    .equals(params.stockist.id)
    .filter((c) => c.pharmacyId === params.pharmacyId && c.status === 'Active')
    .first();
  if (!conn) {
    return fail('BusinessRule', 'CN_CONN', 'Active connection required.', 'Credit note was not issued.');
  }
  const ts = new Date().toISOString();
  const cn: CreditNote = {
    id: newId(),
    creditNoteNo: nextNumber('CN'),
    stockistId: params.stockist.id,
    pharmacyId: params.pharmacyId,
    status: 'Issued',
    amount: roundMoney(params.amount),
    remaining: roundMoney(params.amount),
    applications: [],
    source: 'Goodwill',
    reason: params.reason.trim(),
    issuedAt: ts,
    issuedBy: params.actor.id,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.creditNotes.add(cn);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'CreditNote',
    entityId: cn.id,
    action: 'credit.issueGoodwill',
    reason: params.reason,
    after: { creditNoteNo: cn.creditNoteNo, amount: cn.amount, source: 'Goodwill' },
  });
  await notifyBusinessUsers(params.pharmacyId, 'N-037', { creditNoteNo: cn.creditNoteNo, amount: String(cn.amount) }, {
    type: 'CreditNote',
    id: cn.id,
  });
  return ok(cn);
}

/** CF-39: advance CN from payment surplus — amount must not exceed surplus */
export async function issueAdvanceCreditNote(params: {
  actor: User;
  stockist: Business;
  paymentId: string;
  amount: number;
}): Promise<Result<CreditNote>> {
  const perm = assertCan(params.actor, params.stockist, 'credit.issue');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Advance credit was not issued.');
  const payment = await db.payments.get(params.paymentId);
  if (!payment || payment.stockistId !== params.stockist.id) {
    return fail('NotFound', 'CN_PAY', 'Payment not found.', 'Advance credit was not issued.');
  }
  if (payment.recordedBy !== 'Stockist') {
    return fail('BusinessRule', 'CN_ADV_FLOW', 'Advance credit only for stockist-recorded payments.', 'Advance credit was not issued.');
  }
  const allocated = roundMoney(payment.allocations.reduce((s, a) => s + a.amount, 0));
  const surplus = roundMoney(payment.amount - allocated);
  if (params.amount <= 0 || params.amount - surplus > 0.005) {
    return fail('BusinessRule', 'CN_ADV_SURPLUS', 'Advance credit cannot exceed the payment surplus.', 'Advance credit was not issued.');
  }
  const existing = await db.creditNotes.where('stockistId').equals(params.stockist.id).filter((c) => c.paymentId === payment.id).first();
  if (existing) {
    return fail('Duplicate', 'CN_ADV_DUP', 'Advance credit already issued for this payment.', 'A second advance was not created.', {
      existingId: existing.id,
    });
  }
  const ts = new Date().toISOString();
  const cn: CreditNote = {
    id: newId(),
    creditNoteNo: nextNumber('CN'),
    stockistId: params.stockist.id,
    pharmacyId: payment.pharmacyId,
    status: 'Issued',
    amount: roundMoney(params.amount),
    remaining: roundMoney(params.amount),
    applications: [],
    source: 'Advance',
    paymentId: payment.id,
    reason: `Surplus from ${payment.paymentNo}`,
    issuedAt: ts,
    issuedBy: params.actor.id,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.creditNotes.add(cn);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'CreditNote',
    entityId: cn.id,
    action: 'credit.issueAdvance',
    after: { creditNoteNo: cn.creditNoteNo, amount: cn.amount, paymentId: payment.id },
  });
  await notifyBusinessUsers(payment.pharmacyId, 'N-037', { creditNoteNo: cn.creditNoteNo, amount: String(cn.amount) }, {
    type: 'CreditNote',
    id: cn.id,
  });
  return ok(cn);
}

export async function applyCreditNote(params: {
  actor: User;
  business: Business;
  creditNoteId: string;
  invoiceId: string;
  amount: number;
}): Promise<Result<CreditNote>> {
  const perm = assertCan(params.actor, params.business, 'credit.apply');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Credit was not applied.');
  const cn = await db.creditNotes.get(params.creditNoteId);
  if (!cn) return fail('NotFound', 'CN_MISSING', 'Credit note not found.', 'Credit was not applied.');
  if (cn.pharmacyId !== params.business.id && cn.stockistId !== params.business.id) {
    return fail('Permission', 'CN_BOUNDARY', 'Not a party to this credit note.', 'Credit was not applied.');
  }
  const inv = await db.invoices.get(params.invoiceId);
  if (!inv || inv.pharmacyId !== cn.pharmacyId || inv.stockistId !== cn.stockistId) {
    return fail('NotFound', 'CN_INV', 'Invoice not found.', 'Credit was not applied.');
  }
  const rem = remainingCredit(cn);
  const out = invoiceOutstanding(inv);
  const check = applyCredit(rem, out, params.amount);
  if (!check.ok) return fail('Validation', 'CN_APPLY', check.reason!, 'Credit was not applied.');

  const ts = new Date().toISOString();
  const applications = [
    ...cn.applications,
    { invoiceId: inv.id, invoiceNo: inv.invoiceNo, amount: check.applied, at: ts, actorId: params.actor.id },
  ];
  const remaining = remainingCredit({ amount: cn.amount, applications });
  const status = remaining <= 0 ? 'FullyApplied' : 'PartiallyApplied';
  const creditApplied = roundMoney(inv.creditApplied + check.applied);
  const outstanding = invoiceOutstanding({ ...inv, creditApplied });
  const invStatus = deriveInvoiceStatus({ ...inv, creditApplied });

  await db.transaction('rw', db.creditNotes, db.invoices, async () => {
    await db.creditNotes.update(cn.id, { applications, remaining, status, updatedAt: ts });
    await db.invoices.update(inv.id, {
      creditApplied,
      outstanding,
      status: invStatus,
      updatedAt: ts,
      version: inv.version + 1,
    });
  });

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'CreditNote',
    entityId: cn.id,
    action: 'credit.apply',
    after: { applied: check.applied, invoiceNo: inv.invoiceNo, remaining },
  });
  await notifyBusinessUsers(cn.pharmacyId, 'N-038', { amount: String(check.applied), invoiceNo: inv.invoiceNo }, {
    type: 'CreditNote',
    id: cn.id,
  });
  return ok((await db.creditNotes.get(cn.id))!);
}

export async function voidInvoice(params: {
  actor: User;
  stockist: Business;
  invoiceId: string;
  reason: string;
}): Promise<Result<import("../domain/entities/types").Invoice>> {
  const perm = assertCan(params.actor, params.stockist, "invoice.void");
  if (!perm.allow) return fail("Permission", "PERM_DENIED", perm.reason!, "Invoice was not voided.");
  if (!params.reason.trim()) return fail("Validation", "INV_VOID_REASON", "Void reason is required.", "Invoice was not voided.");
  const inv = await db.invoices.get(params.invoiceId);
  if (!inv || inv.stockistId !== params.stockist.id) {
    return fail("NotFound", "INV_MISSING", "Invoice not found.", "Invoice was not voided.");
  }
  if (!["Issued", "Overdue"].includes(inv.status)) {
    return fail("StateConflict", "INV_VOID_STATE", "Only Issued/Overdue invoices with no settlement can be voided.", "Invoice was not voided.");
  }
  if (inv.paidAmount > 0 || inv.creditApplied > 0) {
    return fail("BusinessRule", "INV_VOID_SETTLED", "Cannot void an invoice with payments or credit applied.", "Invoice was not voided.");
  }
  const t = machines.invoice(inv.status, "Void");
  if (!t.ok) return fail("StateConflict", "INV_BAD_STATE", t.reason!, "Invoice was not voided.");
  const ts = new Date().toISOString();
  await db.invoices.update(inv.id, {
    status: "Void",
    voidReason: params.reason,
    outstanding: 0,
    updatedAt: ts,
    version: inv.version + 1,
    statusHistory: [...inv.statusHistory, { from: inv.status, to: "Void", at: ts, actorId: params.actor.id, reason: params.reason }],
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: "Invoice",
    entityId: inv.id,
    action: "invoice.void",
    reason: params.reason,
    after: { invoiceNo: inv.invoiceNo, status: "Void" },
  });
  await notifyBusinessUsers(inv.pharmacyId, "N-029", { invoiceNo: inv.invoiceNo, reason: params.reason }, { type: "Invoice", id: inv.id });
  return ok((await db.invoices.get(inv.id))!);
}

export async function recordGoodsReceived(params: {
  actor: User;
  stockist: Business;
  returnId: string;
  disposition: "Restock" | "Quarantine" | "Destroy";
}): Promise<Result<ReturnRequest>> {
  const perm = assertCan(params.actor, params.stockist, "return.approve");
  if (!perm.allow) return fail("Permission", "PERM_DENIED", perm.reason!, "Goods receipt was not recorded.");
  const ret = await db.returns.get(params.returnId);
  if (!ret || ret.stockistId !== params.stockist.id) {
    return fail("NotFound", "RET_MISSING", "Return not found.", "Goods receipt was not recorded.");
  }
  const t = machines.return(ret.status, "GoodsReceived");
  if (!t.ok) return fail("StateConflict", "RET_BAD_STATE", t.reason!, "Goods receipt was not recorded.");
  const ts = new Date().toISOString();
  for (const line of ret.lines) {
    const qty = line.approvedQty ?? 0;
    if (qty <= 0) continue;
    const product = await db.products.get(line.productId);
    if (!product) continue;
    let batch = line.batchNumber
      ? (await db.batches.where('productId').equals(line.productId).filter((b) => b.stockistId === params.stockist.id && b.batchNumber === line.batchNumber).first())
      : undefined;
    if (params.disposition === "Restock") {
      if (!batch) {
        batch = {
          id: newId(),
          productId: line.productId,
          stockistId: params.stockist.id,
          batchNumber: line.batchNumber || `RET-${ret.returnNo.slice(-4)}`,
          expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
          onHand: 0,
          reserved: 0,
          status: "Available",
          createdAt: ts,
          updatedAt: ts,
        };
        await db.batches.add(batch);
      }
      const prev = batch.onHand;
      await db.batches.update(batch.id, { onHand: prev + qty, status: "Available", updatedAt: ts });
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.stockist.id,
        productId: line.productId,
        batchId: batch.id,
        type: "ReturnIn",
        qty,
        reason: `Return ${ret.returnNo} restock`,
        sourceDocType: "Return",
        sourceDocId: ret.id,
        actorId: params.actor.id,
        prevQty: prev,
        newQty: prev + qty,
        at: ts,
      });
    } else if (params.disposition === "Quarantine") {
      if (batch) {
        await db.batches.update(batch.id, { status: "Quarantined", updatedAt: ts });
      }
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.stockist.id,
        productId: line.productId,
        batchId: batch?.id,
        type: "Quarantine",
        qty,
        reason: `Return ${ret.returnNo} quarantine`,
        sourceDocType: "Return",
        sourceDocId: ret.id,
        actorId: params.actor.id,
        prevQty: batch?.onHand ?? 0,
        newQty: batch?.onHand ?? 0,
        at: ts,
      });
    } else {
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.stockist.id,
        productId: line.productId,
        batchId: batch?.id,
        type: "Expiry",
        qty,
        reason: `Return ${ret.returnNo} destroy`,
        sourceDocType: "Return",
        sourceDocId: ret.id,
        actorId: params.actor.id,
        prevQty: batch?.onHand ?? 0,
        newQty: batch?.onHand ?? 0,
        at: ts,
      });
    }
  }
  await db.returns.update(ret.id, {
    status: "GoodsReceived",
    disposition: params.disposition,
    updatedAt: ts,
    statusHistory: [...ret.statusHistory, { from: ret.status, to: "GoodsReceived", at: ts, actorId: params.actor.id, reason: params.disposition }],
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: "Return",
    entityId: ret.id,
    action: "return.goodsReceived",
    after: { disposition: params.disposition, returnNo: ret.returnNo },
  });
  return ok((await db.returns.get(ret.id))!);
}

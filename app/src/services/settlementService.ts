import type {
  Business,
  PaymentIntent,
  PlatformFeeCharge,
  Settlement,
  User,
} from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { nowIso } from '../domain/utils/clock';
import { newId, nextNumber } from '../domain/utils/ids';
import { roundMoney } from '../domain/utils/money';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

/** Mock Razorpay capture — always succeeds unless amount <= 0. */
export async function mockRazorpayCapture(params: {
  amount: number;
  pharmacyId: string;
}): Promise<{ ok: true; razorpayMockId: string } | { ok: false; reason: string }> {
  if (params.amount <= 0) return { ok: false, reason: 'Amount must be positive.' };
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, razorpayMockId: `rzp_mock_${newId().slice(0, 8)}` };
}

/** Accrue platform fees for an order (online collected later or offline deferred). */
export async function accruePlatformFees(params: {
  stockistId: string;
  pharmacyId: string;
  orderId: string;
  invoiceId?: string;
  source: 'Online' | 'Offline';
  commission: number;
  bankFee: number;
}): Promise<PlatformFeeCharge> {
  const ts = nowIso();
  const row: PlatformFeeCharge = {
    id: newId(),
    stockistId: params.stockistId,
    pharmacyId: params.pharmacyId,
    orderId: params.orderId,
    invoiceId: params.invoiceId,
    source: params.source,
    commission: roundMoney(params.commission),
    bankFee: roundMoney(params.bankFee),
    status: 'Pending',
    createdAt: ts,
    updatedAt: ts,
  };
  await db.platformFeeCharges.add(row);
  return row;
}

function feesFromOrderLines(order: { lines: { commissionAmount?: number; bankFeeAmount?: number }[] }) {
  let commission = 0;
  let bankFee = 0;
  for (const l of order.lines) {
    commission += l.commissionAmount ?? 0;
    bankFee += l.bankFeeAmount ?? 0;
  }
  return { commission: roundMoney(commission), bankFee: roundMoney(bankFee) };
}

/**
 * Pharmacy pays selected invoices via mock Razorpay → company account,
 * then creates per-stockist settlements cutting commission + bank fee + deferred arrears.
 */
export async function payInvoicesViaRazorpay(params: {
  actor: User;
  pharmacy: Business;
  invoiceIds: string[];
}): Promise<Result<{ intent: PaymentIntent; settlements: Settlement[] }>> {
  const perm = assertCan(params.actor, params.pharmacy, 'payment.submit');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Payment was not created.');

  if (!params.invoiceIds.length) {
    return fail('Validation', 'PAY_EMPTY', 'Select at least one invoice.', 'Payment was not created.');
  }

  const invoices = await db.invoices.bulkGet(params.invoiceIds);
  const valid = invoices.filter(
    (inv): inv is NonNullable<typeof inv> =>
      !!inv && inv.pharmacyId === params.pharmacy.id && inv.outstanding > 0 && inv.status !== 'Void',
  );
  if (valid.length !== params.invoiceIds.length) {
    return fail('Validation', 'PAY_INV', 'One or more invoices are not payable.', 'Payment was not created.');
  }

  const amount = roundMoney(valid.reduce((s, inv) => s + inv.outstanding, 0));
  const byStockist = new Map<string, number>();
  for (const inv of valid) {
    byStockist.set(inv.stockistId, roundMoney((byStockist.get(inv.stockistId) ?? 0) + inv.outstanding));
  }
  const stockistSplits = [...byStockist.entries()].map(([stockistId, amt]) => ({
    stockistId,
    amount: amt,
  }));

  const ts = nowIso();
  const intent: PaymentIntent = {
    id: newId(),
    intentNo: nextNumber('PI'),
    pharmacyId: params.pharmacy.id,
    amount,
    status: 'Created',
    method: 'Razorpay',
    invoiceIds: valid.map((i) => i.id),
    stockistSplits,
    createdBy: params.actor.id,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.paymentIntents.add(intent);

  const capture = await mockRazorpayCapture({ amount, pharmacyId: params.pharmacy.id });
  if (!capture.ok) {
    const failed = { ...intent, status: 'Failed' as const, failureReason: capture.reason, updatedAt: nowIso() };
    await db.paymentIntents.put(failed);
    return fail('BusinessRule', 'RZ_FAIL', capture.reason, 'Razorpay payment failed.');
  }

  const capturedAt = nowIso();
  const captured: PaymentIntent = {
    ...intent,
    status: 'Captured',
    razorpayMockId: capture.razorpayMockId,
    capturedAt,
    updatedAt: capturedAt,
  };
  await db.paymentIntents.put(captured);

  const settlements: Settlement[] = [];

  for (const split of stockistSplits) {
    const stockistInvoices = valid.filter((i) => i.stockistId === split.stockistId);
    const lineBreakouts: Settlement['lineBreakouts'] = [];
    let commissionTotal = 0;
    let bankFeeTotal = 0;

    for (const inv of stockistInvoices) {
      const order = await db.orders.get(inv.orderId);
      const fees = order ? feesFromOrderLines(order) : { commission: 0, bankFee: 0 };
      // Pro-rate fees by outstanding/grand if partial
      const ratio = inv.grandTotal > 0 ? inv.outstanding / inv.grandTotal : 1;
      const c = roundMoney(fees.commission * ratio);
      const b = roundMoney(fees.bankFee * ratio);
      commissionTotal = roundMoney(commissionTotal + c);
      bankFeeTotal = roundMoney(bankFeeTotal + b);
      lineBreakouts.push({
        invoiceId: inv.id,
        orderId: inv.orderId,
        gross: inv.outstanding,
        commission: c,
        bankFee: b,
      });

      // Mark matching fee charges Collected for this order if Online source pending
      const charges = await db.platformFeeCharges
        .where('orderId')
        .equals(inv.orderId)
        .filter((ch) => ch.status === 'Pending' && ch.stockistId === split.stockistId)
        .toArray();
      for (const ch of charges) {
        await db.platformFeeCharges.put({
          ...ch,
          status: 'Collected',
          collectedAt: capturedAt,
          updatedAt: capturedAt,
        });
      }
    }

    // FIFO deferred offline arrears
    const deferred = await db.platformFeeCharges
      .where('stockistId')
      .equals(split.stockistId)
      .filter((ch) => ch.status === 'Pending' && ch.source === 'Offline')
      .sortBy('createdAt');

    let deferredCollected = 0;
    const feeChargeIds: string[] = [];
    let remainingNet = roundMoney(split.amount - commissionTotal - bankFeeTotal);

    for (const ch of deferred) {
      const due = roundMoney(ch.commission + ch.bankFee);
      if (remainingNet <= 0) break;
      const take = Math.min(due, remainingNet);
      deferredCollected = roundMoney(deferredCollected + take);
      remainingNet = roundMoney(remainingNet - take);
      feeChargeIds.push(ch.id);
      if (take >= due) {
        await db.platformFeeCharges.put({
          ...ch,
          status: 'Collected',
          collectedAt: capturedAt,
          updatedAt: capturedAt,
        });
      }
      // Partial leave as Pending with reduced amounts — for demo, only full collect
    }

    const netAmount = Math.max(0, roundMoney(split.amount - commissionTotal - bankFeeTotal - deferredCollected));
    const settlement: Settlement = {
      id: newId(),
      settlementNo: nextNumber('SET'),
      stockistId: split.stockistId,
      paymentIntentId: captured.id,
      status: 'Paid',
      grossAmount: split.amount,
      commissionTotal,
      bankFeeTotal,
      deferredCollected,
      netAmount,
      feeChargeIds,
      lineBreakouts,
      createdAt: capturedAt,
      paidAt: capturedAt,
      updatedAt: capturedAt,
    };
    await db.settlements.add(settlement);
    settlements.push(settlement);

    // Mark invoices paid / partially paid
    for (const inv of stockistInvoices) {
      const paidAmount = roundMoney(inv.paidAmount + inv.outstanding);
      await db.invoices.put({
        ...inv,
        paidAmount,
        outstanding: 0,
        status: 'Paid',
        updatedAt: capturedAt,
        statusHistory: [
          ...inv.statusHistory,
          { from: inv.status, to: 'Paid', at: capturedAt, actorId: params.actor.id, reason: 'Razorpay' },
        ],
      });
    }

    await notifyBusinessUsers(
      split.stockistId,
      'N-031',
      { paymentNo: settlement.settlementNo, amount: String(netAmount) },
      { type: 'Settlement', id: settlement.id, no: settlement.settlementNo },
    );
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'PaymentIntent',
    entityId: captured.id,
    action: 'payment.razorpay',
    after: { amount, settlements: settlements.map((s) => s.settlementNo) },
  });

  return ok({ intent: captured, settlements });
}

export async function listSettlementsForStockist(stockistId: string): Promise<Settlement[]> {
  return db.settlements.where('stockistId').equals(stockistId).reverse().sortBy('createdAt');
}

export async function listPendingFeeCharges(stockistId: string): Promise<PlatformFeeCharge[]> {
  return db.platformFeeCharges
    .where('stockistId')
    .equals(stockistId)
    .filter((c) => c.status === 'Pending')
    .toArray();
}

/** Stockist acknowledges a Paid settlement advice (demo bookkeeping). */
export async function acknowledgeSettlement(params: {
  actor: User;
  stockist: Business;
  settlementId: string;
}): Promise<Result<Settlement>> {
  const perm = assertCan(params.actor, params.stockist, 'payment.approve');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Settlement was not updated.');
  const row = await db.settlements.get(params.settlementId);
  if (!row || row.stockistId !== params.stockist.id) {
    return fail('NotFound', 'SET_MISSING', 'Settlement not found.', 'Settlement was not updated.');
  }
  if (row.status !== 'Paid' && row.status !== 'Draft') {
    return fail('StateConflict', 'SET_STATE', 'Only Paid/Draft settlements can be acknowledged.', 'Settlement was not updated.');
  }
  const ts = nowIso();
  const updated: Settlement = { ...row, status: 'Paid', updatedAt: ts };
  await db.settlements.put(updated);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Settlement',
    entityId: row.id,
    action: 'settlement.acknowledge',
    after: { settlementNo: row.settlementNo, status: updated.status },
  });
  return ok(updated);
}

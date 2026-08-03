import type { Address, Invoice, Payment } from '../../../domain/entities/types';
import { invoiceOutstanding } from '../../../domain/calc';
import { nowIso } from '../../../domain/utils/clock';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { db } from '../../db';
import { setCartLine } from '../../../services/catalogueService';
import {
  allocateOrder,
  createAndDispatchDelivery,
  issueInvoice,
  packOrder,
  recordGrn,
  updateDeliveryStatus,
} from '../../../services/fulfilmentService';
import { acceptOrder, placeOrder } from '../../../services/orderService';
import {
  applyCreditNote,
  issueAdvanceCreditNote,
  issueCreditNote,
  issueGoodwillCreditNote,
  recordGoodsReceived,
  recordOfflinePayment,
  reviewPayment,
  reviewReturn,
  submitPayment,
  submitReturn,
  voidInvoice,
  withdrawPayment,
} from '../../../services/paymentService';
import { sendPaymentReminder } from '../../../services/reminderService';
import { assertOk } from '../assert';
import { advanceBusinessDay, advanceDays } from '../chronology';
import { getWorldCtx, pharmacyByKey, stockistByKey, type TraderParty } from '../context';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function remittanceDate(): string {
  return nowIso().slice(0, 10);
}

async function partyForPharmacyId(pharmacyId: string): Promise<TraderParty | undefined> {
  return getWorldCtx().pharmacies.find((p) => p.business.id === pharmacyId);
}

async function partyForStockistId(stockistId: string): Promise<TraderParty | undefined> {
  return getWorldCtx().stockists.find((s) => s.business.id === stockistId);
}

async function openInvoices(): Promise<Invoice[]> {
  const pharmacyIds = new Set(getWorldCtx().pharmacies.map((p) => p.business.id));
  return (await db.invoices.toArray()).filter(
    (inv) =>
      pharmacyIds.has(inv.pharmacyId) &&
      ['Issued', 'PartiallyPaid', 'Overdue'].includes(inv.status) &&
      invoiceOutstanding(inv) > 0.005,
  );
}

async function submitAndMaybeReview(params: {
  pharmacy: TraderParty;
  stockist: TraderParty;
  invoice: Invoice;
  amount: number;
  method: Payment['method'];
  decision?: 'Approved' | 'Rejected' | 'OnHold' | 'UnderReview' | 'leave';
  tag: string;
  reference?: string;
}): Promise<Payment> {
  const amount = round2(Math.min(params.amount, invoiceOutstanding(params.invoice)));
  if (amount <= 0) throw new Error(`[worldSeed:07] no payable amount for ${params.tag}`);

  const payment = assertOk(
    `07-pay.submit.${params.tag}`,
    await submitPayment({
      actor: params.pharmacy.user,
      pharmacy: params.pharmacy.business,
      stockistId: params.stockist.business.id,
      amount,
      method: params.method,
      reference: params.reference ?? `WS-PAY-${params.tag}`,
      allocations: [{ invoiceId: params.invoice.id, amount }],
      notes: `World seed payment ${params.tag}`,
      idempotencyKey: makeIdempotencyKey(`world-pay-${params.tag}`, params.pharmacy.user.id),
    }),
  ).data;

  const decision = params.decision ?? 'Approved';
  if (decision === 'leave') return payment;

  assertOk(
    `07-pay.review.${params.tag}`,
    await reviewPayment({
      actor: params.stockist.user,
      stockist: params.stockist.business,
      paymentId: payment.id,
      decision,
      reason:
        decision === 'Rejected' || decision === 'OnHold'
          ? `Seed review: ${decision} for ${params.tag}`
          : undefined,
    }),
  );
  return (await db.payments.get(payment.id))!;
}

/** Fresh delivered+GRN orders so returns stay inside the return window. */
async function seedFreshDeliveriesForReturns(): Promise<void> {
  const pairs: { pharmacy: TraderParty; stockist: TraderParty }[] = [
    { pharmacy: pharmacyByKey('pharmacyA'), stockist: stockistByKey('stockistA') },
    { pharmacy: pharmacyByKey('pharmacyB'), stockist: stockistByKey('stockistB') },
    { pharmacy: pharmacyByKey('pharmacyC'), stockist: stockistByKey('stockistA') },
    { pharmacy: pharmacyByKey('pharmacyA'), stockist: stockistByKey('stockistB') },
    { pharmacy: pharmacyByKey('pharmacyB'), stockist: stockistByKey('stockistA') },
    { pharmacy: pharmacyByKey('pharmacyC'), stockist: stockistByKey('stockistB') },
  ];

  for (let i = 0; i < pairs.length; i++) {
    const { pharmacy, stockist } = pairs[i]!;
    const productIds = getWorldCtx().productIdsByStockist.get(stockist.business.id) ?? [];
    const products = (await db.products.bulkGet(productIds)).filter((p) => p && p.status === 'Active');
    if (products.length < 2) continue;
    const p0 = products[i % products.length]!;
    const p1 = products[(i + 5) % products.length]!;

    assertOk(
      `07-retprep.cart.${i}.0`,
      await setCartLine({
        actor: pharmacy.user,
        pharmacy: pharmacy.business,
        stockistId: stockist.business.id,
        productId: p0.id,
        qty: Math.max(p0.moq, 2),
      }),
    );
    assertOk(
      `07-retprep.cart.${i}.1`,
      await setCartLine({
        actor: pharmacy.user,
        pharmacy: pharmacy.business,
        stockistId: stockist.business.id,
        productId: p1.id,
        qty: Math.max(p1.moq, 2),
      }),
    );

    const biz = (await db.businesses.get(pharmacy.business.id))!;
    const address: Address =
      biz.deliveryAddresses?.find((a) => a.isDefault) ??
      biz.deliveryAddresses?.[0] ?? {
        id: `addr-${biz.id}`,
        label: 'Business',
        line1: biz.address,
        city: biz.city,
        state: biz.state,
        pincode: biz.pincode,
        isDefault: true,
      };

    const order = assertOk(
      `07-retprep.place.${i}`,
      await placeOrder({
        actor: pharmacy.user,
        pharmacy: pharmacy.business,
        stockistId: stockist.business.id,
        address,
        notes: `Return-prep order #${i}`,
        idempotencyKey: makeIdempotencyKey(`world-retprep-${i}`, pharmacy.user.id),
      }),
    ).data;

    assertOk(
      `07-retprep.accept.${i}`,
      await acceptOrder({ actor: stockist.user, stockist: stockist.business, orderId: order.id }),
    );
    assertOk(
      `07-retprep.alloc.${i}`,
      await allocateOrder({ actor: stockist.user, stockist: stockist.business, orderId: order.id }),
    );
    assertOk(
      `07-retprep.pack.${i}`,
      await packOrder({ actor: stockist.user, stockist: stockist.business, orderId: order.id }),
    );
    assertOk(
      `07-retprep.inv.${i}`,
      await issueInvoice({ actor: stockist.user, stockist: stockist.business, orderId: order.id }),
    );
    const delivery = assertOk(
      `07-retprep.dispatch.${i}`,
      await createAndDispatchDelivery({
        actor: stockist.user,
        stockist: stockist.business,
        orderId: order.id,
        assigneeId: stockist.delivery?.id,
      }),
    ).data;
    assertOk(
      `07-retprep.ofd.${i}`,
      await updateDeliveryStatus({
        actor: stockist.delivery!,
        stockist: stockist.business,
        deliveryId: delivery.id,
        status: 'OutForDelivery',
      }),
    );
    assertOk(
      `07-retprep.del.${i}`,
      await updateDeliveryStatus({
        actor: stockist.delivery!,
        stockist: stockist.business,
        deliveryId: delivery.id,
        status: 'Delivered',
        receivedBy: pharmacy.user.name,
      }),
    );
    const fresh = (await db.orders.get(order.id))!;
    assertOk(
      `07-retprep.grn.${i}`,
      await recordGrn({
        actor: pharmacy.user,
        pharmacy: pharmacy.business,
        orderId: fresh.id,
        deliveryId: delivery.id,
        received: fresh.lines.map((l) => ({
          lineId: l.id,
          receivedQty: l.deliveredQty ?? l.qty,
        })),
      }),
    );
  }
}

/** Returns first while deliveries are still inside the return window. */
async function seedReturnsAndCreditNotes(): Promise<void> {
  await seedFreshDeliveriesForReturns();

  const settings = await db.platformSettings.get('platform');
  const windowDays = settings?.returnWindowDays ?? 7;
  const nowMs = new Date(nowIso()).getTime();
  const delivered = (await db.orders.toArray())
    .filter(
      (o) =>
        ['Delivered', 'PartiallyDelivered'].includes(o.status) &&
        !o.managedPharmacyId &&
        getWorldCtx().pharmacies.some((p) => p.business.id === o.pharmacyId),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((o) => (nowMs - new Date(o.updatedAt).getTime()) / 86400000 <= windowDays);

  let returnsDone = 0;
  for (const order of delivered) {
    if (returnsDone >= 6) break;
    const pharmacy = await partyForPharmacyId(order.pharmacyId);
    const stockist = await partyForStockistId(order.stockistId);
    if (!pharmacy || !stockist) continue;
    const line = order.lines.find((l) => (l.deliveredQty ?? l.acceptedQty ?? l.qty) > 0);
    if (!line) continue;

    const maxQty = line.deliveredQty ?? line.qty;
    const qty = Math.max(1, Math.min(2, maxQty));
    const ret = assertOk(
      `07-return.submit.${returnsDone}`,
      await submitReturn({
        actor: pharmacy.user,
        pharmacy: pharmacy.business,
        orderId: order.id,
        lines: [
          {
            productId: line.productId,
            qty,
            reason: 'Damaged outer / short shelf life complaint',
            batchNumber: line.batchAllocations?.[0]?.batchNumber,
          },
        ],
        idempotencyKey: makeIdempotencyKey(`world-ret-${returnsDone}`, pharmacy.user.id),
      }),
    ).data;

    const partial = returnsDone % 3 === 2 && qty >= 2;
    assertOk(
      `07-return.review.${returnsDone}`,
      await reviewReturn({
        actor: stockist.user,
        stockist: stockist.business,
        returnId: ret.id,
        decision: partial ? 'PartiallyApproved' : 'Approved',
        approvedQtys: partial ? { [line.productId]: qty - 1 } : undefined,
        disposition: 'Restock',
      }),
    );

    assertOk(
      `07-return.goods.${returnsDone}`,
      await recordGoodsReceived({
        actor: stockist.user,
        stockist: stockist.business,
        returnId: ret.id,
        disposition: returnsDone % 2 === 0 ? 'Restock' : 'Quarantine',
      }),
    );

    const cn = assertOk(
      `07-cn.issue.${returnsDone}`,
      await issueCreditNote({
        actor: stockist.user,
        stockist: stockist.business,
        returnId: ret.id,
        idempotencyKey: makeIdempotencyKey(`world-cn-${returnsDone}`, stockist.user.id),
      }),
    ).data;

    const targetInv = (await openInvoices()).find(
      (inv) => inv.pharmacyId === pharmacy.business.id && inv.stockistId === stockist.business.id,
    );
    if (targetInv && cn.remaining > 0) {
      assertOk(
        `07-cn.apply.${returnsDone}`,
        await applyCreditNote({
          actor: stockist.user,
          business: stockist.business,
          creditNoteId: cn.id,
          invoiceId: targetInv.id,
          amount: round2(Math.min(cn.remaining, invoiceOutstanding(targetInv))),
        }),
      );
    }
    returnsDone += 1;
  }

  const pharmacyA = pharmacyByKey('pharmacyA');
  const stockistA = stockistByKey('stockistA');
  const goodwill = assertOk(
    '07-cn.goodwill',
    await issueGoodwillCreditNote({
      actor: stockistA.user,
      stockist: stockistA.business,
      pharmacyId: pharmacyA.business.id,
      amount: 150,
      reason: 'Goodwill gesture for delayed Mumbai delivery',
    }),
  ).data;
  const goodwillInv = (await openInvoices()).find(
    (inv) => inv.pharmacyId === pharmacyA.business.id && inv.stockistId === stockistA.business.id,
  );
  if (goodwillInv) {
    assertOk(
      '07-cn.goodwill.apply',
      await applyCreditNote({
        actor: pharmacyA.user,
        business: pharmacyA.business,
        creditNoteId: goodwill.id,
        invoiceId: goodwillInv.id,
        amount: round2(Math.min(goodwill.remaining, invoiceOutstanding(goodwillInv))),
      }),
    );
  }

  const pharmacyB = pharmacyByKey('pharmacyB');
  const stockistB = stockistByKey('stockistB');
  assertOk(
    '07-cn.goodwill.b',
    await issueGoodwillCreditNote({
      actor: stockistB.user,
      stockist: stockistB.business,
      pharmacyId: pharmacyB.business.id,
      amount: 75,
      reason: 'Rate difference adjustment — goodwill',
    }),
  );
}

/** Phase 7 — Payments, reminders, voids, returns, and credit notes. */
export async function seedMoneyPhase(): Promise<void> {
  advanceBusinessDay();

  // Returns before multi-week payment clock advances so the return window still holds.
  await seedReturnsAndCreditNotes();

  let invoices = await openInvoices();
  if (!invoices.length) {
    advanceDays(3);
    return;
  }

  invoices = invoices.sort((a, b) => (a.issuedAt ?? a.createdAt).localeCompare(b.issuedAt ?? b.createdAt));

  // --- Partial payments (leave PartiallyPaid) ---
  for (let i = 0; i < Math.min(6, invoices.length); i++) {
    const inv = invoices[i]!;
    const pharmacy = await partyForPharmacyId(inv.pharmacyId);
    const stockist = await partyForStockistId(inv.stockistId);
    if (!pharmacy || !stockist) continue;
    const out = invoiceOutstanding(inv);
    if (out < 2) continue;
    advanceBusinessDay();
    await submitAndMaybeReview({
      pharmacy,
      stockist,
      invoice: inv,
      amount: round2(out * 0.4),
      method: i % 2 === 0 ? 'UPI' : 'NEFT',
      decision: 'Approved',
      tag: `partial-${i}`,
    });
  }

  invoices = await openInvoices();

  // --- Full settlement payments ---
  for (let i = 0; i < Math.min(10, invoices.length); i++) {
    const inv = invoices[i]!;
    const pharmacy = await partyForPharmacyId(inv.pharmacyId);
    const stockist = await partyForStockistId(inv.stockistId);
    if (!pharmacy || !stockist) continue;
    const out = invoiceOutstanding(inv);
    if (out <= 0) continue;
    advanceBusinessDay();
    await submitAndMaybeReview({
      pharmacy,
      stockist,
      invoice: inv,
      amount: out,
      method: 'UPI',
      decision: 'Approved',
      tag: `full-${i}`,
    });
  }

  invoices = await openInvoices();

  // --- Offline payments (stockist-recorded), including one surplus → advance CN ---
  for (let i = 0; i < Math.min(5, invoices.length); i++) {
    const inv = invoices[i]!;
    const pharmacy = await partyForPharmacyId(inv.pharmacyId);
    const stockist = await partyForStockistId(inv.stockistId);
    if (!pharmacy || !stockist) continue;
    const out = invoiceOutstanding(inv);
    if (out <= 0) continue;
    advanceBusinessDay();
    const surplus = i === 0;
    const amount = surplus ? round2(out + 250) : round2(Math.min(out, out * 0.85));
    const alloc = round2(Math.min(out, amount));
    const payment = assertOk(
      `07-offline.${i}`,
      await recordOfflinePayment({
        actor: stockist.user,
        stockist: stockist.business,
        pharmacyId: pharmacy.business.id,
        amount,
        method: 'Cash',
        reference: `WS-OFF-${i}-${inv.invoiceNo}`,
        remittanceDate: remittanceDate(),
        allocations: [{ invoiceId: inv.id, amount: alloc }],
        notes: surplus ? 'Cash with surplus for advance CN' : 'Offline remittance',
        idempotencyKey: makeIdempotencyKey(`world-off-${i}`, stockist.user.id),
      }),
    ).data;
    assertOk(
      `07-offline.approve.${i}`,
      await reviewPayment({
        actor: stockist.user,
        stockist: stockist.business,
        paymentId: payment.id,
        decision: 'Approved',
        issueAdvanceCredit: surplus,
      }),
    );
    if (surplus) {
      const approved = (await db.payments.get(payment.id))!;
      const allocated = round2(approved.allocations.reduce((s, a) => s + a.amount, 0));
      const adv = round2(approved.amount - allocated);
      if (adv > 0.005) {
        const existing = await db.creditNotes
          .where('stockistId')
          .equals(stockist.business.id)
          .filter((c) => c.paymentId === approved.id)
          .first();
        if (!existing) {
          assertOk(
            `07-cn.advance.${i}`,
            await issueAdvanceCreditNote({
              actor: stockist.user,
              stockist: stockist.business,
              paymentId: approved.id,
              amount: adv,
            }),
          );
        }
      }
    }
  }

  // --- Review variety: UnderReview / Rejected / OnHold / withdraw ---
  invoices = await openInvoices();
  if (invoices.length >= 4) {
    const pick = async (idx: number) => {
      const inv = invoices[idx]!;
      const pharmacy = await partyForPharmacyId(inv.pharmacyId);
      const stockist = await partyForStockistId(inv.stockistId);
      if (!pharmacy || !stockist) return null;
      return { inv, pharmacy, stockist };
    };

    advanceBusinessDay();
    const u0 = await pick(0);
    if (u0) {
      await submitAndMaybeReview({
        pharmacy: u0.pharmacy,
        stockist: u0.stockist,
        invoice: u0.inv,
        amount: round2(Math.min(500, invoiceOutstanding(u0.inv))),
        method: 'NEFT',
        decision: 'UnderReview',
        tag: 'underReview',
      });
    }

    advanceBusinessDay();
    const u1 = await pick(1);
    if (u1) {
      await submitAndMaybeReview({
        pharmacy: u1.pharmacy,
        stockist: u1.stockist,
        invoice: u1.inv,
        amount: round2(Math.min(400, invoiceOutstanding(u1.inv))),
        method: 'Cheque',
        decision: 'Rejected',
        tag: 'rejected',
      });
    }

    advanceBusinessDay();
    const u2 = await pick(2);
    if (u2) {
      await submitAndMaybeReview({
        pharmacy: u2.pharmacy,
        stockist: u2.stockist,
        invoice: u2.inv,
        amount: round2(Math.min(350, invoiceOutstanding(u2.inv))),
        method: 'UPI',
        decision: 'OnHold',
        tag: 'onHold',
      });
    }

    advanceBusinessDay();
    const u3 = await pick(3);
    if (u3) {
      const toWithdraw = await submitAndMaybeReview({
        pharmacy: u3.pharmacy,
        stockist: u3.stockist,
        invoice: u3.inv,
        amount: round2(Math.min(300, invoiceOutstanding(u3.inv))),
        method: 'UPI',
        decision: 'leave',
        tag: 'withdraw',
      });
      assertOk(
        '07-pay.withdraw',
        await withdrawPayment({
          actor: u3.pharmacy.user,
          pharmacy: u3.pharmacy.business,
          paymentId: toWithdraw.id,
          reason: 'Pharmacy withdrew — wrong invoice selected',
        }),
      );
    }
  }

  // Leave a few Submitted payments open (no review)
  invoices = await openInvoices();
  for (let i = 0; i < Math.min(4, invoices.length); i++) {
    const inv = invoices[invoices.length - 1 - i]!;
    const pharmacy = await partyForPharmacyId(inv.pharmacyId);
    const stockist = await partyForStockistId(inv.stockistId);
    if (!pharmacy || !stockist) continue;
    const out = invoiceOutstanding(inv);
    if (out < 50) continue;
    advanceBusinessDay();
    await submitAndMaybeReview({
      pharmacy,
      stockist,
      invoice: inv,
      amount: round2(Math.min(out * 0.25, out)),
      method: 'RTGS',
      decision: 'leave',
      tag: `open-alloc-${i}`,
    });
  }

  // --- Payment reminders ---
  invoices = await openInvoices();
  for (let i = 0; i < Math.min(5, invoices.length); i++) {
    const inv = invoices[i]!;
    const stockist = await partyForStockistId(inv.stockistId);
    if (!stockist) continue;
    advanceDays(1);
    assertOk(
      `07-remind.${i}`,
      await sendPaymentReminder({
        actor: stockist.user,
        stockist: stockist.business,
        invoiceId: inv.id,
      }),
    );
  }

  // --- Void one Issued invoice with no open payment claim ---
  {
    const candidates = (await db.invoices.toArray()).filter(
      (inv) => inv.status === 'Issued' && inv.paidAmount === 0 && inv.creditApplied === 0,
    );
    for (const inv of candidates) {
      const openClaim = await db.payments
        .where('pharmacyId')
        .equals(inv.pharmacyId)
        .filter(
          (p) =>
            p.stockistId === inv.stockistId &&
            ['Submitted', 'UnderReview', 'OnHold'].includes(p.status) &&
            p.allocations.some((a) => a.invoiceId === inv.id),
        )
        .first();
      if (openClaim) continue;
      const stockist = await partyForStockistId(inv.stockistId);
      if (!stockist) continue;
      advanceBusinessDay();
      assertOk(
        '07-void.invoice',
        await voidInvoice({
          actor: stockist.user,
          stockist: stockist.business,
          invoiceId: inv.id,
          reason: 'Duplicate bill raised in error — voided in seed',
        }),
      );
      break;
    }
  }

  advanceDays(3);
}

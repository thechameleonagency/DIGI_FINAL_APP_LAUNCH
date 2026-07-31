import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Batch, Invoice, OrderLine, Payment, CreditNote } from '../entities/types';
import { roundMoney } from '../utils/money';

export interface LineCalcInput {
  qty: number;
  unitPrice: number;
  gstPercent: number;
}

export function calcOrderLine(input: LineCalcInput, rounding: 'nearest' | 'up' | 'down' = 'nearest') {
  const lineSubtotal = roundMoney(input.qty * input.unitPrice, rounding);
  const lineTax = roundMoney(lineSubtotal * (input.gstPercent / 100), rounding);
  const lineTotal = roundMoney(lineSubtotal + lineTax, rounding);
  return { lineSubtotal, lineTax, lineTotal };
}

export function calcOrderTotals(
  lines: Pick<OrderLine, 'lineSubtotal' | 'lineTax' | 'lineTotal'>[],
  rounding: 'nearest' | 'up' | 'down' = 'nearest',
) {
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineSubtotal, 0), rounding);
  const taxTotal = roundMoney(lines.reduce((s, l) => s + l.lineTax, 0), rounding);
  const grandTotal = roundMoney(subtotal + taxTotal, rounding);
  return { subtotal, taxTotal, grandTotal };
}

export const calcInvoiceLine = calcOrderLine;

export function calcInvoiceTotals(
  lines: { lineSubtotal: number; lineTax: number; lineTotal: number }[],
  rounding: 'nearest' | 'up' | 'down' = 'nearest',
) {
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineSubtotal, 0), rounding);
  const taxTotal = roundMoney(lines.reduce((s, l) => s + l.lineTax, 0), rounding);
  const raw = subtotal + taxTotal;
  const grandTotal = roundMoney(raw, rounding);
  const roundOff = roundMoney(grandTotal - raw, rounding);
  return { subtotal, taxTotal, roundOff, grandTotal };
}

export function invoiceOutstanding(invoice: Pick<Invoice, 'grandTotal' | 'paidAmount' | 'creditApplied'>): number {
  return roundMoney(Math.max(0, invoice.grandTotal - invoice.paidAmount - invoice.creditApplied));
}

export function deriveInvoiceStatus(
  invoice: Pick<Invoice, 'status' | 'grandTotal' | 'paidAmount' | 'creditApplied' | 'dueDate'>,
  now = new Date(),
): Invoice['status'] {
  if (invoice.status === 'Void' || invoice.status === 'Draft') return invoice.status;
  const outstanding = invoiceOutstanding(invoice);
  if (outstanding <= 0) return 'Paid';
  if (invoice.paidAmount > 0 || invoice.creditApplied > 0) {
    if (invoice.dueDate && parseISO(invoice.dueDate) < now) return 'Overdue';
    return 'PartiallyPaid';
  }
  if (invoice.dueDate && parseISO(invoice.dueDate) < now) return 'Overdue';
  return 'Issued';
}

export function availableQty(batch: Pick<Batch, 'onHand' | 'reserved' | 'status' | 'expiryDate'>, today = new Date()): number {
  if (batch.status !== 'Available') return 0;
  if (parseISO(batch.expiryDate) <= today) return 0;
  return Math.max(0, batch.onHand - batch.reserved);
}

export function productAvailableSellable(batches: Batch[], today = new Date()): number {
  return batches.reduce((sum, b) => sum + availableQty(b, today), 0);
}

export function daysToExpiry(expiryDate: string, today = new Date()): number {
  return differenceInCalendarDays(parseISO(expiryDate), today);
}

export function expiryRiskBand(
  expiryDate: string,
  nearDays = 90,
  criticalDays = 30,
  today = new Date(),
): 'Healthy' | 'Near' | 'Critical' | 'Expired' {
  const d = daysToExpiry(expiryDate, today);
  if (d <= 0) return 'Expired';
  if (d <= criticalDays) return 'Critical';
  if (d <= nearDays) return 'Near';
  return 'Healthy';
}

export function lowStock(available: number, threshold = 10): boolean {
  return available <= threshold;
}

export function calcPaymentAllocationValidity(
  amount: number,
  allocations: { amount: number; outstanding: number }[],
): { ok: boolean; reason?: string } {
  const sum = roundMoney(allocations.reduce((s, a) => s + a.amount, 0));
  if (allocations.some((a) => a.amount <= 0)) return { ok: false, reason: 'Allocation amounts must be positive.' };
  if (allocations.some((a) => a.amount > a.outstanding + 0.005))
    return { ok: false, reason: 'Allocation exceeds invoice outstanding.' };
  if (Math.abs(sum - amount) > 0.005) return { ok: false, reason: 'Allocations must equal payment amount.' };
  return { ok: true };
}

export function pairOutstanding(invoices: Invoice[], pharmacyId: string, stockistId: string): number {
  return roundMoney(
    invoices
      .filter((i) => i.pharmacyId === pharmacyId && i.stockistId === stockistId && i.status !== 'Void')
      .reduce((s, i) => s + invoiceOutstanding(i), 0),
  );
}

export function pharmacyOutstanding(invoices: Invoice[], pharmacyId: string): number {
  return roundMoney(
    invoices.filter((i) => i.pharmacyId === pharmacyId && i.status !== 'Void').reduce((s, i) => s + invoiceOutstanding(i), 0),
  );
}

export function stockistReceivables(invoices: Invoice[], stockistId: string): number {
  return roundMoney(
    invoices.filter((i) => i.stockistId === stockistId && i.status !== 'Void').reduce((s, i) => s + invoiceOutstanding(i), 0),
  );
}

export function remainingCredit(cn: Pick<CreditNote, 'amount' | 'applications'>): number {
  const applied = cn.applications.reduce((s, a) => s + a.amount, 0);
  return roundMoney(Math.max(0, cn.amount - applied));
}

export function applyCredit(
  cnRemaining: number,
  invoiceOut: number,
  applyAmount: number,
): { ok: boolean; applied: number; reason?: string } {
  if (applyAmount <= 0) return { ok: false, applied: 0, reason: 'Apply amount must be positive.' };
  if (applyAmount > cnRemaining + 0.005) return { ok: false, applied: 0, reason: 'Exceeds remaining credit.' };
  if (applyAmount > invoiceOut + 0.005) return { ok: false, applied: 0, reason: 'Exceeds invoice outstanding.' };
  return { ok: true, applied: roundMoney(applyAmount) };
}

export function returnLineValue(qty: number, unitPrice: number, gstPercent: number) {
  return calcOrderLine({ qty, unitPrice, gstPercent });
}

export function cartTotals(
  lines: { qty: number; unitPrice: number; gstPercent: number }[],
  rounding: 'nearest' | 'up' | 'down' = 'nearest',
) {
  const calcLines = lines.map((l) => calcOrderLine(l, rounding));
  return calcOrderTotals(calcLines, rounding);
}

export function gstSplit(taxTotal: number, intraState: boolean) {
  if (intraState) {
    const half = roundMoney(taxTotal / 2);
    return { cgst: half, sgst: roundMoney(taxTotal - half), igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxTotal };
}

/** FEFO: earliest expiry first among sellable batches */
export function fefoSort(batches: Batch[], today = new Date()): Batch[] {
  return [...batches]
    .filter((b) => availableQty(b, today) > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

export function settleInvoice(
  invoice: Invoice,
  payments: Payment[],
  creditsApplied: number,
): Invoice {
  const approved = payments
    .filter((p) => p.status === 'Approved')
    .flatMap((p) => p.allocations)
    .filter((a) => a.invoiceId === invoice.id)
    .reduce((s, a) => s + a.amount, 0);
  const paidAmount = roundMoney(approved);
  const creditApplied = roundMoney(creditsApplied);
  const outstanding = roundMoney(Math.max(0, invoice.grandTotal - paidAmount - creditApplied));
  const next = { ...invoice, paidAmount, creditApplied, outstanding };
  next.status = deriveInvoiceStatus(next);
  return next;
}

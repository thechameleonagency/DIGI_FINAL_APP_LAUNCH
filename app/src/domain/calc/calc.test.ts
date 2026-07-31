import { describe, expect, it } from 'vitest';
import {
  availableQty,
  calcOrderLine,
  calcOrderTotals,
  calcPaymentAllocationValidity,
  deriveInvoiceStatus,
  invoiceOutstanding,
  applyCredit,
} from './index';
import { canTransition } from '../machines/transitions';

describe('calculations', () => {
  it('computes order line and totals', () => {
    const line = calcOrderLine({ qty: 10, unitPrice: 100, gstPercent: 12 });
    expect(line.lineSubtotal).toBe(1000);
    expect(line.lineTax).toBe(120);
    expect(line.lineTotal).toBe(1120);
    const totals = calcOrderTotals([line, line]);
    expect(totals.grandTotal).toBe(2240);
  });

  it('never allows negative outstanding', () => {
    expect(invoiceOutstanding({ grandTotal: 100, paidAmount: 120, creditApplied: 0 })).toBe(0);
  });

  it('validates payment allocations', () => {
    expect(calcPaymentAllocationValidity(100, [{ amount: 60, outstanding: 80 }, { amount: 40, outstanding: 40 }]).ok).toBe(true);
    expect(calcPaymentAllocationValidity(100, [{ amount: 120, outstanding: 80 }]).ok).toBe(false);
  });

  it('blocks expired batches from available qty', () => {
    expect(
      availableQty({
        onHand: 50,
        reserved: 0,
        status: 'Available',
        expiryDate: '2000-01-01',
      }),
    ).toBe(0);
  });

  it('applies credit within remaining and outstanding', () => {
    expect(applyCredit(500, 200, 200).ok).toBe(true);
    expect(applyCredit(100, 200, 150).ok).toBe(false);
  });

  it('derives invoice status', () => {
    expect(
      deriveInvoiceStatus({
        status: 'Issued',
        grandTotal: 1000,
        paidAmount: 1000,
        creditApplied: 0,
      }),
    ).toBe('Paid');
  });
});

describe('state machines', () => {
  it('forbids reverse of issued invoice to draft', () => {
    expect(canTransition('invoice', 'Issued', 'Draft').ok).toBe(false);
  });

  it('allows pending order accept', () => {
    expect(canTransition('order', 'Pending', 'Accepted').ok).toBe(true);
  });

  it('forbids chat-style payment approve from draft', () => {
    expect(canTransition('payment', 'Draft', 'Approved').ok).toBe(false);
  });
});

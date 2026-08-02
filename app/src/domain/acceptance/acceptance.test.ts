import { describe, expect, it } from 'vitest';
import {
  applyCredit,
  availableQty,
  calcOrderLine,
  calcOrderTotals,
  calcPaymentAllocationValidity,
  gstSplit,
  invoiceOutstanding,
  remainingCredit,
} from '../calc';
import { canTransition } from '../machines/transitions';
import { can } from '../permissions';
import { NOTIFICATION_CATALOG } from '../notifications/catalog';

describe('AC-O calculation audits', () => {
  it('AC-O01 outstanding 1000-400-100=500', () => {
    expect(invoiceOutstanding({ grandTotal: 1000, paidAmount: 400, creditApplied: 100 })).toBe(500);
  });

  it('AC-O02 available 50-20=30', () => {
    expect(
      availableQty({
        onHand: 50,
        reserved: 20,
        status: 'Available',
        expiryDate: '2099-01-01',
      }),
    ).toBe(30);
  });

  it('AC-O03 GST intra-state split', () => {
    const split = gstSplit(120, true);
    expect(split.cgst + split.sgst).toBe(120);
    expect(split.igst).toBe(0);
  });

  it('AC-O04 remaining credit 200-50=150', () => {
    expect(
      remainingCredit({
        amount: 200,
        applications: [{ invoiceId: 'i', invoiceNo: 'INV', amount: 50, at: '', actorId: 'a' }],
      }),
    ).toBe(150);
  });

  it('AC-O05 cart/order/invoice totals golden fixture', () => {
    const line = calcOrderLine({ qty: 10, unitPrice: 100, gstPercent: 12 });
    expect(calcOrderTotals([line]).grandTotal).toBe(1120);
  });
});

describe('AC-N state machine audits', () => {
  it('AC-N01 Pending → Delivered forbidden', () => {
    expect(canTransition('order', 'Pending', 'Delivered').ok).toBe(false);
  });
  it('AC-N02 Rejected → Accepted forbidden', () => {
    expect(canTransition('order', 'Rejected', 'Accepted').ok).toBe(false);
  });
  it('AC-N03 Payment Approved → Draft forbidden', () => {
    expect(canTransition('payment', 'Approved', 'Draft').ok).toBe(false);
  });
  it('AC-N04 Credit FullyApplied → Void forbidden', () => {
    expect(canTransition('creditNote', 'FullyApplied', 'Void').ok).toBe(false);
  });
  it('AC-N05 Accepted → Rejected forbidden', () => {
    expect(canTransition('order', 'Accepted', 'Rejected').ok).toBe(false);
  });
  it('AC-N06 Closed order no reopen', () => {
    expect(canTransition('order', 'Closed', 'Pending').ok).toBe(false);
  });
  it('AC-F10 Failed → Delivered direct forbidden', () => {
    expect(canTransition('delivery', 'Failed', 'Delivered').ok).toBe(false);
  });
});

describe('AC-H / AC-I money guards', () => {
  it('AC-H04 allocation > outstanding blocked', () => {
    expect(calcPaymentAllocationValidity(100, [{ amount: 120, outstanding: 80 }]).ok).toBe(false);
  });
  it('AC-H08 credit > outstanding leftover remains via applyCredit block', () => {
    expect(applyCredit(500, 100, 150).ok).toBe(false);
  });
  it('never negative outstanding', () => {
    expect(invoiceOutstanding({ grandTotal: 100, paidAmount: 200, creditApplied: 0 })).toBe(0);
  });
});

describe('AC permissions & gates', () => {
  it('AC-H06 pharmacy cannot approve payment', () => {
    expect(
      can('payment.approve', {
        businessType: 'Pharmacy',
        role: 'Pharmacist',
        accountStatus: 'Active',
        verificationStatus: 'Approved',
      }).allow,
    ).toBe(false);
  });

  it('AC-E14 suspended business cannot order', () => {
    expect(
      can('order.place', {
        businessType: 'Pharmacy',
        role: 'Pharmacist',
        accountStatus: 'Suspended',
        verificationStatus: 'Approved',
      }).allow,
    ).toBe(false);
  });

  it('AC-M03 admin cannot place trade order', () => {
    expect(
      can('order.place', {
        businessType: 'Platform',
        role: 'SuperAdmin',
        accountStatus: 'Active',
        verificationStatus: 'Approved',
      }).allow,
    ).toBe(false);
  });

  it('AC-C05 delivery boy no catalogue manage', () => {
    expect(
      can('catalogue.manage', {
        businessType: 'Stockist',
        role: 'DeliveryStaff',
        accountStatus: 'Active',
        verificationStatus: 'Approved',
      }).allow,
    ).toBe(false);
  });

  it('unverified cannot trade', () => {
    expect(
      can('order.place', {
        businessType: 'Pharmacy',
        role: 'Pharmacist',
        accountStatus: 'Active',
        verificationStatus: 'UnderReview',
      }).allow,
    ).toBe(false);
  });
});

describe('AC-K notifications catalog', () => {
  it('AC-K07 N-001…N-060 registered', () => {
    for (let i = 1; i <= 60; i++) {
      const code = `N-${String(i).padStart(3, '0')}`;
      expect(NOTIFICATION_CATALOG[code], code).toBeTruthy();
    }
  });
});

describe('AC-F inventory integrity', () => {
  it('AC-F06 expired batch not sellable', () => {
    expect(
      availableQty({
        onHand: 40,
        reserved: 0,
        status: 'Available',
        expiryDate: '2001-01-01',
      }),
    ).toBe(0);
  });

  it('AC-F09 quarantined not sellable', () => {
    expect(
      availableQty({
        onHand: 40,
        reserved: 0,
        status: 'Quarantined',
        expiryDate: '2099-01-01',
      }),
    ).toBe(0);
  });
});

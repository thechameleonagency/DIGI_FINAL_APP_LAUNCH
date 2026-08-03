import { describe, expect, it } from 'vitest';
import { can, type Action } from './index';

const activeApproved = {
  accountStatus: 'Active' as const,
  verificationStatus: 'Approved' as const,
};

/** Nav / RequirePermission actions used by portal shells (Wave 11 matrix). */
const pharmacyNavActions: Action[] = [
  'order.place',
  'connection.request',
  'payment.submit',
  'return.raise',
  'sale.record',
  'inventory.adjust',
  'delivery.update',
];
const stockistNavActions: Action[] = [
  'order.accept',
  'order.allocate',
  'order.recordManual',
  'connection.respond',
  'partner.invite',
  'catalogue.manage',
  'inventory.adjust',
  'delivery.update',
  'payment.approve',
  'invoice.issue',
  'po.manage',
  'return.approve',
  'credit.issue',
  'staff.manage',
];
const adminNavActions: Action[] = [
  'verification.review',
  'read.platform',
  'support.manage',
  'counterfeit.review',
  'announcement.manage',
  'staff.manage',
  'settings.manage',
  'business.suspend',
  'audit.export',
];

describe('permission matrix cells (T-1)', () => {
  it('SupportManager: support.manage yes, settings.manage no', () => {
    const ctx = { businessType: 'Platform' as const, role: 'SupportManager' as const, ...activeApproved };
    expect(can('support.manage', ctx).allow).toBe(true);
    expect(can('settings.manage', ctx).allow).toBe(false);
    expect(can('plan.manage', ctx).allow).toBe(false);
    expect(can('impersonate', ctx).allow).toBe(false);
    expect(can('verification.review', ctx).allow).toBe(true);
    expect(can('audit.export', ctx).allow).toBe(true);
  });

  it('SuperAdmin: settings.manage + plan.manage + staff.manage', () => {
    const ctx = { businessType: 'Platform' as const, role: 'SuperAdmin' as const, ...activeApproved };
    expect(can('settings.manage', ctx).allow).toBe(true);
    expect(can('plan.manage', ctx).allow).toBe(true);
    expect(can('staff.manage', ctx).allow).toBe(true);
    expect(can('impersonate', ctx).allow).toBe(true);
    expect(can('business.suspend', ctx).allow).toBe(true);
  });

  it('explicit deny override blocks Pharmacist order.place', () => {
    expect(
      can('order.place', {
        businessType: 'Pharmacy',
        role: 'Pharmacist',
        ...activeApproved,
        overrides: { 'order.place': false },
      }).allow,
    ).toBe(false);
  });

  it('Deactivated blocks all actions', () => {
    expect(
      can('read.own', {
        businessType: 'Pharmacy',
        role: 'Pharmacist',
        accountStatus: 'Deactivated',
        verificationStatus: 'Approved',
      }).allow,
    ).toBe(false);
  });

  it('Stockist can approve payment and manage catalogue', () => {
    const ctx = { businessType: 'Stockist' as const, role: 'Stockist' as const, ...activeApproved };
    expect(can('payment.approve', ctx).allow).toBe(true);
    expect(can('catalogue.manage', ctx).allow).toBe(true);
    expect(can('staff.manage', ctx).allow).toBe(true);
  });

  it('Stockist DeliveryStaff cannot accept orders', () => {
    expect(
      can('order.accept', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('catalogue.manage', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('inventory.adjust', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('payment.approve', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('po.manage', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('supplier.manage', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('delivery.update', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(true);
  });

  it('Pharmacy DeliveryStaff blocked from trade actions', () => {
    const ctx = { businessType: 'Pharmacy' as const, role: 'DeliveryStaff' as const, ...activeApproved };
    expect(can('order.place', ctx).allow).toBe(false);
    expect(can('payment.submit', ctx).allow).toBe(false);
    expect(can('return.raise', ctx).allow).toBe(false);
    expect(can('credit.apply', ctx).allow).toBe(false);
    expect(can('inventory.adjust', ctx).allow).toBe(false);
    expect(can('connection.request', ctx).allow).toBe(false);
    expect(can('delivery.update', ctx).allow).toBe(true);
    expect(can('read.own', ctx).allow).toBe(true);
    // Kept as delivery help channel (tickets), not partner Messages.
    expect(can('support.manage', ctx).allow).toBe(true);
  });

  it('Stockist DeliveryStaff keeps support.manage help channel', () => {
    expect(
      can('support.manage', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(true);
    expect(
      can('order.accept', { businessType: 'Stockist', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
  });

  it('SupportManager has staff.manage but not settings.manage', () => {
    const ctx = { businessType: 'Platform' as const, role: 'SupportManager' as const, ...activeApproved };
    expect(can('staff.manage', ctx).allow).toBe(true);
    expect(can('settings.manage', ctx).allow).toBe(false);
    expect(can('plan.manage', ctx).allow).toBe(false);
    expect(can('impersonate', ctx).allow).toBe(false);
  });

  it('Stockist DeliveryStaff blocked from money actions; Stockist role allowed', () => {
    const boy = { businessType: 'Stockist' as const, role: 'DeliveryStaff' as const, ...activeApproved };
    const st = { businessType: 'Stockist' as const, role: 'Stockist' as const, ...activeApproved };
    for (const action of [
      'payment.approve',
      'payment.reject',
      'payment.recordOffline',
      'reminder.send',
      'invoice.void',
      'return.approve',
      'credit.issue',
      'credit.apply',
    ] as const) {
      expect(can(action, boy).allow).toBe(false);
      expect(can(action, st).allow).toBe(true);
    }
  });

  it('Pharmacist money matrix: submit/raise/apply yes; approve/void/issue no', () => {
    const ctx = { businessType: 'Pharmacy' as const, role: 'Pharmacist' as const, ...activeApproved };
    expect(can('payment.submit', ctx).allow).toBe(true);
    expect(can('return.raise', ctx).allow).toBe(true);
    expect(can('credit.apply', ctx).allow).toBe(true);
    expect(can('payment.approve', ctx).allow).toBe(false);
    expect(can('invoice.void', ctx).allow).toBe(false);
    expect(can('credit.issue', ctx).allow).toBe(false);
    expect(can('reminder.send', ctx).allow).toBe(false);
  });

  it('Platform admin money is read-only (no payment/return/credit mutations)', () => {
    const ctx = { businessType: 'Platform' as const, role: 'SupportManager' as const, ...activeApproved };
    expect(can('read.platform', ctx).allow).toBe(true);
    expect(can('payment.approve', ctx).allow).toBe(false);
    expect(can('payment.submit', ctx).allow).toBe(false);
    expect(can('return.approve', ctx).allow).toBe(false);
    expect(can('credit.issue', ctx).allow).toBe(false);
    expect(can('invoice.void', ctx).allow).toBe(false);
  });

  it('Pharmacist can sale.record and inventory.adjust; DeliveryStaff sale.view only', () => {
    const pharmacist = { businessType: 'Pharmacy' as const, role: 'Pharmacist' as const, ...activeApproved };
    expect(can('sale.record', pharmacist).allow).toBe(true);
    expect(can('inventory.adjust', pharmacist).allow).toBe(true);
    expect(
      can('sale.record', { businessType: 'Pharmacy', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('sale.view', { businessType: 'Pharmacy', role: 'DeliveryStaff', ...activeApproved }).allow,
    ).toBe(true);
  });

  it('unverified blocks trade actions', () => {
    expect(
      can('order.place', {
        businessType: 'Pharmacy',
        role: 'Pharmacist',
        accountStatus: 'Active',
        verificationStatus: 'Submitted',
      }).allow,
    ).toBe(false);
  });
});

describe('Wave 11 — role × action matrix (UI / can alignment)', () => {
  it('Pharmacist: all pharmacy nav actions allowed', () => {
    const ctx = { businessType: 'Pharmacy' as const, role: 'Pharmacist' as const, ...activeApproved };
    for (const action of pharmacyNavActions) {
      expect(can(action, ctx).allow, action).toBe(true);
    }
    expect(can('payment.approve', ctx).allow).toBe(false);
    expect(can('order.accept', ctx).allow).toBe(false);
    expect(can('settings.manage', ctx).allow).toBe(false);
  });

  it('Pharmacy DeliveryStaff: delivery + read; trade nav actions denied', () => {
    const ctx = { businessType: 'Pharmacy' as const, role: 'DeliveryStaff' as const, ...activeApproved };
    expect(can('delivery.update', ctx).allow).toBe(true);
    expect(can('read.own', ctx).allow).toBe(true);
    expect(can('sale.view', ctx).allow).toBe(true);
    expect(can('support.manage', ctx).allow).toBe(true);
    for (const action of pharmacyNavActions.filter((a) => a !== 'delivery.update')) {
      expect(can(action, ctx).allow, action).toBe(false);
    }
  });

  it('Stockist: all stockist nav actions allowed', () => {
    const ctx = { businessType: 'Stockist' as const, role: 'Stockist' as const, ...activeApproved };
    for (const action of stockistNavActions) {
      expect(can(action, ctx).allow, action).toBe(true);
    }
    expect(can('order.place', ctx).allow).toBe(false);
    expect(can('sale.record', ctx).allow).toBe(false);
  });

  it('Stockist DeliveryStaff: only delivery.update among stockist nav', () => {
    const ctx = { businessType: 'Stockist' as const, role: 'DeliveryStaff' as const, ...activeApproved };
    expect(can('delivery.update', ctx).allow).toBe(true);
    expect(can('read.own', ctx).allow).toBe(true);
    expect(can('support.manage', ctx).allow).toBe(true);
    for (const action of stockistNavActions.filter((a) => a !== 'delivery.update')) {
      expect(can(action, ctx).allow, action).toBe(false);
    }
  });

  it('SuperAdmin: admin nav + settings/plan/impersonate; SupportManager lacks settings/plan/impersonate', () => {
    const sa = { businessType: 'Platform' as const, role: 'SuperAdmin' as const, ...activeApproved };
    const sm = { businessType: 'Platform' as const, role: 'SupportManager' as const, ...activeApproved };
    for (const action of adminNavActions) {
      expect(can(action, sa).allow, `SA ${action}`).toBe(true);
    }
    expect(can('plan.manage', sa).allow).toBe(true);
    expect(can('impersonate', sa).allow).toBe(true);

    for (const action of adminNavActions.filter((a) => a !== 'settings.manage')) {
      expect(can(action, sm).allow, `SM ${action}`).toBe(true);
    }
    expect(can('settings.manage', sm).allow).toBe(false);
    expect(can('plan.manage', sm).allow).toBe(false);
    expect(can('impersonate', sm).allow).toBe(false);
  });

  it('suspended still allows read/support/verification.submit; blocks trade and counterfeit.report', () => {
    const ph = {
      businessType: 'Pharmacy' as const,
      role: 'Pharmacist' as const,
      accountStatus: 'Suspended' as const,
      verificationStatus: 'Approved' as const,
    };
    expect(can('read.own', ph).allow).toBe(true);
    expect(can('support.manage', ph).allow).toBe(true);
    expect(can('verification.submit', ph).allow).toBe(true);
    expect(can('order.place', ph).allow).toBe(false);
    expect(can('payment.submit', ph).allow).toBe(false);
    expect(can('counterfeit.report', ph).allow).toBe(false);
    expect(can('counterfeit.report', ph).reason).toMatch(/This action is blocked/);
  });
});

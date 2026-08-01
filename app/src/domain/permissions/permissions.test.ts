import { describe, expect, it } from 'vitest';
import { can } from './index';

const activeApproved = {
  accountStatus: 'Active' as const,
  verificationStatus: 'Approved' as const,
};

describe('permission matrix cells (T-1)', () => {
  it('SupportAgent: support.manage yes, settings.manage no, verification.review no', () => {
    const ctx = { businessType: 'Platform' as const, role: 'SupportAgent' as const, ...activeApproved };
    expect(can('support.manage', ctx).allow).toBe(true);
    expect(can('settings.manage', ctx).allow).toBe(false);
    expect(can('verification.review', ctx).allow).toBe(false);
    expect(can('audit.export', ctx).allow).toBe(false);
  });

  it('Admin: verification + audit + staff, but not settings.manage', () => {
    const ctx = { businessType: 'Platform' as const, role: 'Admin' as const, ...activeApproved };
    expect(can('verification.review', ctx).allow).toBe(true);
    expect(can('audit.export', ctx).allow).toBe(true);
    expect(can('staff.manage', ctx).allow).toBe(true);
    expect(can('announcement.manage', ctx).allow).toBe(true);
    expect(can('settings.manage', ctx).allow).toBe(false);
  });

  it('SuperAdmin: settings.manage + plan.manage + staff.manage', () => {
    const ctx = { businessType: 'Platform' as const, role: 'SuperAdmin' as const, ...activeApproved };
    expect(can('settings.manage', ctx).allow).toBe(true);
    expect(can('plan.manage', ctx).allow).toBe(true);
    expect(can('staff.manage', ctx).allow).toBe(true);
    expect(can('business.suspend', ctx).allow).toBe(true);
  });

  it('explicit deny override blocks even Owner order.place', () => {
    expect(
      can('order.place', {
        businessType: 'Pharmacy',
        role: 'Owner',
        ...activeApproved,
        overrides: { 'order.place': false },
      }).allow,
    ).toBe(false);
  });

  it('Deactivated blocks all actions', () => {
    expect(
      can('read.own', {
        businessType: 'Pharmacy',
        role: 'Owner',
        accountStatus: 'Deactivated',
        verificationStatus: 'Approved',
      }).allow,
    ).toBe(false);
  });

  it('Accountant stockist can approve payment but not catalogue.manage', () => {
    const ctx = { businessType: 'Stockist' as const, role: 'Accountant' as const, ...activeApproved };
    expect(can('payment.approve', ctx).allow).toBe(true);
    expect(can('catalogue.manage', ctx).allow).toBe(false);
  });

  it('Pharmacy Staff can sale.record; Accountant sale.view only', () => {
    expect(
      can('sale.record', { businessType: 'Pharmacy', role: 'Staff', ...activeApproved }).allow,
    ).toBe(true);
    expect(
      can('sale.record', { businessType: 'Pharmacy', role: 'Accountant', ...activeApproved }).allow,
    ).toBe(false);
    expect(
      can('sale.view', { businessType: 'Pharmacy', role: 'Accountant', ...activeApproved }).allow,
    ).toBe(true);
  });
});

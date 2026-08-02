import type { AccountStatus, BusinessType, OperationalRole, VerificationStatus } from '../entities/types';

export type Action =
  | 'trade.create'
  | 'order.place'
  | 'order.recordManual'
  | 'order.accept'
  | 'order.reject'
  | 'order.cancel'
  | 'order.allocate'
  | 'order.pack'
  | 'partner.invite'
  | 'payment.recordOffline'
  | 'reminder.send'
  | 'supplier.manage'
  | 'po.manage'
  | 'route.manage'
  | 'invoice.issue'
  | 'invoice.void'
  | 'payment.submit'
  | 'payment.approve'
  | 'payment.reject'
  | 'return.raise'
  | 'return.approve'
  | 'credit.issue'
  | 'credit.apply'
  | 'delivery.assign'
  | 'delivery.update'
  | 'catalogue.manage'
  | 'inventory.adjust'
  | 'connection.request'
  | 'connection.respond'
  | 'staff.manage'
  | 'verification.submit'
  | 'verification.review'
  | 'business.suspend'
  | 'audit.export'
  | 'support.manage'
  | 'announcement.manage'
  | 'settings.manage'
  | 'plan.manage'
  | 'counterfeit.report'
  | 'counterfeit.review'
  | 'impersonate'
  | 'read.own'
  | 'read.platform'
  | 'sale.record'
  /** Delivery-board / read context only — never gates POS; use sale.record for /pharmacy/sales. */
  | 'sale.view';

/** Pharmacy: Pharmacist = full business ops; DeliveryStaff = customer delivery only. */
const pharmacyMatrix: Record<OperationalRole, Action[]> = {
  Pharmacist: [
    'trade.create',
    'order.place',
    'order.cancel',
    'payment.submit',
    'return.raise',
    'credit.apply',
    'connection.request',
    'staff.manage',
    'verification.submit',
    'inventory.adjust',
    'read.own',
    'support.manage',
    'sale.record',
    'sale.view',
    'counterfeit.report',
    'delivery.assign',
    'delivery.update',
    'route.manage',
  ],
  // support.manage kept so DeliveryStaff can open Support tickets about deliveries (help channel).
  // Partner Messages are gated separately via trade actions (order.place), not this flag.
  DeliveryStaff: ['delivery.update', 'read.own', 'sale.view', 'support.manage'], // sale.view = delivery context only; POS uses sale.record
  Stockist: [],
  SupportManager: [],
  SuperAdmin: [],
};

/** Stockist role = full distributor ops; DeliveryStaff = B2B delivery execute only. */
const stockistMatrix: Record<OperationalRole, Action[]> = {
  Stockist: [
    'trade.create',
    'order.recordManual',
    'order.accept',
    'order.reject',
    'order.cancel',
    'order.allocate',
    'order.pack',
    'invoice.issue',
    'invoice.void',
    'payment.approve',
    'payment.reject',
    'payment.recordOffline',
    'reminder.send',
    'return.approve',
    'credit.issue',
    'credit.apply',
    'delivery.assign',
    'delivery.update',
    'catalogue.manage',
    'inventory.adjust',
    'connection.respond',
    'partner.invite',
    'supplier.manage',
    'po.manage',
    'route.manage',
    'staff.manage',
    'verification.submit',
    'read.own',
    'support.manage',
    'counterfeit.report',
  ],
  // support.manage kept so DeliveryStaff can open Support tickets about deliveries (help channel).
  // Partner Messages are gated separately via trade actions (order.accept), not this flag.
  DeliveryStaff: ['delivery.update', 'read.own', 'support.manage'],
  Pharmacist: [],
  SupportManager: [],
  SuperAdmin: [],
};

/**
 * Platform: SupportManager + SuperAdmin only.
 * Split: SupportManager may staff.manage (invite SupportManagers) but not settings.manage / plan.manage / impersonate.
 * SuperAdmin alone owns platform settings, plans, and view-as.
 */
const adminMatrix: Record<OperationalRole, Action[]> = {
  SupportManager: [
    'verification.review',
    'business.suspend',
    'support.manage',
    'announcement.manage',
    'read.platform',
    'audit.export',
    'staff.manage',
    'counterfeit.review',
  ],
  SuperAdmin: [
    'verification.review',
    'business.suspend',
    'support.manage',
    'announcement.manage',
    'settings.manage',
    'plan.manage',
    'read.platform',
    'audit.export',
    'staff.manage',
    'counterfeit.review',
    'impersonate',
  ],
  Pharmacist: [],
  Stockist: [],
  DeliveryStaff: [],
};

export interface PermissionContext {
  businessType: BusinessType;
  role: OperationalRole;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  overrides?: Record<string, boolean>;
  targetBusinessId?: string;
  actorBusinessId?: string;
  /** CF-25: view-as sessions may only read */
  impersonationReadOnly?: boolean;
}

export function can(action: Action, ctx: PermissionContext): { allow: boolean; reason?: string } {
  if (ctx.impersonationReadOnly) {
    if (action === 'read.own' || action === 'read.platform') return { allow: true };
    return { allow: false, reason: 'View-as session is read-only. Exit to admin to make changes.' };
  }
  if (ctx.overrides?.[action] === false) return { allow: false, reason: 'Explicit deny override.' };
  if (ctx.overrides?.[action] === true) {
    // still respect suspension for trade
  }

  if (ctx.accountStatus === 'Suspended' && !['read.own', 'read.platform', 'support.manage', 'verification.submit'].includes(action)) {
    return { allow: false, reason: 'Business is suspended. Trade actions are blocked.' };
  }
  if (ctx.accountStatus === 'Deactivated') {
    return { allow: false, reason: 'Business is deactivated.' };
  }

  const tradeActions: Action[] = [
    'order.place',
    'order.recordManual',
    'order.accept',
    'order.reject',
    'order.cancel',
    'order.allocate',
    'order.pack',
    'connection.request',
    'connection.respond',
    'catalogue.manage',
    'invoice.issue',
    'invoice.void',
    'payment.submit',
    'payment.approve',
    'payment.reject',
    'payment.recordOffline',
    'return.raise',
    'return.approve',
    'partner.invite',
    'delivery.assign',
    'delivery.update',
    'inventory.adjust',
    'credit.issue',
    'credit.apply',
    'sale.record',
    'supplier.manage',
    'po.manage',
    'reminder.send',
    'route.manage',
  ];
  if (
    tradeActions.includes(action) &&
    ctx.businessType !== 'Platform' &&
    ctx.verificationStatus !== 'Approved'
  ) {
    return { allow: false, reason: 'Business must be verified before trade.' };
  }

  if (ctx.targetBusinessId && ctx.actorBusinessId && ctx.targetBusinessId === ctx.actorBusinessId) {
    if (action.startsWith('connection') || action === 'order.place') {
      return { allow: false, reason: 'Self-trade is not allowed.' };
    }
  }

  let allowed: Action[] = [];
  if (ctx.businessType === 'Pharmacy') allowed = pharmacyMatrix[ctx.role] ?? [];
  else if (ctx.businessType === 'Stockist') allowed = stockistMatrix[ctx.role] ?? [];
  else allowed = adminMatrix[ctx.role] ?? [];

  if (ctx.overrides?.[action] === true) return { allow: true };
  if (allowed.includes(action)) return { allow: true };
  return { allow: false, reason: 'Role is not permitted for this action.' };
}

export function portalFor(type: BusinessType): 'pharmacy' | 'stockist' | 'admin' {
  if (type === 'Pharmacy') return 'pharmacy';
  if (type === 'Stockist') return 'stockist';
  return 'admin';
}

/** Map legacy seed/session roles onto the simplified matrix. */
export function normalizeOperationalRole(role: string): OperationalRole {
  switch (role) {
    case 'Pharmacist':
    case 'Stockist':
    case 'DeliveryStaff':
    case 'SupportManager':
    case 'SuperAdmin':
      return role;
    case 'Owner':
    case 'Manager':
    case 'Staff':
    case 'Accountant':
      return 'Pharmacist';
    case 'DeliveryBoy':
      return 'DeliveryStaff';
    case 'SupportAgent':
    case 'Admin':
      return 'SupportManager';
    case 'CompanyOwner':
      return 'Stockist';
    default:
      return 'Pharmacist';
  }
}

export function normalizeRoleForBusiness(role: string, businessType: BusinessType): OperationalRole {
  if (role === 'DeliveryStaff' || role === 'DeliveryBoy') return 'DeliveryStaff';
  if (businessType === 'Platform') {
    if (role === 'SuperAdmin') return 'SuperAdmin';
    return 'SupportManager';
  }
  if (businessType === 'Stockist') {
    if (role === 'DeliveryStaff' || role === 'DeliveryBoy') return 'DeliveryStaff';
    return 'Stockist';
  }
  return 'Pharmacist';
}

import type { Business, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { normalizeRoleForBusiness } from '../domain/permissions';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { notifyBusinessUsers } from './notifications';
import { nowIso } from '../domain/utils/clock';

export type ImpersonationSession = {
  adminUser: User;
  adminBusiness: Business;
  reason: string;
  startedAt: string;
  targetBusinessId: string;
  notifyOwner: boolean;
};

export type EnterImpersonationResult = {
  viewUser: User;
  viewBusiness: Business;
  impersonation: ImpersonationSession;
  portal: 'pharmacy' | 'stockist';
};

/** SuperAdmin view-as: read-only session into a business portal (CF-25 / AC-Q09). */
export async function enterImpersonation(params: {
  actor: User;
  platform: Business;
  targetBusinessId: string;
  reason: string;
  notifyOwner?: boolean;
  /** E-CF-25b: reject if already impersonating */
  alreadyImpersonating?: boolean;
}): Promise<Result<EnterImpersonationResult>> {
  const perm = assertCan(params.actor, params.platform, 'impersonate');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'View-as was not started.');
  if (params.actor.role !== 'SuperAdmin') {
    return fail('Permission', 'IMP_ROLE', 'Only SuperAdmin can view as a business.', 'View-as was not started.');
  }
  if (params.alreadyImpersonating) {
    return fail('StateConflict', 'IMP_ACTIVE', 'Exit the current view-as session first.', 'View-as was not started.');
  }
  const reason = params.reason.trim();
  if (reason.length < 5) {
    return fail('Validation', 'IMP_REASON', 'Enter a reason (at least 5 characters).', 'View-as was not started.');
  }
  const target = await db.businesses.get(params.targetBusinessId);
  if (!target || target.type === 'Platform') {
    return fail('NotFound', 'IMP_BIZ', 'Target business not found.', 'View-as was not started.');
  }
  const primaryRole = target.type === 'Stockist' ? 'Stockist' : 'Pharmacist';
  const owner =
    (await db.users
      .where('businessId')
      .equals(target.id)
      .filter((u) => normalizeRoleForBusiness(u.role, target.type) === primaryRole && u.status === 'Active')
      .first()) ??
    (await db.users.where('businessId').equals(target.id).filter((u) => u.status === 'Active').first());
  if (!owner) {
    return fail('NotFound', 'IMP_USER', 'No active user to view as.', 'View-as was not started.');
  }

  // Never expose password material in the view session object
  const viewUser: User = {
    ...owner,
    passwordHash: '',
    passwordSalt: '',
    impersonationReadOnly: true,
  };
  const startedAt = nowIso();
  const impersonation: ImpersonationSession = {
    adminUser: params.actor,
    adminBusiness: params.platform,
    reason,
    startedAt,
    targetBusinessId: target.id,
    notifyOwner: params.notifyOwner !== false,
  };

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'Business',
    entityId: target.id,
    action: 'impersonate.enter',
    reason,
    after: { targetBusinessId: target.id, viewUserId: owner.id, startedAt },
  });

  if (impersonation.notifyOwner) {
    await notifyBusinessUsers(
      target.id,
      'N-315',
      { reason },
      { type: 'Business', id: target.id },
      [primaryRole],
    );
  }

  return ok({
    viewUser,
    viewBusiness: target,
    impersonation,
    portal: target.type === 'Pharmacy' ? 'pharmacy' : 'stockist',
  });
}

export async function exitImpersonation(params: {
  impersonation: ImpersonationSession;
}): Promise<Result<{ user: User; business: Business }>> {
  const { adminUser, adminBusiness, targetBusinessId, reason, startedAt } = params.impersonation;
  await writeAudit({
    actorId: adminUser.id,
    actorName: adminUser.name,
    businessId: adminBusiness.id,
    entityType: 'Business',
    entityId: targetBusinessId,
    action: 'impersonate.exit',
    reason,
    after: { targetBusinessId, startedAt, exitedAt: nowIso() },
  });
  // Reload admin entities from DB (fresh)
  const user = await db.users.get(adminUser.id);
  const business = await db.businesses.get(adminBusiness.id);
  if (!user || !business) {
    return fail('NotFound', 'IMP_ADMIN', 'Admin session could not be restored.', 'Exit failed.');
  }
  return ok({ user, business });
}

import type { Business, OperationalRole, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { normalizeRoleForBusiness } from '../domain/permissions';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers, emitNotification } from './notifications';
import { nowIso } from '../domain/utils/clock';

function primaryRoleFor(business: Business): OperationalRole {
  if (business.type === 'Stockist') return 'Stockist';
  if (business.type === 'Platform') return 'SuperAdmin';
  return 'Pharmacist';
}

/** Role the outgoing primary is demoted to after ownership transfer. */
function demotedRoleFor(business: Business): OperationalRole {
  if (business.type === 'Platform') return 'SupportManager';
  return 'DeliveryStaff';
}

function isPrimaryAccount(user: User, business: Business): boolean {
  const role = normalizeRoleForBusiness(user.role, business.type);
  return role === primaryRoleFor(business) || user.id === business.ownerUserId;
}

export async function changeRole(params: {
  actor: User;
  business: Business;
  userId: string;
  role: OperationalRole;
}): Promise<Result<User>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Role was not changed.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Staff member not found.', 'Role was not changed.');
  }
  if (isPrimaryAccount(target, params.business) && params.role !== primaryRoleFor(params.business)) {
    return fail(
      'BusinessRule',
      'PRIMARY_ROLE',
      'Transfer ownership instead of demoting the primary account holder.',
      'Role was not changed.',
    );
  }
  const allowed =
    params.business.type === 'Platform'
      ? params.role === 'SupportManager'
      : params.role === 'DeliveryStaff';
  if (!allowed) {
    return fail('Validation', 'STAFF_ROLE', 'That role cannot be assigned via change-role.', 'Role was not changed.');
  }
  await db.users.update(target.id, { role: params.role, updatedAt: nowIso() });
  await emitNotification({
    userId: target.id,
    businessId: params.business.id,
    code: 'N-008',
    vars: { businessName: params.business.name, role: params.role },
    entityType: 'User',
    entityId: target.id,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.changeRole',
    after: { role: params.role },
  });
  return ok((await db.users.get(target.id))!);
}

export async function suspendStaff(params: {
  actor: User;
  business: Business;
  userId: string;
  reason?: string;
}): Promise<Result<User>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Staff was not suspended.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Staff member not found.', 'Staff was not suspended.');
  }
  if (isPrimaryAccount(target, params.business)) {
    return fail('BusinessRule', 'PRIMARY_LOCK', 'Cannot suspend the primary account holder.', 'Staff was not suspended.');
  }
  await db.users.update(target.id, { status: 'Suspended', updatedAt: nowIso() });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.suspend',
    reason: params.reason,
  });
  return ok((await db.users.get(target.id))!);
}

export async function reactivateStaff(params: {
  actor: User;
  business: Business;
  userId: string;
}): Promise<Result<User>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Staff was not reactivated.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Staff member not found.', 'Staff was not reactivated.');
  }
  await db.users.update(target.id, { status: 'Active', updatedAt: nowIso() });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.reactivate',
  });
  return ok((await db.users.get(target.id))!);
}

export async function removeStaff(params: {
  actor: User;
  business: Business;
  userId: string;
  reason?: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Staff was not removed.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Staff member not found.', 'Staff was not removed.');
  }
  if (isPrimaryAccount(target, params.business)) {
    return fail('BusinessRule', 'PRIMARY_LOCK', 'Cannot remove the primary account holder.', 'Staff was not removed.');
  }
  await db.users.update(target.id, { status: 'Removed', updatedAt: nowIso() });
  await emitNotification({
    userId: target.id,
    businessId: params.business.id,
    code: 'N-009',
    vars: { businessName: params.business.name },
    entityType: 'User',
    entityId: target.id,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.remove',
    reason: params.reason?.trim() || undefined,
  });
  return ok(true);
}

export async function revokeInvite(params: {
  actor: User;
  business: Business;
  userId: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Invite was not revoked.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Invite not found.', 'Invite was not revoked.');
  }
  if (target.status !== 'Invited') {
    return fail('StateConflict', 'INVITE_STATE', 'User is not in Invited status.', 'Invite was not revoked.');
  }
  await db.users.update(target.id, {
    status: 'Removed',
    inviteToken: undefined,
    inviteExpiresAt: undefined,
    updatedAt: nowIso(),
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.revokeInvite',
  });
  return ok(true);
}

export async function resendInvite(params: {
  actor: User;
  business: Business;
  userId: string;
}): Promise<Result<User>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Invite was not resent.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Invite not found.', 'Invite was not resent.');
  }
  if (target.status !== 'Invited') {
    return fail('StateConflict', 'INVITE_STATE', 'User is not in Invited status.', 'Invite was not resent.');
  }
  const settings = await db.platformSettings.get('platform');
  const token = newId();
  const expiresAt = new Date(new Date(nowIso()).getTime() + (settings?.inviteTtlDays ?? 7) * 86400000).toISOString();
  await db.users.update(target.id, {
    inviteToken: token,
    inviteExpiresAt: expiresAt,
    updatedAt: nowIso(),
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.resendInvite',
    after: { inviteExpiresAt: expiresAt },
  });
  await emitNotification({
    userId: target.id,
    businessId: params.business.id,
    code: 'N-007',
    vars: { businessName: params.business.name, role: target.role },
    entityType: 'User',
    entityId: target.id,
  });
  return ok((await db.users.get(target.id))!);
}

export async function transferOwnership(params: {
  actor: User;
  business: Business;
  newOwnerUserId: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Ownership was not transferred.');
  const actorRole = normalizeRoleForBusiness(params.actor.role, params.business.type);
  if (actorRole !== primaryRoleFor(params.business) && actorRole !== 'SuperAdmin') {
    return fail(
      'Permission',
      'PRIMARY_ONLY',
      'Only the primary account holder can transfer ownership.',
      'Ownership was not transferred.',
    );
  }
  const next = await db.users.get(params.newOwnerUserId);
  if (!next || next.businessId !== params.business.id || next.status !== 'Active') {
    return fail('NotFound', 'USER_MISSING', 'New owner not found or inactive.', 'Ownership was not transferred.');
  }
  const primary = primaryRoleFor(params.business);
  const demoted = demotedRoleFor(params.business);
  const ts = nowIso();
  await db.transaction('rw', db.users, db.businesses, async () => {
    const currents = await db.users
      .where({ businessId: params.business.id })
      .filter((u) => normalizeRoleForBusiness(u.role, params.business.type) === primary && u.status === 'Active')
      .toArray();
    for (const o of currents) {
      if (o.id !== next.id) await db.users.update(o.id, { role: demoted, updatedAt: ts });
    }
    await db.users.update(next.id, { role: primary, updatedAt: ts });
    await db.businesses.update(params.business.id, { ownerUserId: next.id, updatedAt: ts });
  });
  // Include DeliveryStaff so the demoted former owner still receives N-049 after role change.
  const fanoutRoles =
    params.business.type === 'Platform'
      ? ['SuperAdmin', 'SupportManager']
      : params.business.type === 'Stockist'
        ? ['Stockist', 'DeliveryStaff']
        : ['Pharmacist', 'DeliveryStaff'];
  await notifyBusinessUsers(
    params.business.id,
    'N-049',
    { businessName: params.business.name },
    { type: 'Business', id: params.business.id },
    fanoutRoles,
  );
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Business',
    entityId: params.business.id,
    action: 'staff.transferOwnership',
    after: { ownerUserId: next.id },
  });
  return ok(true);
}

export async function setPermissionOverrides(params: {
  actor: User;
  business: Business;
  userId: string;
  overrides: Record<string, boolean>;
}): Promise<Result<User>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Overrides were not saved.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Staff member not found.', 'Overrides were not saved.');
  }
  await db.users.update(target.id, { permissionOverrides: params.overrides, updatedAt: nowIso() });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.setOverrides',
    after: { overrides: params.overrides },
  });
  return ok((await db.users.get(target.id))!);
}

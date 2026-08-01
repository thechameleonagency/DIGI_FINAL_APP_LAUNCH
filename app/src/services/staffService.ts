import type { Business, OperationalRole, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers, emitNotification } from './notifications';

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
  if (target.role === 'Owner' && params.role !== 'Owner') {
    return fail('BusinessRule', 'OWNER_ROLE', 'Transfer ownership instead of demoting the Owner.', 'Role was not changed.');
  }
  await db.users.update(target.id, { role: params.role, updatedAt: new Date().toISOString() });
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
  if (target.role === 'Owner') return fail('BusinessRule', 'OWNER_LOCK', 'Cannot suspend the Owner.', 'Staff was not suspended.');
  await db.users.update(target.id, { status: 'Suspended', updatedAt: new Date().toISOString() });
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
  await db.users.update(target.id, { status: 'Active', updatedAt: new Date().toISOString() });
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
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Staff was not removed.');
  const target = await db.users.get(params.userId);
  if (!target || target.businessId !== params.business.id) {
    return fail('NotFound', 'USER_MISSING', 'Staff member not found.', 'Staff was not removed.');
  }
  if (target.role === 'Owner') return fail('BusinessRule', 'OWNER_LOCK', 'Cannot remove the Owner.', 'Staff was not removed.');
  await db.users.update(target.id, { status: 'Removed', updatedAt: new Date().toISOString() });
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
    updatedAt: new Date().toISOString(),
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
  const expiresAt = new Date(Date.now() + (settings?.inviteTtlDays ?? 7) * 86400000).toISOString();
  await db.users.update(target.id, {
    inviteToken: token,
    inviteExpiresAt: expiresAt,
    updatedAt: new Date().toISOString(),
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
  if (params.actor.role !== 'Owner' && params.actor.role !== 'SuperAdmin') {
    return fail('Permission', 'OWNER_ONLY', 'Only the Owner can transfer ownership.', 'Ownership was not transferred.');
  }
  const next = await db.users.get(params.newOwnerUserId);
  if (!next || next.businessId !== params.business.id || next.status !== 'Active') {
    return fail('NotFound', 'USER_MISSING', 'New owner not found or inactive.', 'Ownership was not transferred.');
  }
  const owners = await db.users
    .where('businessId')
    .equals(params.business.id)
    .filter((u) => u.role === 'Owner' && u.status === 'Active')
    .count();
  if (owners < 1) {
    return fail('Integrity', 'OWNER_MISSING', 'No active owner found.', 'Ownership was not transferred.');
  }
  const ts = new Date().toISOString();
  await db.transaction('rw', db.users, db.businesses, async () => {
    const currentOwners = await db.users.where({ businessId: params.business.id }).filter((u) => u.role === 'Owner' && u.status === 'Active').toArray();
    for (const o of currentOwners) {
      if (o.id !== next.id) await db.users.update(o.id, { role: 'Manager', updatedAt: ts });
    }
    await db.users.update(next.id, { role: 'Owner', updatedAt: ts });
    await db.businesses.update(params.business.id, { ownerUserId: next.id, updatedAt: ts });
  });
  await notifyBusinessUsers(params.business.id, 'N-049', { businessName: params.business.name }, { type: 'Business', id: params.business.id });
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
  await db.users.update(target.id, { permissionOverrides: params.overrides, updatedAt: new Date().toISOString() });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: target.id,
    action: 'staff.overrides',
    after: params.overrides,
  });
  return ok((await db.users.get(target.id))!);
}

import type { Business, Connection, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

export async function requestConnection(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  note?: string;
}): Promise<Result<Connection>> {
  const perm = assertCan(params.actor, params.pharmacy, 'connection.request');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Connection was not requested.');
  if (params.pharmacy.type !== 'Pharmacy') {
    return fail('BusinessRule', 'CONN_ROLE', 'Only pharmacies can request connections.', 'Connection was not requested.');
  }
  const stockist = await db.businesses.get(params.stockistId);
  if (!stockist || stockist.type !== 'Stockist') {
    return fail('NotFound', 'CONN_STOCKIST', 'Stockist not found.', 'Connection was not requested.');
  }
  if (stockist.verificationStatus !== 'Approved' || stockist.accountStatus !== 'Active') {
    return fail('BusinessRule', 'CONN_STOCKIST_GATE', 'Stockist is not available for connection.', 'Connection was not requested.');
  }

  const existing = await db.connections
    .where('[pharmacyId+stockistId]')
    .equals([params.pharmacy.id, params.stockistId])
    .first();

  if (existing?.status === 'Active') {
    return fail('Duplicate', 'CONN_ACTIVE', 'An active connection already exists.', 'Connection was not requested.', {
      existingId: existing.id,
    });
  }
  if (existing?.status === 'Requested') {
    return fail('Duplicate', 'CONN_PENDING', 'A connection request is already pending.', 'Connection was not requested.', {
      existingId: existing.id,
    });
  }
  if (existing?.status === 'Blocked') {
    return fail('BusinessRule', 'CONN_BLOCKED', 'This stockist has blocked the connection.', 'Connection was not requested.');
  }

  const ts = new Date().toISOString();
  if (existing && (existing.status === 'Rejected' || existing.status === 'Disconnected' || existing.status === 'Cancelled')) {
    const t = machines.connection(existing.status, 'Requested');
    if (!t.ok) return fail('StateConflict', 'CONN_BAD_STATE', t.reason!, 'Connection was not requested.');
    await db.connections.update(existing.id, {
      status: 'Requested',
      note: params.note,
      requestedAt: ts,
      updatedAt: ts,
      statusHistory: [...existing.statusHistory, { from: existing.status, to: 'Requested', at: ts, actorId: params.actor.id }],
    });
    const updated = (await db.connections.get(existing.id))!;
    await notifyBusinessUsers(stockist.id, 'N-010', { pharmacy: params.pharmacy.name, stockist: stockist.name }, { type: 'Connection', id: updated.id });
    return ok(updated);
  }

  const conn: Connection = {
    id: newId(),
    pharmacyId: params.pharmacy.id,
    stockistId: params.stockistId,
    status: 'Requested',
    requestedAt: ts,
    note: params.note,
    statusHistory: [{ from: 'Requested', to: 'Requested', at: ts, actorId: params.actor.id }],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.connections.add(conn);
  await notifyBusinessUsers(stockist.id, 'N-010', { pharmacy: params.pharmacy.name, stockist: stockist.name }, { type: 'Connection', id: conn.id });
  return ok(conn);
}

export async function respondConnection(params: {
  actor: User;
  stockist: Business;
  connectionId: string;
  decision: 'Active' | 'Rejected';
  reason?: string;
  creditDays?: number;
  creditLimit?: number;
}): Promise<Result<Connection>> {
  const perm = assertCan(params.actor, params.stockist, 'connection.respond');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Connection response was not saved.');
  const conn = await db.connections.get(params.connectionId);
  if (!conn || conn.stockistId !== params.stockist.id) {
    return fail('NotFound', 'CONN_MISSING', 'Connection not found.', 'Connection response was not saved.');
  }
  const t = machines.connection(conn.status, params.decision);
  if (!t.ok) return fail('StateConflict', 'CONN_BAD_STATE', t.reason!, 'Connection response was not saved.');
  if (params.decision === 'Rejected' && !params.reason?.trim()) {
    return fail('Validation', 'CONN_REASON', 'Rejection reason is required.', 'Connection response was not saved.');
  }
  const ts = new Date().toISOString();
  await db.connections.update(conn.id, {
    status: params.decision,
    respondedAt: ts,
    updatedAt: ts,
    rejectReason: params.reason,
    creditDays: params.creditDays ?? params.stockist.creditDaysDefault ?? 30,
    creditLimit: params.creditLimit,
    statusHistory: [...conn.statusHistory, { from: conn.status, to: params.decision, at: ts, actorId: params.actor.id, reason: params.reason }],
  });
  const updated = (await db.connections.get(conn.id))!;
  const pharmacy = (await db.businesses.get(conn.pharmacyId))!;
  if (params.decision === 'Active') {
    await notifyBusinessUsers(pharmacy.id, 'N-011', { pharmacy: pharmacy.name, stockist: params.stockist.name }, { type: 'Connection', id: conn.id });
    const { markPartnerInvitesConnected } = await import('./partnerInviteService');
    await markPartnerInvitesConnected({ pharmacyId: pharmacy.id, stockistId: params.stockist.id });
  } else {
    await notifyBusinessUsers(pharmacy.id, 'N-012', { reason: params.reason ?? '' }, { type: 'Connection', id: conn.id });
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Connection',
    entityId: conn.id,
    action: `connection.${params.decision}`,
    reason: params.reason,
  });
  return ok(updated);
}

export async function cancelConnectionRequest(params: {
  actor: User;
  pharmacy: Business;
  connectionId: string;
}): Promise<Result<Connection>> {
  const perm = assertCan(params.actor, params.pharmacy, 'connection.request');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Request was not cancelled.');
  const conn = await db.connections.get(params.connectionId);
  if (!conn || conn.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'CONN_MISSING', 'Connection not found.', 'Request was not cancelled.');
  }
  const t = machines.connection(conn.status, 'Cancelled');
  if (!t.ok) return fail('StateConflict', 'CONN_BAD_STATE', t.reason!, 'Request was not cancelled.');
  const ts = new Date().toISOString();
  await db.connections.update(conn.id, {
    status: 'Cancelled',
    updatedAt: ts,
    statusHistory: [...conn.statusHistory, { from: conn.status, to: 'Cancelled', at: ts, actorId: params.actor.id }],
  });
  await notifyBusinessUsers(conn.stockistId, 'N-013', {}, { type: 'Connection', id: conn.id });
  return ok((await db.connections.get(conn.id))!);
}

export async function disconnectConnection(params: {
  actor: User;
  business: Business;
  connectionId: string;
  reason?: string;
}): Promise<Result<Connection>> {
  const action = params.business.type === 'Stockist' ? 'connection.respond' : 'connection.request';
  const perm = assertCan(params.actor, params.business, action);
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Connection was not disconnected.');
  if (!params.reason?.trim()) {
    return fail('Validation', 'CONN_REASON', 'Disconnect reason is required.', 'Connection was not disconnected.');
  }
  const conn = await db.connections.get(params.connectionId);
  if (!conn) return fail('NotFound', 'CONN_MISSING', 'Connection not found.', 'Connection was not disconnected.');
  if (conn.pharmacyId !== params.business.id && conn.stockistId !== params.business.id) {
    return fail('Permission', 'CONN_BOUNDARY', 'Not a party to this connection.', 'Connection was not disconnected.');
  }
  const t = machines.connection(conn.status, 'Disconnected');
  if (!t.ok) return fail('StateConflict', 'CONN_BAD_STATE', t.reason!, 'Connection was not disconnected.');
  const ts = new Date().toISOString();
  await db.connections.update(conn.id, {
    status: 'Disconnected',
    updatedAt: ts,
    statusHistory: [...conn.statusHistory, { from: conn.status, to: 'Disconnected', at: ts, actorId: params.actor.id, reason: params.reason }],
  });
  const otherId = conn.pharmacyId === params.business.id ? conn.stockistId : conn.pharmacyId;
  await notifyBusinessUsers(otherId, 'N-014', {}, { type: 'Connection', id: conn.id });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Connection',
    entityId: conn.id,
    action: 'connection.disconnect',
    reason: params.reason,
  });
  return ok((await db.connections.get(conn.id))!);
}

export async function blockConnection(params: {
  actor: User;
  stockist: Business;
  connectionId: string;
  reason?: string;
}): Promise<Result<Connection>> {
  const perm = assertCan(params.actor, params.stockist, 'connection.respond');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Connection was not blocked.');
  const conn = await db.connections.get(params.connectionId);
  if (!conn || conn.stockistId !== params.stockist.id) {
    return fail('NotFound', 'CONN_MISSING', 'Connection not found.', 'Connection was not blocked.');
  }
  const t = machines.connection(conn.status, 'Blocked');
  if (!t.ok) return fail('StateConflict', 'CONN_BAD_STATE', t.reason!, 'Connection was not blocked.');
  const ts = new Date().toISOString();
  await db.connections.update(conn.id, {
    status: 'Blocked',
    updatedAt: ts,
    statusHistory: [...conn.statusHistory, { from: conn.status, to: 'Blocked', at: ts, actorId: params.actor.id, reason: params.reason }],
  });
  await notifyBusinessUsers(conn.pharmacyId, 'N-015', { reason: params.reason ?? '' }, { type: 'Connection', id: conn.id });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Connection',
    entityId: conn.id,
    action: 'connection.block',
    reason: params.reason,
  });
  return ok((await db.connections.get(conn.id))!);
}

export async function unblockConnection(params: {
  actor: User;
  stockist: Business;
  connectionId: string;
}): Promise<Result<Connection>> {
  const perm = assertCan(params.actor, params.stockist, 'connection.respond');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Connection was not unblocked.');
  const conn = await db.connections.get(params.connectionId);
  if (!conn || conn.stockistId !== params.stockist.id) {
    return fail('NotFound', 'CONN_MISSING', 'Connection not found.', 'Connection was not unblocked.');
  }
  const t = machines.connection(conn.status, 'Active');
  if (!t.ok) return fail('StateConflict', 'CONN_BAD_STATE', t.reason!, 'Connection was not unblocked.');
  const ts = new Date().toISOString();
  await db.connections.update(conn.id, {
    status: 'Active',
    updatedAt: ts,
    statusHistory: [...conn.statusHistory, { from: conn.status, to: 'Active', at: ts, actorId: params.actor.id }],
  });
  await notifyBusinessUsers(conn.pharmacyId, 'N-011', { pharmacy: '', stockist: params.stockist.name }, { type: 'Connection', id: conn.id });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Connection',
    entityId: conn.id,
    action: 'connection.unblock',
  });
  return ok((await db.connections.get(conn.id))!);
}

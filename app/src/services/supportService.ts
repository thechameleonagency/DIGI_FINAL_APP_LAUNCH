import type { Business, Message, MessageThread, SupportTicket, User } from '../domain/entities/types';
import { availableQty, lowStock } from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { hydrateCounters } from '../data/counters';
import { SEED_VERSION } from '../data/seed';
import { formatINR } from '../domain/utils/money';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { hasNotification } from './notificationService';
import { emitNotification, notifyBusinessUsers } from './notifications';

export async function createTicket(params: {
  actor: User;
  business: Business;
  subject: string;
  category: string;
  body: string;
  priority?: SupportTicket['priority'];
  relatedEntityType?: string;
  relatedEntityId?: string;
}): Promise<Result<SupportTicket>> {
  const perm = assertCan(params.actor, params.business, 'support.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Ticket was not created.');
  if (!params.subject.trim() || !params.body.trim()) {
    return fail('Validation', 'TKT_FIELDS', 'Subject and description are required.', 'Ticket was not created.');
  }
  if (!params.category.trim()) {
    return fail('Validation', 'TKT_CATEGORY', 'Category is required.', 'Ticket was not created.');
  }
  const ts = new Date().toISOString();
  const ticket: SupportTicket = {
    id: newId(),
    ticketNo: nextNumber('TKT'),
    businessId: params.business.id,
    createdBy: params.actor.id,
    subject: params.subject.trim(),
    category: params.category.trim(),
    status: 'Open',
    priority: params.priority ?? 'Medium',
    relatedEntityType: params.relatedEntityType?.trim() || undefined,
    relatedEntityId: params.relatedEntityId?.trim() || undefined,
    updates: [{ at: ts, actorId: params.actor.id, body: params.body.trim(), status: 'Open' }],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.supportTickets.add(ticket);
  const admins = await db.users.filter((u) => ['Admin', 'SuperAdmin', 'SupportAgent'].includes(u.role)).toArray();
  for (const a of admins) {
    await notifyBusinessUsers(a.businessId, 'N-043', { ticketNo: ticket.ticketNo, subject: ticket.subject }, {
      type: 'SupportTicket',
      id: ticket.id,
    });
  }
  return ok(ticket);
}

export async function updateTicket(params: {
  actor: User;
  business: Business;
  ticketId: string;
  body?: string;
  status?: SupportTicket['status'];
  assigneeId?: string;
}): Promise<Result<SupportTicket>> {
  const ticket = await db.supportTickets.get(params.ticketId);
  if (!ticket) return fail('NotFound', 'TKT_MISSING', 'Ticket not found.', 'Ticket was not updated.');
  const isAdmin = params.business.type === 'Platform';
  if (!isAdmin && ticket.businessId !== params.business.id) {
    return fail('Permission', 'TKT_BOUNDARY', 'Cannot access this ticket.', 'Ticket was not updated.');
  }
  if (isAdmin) {
    const perm = assertCan(params.actor, params.business, 'support.manage');
    if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Ticket was not updated.');
  }
  const ts = new Date().toISOString();
  let status = ticket.status;
  if (params.status && params.status !== ticket.status) {
    const t = machines.ticket(ticket.status, params.status);
    if (!t.ok) return fail('StateConflict', 'TKT_BAD_STATE', t.reason!, 'Ticket was not updated.');
    status = params.status;
  }
  const updates = [...ticket.updates];
  if (params.body?.trim()) {
    updates.push({ at: ts, actorId: params.actor.id, body: params.body.trim(), status });
  } else if (params.status) {
    updates.push({ at: ts, actorId: params.actor.id, body: `Status → ${params.status}`, status });
  }
  const nextAssignee = params.assigneeId !== undefined ? params.assigneeId || undefined : ticket.assigneeId;
  if (params.assigneeId !== undefined && params.assigneeId && !params.body?.trim() && !params.status) {
    updates.push({
      at: ts,
      actorId: params.actor.id,
      body: `Assigned to agent`,
      status,
    });
  }
  await db.supportTickets.update(ticket.id, {
    status,
    assigneeId: nextAssignee,
    updates,
    updatedAt: ts,
  });
  await notifyBusinessUsers(ticket.businessId, 'N-044', { ticketNo: ticket.ticketNo }, { type: 'SupportTicket', id: ticket.id });
  if (nextAssignee && nextAssignee !== ticket.assigneeId) {
    await emitNotification({
      userId: nextAssignee,
      businessId: params.business.id,
      code: 'N-044',
      vars: { ticketNo: ticket.ticketNo },
      entityType: 'SupportTicket',
      entityId: ticket.id,
    });
  }
  return ok((await db.supportTickets.get(ticket.id))!);
}

export async function sendMessage(params: {
  actor: User;
  business: Business;
  counterpartBusinessId: string;
  body: string;
  threadId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}): Promise<Result<{ thread: MessageThread; message: Message }>> {
  const perm = assertCan(params.actor, params.business, 'read.own');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Message was not sent.');
  if (!params.body.trim()) return fail('Validation', 'MSG_EMPTY', 'Message cannot be empty.', 'Message was not sent.');
  const ts = new Date().toISOString();
  let thread = params.threadId ? await db.messageThreads.get(params.threadId) : undefined;
  if (!thread) {
    thread = {
      id: newId(),
      participantBusinessIds: [params.business.id, params.counterpartBusinessId],
      participantUserIds: [params.actor.id],
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      lastMessageAt: ts,
      createdAt: ts,
    };
    await db.messageThreads.add(thread);
  }
  const message: Message = {
    id: newId(),
    threadId: thread.id,
    senderId: params.actor.id,
    body: params.body.trim(),
    createdAt: ts,
    readBy: [params.actor.id],
  };
  await db.messages.add(message);
  const participants = Array.from(new Set([...(thread.participantUserIds ?? []), params.actor.id]));
  await db.messageThreads.update(thread.id, { lastMessageAt: ts, participantUserIds: participants });
  await notifyBusinessUsers(params.counterpartBusinessId, 'N-042', { subject: 'conversation' }, { type: 'MessageThread', id: thread.id });
  return ok({ thread: (await db.messageThreads.get(thread.id))!, message });
}

/** Mark all messages in a thread as read by this user (ST-49). */
export async function markMessagesRead(threadId: string, userId: string): Promise<void> {
  const msgs = await db.messages.where('threadId').equals(threadId).toArray();
  await Promise.all(
    msgs
      .filter((m) => !m.readBy?.includes(userId))
      .map((m) => db.messages.update(m.id, { readBy: [...(m.readBy ?? []), userId] })),
  );
}

async function emitDeduped(
  userId: string,
  businessId: string,
  code: string,
  entityId: string,
  vars: Record<string, string>,
  entityType: string,
) {
  if (!userId || (await hasNotification(userId, code, entityId))) return;
  await emitNotification({ userId, businessId, code, vars, entityType, entityId });
}

async function notifyBizDeduped(
  businessId: string,
  code: string,
  entityId: string,
  vars: Record<string, string>,
  entityType: string,
  roles?: string[],
) {
  let users = await db.users.where('businessId').equals(businessId).filter((u) => u.status === 'Active').toArray();
  if (roles?.length) users = users.filter((u) => roles.includes(u.role));
  for (const u of users) {
    await emitDeduped(u.id, businessId, code, entityId, vars, entityType);
  }
}

export async function runPolicyClock(): Promise<void> {
  const settings = await db.platformSettings.get('platform');
  if (!settings) return;
  const today = new Date();

  const batches = await db.batches.toArray();
  for (const b of batches) {
    const product = await db.products.get(b.productId);
    if (b.status === 'Available' && new Date(b.expiryDate) <= today) {
      await db.batches.update(b.id, { status: 'Expired', updatedAt: today.toISOString() });
      await notifyBizDeduped(b.stockistId, 'N-041', b.id, { batchNumber: b.batchNumber }, 'Batch');
    } else if (b.status === 'Available') {
      const days = Math.ceil((new Date(b.expiryDate).getTime() - today.getTime()) / 86400000);
      if (days > 0 && days <= (settings.expiryNearDays ?? 90)) {
        await notifyBizDeduped(
          b.stockistId,
          'N-040',
          b.id,
          { batchNumber: b.batchNumber, productName: product?.name ?? '', expiryDate: b.expiryDate },
          'Batch',
        );
      }
    }
    if (b.status === 'Available' && lowStock(availableQty(b))) {
      await notifyBizDeduped(
        b.stockistId,
        'N-039',
        b.productId,
        { productName: product?.name ?? '', qty: String(availableQty(b)) },
        'Product',
      );
    }
  }

  const invoices = await db.invoices.filter((i) => ['Issued', 'PartiallyPaid', 'Overdue'].includes(i.status)).toArray();
  for (const inv of invoices) {
    if (inv.dueDate && new Date(inv.dueDate) < today && invoiceOutstandingSafe(inv) > 0) {
      if (inv.status !== 'Overdue') {
        await db.invoices.update(inv.id, { status: 'Overdue', updatedAt: today.toISOString() });
      }
      await notifyBizDeduped(
        inv.pharmacyId,
        'N-028',
        inv.id,
        { invoiceNo: inv.invoiceNo, amount: formatINR(invoiceOutstandingSafe(inv)) },
        'Invoice',
      );
    }
  }

  const invited = await db.users.filter((u) => u.status === 'Invited' && !!u.inviteExpiresAt).toArray();
  for (const u of invited) {
    if (u.inviteExpiresAt && new Date(u.inviteExpiresAt) < today) {
      await db.users.update(u.id, { status: 'Removed', updatedAt: today.toISOString() });
      await notifyBizDeduped(u.businessId, 'N-050', u.id, { email: u.email }, 'User', ['Owner', 'Manager']);
    }
  }

  const announcements = await db.announcements.filter((a) => a.active).toArray();
  for (const a of announcements) {
    if (a.endsAt && new Date(a.endsAt) < today) {
      await db.announcements.update(a.id, { active: false });
    }
  }

  const banners = await db.banners.filter((b) => b.active).toArray();
  for (const b of banners) {
    if (b.endsAt && new Date(b.endsAt) < today) {
      await db.banners.update(b.id, { active: false });
    }
  }

  const verSla = (settings.verificationSlaHours ?? 72) * 3600000;
  const orderSla = (settings.orderSlaHours ?? 24) * 3600000;
  const paySla = (settings.paymentSlaHours ?? 48) * 3600000;

  const pendingVer = await db.verifications.filter((v) => ['Submitted', 'UnderReview'].includes(v.status)).toArray();
  for (const v of pendingVer) {
    const age = today.getTime() - new Date(v.submittedAt ?? v.createdAt).getTime();
    if (age <= verSla) continue;
    const admins = await db.users.filter((u) => ['Admin', 'SuperAdmin', 'SupportAgent'].includes(u.role) && u.status === 'Active').toArray();
    for (const a of admins) {
      await emitDeduped(a.id, a.businessId, 'N-048', v.id, { entity: 'verification', detail: v.id.slice(0, 8) }, 'Verification');
    }
  }

  const pendingOrders = await db.orders.filter((o) => o.status === 'Pending').toArray();
  for (const o of pendingOrders) {
    if (today.getTime() - new Date(o.placedAt).getTime() > orderSla) {
      await notifyBizDeduped(o.stockistId, 'N-048', o.id, { entity: 'order', detail: o.orderNo }, 'Order', ['Owner', 'Manager']);
    }
  }

  const pendingPay = await db.payments.filter((p) => ['Submitted', 'UnderReview'].includes(p.status)).toArray();
  for (const p of pendingPay) {
    if (today.getTime() - new Date(p.createdAt).getTime() > paySla) {
      await notifyBizDeduped(p.stockistId, 'N-048', p.id, { entity: 'payment', detail: p.paymentNo }, 'Payment', ['Owner', 'Accountant']);
    }
  }

  await db.platformSettings.update('platform', { lastPolicyRunAt: today.toISOString() });
}

function invoiceOutstandingSafe(inv: { grandTotal: number; paidAmount: number; creditApplied: number }) {
  return Math.max(0, inv.grandTotal - inv.paidAmount - inv.creditApplied);
}

export async function exportWorkspace(): Promise<string> {
  const data: Record<string, unknown> = {};
  for (const table of db.tables) {
    data[table.name] = await table.toArray();
  }
  return JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2);
}

export async function importWorkspace(json: string): Promise<Result<true>> {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.data) return fail('Validation', 'IMPORT_BAD', 'Invalid workspace file.', 'Import failed.');
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
        const rows = parsed.data[table.name];
        if (Array.isArray(rows) && rows.length) await table.bulkAdd(rows);
      }
      // Stamp seedMeta v3 so importing an old export never triggers a wipe on next reload
      await db.seedMeta.put({
        id: 'meta',
        seedVersion: SEED_VERSION,
        seededAt: new Date().toISOString(),
      });
    });
    await hydrateCounters();
    return ok(true);
  } catch {
    return fail('System', 'IMPORT_FAIL', 'Could not import workspace.', 'Import failed.');
  }
}

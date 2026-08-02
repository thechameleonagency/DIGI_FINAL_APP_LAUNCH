import type { Business, Message, MessageThread, SupportTicket, User } from '../domain/entities/types';
import { availableQty, lowStock } from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { normalizeRoleForBusiness } from '../domain/permissions';
import { hydrateCounters } from '../data/counters';
import { SEED_VERSION } from '../data/seed';
import { formatINR } from '../domain/utils/money';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
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
  const admins = await db.users.filter((u) => ['SuperAdmin', 'SupportManager'].includes(u.role)).toArray();
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
  // DeliveryStaff are excluded from general fan-out; still notify the ticket creator (help-channel intent).
  const creator = await db.users.get(ticket.createdBy);
  if (creator && creator.status === 'Active') {
    const biz = await db.businesses.get(ticket.businessId);
    if (biz && normalizeRoleForBusiness(creator.role, biz.type) === 'DeliveryStaff') {
      await emitNotification({
        userId: creator.id,
        businessId: ticket.businessId,
        code: 'N-044',
        vars: { ticketNo: ticket.ticketNo },
        entityType: 'SupportTicket',
        entityId: ticket.id,
      });
    }
  }
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

/** Create or reuse a thread without posting a filler message. */
export async function ensureMessageThread(params: {
  actor: User;
  business: Business;
  counterpartBusinessId: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}): Promise<Result<MessageThread>> {
  const perm = assertCan(params.actor, params.business, 'read.own');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Thread was not opened.');
  if (normalizeRoleForBusiness(params.actor.role, params.business.type) === 'DeliveryStaff') {
    return fail(
      'Permission',
      'MSG_DELIVERY',
      'Delivery staff use Support tickets for help, not partner messages.',
      'Thread was not opened.',
    );
  }
  const existing = (await db.messageThreads.toArray()).find((t) => {
    const ids = t.participantBusinessIds;
    if (!ids.includes(params.business.id) || !ids.includes(params.counterpartBusinessId)) return false;
    if (params.relatedEntityId) {
      return t.relatedEntityType === params.relatedEntityType && t.relatedEntityId === params.relatedEntityId;
    }
    return !t.relatedEntityId;
  });
  if (existing) return ok(existing);
  const ts = new Date().toISOString();
  const thread: MessageThread = {
    id: newId(),
    participantBusinessIds: [params.business.id, params.counterpartBusinessId],
    participantUserIds: [params.actor.id],
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    lastMessageAt: ts,
    createdAt: ts,
  };
  await db.messageThreads.add(thread);
  return ok(thread);
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
  if (normalizeRoleForBusiness(params.actor.role, params.business.type) === 'DeliveryStaff') {
    return fail(
      'Permission',
      'MSG_DELIVERY',
      'Delivery staff use Support tickets for help, not partner messages.',
      'Message was not sent.',
    );
  }
  if (!params.body.trim()) return fail('Validation', 'MSG_EMPTY', 'Message cannot be empty.', 'Message was not sent.');
  const ts = new Date().toISOString();
  let thread = params.threadId ? await db.messageThreads.get(params.threadId) : undefined;
  if (!thread) {
    const ensured = await ensureMessageThread({
      actor: params.actor,
      business: params.business,
      counterpartBusinessId: params.counterpartBusinessId,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
    });
    if (!ensured.ok) return ensured;
    thread = ensured.data;
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
  else users = users.filter((u) => {
    return u.role !== 'DeliveryStaff';
  });
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
      await notifyBizDeduped(u.businessId, 'N-050', u.id, { email: u.email }, 'User', ['Pharmacist', 'Stockist']);
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

  if (settings.creditNoteAutoExpire) {
    const days = settings.creditNoteExpiryDays ?? 90;
    const openNotes = await db.creditNotes
      .filter((c) => ['Issued', 'PartiallyApplied'].includes(c.status) && c.remaining > 0)
      .toArray();
    for (const cn of openNotes) {
      const expiry = cn.expiresAt
        ? new Date(cn.expiresAt)
        : (() => {
            const d = new Date(cn.issuedAt);
            d.setUTCDate(d.getUTCDate() + days);
            return d;
          })();
      if (expiry > today) continue;
      await db.creditNotes.update(cn.id, {
        status: 'Void',
        remaining: 0,
        expiresAt: cn.expiresAt ?? expiry.toISOString(),
        updatedAt: today.toISOString(),
      });
      await writeAudit({
        actorId: 'system',
        actorName: 'Policy clock',
        businessId: cn.stockistId,
        entityType: 'CreditNote',
        entityId: cn.id,
        action: 'credit.expire',
        after: { creditNoteNo: cn.creditNoteNo, status: 'Void', remaining: 0 },
      });
      await notifyBusinessUsers(cn.pharmacyId, 'N-317', { creditNoteNo: cn.creditNoteNo }, {
        type: 'CreditNote',
        id: cn.id,
      });
    }
  }

  const verSla = (settings.verificationSlaHours ?? 72) * 3600000;
  const orderSla = (settings.orderSlaHours ?? 24) * 3600000;
  const paySla = (settings.paymentSlaHours ?? 48) * 3600000;

  const pendingVer = await db.verifications.filter((v) => ['Submitted', 'UnderReview'].includes(v.status)).toArray();
  for (const v of pendingVer) {
    const age = today.getTime() - new Date(v.submittedAt ?? v.createdAt).getTime();
    if (age <= verSla) continue;
    const admins = await db.users.filter((u) => ['SuperAdmin', 'SupportManager'].includes(u.role) && u.status === 'Active').toArray();
    for (const a of admins) {
      await emitDeduped(a.id, a.businessId, 'N-048', v.id, { entity: 'verification', detail: v.id.slice(0, 8) }, 'Verification');
    }
  }

  const pendingOrders = await db.orders.filter((o) => o.status === 'Pending').toArray();
  for (const o of pendingOrders) {
    if (today.getTime() - new Date(o.placedAt).getTime() > orderSla) {
      await notifyBizDeduped(o.stockistId, 'N-048', o.id, { entity: 'order', detail: o.orderNo }, 'Order', ['Stockist']);
    }
  }

  const pendingPay = await db.payments.filter((p) => ['Submitted', 'UnderReview'].includes(p.status)).toArray();
  for (const p of pendingPay) {
    if (today.getTime() - new Date(p.createdAt).getTime() > paySla) {
      await notifyBizDeduped(p.stockistId, 'N-048', p.id, { entity: 'payment', detail: p.paymentNo }, 'Payment', ['Stockist']);
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

export type WorkspaceImportPreview = {
  exportedAt?: string;
  incomingCounts: Record<string, number>;
  currentCounts: Record<string, number>;
  incomingTotal: number;
  currentTotal: number;
  unknownTables: string[];
  missingTables: string[];
};

/** Validate pasted JSON and return record-count preview without mutating the DB. */
export async function previewWorkspaceImport(json: string): Promise<Result<WorkspaceImportPreview>> {
  try {
    const parsed = JSON.parse(json) as { exportedAt?: string; data?: Record<string, unknown> };
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
      return fail('Validation', 'IMPORT_BAD', 'Invalid workspace file — expected { data: { …tables } }.', 'Import failed.');
    }
    const known = new Set(db.tables.map((t) => t.name));
    const incomingCounts: Record<string, number> = {};
    const unknownTables: string[] = [];
    for (const [name, rows] of Object.entries(parsed.data)) {
      if (!Array.isArray(rows)) {
        return fail(
          'Validation',
          'IMPORT_BAD',
          `Table “${name}” must be an array.`,
          'Import failed.',
        );
      }
      if (!known.has(name)) unknownTables.push(name);
      else incomingCounts[name] = rows.length;
    }
    const currentCounts: Record<string, number> = {};
    let currentTotal = 0;
    for (const table of db.tables) {
      const n = await table.count();
      currentCounts[table.name] = n;
      currentTotal += n;
    }
    const missingTables = db.tables.map((t) => t.name).filter((n) => !(n in parsed.data!));
    const incomingTotal = Object.values(incomingCounts).reduce((a, b) => a + b, 0);
    return ok({
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
      incomingCounts,
      currentCounts,
      incomingTotal,
      currentTotal,
      unknownTables,
      missingTables,
    });
  } catch {
    return fail('Validation', 'IMPORT_BAD', 'Could not parse JSON.', 'Import failed.');
  }
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

/** Trigger a browser download of the given workspace JSON. */
export function downloadWorkspaceJson(json: string, filename = 'digiswasthya-workspace.json') {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import type { Business, Message, MessageThread, SupportTicket, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

export async function createTicket(params: {
  actor: User;
  business: Business;
  subject: string;
  category: string;
  body: string;
  priority?: SupportTicket['priority'];
}): Promise<Result<SupportTicket>> {
  if (!params.subject.trim() || !params.body.trim()) {
    return fail('Validation', 'TKT_FIELDS', 'Subject and description are required.', 'Ticket was not created.');
  }
  const ts = new Date().toISOString();
  const ticket: SupportTicket = {
    id: newId(),
    ticketNo: nextNumber('TKT'),
    businessId: params.business.id,
    createdBy: params.actor.id,
    subject: params.subject.trim(),
    category: params.category,
    status: 'Open',
    priority: params.priority ?? 'Medium',
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
  await db.supportTickets.update(ticket.id, {
    status,
    assigneeId: params.assigneeId ?? ticket.assigneeId,
    updates,
    updatedAt: ts,
  });
  await notifyBusinessUsers(ticket.businessId, 'N-044', { ticketNo: ticket.ticketNo }, { type: 'SupportTicket', id: ticket.id });
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
  await db.messageThreads.update(thread.id, { lastMessageAt: ts });
  await notifyBusinessUsers(params.counterpartBusinessId, 'N-042', { subject: 'conversation' }, { type: 'MessageThread', id: thread.id });
  return ok({ thread, message });
}

export async function runPolicyClock(): Promise<void> {
  const settings = await db.platformSettings.get('platform');
  if (!settings) return;
  const today = new Date();
  const batches = await db.batches.toArray();
  for (const b of batches) {
    if (b.status === 'Available' && new Date(b.expiryDate) <= today) {
      await db.batches.update(b.id, { status: 'Expired', updatedAt: today.toISOString() });
    }
  }
  const invoices = await db.invoices.filter((i) => ['Issued', 'PartiallyPaid'].includes(i.status)).toArray();
  for (const inv of invoices) {
    if (inv.dueDate && new Date(inv.dueDate) < today && invoiceOutstandingSafe(inv) > 0) {
      await db.invoices.update(inv.id, { status: 'Overdue', updatedAt: today.toISOString() });
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
    });
    return ok(true);
  } catch {
    return fail('System', 'IMPORT_FAIL', 'Could not import workspace.', 'Import failed.');
  }
}

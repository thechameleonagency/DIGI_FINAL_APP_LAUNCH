import type { Business, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { localDayKey, localTodayKey } from '../domain/utils/dateKeys';
import { formatINR } from '../domain/utils/money';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { notifyBusinessUsers } from './notifications';
import { sendMessage } from './supportService';
import { nowIso } from '../domain/utils/clock';

export async function sendPaymentReminder(params: {
  actor: User;
  stockist: Business;
  invoiceId: string;
  postToMessages?: boolean;
}): Promise<Result<{ invoiceId: string; notifiedAt: string }>> {
  const perm = assertCan(params.actor, params.stockist, 'reminder.send');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Reminder was not sent.');
  if (params.stockist.type !== 'Stockist') {
    return fail('BusinessRule', 'REM_ROLE', 'Only stockists can send payment reminders.', 'Reminder was not sent.');
  }
  const settings = await db.platformSettings.get('platform');
  if (settings?.maintenanceMode) {
    return fail(
      'BusinessRule',
      'REM_MAINTENANCE',
      'Platform is in maintenance mode.',
      'Reminder was not sent.',
    );
  }

  const inv = await db.invoices.get(params.invoiceId);
  if (!inv || inv.stockistId !== params.stockist.id) {
    return fail('NotFound', 'REM_INV', 'Invoice not found.', 'Reminder was not sent.');
  }
  if (inv.status === 'Void' || inv.status === 'Paid' || inv.outstanding <= 0) {
    return fail('BusinessRule', 'REM_SETTLED', 'Cannot remind on a fully settled invoice.', 'Reminder was not sent.');
  }

  const today = localTodayKey();
  const prior = await db.auditLogs
    .where('entityId')
    .equals(inv.id)
    .filter((a) => a.action === 'reminder.send' && localDayKey(a.at) === today)
    .first();
  if (prior) {
    return fail('BusinessRule', 'REM_THROTTLE', 'A reminder was already sent for this invoice today.', 'Reminder was not sent.');
  }

  const dueSince = inv.dueDate ?? inv.issuedAt?.slice(0, 10) ?? inv.createdAt.slice(0, 10);
  const amount = formatINR(inv.outstanding);
  const ts = nowIso();

  await notifyBusinessUsers(
    inv.pharmacyId,
    'N-307',
    { invoiceNo: inv.invoiceNo, amount },
    { type: 'Invoice', id: inv.id },
  );

  if (params.postToMessages !== false) {
    const body = `Payment reminder: ${inv.invoiceNo}, ${amount} due since ${dueSince}.`;
    // Prefer existing pair thread if present
    const threads = await db.messageThreads
      .filter(
        (t) =>
          t.participantBusinessIds.includes(params.stockist.id) &&
          t.participantBusinessIds.includes(inv.pharmacyId),
      )
      .toArray();
    const thread = threads.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))[0];
    await sendMessage({
      actor: params.actor,
      business: params.stockist,
      counterpartBusinessId: inv.pharmacyId,
      body,
      threadId: thread?.id,
      relatedEntityType: 'Invoice',
      relatedEntityId: inv.id,
    });
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Invoice',
    entityId: inv.id,
    action: 'reminder.send',
    after: { invoiceNo: inv.invoiceNo, amount: inv.outstanding, at: ts },
  });

  return ok({ invoiceId: inv.id, notifiedAt: ts });
}

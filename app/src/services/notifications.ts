import { NOTIFICATION_CATALOG } from '../domain/notifications/catalog';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';

function entityNoFromVars(vars?: Record<string, string>, entityType?: string): string | undefined {
  if (!vars) return undefined;
  switch (entityType) {
    case 'Order':
      return vars.orderNo;
    case 'Invoice':
      return vars.invoiceNo;
    case 'Payment':
      return vars.paymentNo;
    case 'Return':
    case 'ReturnRequest':
      return vars.returnNo;
    case 'CreditNote':
      return vars.creditNoteNo;
    case 'SupportTicket':
      return vars.ticketNo;
    case 'PurchaseOrder':
      return vars.poNo;
    default:
      return (
        vars.orderNo ||
        vars.invoiceNo ||
        vars.paymentNo ||
        vars.returnNo ||
        vars.creditNoteNo ||
        vars.ticketNo ||
        vars.poNo ||
        undefined
      );
  }
}

export async function emitNotification(params: {
  userId: string;
  businessId: string;
  code: string;
  vars?: Record<string, string>;
  entityType?: string;
  entityId?: string;
  entityNo?: string;
}): Promise<void> {
  try {
    const tpl = NOTIFICATION_CATALOG[params.code];
    if (!tpl) return;
    const user = await db.users.get(params.userId);
    const muted = user?.notificationPreferences?.mutedCategories ?? [];
    const category = params.entityType ?? 'System';
    // Critical/action-required categories cannot be muted (CF-30)
    const critical = category === 'Verification' || category === 'Business';
    if (!critical && (muted.includes(category) || muted.includes(params.code))) return;
    const entityNo = params.entityNo || entityNoFromVars(params.vars, params.entityType);
    await db.notifications.add({
      id: newId(),
      userId: params.userId,
      businessId: params.businessId,
      code: params.code,
      title: tpl.title,
      body: tpl.body(params.vars ?? {}),
      status: 'Unread',
      entityType: params.entityType,
      entityId: params.entityId,
      entityNo,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Notification failure never rolls back primary commit
  }
}

export async function archiveNotification(notificationId: string): Promise<void> {
  await db.notifications.update(notificationId, { status: 'Archived' });
}

export async function notifyBusinessUsers(
  businessId: string,
  code: string,
  vars?: Record<string, string>,
  entity?: { type: string; id: string; no?: string },
  roles?: string[],
): Promise<void> {
  let users = await db.users.where('businessId').equals(businessId).filter((u) => u.status === 'Active').toArray();
  if (roles?.length) users = users.filter((u) => roles.includes(u.role));
  await Promise.all(
    users.map((u) =>
      emitNotification({
        userId: u.id,
        businessId,
        code,
        vars,
        entityType: entity?.type,
        entityId: entity?.id,
        entityNo: entity?.no || entityNoFromVars(vars, entity?.type),
      }),
    ),
  );
}

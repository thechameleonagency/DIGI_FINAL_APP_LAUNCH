import { NOTIFICATION_CATALOG } from '../domain/notifications/catalog';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';

export async function emitNotification(params: {
  userId: string;
  businessId: string;
  code: string;
  vars?: Record<string, string>;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    const tpl = NOTIFICATION_CATALOG[params.code];
    if (!tpl) return;
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
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Notification failure never rolls back primary commit
  }
}

export async function notifyBusinessUsers(
  businessId: string,
  code: string,
  vars?: Record<string, string>,
  entity?: { type: string; id: string },
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
      }),
    ),
  );
}

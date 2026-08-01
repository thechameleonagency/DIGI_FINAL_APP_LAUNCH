import type { Notification } from '../domain/entities/types';
import { db } from '../data/db';
import { filterMutableCategories } from './preferencesService';

/** Deep-link by entityType (never N-code — app catalog ≠ docs/13 numbering). */
export function resolveNotificationLink(
  n: Pick<Notification, 'entityType' | 'entityId' | 'code'>,
  portal: 'pharmacy' | 'stockist' | 'admin',
): string {
  const base = `/${portal}`;
  const id = n.entityId;
  switch (n.entityType) {
    case 'Order':
      if (portal === 'admin') return id ? `${base}/orders` : `${base}/orders`;
      return id ? `${base}/orders` : `${base}/orders`;
    case 'Invoice':
      return `${base}/payments`;
    case 'Payment':
      return portal === 'admin' && id ? `${base}/payments` : `${base}/payments`;
    case 'Return':
    case 'ReturnRequest':
      return `${base}/returns`;
    case 'CreditNote':
      return portal === 'pharmacy' ? `${base}/payments` : `${base}/credit-notes`;
    case 'Connection':
      return portal === 'stockist' ? `${base}/pharmacies` : `${base}/connections`;
    case 'Delivery':
      return portal === 'stockist' ? `${base}/delivery` : `${base}/orders`;
    case 'Verification':
      return portal === 'admin' ? (id ? `${base}/verifications/${id}` : `${base}/verifications`) : '/auth/pending';
    case 'Business':
      return portal === 'admin' && id ? `${base}/network/${id}` : base;
    case 'SupportTicket':
      return id ? `${base}/support/${id}` : `${base}/support`;
    case 'MessageThread':
      return `${base}/messages`;
    case 'Announcement':
      return base;
    default:
      return `${base}/notifications`;
  }
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  const n = await db.notifications.get(notificationId);
  if (!n || n.userId !== userId) return;
  if (n.status === 'Read') return;
  await db.notifications.update(notificationId, { status: 'Read', readAt: new Date().toISOString() });
}

export async function markAllRead(userId: string): Promise<void> {
  const unread = await db.notifications.where({ userId, status: 'Unread' }).toArray();
  const ts = new Date().toISOString();
  await Promise.all(unread.map((n) => db.notifications.update(n.id, { status: 'Read', readAt: ts })));
}

export async function archiveNotification(notificationId: string, userId: string): Promise<void> {
  const n = await db.notifications.get(notificationId);
  if (!n || n.userId !== userId) return;
  await db.notifications.update(notificationId, { status: 'Archived', readAt: n.readAt ?? new Date().toISOString() });
}

export async function setMutedCategories(userId: string, mutedCategories: string[]): Promise<void> {
  const user = await db.users.get(userId);
  if (!user) return;
  await db.users.update(userId, {
    notificationPreferences: {
      ...(user.notificationPreferences ?? {}),
      mutedCategories: filterMutableCategories(mutedCategories),
    },
    updatedAt: new Date().toISOString(),
  });
}

/** Dedupe helper for policy-clock emitters: skip if (code, entityId) already exists for user. */
export async function hasNotification(userId: string, code: string, entityId: string): Promise<boolean> {
  const existing = await db.notifications
    .where('userId')
    .equals(userId)
    .filter((n) => n.code === code && n.entityId === entityId)
    .first();
  return !!existing;
}

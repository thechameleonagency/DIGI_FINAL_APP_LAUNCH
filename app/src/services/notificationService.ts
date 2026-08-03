import type { Notification } from '../domain/entities/types';
import { db } from '../data/db';
import { filterMutableCategories } from './preferencesService';
import { nowIso } from '../domain/utils/clock';

/** Deep-link by entityType + human number when present (never N-code in the path). */
export function resolveNotificationLink(
  n: Pick<Notification, 'entityType' | 'entityId' | 'entityNo' | 'code'>,
  portal: 'pharmacy' | 'stockist' | 'admin',
): string {
  const base = `/${portal}`;
  const id = n.entityId;
  const no = n.entityNo ? encodeURIComponent(n.entityNo) : '';
  switch (n.entityType) {
    case 'Order':
      return no ? `${base}/orders/${no}` : `${base}/orders`;
    case 'Invoice':
      if (portal === 'admin') return no ? `${base}/payments?invoice=${no}` : `${base}/payments`;
      return no ? `${base}/invoices/${no}` : `${base}/payments`;
    case 'Payment':
      if (portal === 'admin') return no ? `${base}/payments/${no}` : `${base}/payments`;
      if (portal === 'pharmacy') return no ? `${base}/payments/${no}` : `${base}/payments`;
      return no ? `${base}/payments?payment=${no}` : `${base}/payments`;
    case 'Return':
    case 'ReturnRequest':
      return no ? `${base}/returns/${no}` : `${base}/returns`;
    case 'CreditNote':
      if (portal === 'pharmacy') return no ? `${base}/payments?tab=Credits&credit=${no}` : `${base}/payments?tab=Credits`;
      return `${base}/credit-notes`;
    case 'Connection':
      if (portal === 'stockist') return `${base}/pharmacies`;
      // Admin has no /connections route; entityId is a connection id, not a business id.
      if (portal === 'admin') return `${base}/network`;
      return `${base}/connections`;
    case 'Delivery':
      return portal === 'stockist' ? `${base}/delivery` : `${base}/orders`;
    case 'Verification':
      return portal === 'admin' ? (id ? `${base}/verifications/${id}` : `${base}/verifications`) : '/auth/pending';
    case 'Business':
      return portal === 'admin' && id ? `${base}/network/${id}` : base;
    case 'SupportTicket':
      return id ? `${base}/support/${id}` : `${base}/support`;
    case 'MessageThread':
      // Admin has no messages route — land on support queue instead of a dead path.
      if (portal === 'admin') return `${base}/support`;
      return no || id ? `${base}/messages?thread=${encodeURIComponent(n.entityNo ?? id ?? '')}` : `${base}/messages`;
    case 'Announcement':
      return base;
    case 'CounterfeitReport':
      return `${base}/counterfeit`;
    case 'Batch':
      if (portal === 'stockist') return `${base}/inventory`;
      if (portal === 'pharmacy') return `${base}/counterfeit`;
      return `${base}/counterfeit`;
    default:
      return `${base}/notifications`;
  }
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  const n = await db.notifications.get(notificationId);
  if (!n || n.userId !== userId) return;
  if (n.status === 'Read') return;
  await db.notifications.update(notificationId, { status: 'Read', readAt: nowIso() });
}

export async function markAllRead(userId: string): Promise<void> {
  const unread = await db.notifications.where({ userId, status: 'Unread' }).toArray();
  const ts = nowIso();
  await Promise.all(unread.map((n) => db.notifications.update(n.id, { status: 'Read', readAt: ts })));
}

export async function archiveNotification(notificationId: string, userId: string): Promise<void> {
  const n = await db.notifications.get(notificationId);
  if (!n || n.userId !== userId) return;
  await db.notifications.update(notificationId, { status: 'Archived', readAt: n.readAt ?? nowIso() });
}

export async function unarchiveNotification(
  notificationId: string,
  userId: string,
  restoreStatus: 'Unread' | 'Read' = 'Unread',
): Promise<void> {
  const n = await db.notifications.get(notificationId);
  if (!n || n.userId !== userId) return;
  await db.notifications.update(notificationId, {
    status: restoreStatus,
    readAt: restoreStatus === 'Unread' ? undefined : n.readAt ?? nowIso(),
  });
}

export async function setMutedCategories(userId: string, mutedCategories: string[]): Promise<void> {
  const user = await db.users.get(userId);
  if (!user) return;
  await db.users.update(userId, {
    notificationPreferences: {
      ...(user.notificationPreferences ?? {}),
      mutedCategories: filterMutableCategories(mutedCategories),
    },
    updatedAt: nowIso(),
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

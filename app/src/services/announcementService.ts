import type { Announcement, Business, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { emitNotification } from './notifications';
import { nowIso } from '../domain/utils/clock';

export const ANNOUNCEMENT_PLACEMENTS = ['All Dashboards', 'Pharmacy Home', 'Stockist Home', 'Pharmacy Buy', 'Admin Home'] as const;
export const ANNOUNCEMENT_AUDIENCES = ['Pharmacy', 'Stockist', 'Admin'] as const;

export async function upsertAnnouncement(params: {
  actor: User;
  business: Business;
  id?: string;
  title: string;
  body: string;
  targetRoles: string[];
  placements: string[];
  priority: 'Low' | 'Medium' | 'High';
  startsAt: string;
  endsAt?: string;
  active?: boolean;
}): Promise<Result<Announcement>> {
  const perm = assertCan(params.actor, params.business, 'announcement.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Announcement was not saved.');
  if (!params.title.trim() || !params.body.trim()) {
    return fail('Validation', 'ANN_FIELDS', 'Title and body are required.', 'Announcement was not saved.');
  }
  if (!params.targetRoles.length) {
    return fail('Validation', 'ANN_AUDIENCE', 'Select at least one audience.', 'Announcement was not saved.');
  }
  if (!params.placements.length) {
    return fail('Validation', 'ANN_PLACE', 'Select at least one placement.', 'Announcement was not saved.');
  }

  const ts = nowIso();
  const startsAt = params.startsAt || ts;
  const endsAt = params.endsAt?.trim() || undefined;
  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    return fail('Validation', 'ANN_DATES', 'End date must be on or after the start date.', 'Announcement was not saved.');
  }
  const existing = params.id ? await db.announcements.get(params.id) : undefined;
  const row: Announcement = {
    id: existing?.id ?? newId(),
    title: params.title.trim(),
    body: params.body.trim(),
    targetRoles: params.targetRoles,
    placements: params.placements,
    priority: params.priority,
    startsAt,
    endsAt,
    active: params.active ?? true,
    createdBy: existing?.createdBy ?? params.actor.id,
    createdAt: existing?.createdAt ?? ts,
  };

  if (existing) {
    await db.announcements.put(row);
    await writeAudit({
      actorId: params.actor.id,
      actorName: params.actor.name,
      businessId: params.business.id,
      entityType: 'Announcement',
      entityId: row.id,
      action: 'announcement.update',
      before: existing,
      after: row,
    });
    if (row.active && !existing.active) await fanOutAnnouncement(row);
  } else {
    await db.announcements.add(row);
    await writeAudit({
      actorId: params.actor.id,
      actorName: params.actor.name,
      businessId: params.business.id,
      entityType: 'Announcement',
      entityId: row.id,
      action: 'announcement.publish',
      after: row,
    });
    if (row.active) await fanOutAnnouncement(row);
  }
  return ok(row);
}

export async function unpublishAnnouncement(params: {
  actor: User;
  business: Business;
  id: string;
}): Promise<Result<Announcement>> {
  const perm = assertCan(params.actor, params.business, 'announcement.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Announcement was not unpublished.');
  const existing = await db.announcements.get(params.id);
  if (!existing) return fail('NotFound', 'ANN_MISSING', 'Announcement not found.', 'No change made.');
  const next = { ...existing, active: false };
  await db.announcements.put(next);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Announcement',
    entityId: next.id,
    action: 'announcement.unpublish',
    before: existing,
    after: next,
  });
  return ok(next);
}

export async function deleteAnnouncement(params: {
  actor: User;
  business: Business;
  id: string;
}): Promise<Result<{ id: string }>> {
  const perm = assertCan(params.actor, params.business, 'announcement.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Announcement was not deleted.');
  const existing = await db.announcements.get(params.id);
  if (!existing) return fail('NotFound', 'ANN_MISSING', 'Announcement not found.', 'No change made.');
  await db.announcements.delete(params.id);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Announcement',
    entityId: params.id,
    action: 'announcement.delete',
    before: existing,
  });
  return ok({ id: params.id });
}

async function fanOutAnnouncement(a: Announcement): Promise<void> {
  const users = await db.users.filter((u) => u.status === 'Active').toArray();
  const businesses = await db.businesses.toArray();
  for (const u of users) {
    const biz = businesses.find((b) => b.id === u.businessId);
    if (!biz) continue;
    const audience =
      biz.type === 'Platform'
        ? 'Admin'
        : biz.type === 'Pharmacy'
          ? 'Pharmacy'
          : biz.type === 'Stockist'
            ? 'Stockist'
            : null;
    if (!audience || !a.targetRoles.includes(audience)) continue;
    await emitNotification({
      userId: u.id,
      businessId: u.businessId,
      code: 'N-045',
      vars: { title: a.title },
      entityType: 'Announcement',
      entityId: a.id,
    });
  }
}

/** Visible now for portal placement, honoring audience + schedule + active. */
export function isAnnouncementVisible(
  a: Announcement,
  opts: { audience: 'Pharmacy' | 'Stockist' | 'Admin'; placement: string; now?: Date },
): boolean {
  if (!a.active) return false;
  if (!a.targetRoles.includes(opts.audience)) return false;
  const places = a.placements ?? [];
  if (!places.includes('All Dashboards') && !places.includes(opts.placement)) return false;
  const now = opts.now ?? new Date();
  if (a.startsAt && new Date(a.startsAt) > now) return false;
  if (a.endsAt && new Date(a.endsAt) < now) return false;
  return true;
}

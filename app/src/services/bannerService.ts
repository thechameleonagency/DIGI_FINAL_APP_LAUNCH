import type { Banner, Business, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { nowIso } from '../domain/utils/clock';

export const BANNER_PLACEMENTS = [
  'Auth',
  'All Dashboards',
  'Pharmacy Home',
  'Stockist Home',
  'Admin Home',
] as const;

export async function upsertBanner(params: {
  actor: User;
  business: Business;
  id?: string;
  text: string;
  tone: Banner['tone'];
  placements: string[];
  startsAt: string;
  endsAt?: string;
  active?: boolean;
}): Promise<Result<Banner>> {
  const perm = assertCan(params.actor, params.business, 'announcement.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Banner was not saved.');
  if (!params.text.trim()) return fail('Validation', 'BAN_TEXT', 'Banner text is required.', 'Banner was not saved.');
  if (!params.placements.length) {
    return fail('Validation', 'BAN_PLACE', 'Select at least one placement.', 'Banner was not saved.');
  }
  const ts = nowIso();
  const existing = params.id ? await db.banners.get(params.id) : undefined;
  const row: Banner = {
    id: existing?.id ?? newId(),
    text: params.text.trim(),
    tone: params.tone,
    placements: params.placements,
    startsAt: params.startsAt || ts,
    endsAt: params.endsAt?.trim() || undefined,
    active: params.active ?? true,
    createdBy: existing?.createdBy ?? params.actor.id,
    createdAt: existing?.createdAt ?? ts,
  };
  if (existing) {
    await db.banners.put(row);
    await writeAudit({
      actorId: params.actor.id,
      actorName: params.actor.name,
      businessId: params.business.id,
      entityType: 'Banner',
      entityId: row.id,
      action: 'banner.update',
      before: existing,
      after: row,
    });
  } else {
    await db.banners.add(row);
    await writeAudit({
      actorId: params.actor.id,
      actorName: params.actor.name,
      businessId: params.business.id,
      entityType: 'Banner',
      entityId: row.id,
      action: 'banner.create',
      after: row,
    });
  }
  return ok(row);
}

export async function setBannerActive(params: {
  actor: User;
  business: Business;
  id: string;
  active: boolean;
}): Promise<Result<Banner>> {
  const perm = assertCan(params.actor, params.business, 'announcement.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Banner was not updated.');
  const existing = await db.banners.get(params.id);
  if (!existing) return fail('NotFound', 'BAN_MISSING', 'Banner not found.', 'No change made.');
  const next = { ...existing, active: params.active };
  await db.banners.put(next);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Banner',
    entityId: next.id,
    action: params.active ? 'banner.go_live' : 'banner.pause',
    before: existing,
    after: next,
  });
  return ok(next);
}

export async function deleteBanner(params: {
  actor: User;
  business: Business;
  id: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.business, 'announcement.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Banner was not deleted.');
  const existing = await db.banners.get(params.id);
  if (!existing) return fail('NotFound', 'BAN_MISSING', 'Banner not found.', 'No change made.');
  await db.banners.delete(params.id);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Banner',
    entityId: params.id,
    action: 'banner.delete',
    before: existing,
  });
  return ok(true);
}

export function isBannerVisible(b: Banner, placement: string, now = new Date()): boolean {
  if (!b.active) return false;
  const places = b.placements ?? [];
  if (placement === 'Auth') {
    if (!places.includes('Auth')) return false;
  } else if (!places.includes(placement) && !places.includes('All Dashboards')) {
    return false;
  }
  if (b.startsAt && new Date(b.startsAt) > now) return false;
  if (b.endsAt && new Date(b.endsAt) < now) return false;
  return true;
}

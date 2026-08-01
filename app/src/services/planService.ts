import type { Business, PlatformSettings, UpgradeRequest, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { emitNotification, notifyBusinessUsers } from './notifications';

export type PlanConfig = {
  priceText: string;
  benefits: string[];
  upiId: string;
};

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  priceText: '₹999 / month (declared offline)',
  upiId: 'digiswasthya@upi',
  benefits: [
    'Saved report period presets on Analytics',
    'Premium badge on your workspace',
    'Priority support labelling (convenience only)',
  ],
};

export function resolvePlanConfig(settings?: PlatformSettings | null): PlanConfig {
  const cfg = settings?.premiumPlan;
  return {
    priceText: cfg?.priceText?.trim() || DEFAULT_PLAN_CONFIG.priceText,
    upiId: cfg?.upiId?.trim() || DEFAULT_PLAN_CONFIG.upiId,
    benefits:
      cfg?.benefits?.map((b) => b.trim()).filter(Boolean).length
        ? cfg!.benefits!.map((b) => b.trim()).filter(Boolean)
        : DEFAULT_PLAN_CONFIG.benefits,
  };
}

export async function savePlanConfig(params: {
  actor: User;
  platform: Business;
  config: PlanConfig;
}): Promise<Result<PlanConfig>> {
  const perm = assertCan(params.actor, params.platform, 'plan.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Plan copy was not saved.');
  const benefits = params.config.benefits.map((b) => b.trim()).filter(Boolean);
  if (!params.config.priceText.trim()) {
    return fail('Validation', 'PLAN_PRICE', 'Price text is required.', 'Plan copy was not saved.');
  }
  if (!benefits.length) {
    return fail('Validation', 'PLAN_BEN', 'Add at least one benefit.', 'Plan copy was not saved.');
  }
  const settings = await db.platformSettings.get('platform');
  if (!settings) return fail('NotFound', 'PLAN_SET', 'Platform settings missing.', 'Plan copy was not saved.');
  const before = settings.premiumPlan;
  const next: PlanConfig = {
    priceText: params.config.priceText.trim(),
    upiId: params.config.upiId.trim(),
    benefits,
  };
  await db.platformSettings.update('platform', { premiumPlan: next });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'PlatformSettings',
    entityId: 'platform',
    action: 'plan.config',
    before,
    after: next,
  });
  return ok(next);
}

function normalizeUtr(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

async function notifyPlatformAdmins(code: string, vars: Record<string, string>, entityId: string) {
  const admins = await db.users
    .filter((u) => ['Admin', 'SuperAdmin'].includes(u.role) && u.status === 'Active')
    .toArray();
  for (const a of admins) {
    await emitNotification({
      userId: a.id,
      businessId: a.businessId,
      code,
      vars,
      entityType: 'UpgradeRequest',
      entityId,
    });
  }
}

/** Owner submits upgrade declaration (UTR + optional proof). */
export async function submitUpgradeRequest(params: {
  actor: User;
  business: Business;
  utr: string;
  proofFileId?: string;
}): Promise<Result<UpgradeRequest>> {
  if (params.actor.role !== 'Owner') {
    return fail('Permission', 'UPG_OWNER', 'Only the business Owner can request Premium.', 'Request was not submitted.');
  }
  const perm = assertCan(params.actor, params.business, 'read.own');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Request was not submitted.');
  if (params.business.type === 'Platform') {
    return fail('BusinessRule', 'UPG_BIZ', 'Platform accounts cannot upgrade.', 'Request was not submitted.');
  }
  if ((params.business.plan ?? 'Free') === 'Premium') {
    return fail('BusinessRule', 'UPG_ALREADY', 'Business is already Premium.', 'Request was not submitted.');
  }
  const utr = normalizeUtr(params.utr);
  if (utr.length < 6 || !/^[A-Z0-9/-]+$/.test(utr)) {
    return fail(
      'Validation',
      'UPG_UTR',
      'Enter a valid UPI reference / UTR (at least 6 characters).',
      'Request was not submitted.',
    );
  }

  // E-CF-23a: one open request
  const open = await db.upgradeRequests
    .where('businessId')
    .equals(params.business.id)
    .filter((r) => r.status === 'Submitted')
    .first();
  if (open) {
    return fail('Duplicate', 'UPG_OPEN', 'You already have an open upgrade request.', 'Request was not submitted.');
  }

  const ts = new Date().toISOString();
  const row: UpgradeRequest = {
    id: newId(),
    businessId: params.business.id,
    plan: 'Premium',
    utr,
    proofFileId: params.proofFileId,
    status: 'Submitted',
    createdAt: ts,
    updatedAt: ts,
  };
  await db.upgradeRequests.add(row);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'UpgradeRequest',
    entityId: row.id,
    action: 'plan.upgrade.submit',
    after: row,
  });
  await notifyPlatformAdmins('N-309', { businessName: params.business.name }, row.id);
  return ok(row);
}

export async function decideUpgradeRequest(params: {
  actor: User;
  platform: Business;
  id: string;
  decision: 'Approved' | 'Rejected';
  reason?: string;
}): Promise<Result<UpgradeRequest & { duplicateUtr?: boolean }>> {
  const perm = assertCan(params.actor, params.platform, 'read.platform');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Decision was not saved.');
  if (!['Admin', 'SuperAdmin'].includes(params.actor.role)) {
    return fail('Permission', 'UPG_ROLE', 'Only Admin or SuperAdmin can decide upgrades.', 'Decision was not saved.');
  }
  const row = await db.upgradeRequests.get(params.id);
  if (!row) return fail('NotFound', 'UPG_MISSING', 'Request not found.', 'Decision was not saved.');
  if (row.status !== 'Submitted') {
    return fail('StateConflict', 'UPG_STATE', 'Only Submitted requests can be decided.', 'Decision was not saved.');
  }
  if (params.decision === 'Rejected' && !params.reason?.trim()) {
    return fail('Validation', 'UPG_REASON', 'Rejection reason is required.', 'Decision was not saved.');
  }

  const biz = await db.businesses.get(row.businessId);
  if (!biz) return fail('NotFound', 'UPG_BIZ', 'Business not found.', 'Decision was not saved.');

  // E-CF-23b: flag duplicate UTR (informational — decision still allowed)
  const dupUtr = await db.upgradeRequests
    .where('utr')
    .equals(row.utr)
    .filter((r) => r.id !== row.id)
    .first();

  const ts = new Date().toISOString();
  const next: UpgradeRequest = {
    ...row,
    status: params.decision,
    decisionReason: params.reason?.trim() || undefined,
    decidedBy: params.actor.id,
    updatedAt: ts,
  };
  await db.transaction('rw', db.upgradeRequests, db.businesses, async () => {
    await db.upgradeRequests.put(next);
    if (params.decision === 'Approved') {
      await db.businesses.update(biz.id, { plan: 'Premium', updatedAt: ts });
    }
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'UpgradeRequest',
    entityId: row.id,
    action: params.decision === 'Approved' ? 'plan.upgrade.approve' : 'plan.upgrade.reject',
    before: row,
    after: next,
    reason: params.reason?.trim(),
  });
  await notifyBusinessUsers(biz.id, 'N-310', { status: params.decision }, { type: 'UpgradeRequest', id: row.id });
  return ok({ ...next, duplicateUtr: Boolean(dupUtr) });
}

export async function revokePremium(params: {
  actor: User;
  platform: Business;
  businessId: string;
  reason: string;
}): Promise<Result<Business>> {
  const perm = assertCan(params.actor, params.platform, 'read.platform');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Premium was not revoked.');
  if (!['Admin', 'SuperAdmin'].includes(params.actor.role)) {
    return fail('Permission', 'UPG_ROLE', 'Only Admin or SuperAdmin can revoke Premium.', 'Premium was not revoked.');
  }
  if (!params.reason.trim()) {
    return fail('Validation', 'UPG_REASON', 'Revocation reason is required.', 'Premium was not revoked.');
  }
  const biz = await db.businesses.get(params.businessId);
  if (!biz) return fail('NotFound', 'UPG_BIZ', 'Business not found.', 'Premium was not revoked.');
  if ((biz.plan ?? 'Free') !== 'Premium') {
    return fail('BusinessRule', 'UPG_FREE', 'Business is not Premium.', 'Premium was not revoked.');
  }
  const ts = new Date().toISOString();
  const before = { plan: biz.plan };
  await db.businesses.update(biz.id, { plan: 'Free', updatedAt: ts });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'plan.revoke',
    before,
    after: { plan: 'Free' },
    reason: params.reason.trim(),
  });
  await notifyBusinessUsers(biz.id, 'N-310', { status: 'Revoked' }, { type: 'Business', id: biz.id });
  return ok({ ...biz, plan: 'Free', updatedAt: ts });
}

export async function saveReportPreset(params: {
  actor: User;
  business: Business;
  name: string;
  periodDays: number;
}): Promise<Result<{ id: string; name: string; periodDays: number }[]>> {
  if ((params.business.plan ?? 'Free') !== 'Premium') {
    return fail('BusinessRule', 'PRESET_PREM', 'Saved presets are a Premium convenience.', 'Preset was not saved.');
  }
  const perm = assertCan(params.actor, params.business, 'read.own');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Preset was not saved.');
  const name = params.name.trim();
  if (!name) return fail('Validation', 'PRESET_NAME', 'Preset name is required.', 'Preset was not saved.');
  const presets = [...(params.business.preferences?.reportPresets ?? [])];
  const id = newId();
  presets.push({ id, name, periodDays: params.periodDays });
  const preferences = { ...(params.business.preferences ?? {}), reportPresets: presets };
  await db.businesses.update(params.business.id, { preferences, updatedAt: new Date().toISOString() });
  return ok(presets);
}

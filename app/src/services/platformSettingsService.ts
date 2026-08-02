import type { Business, PlatformSettings, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';

const DAY_FIELDS = [
  'returnWindowDays',
  'inviteTtlDays',
  'expiryNearDays',
  'expiryCriticalDays',
  'creditNoteExpiryDays',
] as const;

const HOUR_FIELDS = ['verificationSlaHours', 'orderSlaHours', 'paymentSlaHours'] as const;

const PERCENT_FIELDS = ['genericCommissionPercent', 'defaultGstPercent'] as const;

const MONEY_FLAT_FIELDS = ['ethicalCommissionFlatPerProduct', 'offlineManagedFlatPerLine', 'largePaymentMultiple'] as const;

function badNumber(label: string, value: unknown, min: number, max: number): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${label} must be a valid number.`;
  }
  if (value < min || value > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return null;
}

export async function updatePlatformSettings(params: {
  actor: User;
  adminBusiness: Business;
  patch: Partial<Omit<PlatformSettings, 'id'>>;
}): Promise<Result<PlatformSettings>> {
  const perm = assertCan(params.actor, params.adminBusiness, 'settings.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Settings were not saved.');
  const before = await db.platformSettings.get('platform');
  if (!before) return fail('NotFound', 'SETTINGS_MISSING', 'Platform settings not found.', 'Settings were not saved.');

  const patch = params.patch;
  for (const key of DAY_FIELDS) {
    const msg = badNumber(key, patch[key], 0, 3650);
    if (msg) return fail('Validation', 'SETTINGS_RANGE', msg, 'Settings were not saved.');
  }
  for (const key of HOUR_FIELDS) {
    const msg = badNumber(key, patch[key], 1, 8760);
    if (msg) return fail('Validation', 'SETTINGS_RANGE', msg, 'Settings were not saved.');
  }
  for (const key of PERCENT_FIELDS) {
    const msg = badNumber(key, patch[key], 0, 100);
    if (msg) return fail('Validation', 'SETTINGS_RANGE', msg, 'Settings were not saved.');
  }
  for (const key of MONEY_FLAT_FIELDS) {
    const msg = badNumber(key, patch[key], 0, 1_000_000);
    if (msg) return fail('Validation', 'SETTINGS_RANGE', msg, 'Settings were not saved.');
  }
  if (patch.roundingMode !== undefined && !['nearest', 'up', 'down'].includes(patch.roundingMode)) {
    return fail('Validation', 'SETTINGS_ROUND', 'Invalid rounding mode.', 'Settings were not saved.');
  }

  await db.platformSettings.update('platform', patch);
  const after = (await db.platformSettings.get('platform'))!;
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.adminBusiness.id,
    entityType: 'PlatformSettings',
    entityId: 'platform',
    action: 'settings.save',
    before,
    after,
  });
  return ok(after);
}

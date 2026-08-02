import type { Business, PlatformSettings, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';

export async function updatePlatformSettings(params: {
  actor: User;
  adminBusiness: Business;
  patch: Partial<Omit<PlatformSettings, 'id'>>;
}): Promise<Result<PlatformSettings>> {
  const perm = assertCan(params.actor, params.adminBusiness, 'settings.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Settings were not saved.');
  const before = await db.platformSettings.get('platform');
  if (!before) return fail('NotFound', 'SETTINGS_MISSING', 'Platform settings not found.', 'Settings were not saved.');
  await db.platformSettings.update('platform', params.patch);
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

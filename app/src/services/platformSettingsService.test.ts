import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { defaultPlatformSettings } from '../data/seed';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { updatePlatformSettings } from './platformSettingsService';

describe('platformSettingsService Wave 0', () => {
  beforeEach(async () => {
    await clearDb();
    await db.platformSettings.put(defaultPlatformSettings());
    const admin = await makeActor({ id: 'u-admin', businessId: 'biz-plat', role: 'SuperAdmin' });
    await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id });
  });

  it('SupportManager cannot mutate settings.manage', async () => {
    const sm = await makeActor({ id: 'u-sm', businessId: 'biz-plat', role: 'SupportManager' });
    const platform = (await db.businesses.get('biz-plat'))!;
    const res = await updatePlatformSettings({
      actor: sm,
      adminBusiness: platform,
      patch: { orderSlaHours: 12 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('PERM_DENIED');
  });

  it('SuperAdmin can mutate settings', async () => {
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const res = await updatePlatformSettings({
      actor: admin,
      adminBusiness: platform,
      patch: { orderSlaHours: 12 },
    });
    expect(res.ok).toBe(true);
    expect((await db.platformSettings.get('platform'))?.orderSlaHours).toBe(12);
  });
});

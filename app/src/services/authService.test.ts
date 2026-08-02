import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_OTP } from '../domain/utils/crypto';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { db } from '../data/db';
import { defaultPlatformSettings } from '../data/seed';
import {
  acceptInvite,
  createFirstSuperAdmin,
  getInvitePreview,
  inviteStaff,
  login,
  needsFirstSuperAdmin,
  resetPassword,
} from './authService';

describe('authService Wave 0', () => {
  beforeEach(async () => {
    await clearDb();
    await db.platformSettings.put(defaultPlatformSettings());
  });

  it('needsFirstSuperAdmin is true on empty DB and false after create', async () => {
    expect(await needsFirstSuperAdmin()).toBe(true);
    const created = await createFirstSuperAdmin({
      name: 'Ada Admin',
      email: 'ada@platform.local',
      phone: '9876543210',
      password: 'Admin@2026',
    });
    expect(created.ok).toBe(true);
    expect(await needsFirstSuperAdmin()).toBe(false);
    expect(await db.users.count()).toBe(1);
    expect(await db.businesses.where('type').equals('Platform').count()).toBe(1);
  });

  it('createFirstSuperAdmin does not auto-login and rejects a second create', async () => {
    const first = await createFirstSuperAdmin({
      name: 'Ada Admin',
      email: 'ada@platform.local',
      phone: '9876543210',
      password: 'Admin@2026',
    });
    expect(first.ok).toBe(true);

    const second = await createFirstSuperAdmin({
      name: 'Other',
      email: 'other@platform.local',
      phone: '9876543211',
      password: 'Admin@2026',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('AUTH_PLATFORM_EXISTS');
    expect(await db.users.count()).toBe(1);
  });

  it('login works after first SuperAdmin create', async () => {
    await createFirstSuperAdmin({
      name: 'Ada Admin',
      email: 'ada@platform.local',
      phone: '9876543210',
      password: 'Admin@2026',
    });
    const bad = await login('ada@platform.local', 'wrong');
    expect(bad.ok).toBe(false);
    const good = await login('ada@platform.local', 'Admin@2026');
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.data.user.role).toBe('SuperAdmin');
      expect(good.data.business.type).toBe('Platform');
    }
  });

  it('resetPassword with demo OTP then login', async () => {
    await createFirstSuperAdmin({
      name: 'Ada Admin',
      email: 'ada@platform.local',
      phone: '9876543210',
      password: 'Admin@2026',
    });
    const reset = await resetPassword('ada@platform.local', DEMO_OTP, 'NewPass@2026');
    expect(reset.ok).toBe(true);
    expect((await login('ada@platform.local', 'Admin@2026')).ok).toBe(false);
    expect((await login('ada@platform.local', 'NewPass@2026')).ok).toBe(true);
  });

  it('invite accept activates DeliveryStaff', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    const invited = await inviteStaff({
      actor: owner,
      business: biz,
      name: 'Rider',
      email: 'rider@ph.local',
      phone: '9123456780',
      role: 'DeliveryStaff',
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;
    const token = invited.data.inviteToken!;
    const preview = await getInvitePreview(token);
    expect(preview.ok).toBe(true);
    const accepted = await acceptInvite(token, 'Rider@2026');
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.data.user.status).toBe('Active');
      expect(accepted.data.user.role).toBe('DeliveryStaff');
    }
    expect((await login('rider@ph.local', 'Rider@2026')).ok).toBe(true);
  });
});

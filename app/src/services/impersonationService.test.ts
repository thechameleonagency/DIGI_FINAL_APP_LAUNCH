import { beforeEach, describe, expect, it } from 'vitest';
import { assertCan } from './authService';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { enterImpersonation, exitImpersonation } from './impersonationService';
import { db } from '../data/db';

describe('impersonationService (CF-25)', () => {
  beforeEach(async () => {
    await clearDb();
    const admin = await makeActor({ id: 'u-admin', businessId: 'biz-plat', role: 'SuperAdmin' });
    await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id, name: 'Platform' });
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id, name: 'CarePlus' });
  });

  it('enters read-only view-as and blocks mutations (AC-Q09)', async () => {
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const res = await enterImpersonation({
      actor: admin,
      platform,
      targetBusinessId: 'biz-ph',
      reason: 'Ticket 42 review',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.viewUser.impersonationReadOnly).toBe(true);
    expect(res.data.viewUser.passwordHash).toBe('');
    expect(assertCan(res.data.viewUser, res.data.viewBusiness, 'order.place').allow).toBe(false);
    expect(assertCan(res.data.viewUser, res.data.viewBusiness, 'payment.submit').allow).toBe(false);
    expect(assertCan(res.data.viewUser, res.data.viewBusiness, 'read.own').allow).toBe(true);
    const notes = await db.notifications.toArray();
    expect(notes.some((n) => n.code === 'N-315')).toBe(true);
  });

  it('rejects concurrent impersonation (E-CF-25b) and restores admin on exit', async () => {
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const first = await enterImpersonation({
      actor: admin,
      platform,
      targetBusinessId: 'biz-ph',
      reason: 'First session',
      notifyOwner: false,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await enterImpersonation({
      actor: admin,
      platform,
      targetBusinessId: 'biz-ph',
      reason: 'Second attempt',
      alreadyImpersonating: true,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('IMP_ACTIVE');

    const exited = await exitImpersonation({ impersonation: first.data.impersonation });
    expect(exited.ok).toBe(true);
    if (exited.ok) {
      expect(exited.data.user.id).toBe('u-admin');
      expect(exited.data.business.type).toBe('Platform');
    }
  });

  it('allows view-as on suspended business (E-CF-25a)', async () => {
    await db.businesses.update('biz-ph', { accountStatus: 'Suspended', suspendReason: 'Docs' });
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const res = await enterImpersonation({
      actor: admin,
      platform,
      targetBusinessId: 'biz-ph',
      reason: 'Suspension review',
      notifyOwner: false,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.viewBusiness.accountStatus).toBe('Suspended');
  });

  it('SupportManager cannot impersonate', async () => {
    const sm = await makeActor({ id: 'u-sm', businessId: 'biz-plat', role: 'SupportManager' });
    const platform = (await db.businesses.get('biz-plat'))!;
    const res = await enterImpersonation({
      actor: sm,
      platform,
      targetBusinessId: 'biz-ph',
      reason: 'Should fail',
      notifyOwner: false,
    });
    expect(res.ok).toBe(false);
  });
});

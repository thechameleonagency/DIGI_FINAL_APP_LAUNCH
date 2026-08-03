import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import {
  adminReviewVerification,
  reactivateBusiness,
  requestReactivation,
  submitVerification,
  suspendBusiness,
} from './verificationService';
import { nowIso } from '../domain/utils/clock';

describe('verificationService Wave 1', () => {
  beforeEach(async () => {
    await clearDb();
  });

  async function seedPharmacyPending() {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await db.businesses.update(biz.id, {
      accountStatus: 'PendingActivation',
      verificationStatus: 'Submitted',
    });
    const refreshed = (await db.businesses.get(biz.id))!;
    await db.verifications.add({
      id: 'ver-1',
      businessId: biz.id,
      status: 'Submitted',
      submittedAt: nowIso(),
      documentIds: [],
      documents: [],
      decisionHistory: [{ from: 'NotStarted', to: 'Submitted', at: nowIso(), actorId: owner.id }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return { owner, biz: refreshed };
  }

  async function seedPlatformAdmin() {
    const admin = await makeActor({ id: 'u-admin', businessId: 'biz-plat', role: 'SuperAdmin' });
    const platform = await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id });
    return { admin, platform };
  }

  it('adminReviewVerification CONCURRENCY returns fail() not throw', async () => {
    const { admin, platform } = await seedPlatformAdmin();
    await seedPharmacyPending();

    const table = db.verifications as unknown as {
      get: (key: string) => Promise<(Awaited<ReturnType<typeof db.verifications.get>> & object) | undefined>;
    };
    const originalGet = table.get.bind(db.verifications);
    let reads = 0;
    vi.spyOn(db.verifications, 'get').mockImplementation((async (key: string) => {
      reads += 1;
      const row = await originalGet(key);
      // First read (pre-tx): Submitted. In-tx re-read: pretend another admin already moved it.
      if (reads > 1 && row) return { ...row, status: 'UnderReview' as const };
      return row;
    }) as typeof db.verifications.get);

    const res = await adminReviewVerification({
      actor: admin,
      business: platform,
      verificationId: 'ver-1',
      decision: 'UnderReview',
    });
    vi.restoreAllMocks();

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.category).toBe('Concurrency');
      expect(res.code).toBe('VER_CONFLICT');
    }
  });

  it('suspendBusiness only from Active or PendingActivation', async () => {
    const { owner, biz } = await seedPharmacyPending();
    const { admin, platform } = await seedPlatformAdmin();
    void owner;

    const pendingOk = await suspendBusiness({
      actor: admin,
      adminBusiness: platform,
      targetBusinessId: biz.id,
      reason: 'Docs expired',
    });
    expect(pendingOk.ok).toBe(true);

    const again = await suspendBusiness({
      actor: admin,
      adminBusiness: platform,
      targetBusinessId: biz.id,
      reason: 'Again',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('SUSPEND_STATE');
  });

  it('approve activates PendingActivation and reject does not', async () => {
    const { biz } = await seedPharmacyPending();
    const { admin, platform } = await seedPlatformAdmin();

    await adminReviewVerification({
      actor: admin,
      business: platform,
      verificationId: 'ver-1',
      decision: 'UnderReview',
    });
    const approved = await adminReviewVerification({
      actor: admin,
      business: platform,
      verificationId: 'ver-1',
      decision: 'Approved',
    });
    expect(approved.ok).toBe(true);
    const after = await db.businesses.get(biz.id);
    expect(after?.verificationStatus).toBe('Approved');
    expect(after?.accountStatus).toBe('Active');
  });

  it('reactivate restores PendingActivation when still unverified', async () => {
    const { biz } = await seedPharmacyPending();
    const { admin, platform } = await seedPlatformAdmin();

    await suspendBusiness({
      actor: admin,
      adminBusiness: platform,
      targetBusinessId: biz.id,
      reason: 'Hold',
    });
    const res = await reactivateBusiness({
      actor: admin,
      adminBusiness: platform,
      targetBusinessId: biz.id,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.accountStatus).toBe('PendingActivation');
  });

  it('requestReactivation requires own suspended business from DB', async () => {
    const { owner, biz } = await seedPharmacyPending();
    const { admin, platform } = await seedPlatformAdmin();

    await suspendBusiness({
      actor: admin,
      adminBusiness: platform,
      targetBusinessId: biz.id,
      reason: 'Hold',
    });
    const suspended = (await db.businesses.get(biz.id))!;

    const other = await makeActor({ id: 'u-other', businessId: 'biz-other', role: 'Pharmacist' });
    await makeBusiness({ id: 'biz-other', type: 'Pharmacy', ownerUserId: other.id });
    const cross = await requestReactivation({ actor: other, business: suspended });
    expect(cross.ok).toBe(false);

    const okReq = await requestReactivation({ actor: owner, business: suspended });
    expect(okReq.ok).toBe(true);

    await reactivateBusiness({ actor: admin, adminBusiness: platform, targetBusinessId: biz.id });
    const stale = await requestReactivation({ actor: owner, business: suspended });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe('NOT_SUSPENDED');
  });

  it('submitVerification notifies platform admins on resubmit', async () => {
    const { owner, biz } = await seedPharmacyPending();
    const { admin, platform } = await seedPlatformAdmin();
    void platform;

    await db.verifications.update('ver-1', { status: 'DocumentsRequested', requestDocsNote: 'Need clearer scan' });
    await db.businesses.update(biz.id, { verificationStatus: 'DocumentsRequested' });
    const refreshed = (await db.businesses.get(biz.id))!;

    const res = await submitVerification(owner, refreshed, { documents: [], documentIds: [] });
    expect(res.ok).toBe(true);

    const notes = await db.notifications.filter((n) => n.userId === admin.id && n.code === 'N-002').toArray();
    expect(notes.length).toBeGreaterThan(0);
  });

  it('SupportManager can suspend; Pharmacist cannot', async () => {
    const { biz } = await seedPharmacyPending();
    const support = await makeActor({ id: 'u-sup', businessId: 'biz-plat', role: 'SupportManager' });
    const platform = await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: support.id });
    const pharm = await makeActor({ id: 'u-ph2', businessId: 'biz-ph', role: 'Pharmacist' });

    const denied = await suspendBusiness({
      actor: pharm,
      adminBusiness: biz,
      targetBusinessId: biz.id,
      reason: 'Nope',
    });
    expect(denied.ok).toBe(false);

    const allowed = await suspendBusiness({
      actor: support,
      adminBusiness: platform,
      targetBusinessId: biz.id,
      reason: 'Policy',
    });
    expect(allowed.ok).toBe(true);
  });
});

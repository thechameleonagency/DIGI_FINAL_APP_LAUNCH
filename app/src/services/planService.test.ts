import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import {
  decideUpgradeRequest,
  revokePremium,
  savePlanConfig,
  saveReportPreset,
  submitUpgradeRequest,
} from './planService';

describe('planService (CF-23)', () => {
  beforeEach(async () => {
    await clearDb();
    const admin = await makeActor({ id: 'u-admin', businessId: 'biz-plat', role: 'SuperAdmin' });
    await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id, name: 'Platform' });
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id, name: 'CarePlus' });
    await db.platformSettings.put({
      id: 'platform',
      returnWindowDays: 7,
      inviteTtlDays: 7,
      verificationSlaHours: 72,
      orderSlaHours: 24,
      paymentSlaHours: 48,
      paymentProofMandatory: false,
      billAheadAllowed: false,
      roundingMode: 'nearest',
      expiryNearDays: 90,
      expiryCriticalDays: 30,
      creditNoteAutoExpire: false,
    });
  });

  it('submits upgrade, blocks second open request (E-CF-23a), notifies admins', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const res = await submitUpgradeRequest({ actor: owner, business: biz, utr: 'UTR123456' });
    expect(res.ok).toBe(true);
    const again = await submitUpgradeRequest({ actor: owner, business: biz, utr: 'UTR999999' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('UPG_OPEN');
    const notes = await db.notifications.toArray();
    expect(notes.some((n) => n.code === 'N-309')).toBe(true);
  });

  it('approves to Premium and unlocks report presets', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const submitted = await submitUpgradeRequest({ actor: owner, business: biz, utr: 'UTRABCDEF' });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const decided = await decideUpgradeRequest({
      actor: admin,
      platform,
      id: submitted.data.id,
      decision: 'Approved',
    });
    expect(decided.ok).toBe(true);
    const fresh = (await db.businesses.get('biz-ph'))!;
    expect(fresh.plan).toBe('Premium');
    const notes = await db.notifications.toArray();
    expect(notes.some((n) => n.code === 'N-310')).toBe(true);

    const deny = await saveReportPreset({
      actor: owner,
      business: biz,
      name: 'Week',
      periodDays: 7,
    });
    expect(deny.ok).toBe(false);

    const okPreset = await saveReportPreset({
      actor: owner,
      business: fresh,
      name: 'Week',
      periodDays: 7,
    });
    expect(okPreset.ok).toBe(true);
  });

  it('flags duplicate UTR on decide (E-CF-23b) and supports revoke', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const stOwner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stOwner.id, name: 'MedRoute' });

    const a = await submitUpgradeRequest({ actor: owner, business: biz, utr: 'SAMEUTR1' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    await decideUpgradeRequest({ actor: admin, platform, id: a.data.id, decision: 'Approved' });

    const st = (await db.businesses.get('biz-st'))!;
    const b = await submitUpgradeRequest({ actor: stOwner, business: st, utr: 'SAMEUTR1' });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const decided = await decideUpgradeRequest({
      actor: admin,
      platform,
      id: b.data.id,
      decision: 'Approved',
    });
    expect(decided.ok).toBe(true);
    if (decided.ok) expect(decided.data.duplicateUtr).toBe(true);

    const revoked = await revokePremium({
      actor: admin,
      platform,
      businessId: 'biz-ph',
      reason: 'Non-payment',
    });
    expect(revoked.ok).toBe(true);
    expect((await db.businesses.get('biz-ph'))!.plan).toBe('Free');
  });

  it('saves plan copy with plan.manage', async () => {
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const res = await savePlanConfig({
      actor: admin,
      platform,
      config: { priceText: '₹499', upiId: 'x@upi', benefits: ['Badge'] },
    });
    expect(res.ok).toBe(true);
    const settings = await db.platformSettings.get('platform');
    expect(settings?.premiumPlan?.priceText).toBe('₹499');
  });

  it('SupportManager cannot save plan copy (plan.manage)', async () => {
    const sm = await makeActor({ id: 'u-sm', businessId: 'biz-plat', role: 'SupportManager' });
    const platform = (await db.businesses.get('biz-plat'))!;
    const res = await savePlanConfig({
      actor: sm,
      platform,
      config: { priceText: '₹1', upiId: 'x@upi', benefits: ['Nope'] },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('PERM_DENIED');
  });

  it('SupportManager can read platform but cannot decide or revoke (plan.manage)', async () => {
    const owner = (await db.users.get('u-ph'))!;
    const biz = (await db.businesses.get('biz-ph'))!;
    const sm = await makeActor({ id: 'u-sm', businessId: 'biz-plat', role: 'SupportManager' });
    const platform = (await db.businesses.get('biz-plat'))!;
    const submitted = await submitUpgradeRequest({ actor: owner, business: biz, utr: 'UTRSMDENY' });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const decided = await decideUpgradeRequest({
      actor: sm,
      platform,
      id: submitted.data.id,
      decision: 'Approved',
    });
    expect(decided.ok).toBe(false);
    if (!decided.ok) expect(decided.code).toBe('PERM_DENIED');
    expect((await db.businesses.get('biz-ph'))!.plan ?? 'Free').toBe('Free');

    await db.businesses.update('biz-ph', { plan: 'Premium' });
    const revoked = await revokePremium({
      actor: sm,
      platform,
      businessId: 'biz-ph',
      reason: 'Should not revoke',
    });
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.code).toBe('PERM_DENIED');
    expect((await db.businesses.get('biz-ph'))!.plan).toBe('Premium');
  });
});

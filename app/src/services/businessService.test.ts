import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { updateBusiness } from './businessService';

describe('businessService Wave 1', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('rejects invalid GSTIN and duplicate GSTIN before approval', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await db.businesses.update(biz.id, {
      verificationStatus: 'Submitted',
      accountStatus: 'PendingActivation',
      gstNumber: '27AABCU9603R1ZM',
    });
    const live = (await db.businesses.get(biz.id))!;

    const otherOwner = await makeActor({ id: 'u-ph2', businessId: 'biz-ph2', role: 'Pharmacist' });
    await makeBusiness({ id: 'biz-ph2', type: 'Pharmacy', ownerUserId: otherOwner.id });
    await db.businesses.update('biz-ph2', { gstNumber: '27AABCU9603R1ZN' });

    const bad = await updateBusiness({
      actor: owner,
      business: live,
      patch: { gstNumber: 'NOT-A-GST' },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BIZ_GST_BAD');

    const dup = await updateBusiness({
      actor: owner,
      business: live,
      patch: { gstNumber: '27AABCU9603R1ZN' },
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe('BIZ_GST_DUP');
  });

  it('locks GSTIN after verification Approved', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await db.businesses.update(biz.id, {
      verificationStatus: 'Approved',
      gstNumber: '27AABCU9603R1ZM',
      drugLicenseNumber: 'MH-DL-1001',
    });
    const live = (await db.businesses.get(biz.id))!;

    const res = await updateBusiness({
      actor: owner,
      business: live,
      patch: { gstNumber: '27AABCU9603R1ZN', drugLicenseNumber: 'MH-DL-9999', name: 'Renamed Pharmacy' },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.gstNumber).toBe('27AABCU9603R1ZM');
      expect(res.data.drugLicenseNumber).toBe('MH-DL-1001');
      expect(res.data.name).toBe('Renamed Pharmacy');
    }
  });

  it('blocks cross-business profile updates', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    const other = await makeActor({ id: 'u-other', businessId: 'biz-other', role: 'Pharmacist' });
    await makeBusiness({ id: 'biz-other', type: 'Pharmacy', ownerUserId: other.id });

    const res = await updateBusiness({
      actor: other,
      business: biz,
      patch: { name: 'Hijack' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('PERM_DENIED');
  });
});

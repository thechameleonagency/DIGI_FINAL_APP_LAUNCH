import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import {
  createPartnerInvite,
  matchPartnerInvitesOnRegistration,
  withdrawPartnerInvite,
} from './partnerInviteService';

describe('partnerInviteService (CF-12)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: owner.id });
  });

  it('does not create pharmacy records; duplicate phone returns existing invite', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const first = await createPartnerInvite({
      actor,
      stockist,
      name: 'New Chemist',
      phone: '9876543210',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.invite?.status).toBe('Sent');
    expect(await db.businesses.where('type').equals('Pharmacy').count()).toBe(0);

    const second = await createPartnerInvite({
      actor,
      stockist,
      name: 'New Chemist Again',
      phone: '9876543210',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.invite?.id).toBe(first.data.invite?.id);
    expect(await db.partnerInvites.count()).toBe(1);
  });

  it('matches registration by phone → Registered + N-304', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const created = await createPartnerInvite({
      actor,
      stockist,
      name: 'Join Us',
      phone: '9123456780',
    });
    expect(created.ok).toBe(true);
    await matchPartnerInvitesOnRegistration({ pharmacyId: 'biz-new', phone: '9123456780' });
    const invite = await db.partnerInvites.toCollection().first();
    expect(invite?.status).toBe('Registered');
    const n = await db.notifications.filter((x) => x.code === 'N-304').first();
    expect(n).toBeTruthy();
  });

  it('withdraw marks Withdrawn', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const created = await createPartnerInvite({
      actor,
      stockist,
      name: 'Temp',
      phone: '9000011122',
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data.invite) return;
    const w = await withdrawPartnerInvite({ actor, stockist, id: created.data.invite.id });
    expect(w.ok).toBe(true);
    if (w.ok) expect(w.data.status).toBe('Withdrawn');
  });
});

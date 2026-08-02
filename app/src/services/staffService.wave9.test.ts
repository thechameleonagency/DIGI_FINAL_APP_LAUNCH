import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { inviteStaff } from './authService';
import { notifyBusinessUsers } from './notifications';
import { createTicket, sendMessage, updateTicket } from './supportService';
import { transferOwnership } from './staffService';

describe('Wave 9 — people & workspace chrome', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('pharmacy invite is DeliveryStaff only; platform invite is SupportManager only', async () => {
    const owner = await makeActor({ id: 'ph-owner', businessId: 'biz-ph', role: 'Pharmacist' });
    const pharmacy = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    const badPh = await inviteStaff({
      actor: owner,
      business: pharmacy,
      name: 'Bad',
      email: 'bad-ph@test.local',
      phone: '9111111111',
      role: 'SupportManager',
    });
    expect(badPh.ok).toBe(false);
    if (!badPh.ok) expect(badPh.code).toBe('STAFF_ROLE');

    const okPh = await inviteStaff({
      actor: owner,
      business: pharmacy,
      name: 'Rider',
      email: 'rider-ph@test.local',
      phone: '9111111112',
      role: 'DeliveryStaff',
    });
    expect(okPh.ok).toBe(true);

    const admin = await makeActor({ id: 'sa', businessId: 'biz-pl', role: 'SuperAdmin' });
    const platform = await makeBusiness({ id: 'biz-pl', type: 'Platform', ownerUserId: admin.id });
    const badPl = await inviteStaff({
      actor: admin,
      business: platform,
      name: 'Bad',
      email: 'bad-pl@test.local',
      phone: '9111111113',
      role: 'DeliveryStaff',
    });
    expect(badPl.ok).toBe(false);
    if (!badPl.ok) expect(badPl.code).toBe('STAFF_ROLE');

    const okPl = await inviteStaff({
      actor: admin,
      business: platform,
      name: 'Support',
      email: 'sm@test.local',
      phone: '9111111114',
      role: 'SupportManager',
    });
    expect(okPl.ok).toBe(true);
  });

  it('platform ownership transfer demotes SuperAdmin to SupportManager (not DeliveryStaff)', async () => {
    const sa = await makeActor({ id: 'sa2', businessId: 'biz-pl2', role: 'SuperAdmin' });
    const platform = await makeBusiness({ id: 'biz-pl2', type: 'Platform', ownerUserId: sa.id });
    const sm = await makeActor({ id: 'sm2', businessId: platform.id, role: 'SupportManager' });
    const res = await transferOwnership({ actor: sa, business: platform, newOwnerUserId: sm.id });
    expect(res.ok).toBe(true);
    expect((await db.users.get(sa.id))?.role).toBe('SupportManager');
    expect((await db.users.get(sm.id))?.role).toBe('SuperAdmin');
    expect((await db.businesses.get(platform.id))?.ownerUserId).toBe(sm.id);
  });

  it('pharmacy ownership transfer demotes former owner to DeliveryStaff and still notifies them (N-049)', async () => {
    const owner = await makeActor({ id: 'ph-o', businessId: 'biz-ph3', role: 'Pharmacist' });
    const pharmacy = await makeBusiness({ id: 'biz-ph3', type: 'Pharmacy', ownerUserId: owner.id });
    const rider = await makeActor({ id: 'ph-r', businessId: pharmacy.id, role: 'DeliveryStaff' });
    const res = await transferOwnership({ actor: owner, business: pharmacy, newOwnerUserId: rider.id });
    expect(res.ok).toBe(true);
    expect((await db.users.get(owner.id))?.role).toBe('DeliveryStaff');
    expect((await db.users.get(rider.id))?.role).toBe('Pharmacist');
    const notes = await db.notifications.where('userId').equals(owner.id).toArray();
    expect(notes.some((n) => n.code === 'N-049')).toBe(true);
  });

  it('DeliveryStaff excluded from general fan-out; included when roles opts in', async () => {
    const owner = await makeActor({ id: 'st-o', businessId: 'biz-st', role: 'Stockist' });
    const stockist = await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: owner.id });
    const rider = await makeActor({ id: 'st-r', businessId: stockist.id, role: 'DeliveryStaff' });

    await notifyBusinessUsers(stockist.id, 'N-024', { deliveryNo: 'DEL-1' }, { type: 'Delivery', id: 'd1' });
    expect(await db.notifications.where('userId').equals(rider.id).count()).toBe(0);
    expect(await db.notifications.where('userId').equals(owner.id).count()).toBe(1);

    await notifyBusinessUsers(
      stockist.id,
      'N-023',
      { deliveryNo: 'DEL-2' },
      { type: 'Delivery', id: 'd2' },
      ['DeliveryStaff'],
    );
    expect(await db.notifications.where('userId').equals(rider.id).count()).toBe(1);
    // Owner not in DeliveryStaff filter — still one note from N-024 only.
    expect(await db.notifications.where('userId').equals(owner.id).count()).toBe(1);
  });

  it('DeliveryStaff can open tickets and receive ticket updates; cannot partner-message', async () => {
    const owner = await makeActor({ id: 'ph-o2', businessId: 'biz-ph4', role: 'Pharmacist' });
    const pharmacy = await makeBusiness({ id: 'biz-ph4', type: 'Pharmacy', ownerUserId: owner.id });
    const rider = await makeActor({ id: 'ph-r2', businessId: pharmacy.id, role: 'DeliveryStaff' });
    const stockistOwner = await makeActor({ id: 'st-o2', businessId: 'biz-st2', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st2', type: 'Stockist', ownerUserId: stockistOwner.id });

    const ticket = await createTicket({
      actor: rider,
      business: pharmacy,
      subject: 'Failed stop',
      category: 'Orders',
      body: 'Customer not reachable',
    });
    expect(ticket.ok).toBe(true);
    if (!ticket.ok) return;

    const updated = await updateTicket({
      actor: owner,
      business: pharmacy,
      ticketId: ticket.data.id,
      body: 'Trying again tomorrow',
      status: 'InProgress',
    });
    expect(updated.ok).toBe(true);
    const riderNotes = await db.notifications.where('userId').equals(rider.id).toArray();
    expect(riderNotes.some((n) => n.code === 'N-044')).toBe(true);

    const msg = await sendMessage({
      actor: rider,
      business: pharmacy,
      counterpartBusinessId: 'biz-st2',
      body: 'Hello stockist',
    });
    expect(msg.ok).toBe(false);
    if (!msg.ok) expect(msg.code).toBe('MSG_DELIVERY');
  });
});

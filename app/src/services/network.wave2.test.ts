import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import {
  createManagedPharmacy,
  inviteManagedPharmacy,
  updateManagedPharmacy,
} from './managedPharmacyService';
import {
  matchPartnerInvitesOnRegistration,
  withdrawPartnerInvite,
} from './partnerInviteService';
import {
  blockConnection,
  requestConnection,
  respondConnection,
  updateConnectionCreditTerms,
} from './connectionService';
import { isFavouritePinned, setFavourite, setSupplierRating } from './favouriteService';
import { newId } from '../domain/utils/ids';
import { nowIso } from '../domain/utils/clock';

describe('Wave 2 — Network', () => {
  beforeEach(async () => {
    await clearDb();
    const stOwner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stOwner.id, name: 'MedRoute' });
    const phOwner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phOwner.id, name: 'City Chemist' });
  });

  describe('managedPharmacyService inviteFirst rollback', () => {
    it('rolls back managed row when inviteFirst hits existing pharmacy', async () => {
      const actor = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      await db.users.update('u-ph', { phone: '9123456780' });
      const res = await createManagedPharmacy({
        actor,
        stockist,
        data: {
          name: 'City Chemist Dup',
          phone: '9123456780',
          inviteFirst: true,
        },
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe('MP_INVITE_EXISTS');
      expect(await db.managedPharmacies.count()).toBe(0);
      expect(await db.partnerInvites.count()).toBe(0);
    });

    it('rolls back managed row when inviteFirst phone is invalid', async () => {
      const actor = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const res = await createManagedPharmacy({
        actor,
        stockist,
        data: { name: 'Bad Phone', phone: '123', inviteFirst: true },
      });
      expect(res.ok).toBe(false);
      expect(await db.managedPharmacies.count()).toBe(0);
    });
  });

  describe('partner invite withdraw + auto-connect', () => {
    it('withdraw clears managed Invited → OfflineOnly', async () => {
      const actor = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const created = await createManagedPharmacy({
        actor,
        stockist,
        data: { name: 'Offline', phone: '9000011122', inviteFirst: true },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.data.status).toBe('Invited');
      expect(created.data.inviteId).toBeTruthy();
      const w = await withdrawPartnerInvite({ actor, stockist, id: created.data.inviteId! });
      expect(w.ok).toBe(true);
      const managed = await db.managedPharmacies.get(created.data.id);
      expect(managed?.status).toBe('OfflineOnly');
      expect(managed?.inviteId).toBeUndefined();
    });

    it('auto-connect reactivates Disconnected with managed credit terms', async () => {
      const ts = nowIso();
      const managedId = newId();
      const inviteId = newId();
      await db.users.update('u-ph', { phone: '9123456780' });
      await db.managedPharmacies.add({
        id: managedId,
        stockistId: 'biz-st',
        name: 'City Chemist',
        phone: '9123456780',
        creditDays: 45,
        creditLimit: 250000,
        status: 'Invited',
        inviteId,
        createdAt: ts,
        updatedAt: ts,
      });
      await db.partnerInvites.add({
        id: inviteId,
        stockistId: 'biz-st',
        name: 'City Chemist',
        phone: '9123456780',
        managedPharmacyId: managedId,
        status: 'Sent',
        createdAt: ts,
      });
      await db.connections.add({
        id: newId(),
        pharmacyId: 'biz-ph',
        stockistId: 'biz-st',
        status: 'Disconnected',
        requestedAt: ts,
        creditDays: 7,
        creditLimit: 1000,
        statusHistory: [{ from: 'Active', to: 'Disconnected', at: ts, actorId: 'u-st' }],
        createdAt: ts,
        updatedAt: ts,
      });

      await matchPartnerInvitesOnRegistration({ pharmacyId: 'biz-ph', phone: '9123456780' });

      const conn = await db.connections.where({ pharmacyId: 'biz-ph', stockistId: 'biz-st' }).first();
      expect(conn?.status).toBe('Active');
      expect(conn?.creditDays).toBe(45);
      expect(conn?.creditLimit).toBe(250000);
      const managed = await db.managedPharmacies.get(managedId);
      expect(managed?.status).toBe('Linked');
      const inv = await db.partnerInvites.get(inviteId);
      expect(inv?.status).toBe('Connected');
    });

    it('does not reactivate Blocked on managed register', async () => {
      const ts = nowIso();
      const managedId = newId();
      const inviteId = newId();
      await db.users.update('u-ph', { phone: '9123456780' });
      await db.managedPharmacies.add({
        id: managedId,
        stockistId: 'biz-st',
        name: 'City Chemist',
        phone: '9123456780',
        status: 'Invited',
        inviteId,
        createdAt: ts,
        updatedAt: ts,
      });
      await db.partnerInvites.add({
        id: inviteId,
        stockistId: 'biz-st',
        name: 'City Chemist',
        phone: '9123456780',
        managedPharmacyId: managedId,
        status: 'Sent',
        createdAt: ts,
      });
      await db.connections.add({
        id: newId(),
        pharmacyId: 'biz-ph',
        stockistId: 'biz-st',
        status: 'Blocked',
        requestedAt: ts,
        statusHistory: [{ from: 'Active', to: 'Blocked', at: ts, actorId: 'u-st' }],
        createdAt: ts,
        updatedAt: ts,
      });

      await matchPartnerInvitesOnRegistration({ pharmacyId: 'biz-ph', phone: '9123456780' });
      const conn = await db.connections.where({ pharmacyId: 'biz-ph', stockistId: 'biz-st' }).first();
      expect(conn?.status).toBe('Blocked');
      expect((await db.managedPharmacies.get(managedId))?.status).toBe('Linked');
      expect((await db.partnerInvites.get(inviteId))?.status).toBe('Registered');
    });
  });

  describe('connectionService', () => {
    it('Pharmacist requests; Stockist approves with validated terms; DeliveryStaff denied', async () => {
      const pharmacist = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const stockistUser = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const delivery = await makeActor({ id: 'u-ds', businessId: 'biz-ph', role: 'DeliveryStaff' });

      const denied = await requestConnection({
        actor: delivery,
        pharmacy,
        stockistId: stockist.id,
      });
      expect(denied.ok).toBe(false);

      const req = await requestConnection({ actor: pharmacist, pharmacy, stockistId: stockist.id });
      expect(req.ok).toBe(true);
      if (!req.ok) return;

      const badTerms = await respondConnection({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        decision: 'Active',
        creditDays: -1,
        creditLimit: 50000,
      });
      expect(badTerms.ok).toBe(false);
      if (!badTerms.ok) expect(badTerms.code).toBe('CONN_TERMS_DAYS');

      const okRes = await respondConnection({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        decision: 'Active',
        creditDays: 21,
        creditLimit: 75000,
      });
      expect(okRes.ok).toBe(true);
      if (okRes.ok) {
        expect(okRes.data.creditDays).toBe(21);
        expect(okRes.data.creditLimit).toBe(75000);
      }

      const dsRespond = await respondConnection({
        actor: await makeActor({ id: 'u-st-ds', businessId: 'biz-st', role: 'DeliveryStaff' }),
        stockist,
        connectionId: req.data.id,
        decision: 'Rejected',
        reason: 'nope',
      });
      expect(dsRespond.ok).toBe(false);
    });

    it('rejects approve when pharmacy is not Active/Approved', async () => {
      const pharmacist = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const stockistUser = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const req = await requestConnection({ actor: pharmacist, pharmacy, stockistId: stockist.id });
      expect(req.ok).toBe(true);
      if (!req.ok) return;
      await db.businesses.update('biz-ph', { accountStatus: 'Suspended' });
      const res = await respondConnection({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        decision: 'Active',
        creditDays: 30,
        creditLimit: 100000,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('CONN_PHARM_GATE');
    });

    it('updateConnectionCreditTerms requires Active + reason', async () => {
      const stockistUser = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const pharmacist = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const req = await requestConnection({ actor: pharmacist, pharmacy, stockistId: stockist.id });
      if (!req.ok) return;
      await respondConnection({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        decision: 'Active',
        creditDays: 30,
        creditLimit: 100000,
      });
      const bad = await updateConnectionCreditTerms({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        creditDays: 10,
        creditLimit: 50000,
        reason: '  ',
      });
      expect(bad.ok).toBe(false);
      const okRes = await updateConnectionCreditTerms({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        creditDays: 10,
        creditLimit: 50000,
        reason: 'Seasonal limit',
      });
      expect(okRes.ok).toBe(true);
      if (okRes.ok) expect(okRes.data.creditDays).toBe(10);
    });

    it('block then unblock restores Active', async () => {
      const stockistUser = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const pharmacist = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const req = await requestConnection({ actor: pharmacist, pharmacy, stockistId: stockist.id });
      if (!req.ok) return;
      await respondConnection({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        decision: 'Active',
        creditDays: 30,
        creditLimit: 100000,
      });
      const blocked = await blockConnection({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
        reason: 'Abuse',
      });
      expect(blocked.ok).toBe(true);
      const { unblockConnection } = await import('./connectionService');
      const unblocked = await unblockConnection({
        actor: stockistUser,
        stockist,
        connectionId: req.data.id,
      });
      expect(unblocked.ok).toBe(true);
      if (unblocked.ok) expect(unblocked.data.status).toBe('Active');
    });
  });

  describe('favouriteService', () => {
    it('rating does not pin; pin/unpin preserves rating', async () => {
      const pharmacist = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const rated = await setSupplierRating({
        actor: pharmacist,
        pharmacy,
        stockistId: 'biz-st',
        rating: 4,
        note: 'reliable',
      });
      expect(rated.ok).toBe(true);
      if (!rated.ok) return;
      expect(isFavouritePinned(rated.data)).toBe(false);

      const pinned = await setFavourite({
        actor: pharmacist,
        pharmacy,
        stockistId: 'biz-st',
        favourite: true,
      });
      expect(pinned.ok).toBe(true);
      if (!pinned.ok || !pinned.data) return;
      expect(isFavouritePinned(pinned.data)).toBe(true);
      expect(pinned.data.rating).toBe(4);

      const unpinned = await setFavourite({
        actor: pharmacist,
        pharmacy,
        stockistId: 'biz-st',
        favourite: false,
      });
      expect(unpinned.ok).toBe(true);
      if (!unpinned.ok || !unpinned.data) return;
      expect(isFavouritePinned(unpinned.data)).toBe(false);
      expect(unpinned.data.rating).toBe(4);
      expect(unpinned.data.note).toBe('reliable');
    });

    it('DeliveryStaff cannot favourite', async () => {
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const delivery = await makeActor({ id: 'u-ds2', businessId: 'biz-ph', role: 'DeliveryStaff' });
      const res = await setFavourite({
        actor: delivery,
        pharmacy,
        stockistId: 'biz-st',
        favourite: true,
      });
      expect(res.ok).toBe(false);
    });
  });

  describe('managedPharmacyService update whitelist', () => {
    it('cannot overwrite status via patch; inviteManagedPharmacy requires permission', async () => {
      const actor = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const created = await createManagedPharmacy({
        actor,
        stockist,
        data: { name: 'Local', phone: '9000099900' },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const patched = await updateManagedPharmacy({
        actor,
        stockist,
        id: created.data.id,
        patch: { note: 'VIP', creditLimit: 50000 },
      });
      expect(patched.ok).toBe(true);
      if (patched.ok) {
        expect(patched.data.status).toBe('OfflineOnly');
        expect(patched.data.note).toBe('VIP');
        expect(patched.data.creditLimit).toBe(50000);
      }
      const delivery = await makeActor({ id: 'u-st-ds2', businessId: 'biz-st', role: 'DeliveryStaff' });
      const inv = await inviteManagedPharmacy({ actor: delivery, stockist, id: created.data.id });
      expect(inv.ok).toBe(false);
    });
  });
});

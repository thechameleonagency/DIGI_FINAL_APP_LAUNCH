import type { Business, PartnerInvite, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { normalizePhone } from '../domain/utils/validation';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { notifyBusinessUsers } from './notifications';
import { nowIso } from '../domain/utils/clock';

export type CreateInviteResult = {
  invite?: PartnerInvite;
  /** Existing platform pharmacy match — deep-link to connection flow instead of invite */
  existingPharmacyId?: string;
  existingPharmacyName?: string;
  shareText?: string;
  shareUrl?: string;
};

function sharePayload(stockist: Business, invite: PartnerInvite): { shareText: string; shareUrl: string } {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.digiswasthya.local';
  const shareUrl = `${origin}/auth/register/pharmacy?invite=${invite.id}`;
  const shareText = [
    `${stockist.name} invites ${invite.name} to DigiSwasthya.`,
    `Register as a Pharmacy and connect with us.`,
    invite.gst ? `GST hint: ${invite.gst}` : null,
    `Link: ${shareUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { shareText, shareUrl };
}

export async function createPartnerInvite(params: {
  actor: User;
  stockist: Business;
  name: string;
  phone: string;
  email?: string;
  gst?: string;
  managedPharmacyId?: string;
}): Promise<Result<CreateInviteResult>> {
  const perm = assertCan(params.actor, params.stockist, 'partner.invite');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Invite was not created.');
  if (params.stockist.type !== 'Stockist') {
    return fail('BusinessRule', 'INV_ROLE', 'Only stockists can invite pharmacies.', 'Invite was not created.');
  }
  const name = params.name.trim();
  if (!name) return fail('Validation', 'INV_NAME', 'Pharmacy name is required.', 'Invite was not created.');
  const phone = normalizePhone(params.phone);
  if (phone.length !== 10) {
    return fail('Validation', 'INV_PHONE', 'Enter a valid 10-digit mobile.', 'Invite was not created.');
  }
  const gst = params.gst?.replace(/\s/g, '').toUpperCase() || undefined;

  // Existing pharmacy by GST or phone → connection deep-link, no new invite
  if (gst) {
    const byGst = await db.businesses.where('gstNumber').equals(gst).first();
    if (byGst && byGst.type === 'Pharmacy') {
      return ok({
        existingPharmacyId: byGst.id,
        existingPharmacyName: byGst.name,
      });
    }
  }
  const userByPhone = await db.users.filter((u) => normalizePhone(u.phone) === phone).first();
  if (userByPhone) {
    const biz = await db.businesses.get(userByPhone.businessId);
    if (biz?.type === 'Pharmacy') {
      return ok({
        existingPharmacyId: biz.id,
        existingPharmacyName: biz.name,
      });
    }
  }

  // E-CF-12a: duplicate invite to same phone → show existing
  const dup = await db.partnerInvites
    .where('stockistId')
    .equals(params.stockist.id)
    .filter((i) => i.phone === phone && (i.status === 'Sent' || i.status === 'Registered'))
    .first();
  if (dup) {
    const share = sharePayload(params.stockist, dup);
    return ok({ invite: dup, ...share });
  }

  const invite: PartnerInvite = {
    id: newId(),
    stockistId: params.stockist.id,
    name,
    phone,
    email: params.email?.trim().toLowerCase() || undefined,
    gst,
    managedPharmacyId: params.managedPharmacyId,
    status: 'Sent',
    createdAt: nowIso(),
  };
  await db.partnerInvites.add(invite);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'PartnerInvite',
    entityId: invite.id,
    action: 'partnerInvite.create',
    after: invite,
  });
  const share = sharePayload(params.stockist, invite);
  return ok({ invite, ...share });
}

export async function withdrawPartnerInvite(params: {
  actor: User;
  stockist: Business;
  id: string;
}): Promise<Result<PartnerInvite>> {
  const perm = assertCan(params.actor, params.stockist, 'partner.invite');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Invite was not withdrawn.');
  const invite = await db.partnerInvites.get(params.id);
  if (!invite || invite.stockistId !== params.stockist.id) {
    return fail('NotFound', 'INV_MISSING', 'Invite not found.', 'Invite was not withdrawn.');
  }
  if (invite.status === 'Connected' || invite.status === 'Withdrawn') {
    return fail('StateConflict', 'INV_STATE', 'Invite cannot be withdrawn in its current state.', 'No change made.');
  }
  const next = { ...invite, status: 'Withdrawn' as const };
  await db.partnerInvites.put(next);
  if (invite.managedPharmacyId) {
    const managed = await db.managedPharmacies.get(invite.managedPharmacyId);
    if (managed && managed.stockistId === params.stockist.id && managed.status === 'Invited') {
      await db.managedPharmacies.put({
        ...managed,
        status: 'OfflineOnly',
        inviteId: undefined,
        updatedAt: nowIso(),
      });
    }
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'PartnerInvite',
    entityId: invite.id,
    action: 'partnerInvite.withdraw',
    before: invite,
    after: next,
  });
  return ok(next);
}

/** Called after pharmacy registration — match Sent invites by phone/GST → Registered + N-304 */
export async function matchPartnerInvitesOnRegistration(params: {
  pharmacyId: string;
  phone: string;
  gstNumber?: string;
}): Promise<void> {
  const phone = normalizePhone(params.phone);
  const gst = params.gstNumber?.replace(/\s/g, '').toUpperCase();
  const candidates = await db.partnerInvites.filter((i) => i.status === 'Sent').toArray();
  for (const invite of candidates) {
    const phoneMatch = normalizePhone(invite.phone) === phone;
    const gstMatch = !!(gst && invite.gst && invite.gst === gst);
    if (!phoneMatch && !gstMatch) continue;
    const next = { ...invite, status: 'Registered' as const };
    await db.partnerInvites.put(next);
    if (invite.managedPharmacyId) {
      const { linkManagedPharmacyOnRegister } = await import('./managedPharmacyService');
      await linkManagedPharmacyOnRegister({
        inviteId: invite.id,
        pharmacyBusinessId: params.pharmacyId,
      });
      // Auto Active connection for invite-from-managed flow (never override Blocked).
      const existing = await db.connections
        .where({ pharmacyId: params.pharmacyId, stockistId: invite.stockistId })
        .first();
      const managed = await db.managedPharmacies.get(invite.managedPharmacyId);
      const creditDays = managed?.creditDays ?? 30;
      const creditLimit = managed?.creditLimit ?? 100000;
      const ts = nowIso();
      if (!existing) {
        await db.connections.add({
          id: newId(),
          pharmacyId: params.pharmacyId,
          stockistId: invite.stockistId,
          status: 'Active',
          requestedAt: ts,
          respondedAt: ts,
          creditDays,
          creditLimit,
          statusHistory: [{ from: 'Active', to: 'Active', at: ts, actorId: 'system' }],
          createdAt: ts,
          updatedAt: ts,
        });
      } else if (existing.status === 'Blocked') {
        // Stockist explicitly blocked — keep Blocked; managed is Linked for history only.
      } else if (existing.status !== 'Active') {
        // Reactivate Disconnected / Rejected / Cancelled / Requested with managed credit terms.
        await db.connections.put({
          ...existing,
          status: 'Active',
          respondedAt: ts,
          creditDays: managed?.creditDays ?? existing.creditDays ?? creditDays,
          creditLimit: managed?.creditLimit ?? existing.creditLimit ?? creditLimit,
          updatedAt: ts,
          statusHistory: [
            ...existing.statusHistory,
            { from: existing.status, to: 'Active', at: ts, actorId: 'system' },
          ],
        });
      }
    }
    const conn = await db.connections
      .where({ pharmacyId: params.pharmacyId, stockistId: invite.stockistId })
      .first();
    if (conn?.status === 'Active') {
      await markPartnerInvitesConnected({ pharmacyId: params.pharmacyId, stockistId: invite.stockistId });
    }
    await notifyBusinessUsers(
      invite.stockistId,
      'N-304',
      { pharmacy: (await db.businesses.get(params.pharmacyId))?.name ?? invite.name },
      { type: 'PartnerInvite', id: invite.id },
    );
  }
}

/** When connection becomes Active, mark matching Registered/Sent invites Connected */
export async function markPartnerInvitesConnected(params: {
  pharmacyId: string;
  stockistId: string;
}): Promise<void> {
  const pharmacy = await db.businesses.get(params.pharmacyId);
  const owner = pharmacy ? await db.users.get(pharmacy.ownerUserId) : undefined;
  const phone = owner ? normalizePhone(owner.phone) : '';
  const gst = pharmacy?.gstNumber?.replace(/\s/g, '').toUpperCase();
  const invites = await db.partnerInvites
    .where('stockistId')
    .equals(params.stockistId)
    .filter((i) => i.status === 'Sent' || i.status === 'Registered')
    .toArray();
  for (const invite of invites) {
    const phoneMatch = phone && normalizePhone(invite.phone) === phone;
    const gstMatch = !!(gst && invite.gst && invite.gst === gst);
    if (!phoneMatch && !gstMatch) continue;
    await db.partnerInvites.put({ ...invite, status: 'Connected' });
  }
}

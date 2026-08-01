import type { Business, ManagedPharmacy, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { createPartnerInvite } from './partnerInviteService';

export async function createManagedPharmacy(params: {
  actor: User;
  stockist: Business;
  data: {
    name: string;
    phone: string;
    email?: string;
    gst?: string;
    drugLicense?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    creditLimit?: number;
    creditDays?: number;
    note?: string;
    inviteFirst?: boolean;
  };
}): Promise<Result<ManagedPharmacy>> {
  const perm = assertCan(params.actor, params.stockist, 'partner.invite');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Pharmacy was not created.');
  if (params.stockist.type !== 'Stockist') {
    return fail('BusinessRule', 'MP_ROLE', 'Only stockists manage offline pharmacies.', 'Pharmacy was not created.');
  }
  if (!params.data.name.trim() || !params.data.phone.trim()) {
    return fail('Validation', 'MP_REQ', 'Name and phone are required.', 'Pharmacy was not created.');
  }
  const ts = new Date().toISOString();
  let row: ManagedPharmacy = {
    id: newId(),
    stockistId: params.stockist.id,
    name: params.data.name.trim(),
    phone: params.data.phone.trim(),
    email: params.data.email,
    gst: params.data.gst,
    drugLicense: params.data.drugLicense,
    address: params.data.address,
    city: params.data.city,
    state: params.data.state,
    pincode: params.data.pincode,
    creditLimit: params.data.creditLimit,
    creditDays: params.data.creditDays,
    note: params.data.note,
    status: params.data.inviteFirst ? 'Invited' : 'OfflineOnly',
    createdAt: ts,
    updatedAt: ts,
  };
  await db.managedPharmacies.add(row);
  if (params.data.inviteFirst) {
    const inv = await createPartnerInvite({
      actor: params.actor,
      stockist: params.stockist,
      name: row.name,
      phone: row.phone,
      email: row.email,
      gst: row.gst,
      managedPharmacyId: row.id,
    });
    if (inv.ok && inv.data.invite) {
      row = { ...row, inviteId: inv.data.invite.id, updatedAt: new Date().toISOString() };
      await db.managedPharmacies.put(row);
    }
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'ManagedPharmacy',
    entityId: row.id,
    action: 'managedPharmacy.create',
    after: { name: row.name, status: row.status },
  });
  return ok(row);
}

export async function updateManagedPharmacy(params: {
  actor: User;
  stockist: Business;
  id: string;
  patch: Partial<ManagedPharmacy>;
}): Promise<Result<ManagedPharmacy>> {
  const perm = assertCan(params.actor, params.stockist, 'partner.invite');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Pharmacy was not updated.');
  const row = await db.managedPharmacies.get(params.id);
  if (!row || row.stockistId !== params.stockist.id) {
    return fail('NotFound', 'MP_MISSING', 'Managed pharmacy not found.', 'Pharmacy was not updated.');
  }
  const next: ManagedPharmacy = {
    ...row,
    ...params.patch,
    id: row.id,
    stockistId: row.stockistId,
    updatedAt: new Date().toISOString(),
  };
  await db.managedPharmacies.put(next);
  return ok(next);
}

export async function inviteManagedPharmacy(params: {
  actor: User;
  stockist: Business;
  id: string;
}): Promise<Result<{ managed: ManagedPharmacy; shareText?: string; shareUrl?: string }>> {
  const row = await db.managedPharmacies.get(params.id);
  if (!row || row.stockistId !== params.stockist.id) {
    return fail('NotFound', 'MP_MISSING', 'Managed pharmacy not found.', 'Invite was not sent.');
  }
  if (row.status === 'Linked') {
    return fail('BusinessRule', 'MP_LINKED', 'Already linked to a platform pharmacy.', 'Invite was not sent.');
  }
  const inv = await createPartnerInvite({
    actor: params.actor,
    stockist: params.stockist,
    name: row.name,
    phone: row.phone,
    email: row.email,
    gst: row.gst,
    managedPharmacyId: row.id,
  });
  if (!inv.ok) return inv;
  if (inv.data.existingPharmacyId) {
    return fail(
      'BusinessRule',
      'MP_EXISTS',
      `${inv.data.existingPharmacyName} is already on DigiSwasthya — connect from Platform tab.`,
      'Invite was not sent.',
    );
  }
  const next: ManagedPharmacy = {
    ...row,
    status: 'Invited',
    inviteId: inv.data.invite?.id,
    updatedAt: new Date().toISOString(),
  };
  await db.managedPharmacies.put(next);
  return ok({ managed: next, shareText: inv.data.shareText, shareUrl: inv.data.shareUrl });
}

/** Called after pharmacy registers from invite — link managed row. */
export async function linkManagedPharmacyOnRegister(params: {
  inviteId: string;
  pharmacyBusinessId: string;
}): Promise<void> {
  const invite = await db.partnerInvites.get(params.inviteId);
  if (!invite?.managedPharmacyId) return;
  const row = await db.managedPharmacies.get(invite.managedPharmacyId);
  if (!row) return;
  const ts = new Date().toISOString();
  await db.managedPharmacies.put({
    ...row,
    status: 'Linked',
    linkedBusinessId: params.pharmacyBusinessId,
    updatedAt: ts,
  });
}

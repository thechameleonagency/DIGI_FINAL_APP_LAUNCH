import type { Business, User, VerificationDocument } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { isGstin, isIfsc, isLicenseNo, isPan, isPhone, isPin, isUpi, normalizeGstin, normalizePan } from '../domain/utils/validation';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { storeFile } from './fileService';

export type BusinessProfilePatch = {
  name?: string;
  legalName?: string;
  pharmacyType?: string;
  panNumber?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  /** Locked after verification Approved — ignored if locked. */
  gstNumber?: string;
  drugLicenseNumber?: string;
  upiId?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  accountHolderName?: string;
  servicePins?: string[];
  holidays?: string[];
  preferences?: Business['preferences'];
  locations?: Business['locations'];
};

export async function updateBusiness(params: {
  actor: User;
  business: Business;
  patch: BusinessProfilePatch;
}): Promise<Result<Business>> {
  if (params.actor.businessId !== params.business.id) {
    return fail('Permission', 'PERM_DENIED', 'You can only update your own business profile.', 'Business was not updated.');
  }
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) {
    // Owners/managers typically have staff.manage; fall back to verification.submit for owners without staff
    const alt = assertCan(params.actor, params.business, 'verification.submit');
    if (!alt.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Business was not updated.');
  }

  const lockedIds = params.business.verificationStatus === 'Approved';
  const patch = { ...params.patch };

  if (lockedIds) {
    delete patch.gstNumber;
    delete patch.drugLicenseNumber;
    // type is immutable on Business.type — never patched
  }

  if (patch.name !== undefined && !patch.name.trim()) {
    return fail('Validation', 'BIZ_NAME', 'Business name is required.', 'Business was not updated.');
  }
  if (patch.pincode !== undefined && !isPin(patch.pincode)) {
    return fail('Validation', 'BIZ_PIN_BAD', 'PIN must be 6 digits.', 'Business was not updated.');
  }
  if (patch.phone !== undefined && !isPhone(patch.phone)) {
    return fail('Validation', 'BIZ_PHONE_BAD', 'Invalid phone.', 'Business was not updated.');
  }
  if (patch.panNumber !== undefined && patch.panNumber && !isPan(patch.panNumber)) {
    return fail('Validation', 'BIZ_PAN_BAD', 'Invalid PAN.', 'Business was not updated.');
  }
  if (patch.gstNumber !== undefined) {
    if (!isGstin(patch.gstNumber)) {
      return fail('Validation', 'BIZ_GST_BAD', 'Invalid GSTIN.', 'Business was not updated.');
    }
    const gst = normalizeGstin(patch.gstNumber);
    const gstDup = await db.businesses
      .filter((b) => b.id !== params.business.id && normalizeGstin(b.gstNumber ?? '') === gst)
      .count();
    if (gstDup) {
      return fail('Duplicate', 'BIZ_GST_DUP', 'GSTIN is already registered.', 'Business was not updated.');
    }
  }
  if (patch.drugLicenseNumber !== undefined && !lockedIds) {
    if (!isLicenseNo(patch.drugLicenseNumber)) {
      return fail('Validation', 'BIZ_DL_BAD', 'Invalid drug license.', 'Business was not updated.');
    }
    const dlKey = patch.drugLicenseNumber.trim().toLowerCase();
    const dlDup = await db.businesses
      .filter(
        (b) =>
          b.id !== params.business.id && (b.drugLicenseNumber ?? '').trim().toLowerCase() === dlKey,
      )
      .count();
    if (dlDup) {
      return fail('Duplicate', 'BIZ_DL_DUP', 'Drug license number is already registered.', 'Business was not updated.');
    }
  }
  if (patch.upiId !== undefined && patch.upiId && !isUpi(patch.upiId)) {
    return fail('Validation', 'BIZ_UPI_BAD', 'Invalid UPI.', 'Business was not updated.');
  }
  if (patch.bankIfsc !== undefined && patch.bankIfsc && !isIfsc(patch.bankIfsc)) {
    return fail('Validation', 'BIZ_IFSC_BAD', 'Invalid IFSC.', 'Business was not updated.');
  }
  if (params.business.type === 'Stockist' && patch.servicePins !== undefined && !patch.servicePins.length) {
    return fail('Validation', 'BIZ_PINS_REQUIRED', 'Add at least one serviceable PIN.', 'Business was not updated.');
  }

  const ts = new Date().toISOString();
  const next: Partial<Business> = { updatedAt: ts };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.legalName !== undefined) next.legalName = patch.legalName.trim() || undefined;
  if (patch.pharmacyType !== undefined) next.pharmacyType = patch.pharmacyType;
  if (patch.panNumber !== undefined) next.panNumber = patch.panNumber ? normalizePan(patch.panNumber) : undefined;
  if (patch.phone !== undefined) next.phone = patch.phone.trim();
  if (patch.email !== undefined) next.email = patch.email.trim().toLowerCase();
  if (patch.city !== undefined) next.city = patch.city.trim();
  if (patch.state !== undefined) next.state = patch.state.trim();
  if (patch.pincode !== undefined) next.pincode = patch.pincode.trim();
  if (patch.address !== undefined) next.address = patch.address.trim();
  if (patch.gstNumber !== undefined) next.gstNumber = normalizeGstin(patch.gstNumber);
  if (patch.drugLicenseNumber !== undefined) next.drugLicenseNumber = patch.drugLicenseNumber.trim();
  if (patch.upiId !== undefined) next.upiId = patch.upiId.trim() || undefined;
  if (patch.bankAccountNumber !== undefined) next.bankAccountNumber = patch.bankAccountNumber.trim() || undefined;
  if (patch.bankIfsc !== undefined) next.bankIfsc = patch.bankIfsc.trim().toUpperCase() || undefined;
  if (patch.bankName !== undefined) next.bankName = patch.bankName.trim() || undefined;
  if (patch.accountHolderName !== undefined) next.accountHolderName = patch.accountHolderName.trim() || undefined;
  if (patch.servicePins !== undefined) next.servicePins = patch.servicePins;
  if (patch.holidays !== undefined) next.holidays = patch.holidays;
  if (patch.preferences !== undefined) next.preferences = patch.preferences;
  if (patch.locations !== undefined) next.locations = patch.locations;

  await db.businesses.update(params.business.id, next);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Business',
    entityId: params.business.id,
    action: 'business.updateProfile',
    after: next,
  });
  return ok((await db.businesses.get(params.business.id))!);
}

export async function addBusinessDocument(params: {
  actor: User;
  business: Business;
  kind: VerificationDocument['kind'];
  label: string;
  licenseNumber?: string;
  file: File;
}): Promise<Result<VerificationDocument>> {
  if (params.actor.businessId !== params.business.id) {
    return fail('Permission', 'PERM_DENIED', 'You can only upload documents for your own business.', 'Document was not uploaded.');
  }
  const perm = assertCan(params.actor, params.business, 'verification.submit');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Document was not uploaded.');
  const stored = await storeFile({ actor: params.actor, file: params.file });
  if (!stored.ok) return stored;
  const doc: VerificationDocument = {
    kind: params.kind,
    label: params.label,
    fileId: stored.data.id,
    licenseNumber: params.licenseNumber?.trim() || undefined,
  };
  const verifications = await db.verifications.where('businessId').equals(params.business.id).reverse().sortBy('updatedAt');
  const current = verifications[0];
  if (current) {
    const documents = [...(current.documents ?? []), doc];
    await db.verifications.update(current.id, {
      documents,
      documentIds: documents.map((d) => d.fileId),
      updatedAt: new Date().toISOString(),
    });
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Business',
    entityId: params.business.id,
    action: 'business.addDocument',
    after: { fileId: doc.fileId, kind: doc.kind },
  });
  return ok(doc);
}

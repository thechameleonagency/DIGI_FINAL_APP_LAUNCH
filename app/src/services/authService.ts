import type { Address, Business, BusinessType, User, VerificationDocKind, VerificationDocument } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { can, normalizeRoleForBusiness } from '../domain/permissions';
import { DEMO_OTP, hashPassword, randomSalt, verifyPassword } from '../domain/utils/crypto';
import { newId } from '../domain/utils/ids';
import {
  isEmail,
  isGstin,
  isIfsc,
  isLicenseNo,
  isPan,
  isPhone,
  isPin,
  isUpi,
  normalizeGstin,
  normalizePan,
  normalizePhone,
} from '../domain/utils/validation';
import { db } from '../data/db';
import { defaultPlatformSettings } from '../data/seed';
import { writeAudit } from './audit';
import { storeFile } from './fileService';
import { emitNotification, notifyBusinessUsers } from './notifications';
import { nowIso } from '../domain/utils/clock';

export type RegistrationDocInput = {
  kind: VerificationDocKind;
  label: string;
  licenseNumber?: string;
  file: { name: string; mime: string; size: number; dataUrl: string };
};

/** Platform staff roles — SuperAdmin / SupportManager only. */
export function isPlatformStaffRole(role: string): boolean {
  return role === 'SuperAdmin' || role === 'SupportManager';
}

/** True when no platform staff exist yet (first-boot SuperAdmin setup is allowed). */
export async function needsFirstSuperAdmin(): Promise<boolean> {
  const count = await db.users.filter((u) => isPlatformStaffRole(u.role)).count();
  return count === 0;
}

/**
 * One-time empty-state bootstrap: create Platform business + first SuperAdmin.
 * Does not seed demo data and does not open a session — caller must sign in.
 */
export async function createFirstSuperAdmin(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<Result<{ user: User; business: Business }>> {
  if (!(await needsFirstSuperAdmin())) {
    return fail(
      'BusinessRule',
      'AUTH_PLATFORM_EXISTS',
      'A platform admin already exists. Sign in or ask an existing SuperAdmin to invite SupportManager staff.',
      'First SuperAdmin was not created.',
    );
  }
  if (!input.name.trim()) {
    return fail('Validation', 'AUTH_REQUIRED', 'Name is required.', 'First SuperAdmin was not created.');
  }
  if (!isEmail(input.email)) {
    return fail('Validation', 'AUTH_EMAIL_BAD', 'Enter a valid email address.', 'First SuperAdmin was not created.', {
      fields: { email: 'Invalid email' },
    });
  }
  if (!isPhone(input.phone)) {
    return fail('Validation', 'AUTH_PHONE_BAD', 'Enter a valid 10-digit Indian mobile number.', 'First SuperAdmin was not created.', {
      fields: { phone: 'Invalid phone' },
    });
  }
  if (input.password.length < 6) {
    return fail('Validation', 'AUTH_WEAK_PASSWORD', 'Password must be at least 6 characters.', 'First SuperAdmin was not created.', {
      fields: { password: 'Min 6 characters' },
    });
  }

  const phone = normalizePhone(input.phone);
  const email = input.email.trim().toLowerCase();
  const emailExists = await db.users.filter((u) => u.email.toLowerCase() === email).count();
  if (emailExists) {
    return fail('Duplicate', 'AUTH_EMAIL_DUP', 'An account with this email already exists.', 'First SuperAdmin was not created.');
  }
  const phoneExists = await db.users.filter((u) => normalizePhone(u.phone) === phone).count();
  if (phoneExists) {
    return fail('Duplicate', 'AUTH_PHONE_DUP', 'An account with this phone already exists.', 'First SuperAdmin was not created.');
  }

  const ts = nowIso();
  const salt = randomSalt();
  const passwordHash = await hashPassword(input.password, salt);

  const existingPlatform = await db.businesses.filter((b) => b.type === 'Platform').first();
  const businessId = existingPlatform?.id ?? newId();
  const userId = newId();

  const business: Business = existingPlatform
    ? {
        ...existingPlatform,
        ownerUserId: existingPlatform.ownerUserId || userId,
        updatedAt: ts,
      }
    : {
        id: businessId,
        type: 'Platform',
        name: 'DigiSwasthya Platform',
        phone,
        email,
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        address: 'Platform operations',
        accountStatus: 'Active',
        verificationStatus: 'Approved',
        ownerUserId: userId,
        createdAt: ts,
        updatedAt: ts,
      };

  const user: User = {
    id: userId,
    businessId,
    name: input.name.trim(),
    email,
    phone,
    role: 'SuperAdmin',
    status: 'Active',
    passwordSalt: salt,
    passwordHash,
    createdAt: ts,
    updatedAt: ts,
  };

  await db.transaction('rw', db.businesses, db.users, db.platformSettings, async () => {
    const settings = await db.platformSettings.get('platform');
    if (!settings) {
      await db.platformSettings.put(defaultPlatformSettings());
    }
    await db.businesses.put(business);
    await db.users.add(user);
  });

  await writeAudit({
    actorId: user.id,
    actorName: user.name,
    businessId,
    entityType: 'User',
    entityId: user.id,
    action: 'auth.firstSuperAdmin.create',
    after: { email: user.email, role: user.role },
  });

  return ok({ user, business });
}

export async function login(emailOrPhone: string, password: string): Promise<Result<{ user: User; business: Business }>> {
  const key = emailOrPhone.trim().toLowerCase();
  const user =
    (await db.users.filter((u) => u.email.toLowerCase() === key || u.phone.replace(/\s/g, '') === key.replace(/\s/g, '')).first()) ??
    null;
  if (!user) {
    return fail('Validation', 'AUTH_INVALID', 'Invalid email/phone or password.', 'You were not signed in.');
  }
  if (user.status === 'Suspended' || user.status === 'Removed') {
    return fail('Permission', 'AUTH_USER_INACTIVE', 'This user account is not active.', 'You were not signed in.');
  }
  if (user.status === 'Invited') {
    return fail('Validation', 'AUTH_INVITE_PENDING', 'Accept your invite and set a password first.', 'You were not signed in.');
  }
  const valid = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!valid) {
    return fail('Validation', 'AUTH_INVALID', 'Invalid email/phone or password.', 'You were not signed in.', { retrySafe: true });
  }
  const business = await db.businesses.get(user.businessId);
  if (!business) {
    return fail('System', 'AUTH_NO_BUSINESS', 'Business record missing.', 'You were not signed in.');
  }
  if (business.accountStatus === 'Deactivated') {
    return fail('Permission', 'AUTH_BIZ_INACTIVE', 'This business is deactivated.', 'You were not signed in.');
  }
  await db.users.update(user.id, { lastLoginAt: nowIso() });
  return ok({ user, business });
}

export async function registerBusiness(input: {
  type: 'Pharmacy' | 'Stockist';
  ownerName: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  password: string;
  businessName: string;
  gstNumber: string;
  drugLicenseNumber: string;
  panNumber?: string;
  pharmacyType?: string;
  city: string;
  state: string;
  pincode: string;
  address: string;
  upiId?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  accountHolderName?: string;
  servicePins?: string[];
  documents?: RegistrationDocInput[];
  phoneVerified?: boolean;
}): Promise<Result<{ user: User; business: Business }>> {
  if (!input.ownerName.trim()) {
    return fail('Validation', 'AUTH_REQUIRED', 'Owner name is required.', 'Registration was not completed.');
  }
  if (!isEmail(input.email)) {
    return fail('Validation', 'AUTH_EMAIL_BAD', 'Enter a valid email address.', 'Registration was not completed.', {
      fields: { email: 'Invalid email' },
    });
  }
  if (!isPhone(input.phone)) {
    return fail('Validation', 'AUTH_PHONE_BAD', 'Enter a valid 10-digit Indian mobile number.', 'Registration was not completed.', {
      fields: { phone: 'Invalid phone' },
    });
  }
  if (!input.phoneVerified) {
    return fail('Validation', 'AUTH_PHONE_UNVERIFIED', 'Verify your phone with the demo OTP first.', 'Registration was not completed.');
  }
  if (input.alternatePhone?.trim() && !isPhone(input.alternatePhone)) {
    return fail('Validation', 'AUTH_ALT_PHONE_BAD', 'Alternate/WhatsApp phone is invalid.', 'Registration was not completed.', {
      fields: { alternatePhone: 'Invalid phone' },
    });
  }
  if (input.password.length < 6) {
    return fail('Validation', 'AUTH_WEAK_PASSWORD', 'Password must be at least 6 characters.', 'Registration was not completed.', {
      fields: { password: 'Min 6 characters' },
    });
  }
  if (!input.businessName.trim()) {
    return fail('Validation', 'AUTH_REQUIRED', 'Business name is required.', 'Registration was not completed.');
  }
  if (!isGstin(input.gstNumber)) {
    return fail('Validation', 'BIZ_GST_BAD', 'GSTIN format is invalid.', 'Registration was not completed.', {
      fields: { gstNumber: 'Invalid GSTIN' },
    });
  }
  if (!isLicenseNo(input.drugLicenseNumber)) {
    return fail('Validation', 'BIZ_DL_BAD', 'Drug license number looks invalid.', 'Registration was not completed.');
  }
  if (input.panNumber && !isPan(input.panNumber)) {
    return fail('Validation', 'BIZ_PAN_BAD', 'PAN format is invalid.', 'Registration was not completed.');
  }
  if (!input.state.trim() || !input.city.trim() || !input.address.trim()) {
    return fail('Validation', 'AUTH_REQUIRED', 'Address fields are required.', 'Registration was not completed.');
  }
  if (!isPin(input.pincode)) {
    return fail('Validation', 'BIZ_PIN_BAD', 'PIN code must be 6 digits.', 'Registration was not completed.');
  }
  if (input.upiId && !isUpi(input.upiId)) {
    return fail('Validation', 'BIZ_UPI_BAD', 'UPI ID format is invalid.', 'Registration was not completed.');
  }
  if (input.type === 'Stockist' && !(input.servicePins?.length)) {
    return fail('Validation', 'BIZ_PINS_REQUIRED', 'Add at least one serviceable PIN.', 'Registration was not completed.');
  }
  const requiredKinds: VerificationDocKind[] =
    input.type === 'Stockist' ? ['DrugLicense', 'GstinCert', 'WholesaleLicense'] : ['DrugLicense', 'GstinCert', 'PharmacyCert'];
  const docs = input.documents ?? [];
  for (const kind of requiredKinds) {
    if (!docs.some((d) => d.kind === kind && d.file?.dataUrl)) {
      return fail('Validation', 'BIZ_DOCS_REQUIRED', `Upload required document: ${kind}.`, 'Registration was not completed.');
    }
  }
  const bankRequired = input.type === 'Stockist';
  const bankStarted = !!(input.bankAccountNumber || input.bankIfsc || input.bankName || input.accountHolderName);
  if (bankRequired || bankStarted) {
    if (!input.bankAccountNumber?.trim() || !input.bankIfsc || !input.bankName?.trim() || !input.accountHolderName?.trim()) {
      return fail('Validation', 'BIZ_BANK_REQUIRED', 'Complete bank account details.', 'Registration was not completed.');
    }
    if (!isIfsc(input.bankIfsc)) {
      return fail('Validation', 'BIZ_IFSC_BAD', 'IFSC format is invalid.', 'Registration was not completed.');
    }
  }

  const phone = normalizePhone(input.phone);
  const emailExists = await db.users.filter((u) => u.email.toLowerCase() === input.email.trim().toLowerCase()).count();
  if (emailExists) {
    return fail('Duplicate', 'AUTH_EMAIL_DUP', 'An account with this email already exists.', 'Registration was not completed.');
  }
  const phoneExists = await db.users.filter((u) => normalizePhone(u.phone) === phone).count();
  if (phoneExists) {
    return fail('Duplicate', 'AUTH_PHONE_DUP', 'An account with this phone already exists.', 'Registration was not completed.');
  }
  const gst = normalizeGstin(input.gstNumber);
  const gstDup = await db.businesses.where('gstNumber').equals(gst).count();
  if (gstDup) {
    return fail('Duplicate', 'BIZ_GST_DUP', 'GSTIN is already registered.', 'Registration was not completed.');
  }
  const dlKey = input.drugLicenseNumber.trim().toLowerCase();
  const dlDup = await db.businesses
    .filter((b) => (b.drugLicenseNumber ?? '').trim().toLowerCase() === dlKey)
    .count();
  if (dlDup) {
    return fail('Duplicate', 'BIZ_DL_DUP', 'Drug license number is already registered.', 'Registration was not completed.');
  }

  const businessId = newId();
  const userId = newId();
  const salt = randomSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const ts = nowIso();

  const business: Business = {
    id: businessId,
    type: input.type,
    name: input.businessName.trim(),
    gstNumber: gst,
    drugLicenseNumber: input.drugLicenseNumber.trim(),
    panNumber: input.panNumber ? normalizePan(input.panNumber) : undefined,
    pharmacyType: input.type === 'Pharmacy' ? input.pharmacyType : undefined,
    phone,
    alternatePhone: input.alternatePhone?.trim() ? normalizePhone(input.alternatePhone) : undefined,
    email: input.email.trim().toLowerCase(),
    city: input.city.trim(),
    state: input.state.trim(),
    pincode: input.pincode.trim(),
    address: input.address.trim(),
    accountStatus: 'PendingActivation',
    verificationStatus: 'Submitted',
    ownerUserId: userId,
    upiId: input.upiId?.trim() || undefined,
    bankAccountNumber: input.bankAccountNumber?.trim() || undefined,
    bankIfsc: input.bankIfsc?.trim().toUpperCase() || undefined,
    bankName: input.bankName?.trim() || undefined,
    accountHolderName: input.accountHolderName?.trim() || undefined,
    servicePins: input.servicePins?.length ? input.servicePins : undefined,
    createdAt: ts,
    updatedAt: ts,
  };

  const user: User = {
    id: userId,
    businessId,
    name: input.ownerName.trim(),
    email: input.email.trim().toLowerCase(),
    phone,
    role: input.type === 'Stockist' ? 'Stockist' : 'Pharmacist',
    status: 'Active',
    passwordSalt: salt,
    passwordHash,
    createdAt: ts,
    updatedAt: ts,
  };

  const storedDocs: VerificationDocument[] = [];
  for (const d of docs) {
    const stored = await storeFile({ actor: { id: userId }, file: d.file });
    if (!stored.ok) return stored;
    storedDocs.push({
      kind: d.kind,
      fileId: stored.data.id,
      licenseNumber: d.licenseNumber?.trim() || undefined,
      label: d.label,
    });
  }

  await db.transaction('rw', db.businesses, db.users, db.verifications, db.catalogues, async () => {
    await db.businesses.add(business);
    await db.users.add(user);
    await db.verifications.add({
      id: newId(),
      businessId,
      status: 'Submitted',
      submittedAt: ts,
      documentIds: storedDocs.map((d) => d.fileId),
      documents: storedDocs,
      decisionHistory: [{ from: 'NotStarted', to: 'Submitted', at: ts, actorId: userId }],
      createdAt: ts,
      updatedAt: ts,
    });
    if (input.type === 'Stockist') {
      await db.catalogues.add({ id: newId(), stockistId: businessId, status: 'Active', updatedAt: ts });
    }
  });

  await emitNotification({
    userId,
    businessId,
    code: 'N-001',
    vars: { businessType: input.type, businessName: business.name },
  });
  await emitNotification({
    userId,
    businessId,
    code: 'N-002',
    vars: { businessName: business.name },
  });

  const admins = await db.users.filter((u) => ['SuperAdmin', 'SupportManager'].includes(u.role)).toArray();
  for (const a of admins) {
    await emitNotification({
      userId: a.id,
      businessId: a.businessId,
      code: 'N-002',
      vars: { businessName: business.name },
      entityType: 'Business',
      entityId: businessId,
    });
  }

  if (input.type === 'Pharmacy') {
    const { matchPartnerInvitesOnRegistration } = await import('./partnerInviteService');
    await matchPartnerInvitesOnRegistration({
      pharmacyId: businessId,
      phone,
      gstNumber: business.gstNumber,
    });
  }

  return ok({ user, business });
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<Result<true>> {
  if (otp !== DEMO_OTP) {
    return fail('Validation', 'AUTH_OTP_BAD', 'Invalid OTP.', 'Password was not reset.', { retrySafe: true });
  }
  if (newPassword.length < 6) {
    return fail('Validation', 'AUTH_WEAK_PASSWORD', 'Password must be at least 6 characters.', 'Password was not reset.');
  }
  const user = await db.users.filter((u) => u.email.toLowerCase() === email.trim().toLowerCase()).first();
  if (!user) {
    return fail('NotFound', 'AUTH_USER_MISSING', 'No account found for this email.', 'Password was not reset.');
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(newPassword, salt);
  await db.users.update(user.id, { passwordSalt: salt, passwordHash, updatedAt: nowIso() });
  await emitNotification({ userId: user.id, businessId: user.businessId, code: 'N-051', vars: {} });
  return ok(true);
}

export async function acceptInvite(token: string, password: string): Promise<Result<{ user: User; business: Business }>> {
  const user = await db.users.where('inviteToken').equals(token).first();
  if (!user) return fail('NotFound', 'INVITE_BAD', 'Invite link is invalid.', 'Invite was not accepted.');
  if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date(nowIso())) {
    return fail('BusinessRule', 'INVITE_EXPIRED', 'Invite has expired.', 'Invite was not accepted.');
  }
  if (password.length < 6) {
    return fail('Validation', 'AUTH_WEAK_PASSWORD', 'Password must be at least 6 characters.', 'Invite was not accepted.');
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  await db.users.update(user.id, {
    passwordSalt: salt,
    passwordHash,
    status: 'Active',
    inviteToken: undefined,
    inviteExpiresAt: undefined,
    updatedAt: nowIso(),
  });
  const updated = (await db.users.get(user.id))!;
  const business = (await db.businesses.get(user.businessId))!;
  return ok({ user: updated, business });
}

/** Preview invite context for the accept page (no password yet). */
export async function getInvitePreview(
  token: string,
): Promise<Result<{ name: string; email: string; role: string; businessName: string; businessType: string; expiresAt?: string }>> {
  const user = await db.users.where('inviteToken').equals(token).first();
  if (!user || user.status !== 'Invited') {
    return fail('NotFound', 'INVITE_BAD', 'Invite link is invalid.', 'Invite cannot be opened.');
  }
  if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date(nowIso())) {
    return fail('BusinessRule', 'INVITE_EXPIRED', 'Invite has expired.', 'Ask your owner to resend the invite.');
  }
  const business = await db.businesses.get(user.businessId);
  if (!business) return fail('NotFound', 'BIZ_MISSING', 'Business missing for this invite.', 'Invite cannot be opened.');
  return ok({
    name: user.name,
    email: user.email,
    role: user.role,
    businessName: business.name,
    businessType: business.type,
    expiresAt: user.inviteExpiresAt,
  });
}

export function assertCan(user: User, business: Business, action: Parameters<typeof can>[0]) {
  return can(action, {
    businessType: business.type as BusinessType,
    role: normalizeRoleForBusiness(user.role, business.type as BusinessType),
    accountStatus: business.accountStatus,
    verificationStatus: business.verificationStatus,
    overrides: user.permissionOverrides,
    actorBusinessId: business.id,
    impersonationReadOnly: user.impersonationReadOnly,
  });
}

export async function changePassword(params: {
  actor: User;
  currentPassword: string;
  newPassword: string;
}): Promise<Result<true>> {
  if (params.newPassword.length < 6) {
    return fail('Validation', 'AUTH_WEAK_PASSWORD', 'Password must be at least 6 characters.', 'Password was not changed.');
  }
  const valid = await verifyPassword(params.currentPassword, params.actor.passwordSalt, params.actor.passwordHash);
  if (!valid) {
    return fail('Validation', 'AUTH_INVALID', 'Current password is incorrect.', 'Password was not changed.');
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(params.newPassword, salt);
  await db.users.update(params.actor.id, { passwordSalt: salt, passwordHash, updatedAt: nowIso() });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.actor.businessId,
    entityType: 'User',
    entityId: params.actor.id,
    action: 'auth.changePassword',
  });
  return ok(true);
}

export async function updateProfile(params: {
  actor: User;
  name?: string;
  phone?: string;
}): Promise<Result<User>> {
  const patch: Partial<User> = { updatedAt: nowIso() };
  if (params.name?.trim()) patch.name = params.name.trim();
  if (params.phone?.trim()) patch.phone = params.phone.trim();
  await db.users.update(params.actor.id, patch);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.actor.businessId,
    entityType: 'User',
    entityId: params.actor.id,
    action: 'auth.updateProfile',
    after: patch,
  });
  return ok((await db.users.get(params.actor.id))!);
}

export async function inviteStaff(params: {
  actor: User;
  business: Business;
  name: string;
  email: string;
  phone: string;
  role: User['role'];
}): Promise<Result<User>> {
  const perm = assertCan(params.actor, params.business, 'staff.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Staff was not invited.');
  if (params.role === 'Pharmacist' || params.role === 'Stockist' || params.role === 'SuperAdmin') {
    return fail(
      'Permission',
      'STAFF_PRIMARY_INVITE',
      'Cannot invite as the primary business role. Invite DeliveryStaff (or SupportManager on platform) instead.',
      'Staff was not invited.',
    );
  }
  if (params.business.type === 'Pharmacy' && params.role !== 'DeliveryStaff') {
    return fail('Validation', 'STAFF_ROLE', 'Pharmacy staff invites are DeliveryStaff only.', 'Staff was not invited.');
  }
  if (params.business.type === 'Stockist' && params.role !== 'DeliveryStaff') {
    return fail('Validation', 'STAFF_ROLE', 'Stockist staff invites are DeliveryStaff only.', 'Staff was not invited.');
  }
  if (params.business.type === 'Platform' && params.role !== 'SupportManager') {
    return fail('Validation', 'STAFF_ROLE', 'Platform invites are SupportManager only.', 'Staff was not invited.');
  }
  if (!params.name.trim() || !params.email.trim() || !params.phone.trim()) {
    return fail('Validation', 'STAFF_FIELDS', 'Name, email, and phone are required.', 'Staff was not invited.');
  }
  const exists = await db.users.filter((u) => u.email.toLowerCase() === params.email.trim().toLowerCase()).count();
  if (exists) return fail('Duplicate', 'AUTH_EMAIL_DUP', 'Email already in use.', 'Staff was not invited.');

  const settings = await db.platformSettings.get('platform');
  const token = newId();
  const salt = randomSalt();
  const passwordHash = await hashPassword('Invite@2026', salt);
  const ts = nowIso();
  const user: User = {
    id: newId(),
    businessId: params.business.id,
    name: params.name.trim(),
    email: params.email.trim().toLowerCase(),
    phone: params.phone.trim(),
    role: params.role,
    status: 'Invited',
    passwordSalt: salt,
    passwordHash,
    inviteToken: token,
    inviteExpiresAt: new Date(new Date(nowIso()).getTime() + (settings?.inviteTtlDays ?? 7) * 86400000).toISOString(),
    createdAt: ts,
    updatedAt: ts,
  };
  await db.users.add(user);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'User',
    entityId: user.id,
    action: 'staff.invite',
    after: { email: user.email, role: user.role },
  });
  await emitNotification({
    userId: user.id,
    businessId: params.business.id,
    code: 'N-007',
    vars: { role: user.role, businessName: params.business.name },
  });
  return ok(user);
}

export async function upsertDeliveryAddress(params: {
  actor: User;
  business: Business;
  address: Omit<Address, 'id'> & { id?: string };
}): Promise<Result<Address>> {
  const perm = assertCan(params.actor, params.business, 'settings.manage');
  if (!perm.allow) {
    // Owners/staff who can place orders may also maintain addresses used at checkout
    const orderPerm = assertCan(params.actor, params.business, 'order.place');
    if (!orderPerm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Address was not saved.');
  }
  const biz = await db.businesses.get(params.business.id);
  if (!biz) return fail('NotFound', 'BIZ_MISSING', 'Business not found.', 'Address was not saved.');
  const label = params.address.label?.trim();
  const line1 = params.address.line1?.trim();
  const city = params.address.city?.trim();
  const state = params.address.state?.trim();
  const pincode = params.address.pincode?.trim();
  if (!label || !line1 || !city || !state || !pincode) {
    return fail('Validation', 'ADDR_FIELDS', 'Label, line1, city, state, and pincode are required.', 'Address was not saved.');
  }
  const list = [...(biz.deliveryAddresses ?? [])];
  const id = params.address.id ?? newId();
  const next: Address = {
    id,
    label,
    line1,
    line2: params.address.line2?.trim() || undefined,
    city,
    state,
    pincode,
    isDefault: !!params.address.isDefault,
  };
  const idx = list.findIndex((a) => a.id === id);
  if (next.isDefault) {
    for (const a of list) a.isDefault = false;
  }
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  if (!list.some((a) => a.isDefault) && list[0]) list[0].isDefault = true;
  const ts = nowIso();
  await db.businesses.update(biz.id, { deliveryAddresses: list, updatedAt: ts });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: biz.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.address.upsert',
    after: { addressId: id, label },
  });
  return ok(next);
}

export async function removeDeliveryAddress(params: {
  actor: User;
  business: Business;
  addressId: string;
}): Promise<Result<true>> {
  const orderPerm = assertCan(params.actor, params.business, 'order.place');
  if (!orderPerm.allow) return fail('Permission', 'PERM_DENIED', orderPerm.reason!, 'Address was not removed.');
  const biz = await db.businesses.get(params.business.id);
  if (!biz) return fail('NotFound', 'BIZ_MISSING', 'Business not found.', 'Address was not removed.');
  let list = (biz.deliveryAddresses ?? []).filter((a) => a.id !== params.addressId);
  if (list.length && !list.some((a) => a.isDefault)) list = list.map((a, i) => ({ ...a, isDefault: i === 0 }));
  await db.businesses.update(biz.id, { deliveryAddresses: list, updatedAt: nowIso() });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: biz.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.address.remove',
    after: { addressId: params.addressId },
  });
  return ok(true);
}

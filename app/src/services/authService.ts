import type { Business, BusinessType, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { can } from '../domain/permissions';
import { DEMO_OTP, hashPassword, randomSalt, verifyPassword } from '../domain/utils/crypto';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { emitNotification, notifyBusinessUsers } from './notifications';

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
  await db.users.update(user.id, { lastLoginAt: new Date().toISOString() });
  return ok({ user, business });
}

export async function registerBusiness(input: {
  type: 'Pharmacy' | 'Stockist';
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  businessName: string;
  gstNumber: string;
  drugLicenseNumber: string;
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
}): Promise<Result<{ user: User; business: Business }>> {
  if (input.password.length < 6) {
    return fail('Validation', 'AUTH_WEAK_PASSWORD', 'Password must be at least 6 characters.', 'Registration was not completed.', {
      fields: { password: 'Min 6 characters' },
    });
  }
  const emailExists = await db.users.filter((u) => u.email.toLowerCase() === input.email.trim().toLowerCase()).count();
  if (emailExists) {
    return fail('Duplicate', 'AUTH_EMAIL_DUP', 'An account with this email already exists.', 'Registration was not completed.');
  }
  const gstDup = await db.businesses.where('gstNumber').equals(input.gstNumber.trim().toUpperCase()).count();
  if (gstDup) {
    return fail('Duplicate', 'BIZ_GST_DUP', 'GSTIN is already registered.', 'Registration was not completed.');
  }

  const businessId = newId();
  const userId = newId();
  const salt = randomSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const ts = new Date().toISOString();

  const business: Business = {
    id: businessId,
    type: input.type,
    name: input.businessName.trim(),
    gstNumber: input.gstNumber.trim().toUpperCase(),
    drugLicenseNumber: input.drugLicenseNumber.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    city: input.city.trim(),
    state: input.state.trim(),
    pincode: input.pincode.trim(),
    address: input.address.trim(),
    accountStatus: 'Active',
    verificationStatus: 'Submitted',
    ownerUserId: userId,
    upiId: input.upiId,
    bankAccountNumber: input.bankAccountNumber,
    bankIfsc: input.bankIfsc,
    bankName: input.bankName,
    accountHolderName: input.accountHolderName,
    servicePins: input.servicePins,
    createdAt: ts,
    updatedAt: ts,
  };

  const user: User = {
    id: userId,
    businessId,
    name: input.ownerName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    role: 'Owner',
    status: 'Active',
    passwordSalt: salt,
    passwordHash,
    createdAt: ts,
    updatedAt: ts,
  };

  await db.transaction('rw', db.businesses, db.users, db.verifications, db.catalogues, async () => {
    await db.businesses.add(business);
    await db.users.add(user);
    await db.verifications.add({
      id: newId(),
      businessId,
      status: 'Submitted',
      submittedAt: ts,
      documentIds: [],
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

  const admins = await db.users.filter((u) => ['Admin', 'SuperAdmin', 'SupportAgent'].includes(u.role)).toArray();
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
  await db.users.update(user.id, { passwordSalt: salt, passwordHash, updatedAt: new Date().toISOString() });
  await emitNotification({ userId: user.id, businessId: user.businessId, code: 'N-051', vars: {} });
  return ok(true);
}

export async function acceptInvite(token: string, password: string): Promise<Result<{ user: User; business: Business }>> {
  const user = await db.users.where('inviteToken').equals(token).first();
  if (!user) return fail('NotFound', 'INVITE_BAD', 'Invite link is invalid.', 'Invite was not accepted.');
  if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date()) {
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
    updatedAt: new Date().toISOString(),
  });
  const updated = (await db.users.get(user.id))!;
  const business = (await db.businesses.get(user.businessId))!;
  return ok({ user: updated, business });
}

export function assertCan(user: User, business: Business, action: Parameters<typeof can>[0]) {
  return can(action, {
    businessType: business.type as BusinessType,
    role: user.role,
    accountStatus: business.accountStatus,
    verificationStatus: business.verificationStatus,
    overrides: user.permissionOverrides,
    actorBusinessId: business.id,
  });
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
  if (params.role === 'Owner') {
    return fail('Permission', 'STAFF_OWNER_INVITE', 'Cannot invite as Owner. Transfer ownership instead.', 'Staff was not invited.');
  }
  const exists = await db.users.filter((u) => u.email.toLowerCase() === params.email.trim().toLowerCase()).count();
  if (exists) return fail('Duplicate', 'AUTH_EMAIL_DUP', 'Email already in use.', 'Staff was not invited.');

  const settings = await db.platformSettings.get('platform');
  const token = newId();
  const salt = randomSalt();
  const passwordHash = await hashPassword('Invite@2026', salt);
  const ts = new Date().toISOString();
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
    inviteExpiresAt: new Date(Date.now() + (settings?.inviteTtlDays ?? 7) * 86400000).toISOString(),
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

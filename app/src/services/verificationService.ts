import type { Business, User, Verification, VerificationStatus } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

async function getCurrentVerification(businessId: string): Promise<Verification | undefined> {
  return db.verifications.where('businessId').equals(businessId).reverse().sortBy('updatedAt').then((rows) => rows[0]);
}

export async function submitVerification(actor: User, business: Business): Promise<Result<Verification>> {
  const perm = assertCan(actor, business, 'verification.submit');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Verification was not submitted.');
  const current = await getCurrentVerification(business.id);
  const from = (current?.status ?? 'NotStarted') as VerificationStatus;
  const to: VerificationStatus = from === 'DocumentsRequested' || from === 'Rejected' || from === 'NotStarted' ? 'Submitted' : from;
  if (from !== to) {
    const t = machines.verification(from, to);
    if (!t.ok) return fail('StateConflict', 'VER_BAD_STATE', t.reason!, 'Verification was not submitted.');
  }
  const ts = new Date().toISOString();
  if (!current) {
    const v: Verification = {
      id: crypto.randomUUID(),
      businessId: business.id,
      status: 'Submitted',
      submittedAt: ts,
      documentIds: [],
      decisionHistory: [{ from: 'NotStarted', to: 'Submitted', at: ts, actorId: actor.id }],
      createdAt: ts,
      updatedAt: ts,
    };
    await db.verifications.add(v);
    await db.businesses.update(business.id, { verificationStatus: 'Submitted', updatedAt: ts });
    return ok(v);
  }
  await db.verifications.update(current.id, {
    status: 'Submitted',
    submittedAt: ts,
    updatedAt: ts,
    decisionHistory: [...current.decisionHistory, { from, to: 'Submitted', at: ts, actorId: actor.id }],
  });
  await db.businesses.update(business.id, { verificationStatus: 'Submitted', updatedAt: ts });
  return ok((await db.verifications.get(current.id))!);
}

export async function adminReviewVerification(params: {
  actor: User;
  business: Business;
  verificationId: string;
  decision: 'UnderReview' | 'Approved' | 'Rejected' | 'DocumentsRequested';
  reason?: string;
  note?: string;
}): Promise<Result<Verification>> {
  const perm = assertCan(params.actor, params.business, 'verification.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Verification decision was not saved.');

  const v = await db.verifications.get(params.verificationId);
  if (!v) return fail('NotFound', 'VER_MISSING', 'Verification not found.', 'Verification decision was not saved.');

  const t = machines.verification(v.status, params.decision);
  if (!t.ok) return fail('StateConflict', 'VER_BAD_STATE', t.reason!, 'Verification decision was not saved.');
  if ((params.decision === 'Rejected' || params.decision === 'DocumentsRequested') && !params.reason && !params.note) {
    return fail('Validation', 'VER_REASON', 'Reason/note is required.', 'Verification decision was not saved.');
  }

  const ts = new Date().toISOString();
  const patch: Partial<Verification> = {
    status: params.decision,
    reviewedAt: ts,
    reviewerId: params.actor.id,
    updatedAt: ts,
    decisionHistory: [...v.decisionHistory, { from: v.status, to: params.decision, at: ts, actorId: params.actor.id, reason: params.reason }],
  };
  if (params.decision === 'Rejected') patch.rejectReason = params.reason;
  if (params.decision === 'DocumentsRequested') patch.requestDocsNote = params.note ?? params.reason;

  await db.transaction('rw', db.verifications, db.businesses, async () => {
    const fresh = await db.verifications.get(v.id);
    if (!fresh || fresh.status !== v.status) {
      throw new Error('CONCURRENCY');
    }
    await db.verifications.update(v.id, patch);
    await db.businesses.update(v.businessId, {
      verificationStatus: params.decision === 'Approved' ? 'Approved' : params.decision,
      updatedAt: ts,
    });
  }).catch((e) => {
    if (String(e.message) === 'CONCURRENCY') {
      return Promise.reject(fail('Concurrency', 'VER_CONFLICT', 'Another admin already decided.', 'Your decision was not applied.'));
    }
    throw e;
  });

  const updated = (await db.verifications.get(v.id))!;
  const biz = (await db.businesses.get(v.businessId))!;
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Verification',
    entityId: v.id,
    action: `verification.${params.decision}`,
    reason: params.reason,
    after: { status: params.decision },
  });

  if (params.decision === 'Approved') {
    await notifyBusinessUsers(biz.id, 'N-004', { businessName: biz.name }, { type: 'Business', id: biz.id });
  } else if (params.decision === 'Rejected') {
    await notifyBusinessUsers(biz.id, 'N-056', { reason: params.reason ?? '' }, { type: 'Verification', id: v.id });
  } else if (params.decision === 'DocumentsRequested') {
    await notifyBusinessUsers(biz.id, 'N-003', { businessName: biz.name, note: params.note ?? params.reason ?? '' }, { type: 'Verification', id: v.id });
  }
  return ok(updated);
}

export async function suspendBusiness(params: {
  actor: User;
  adminBusiness: Business;
  targetBusinessId: string;
  reason: string;
}): Promise<Result<Business>> {
  const perm = assertCan(params.actor, params.adminBusiness, 'business.suspend');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Business was not suspended.');
  if (!params.reason.trim()) return fail('Validation', 'SUSPEND_REASON', 'Reason is required.', 'Business was not suspended.');
  const biz = await db.businesses.get(params.targetBusinessId);
  if (!biz) return fail('NotFound', 'BIZ_MISSING', 'Business not found.', 'Business was not suspended.');
  if (biz.type === 'Platform') return fail('BusinessRule', 'SUSPEND_PLATFORM', 'Cannot suspend platform.', 'Business was not suspended.');
  const ts = new Date().toISOString();
  await db.businesses.update(biz.id, {
    accountStatus: 'Suspended',
    suspendedAt: ts,
    suspendReason: params.reason,
    updatedAt: ts,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.adminBusiness.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.suspend',
    reason: params.reason,
  });
  await notifyBusinessUsers(biz.id, 'N-005', { businessName: biz.name, reason: params.reason });
  return ok((await db.businesses.get(biz.id))!);
}

export async function reactivateBusiness(params: {
  actor: User;
  adminBusiness: Business;
  targetBusinessId: string;
}): Promise<Result<Business>> {
  const perm = assertCan(params.actor, params.adminBusiness, 'business.suspend');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Business was not reactivated.');
  const biz = await db.businesses.get(params.targetBusinessId);
  if (!biz) return fail('NotFound', 'BIZ_MISSING', 'Business not found.', 'Business was not reactivated.');
  const ts = new Date().toISOString();
  await db.businesses.update(biz.id, {
    accountStatus: 'Active',
    suspendedAt: undefined,
    suspendReason: undefined,
    updatedAt: ts,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.adminBusiness.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.reactivate',
  });
  await notifyBusinessUsers(biz.id, 'N-006', { businessName: biz.name });
  return ok((await db.businesses.get(biz.id))!);
}

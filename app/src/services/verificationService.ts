import type {
  Business,
  User,
  Verification,
  VerificationDocument,
  VerificationStatus,
} from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { emitNotification, notifyBusinessUsers } from './notifications';

async function getCurrentVerification(businessId: string): Promise<Verification | undefined> {
  return db.verifications.where('businessId').equals(businessId).reverse().sortBy('updatedAt').then((rows) => rows[0]);
}

async function notifyPlatformAdminsVerificationSubmitted(business: Business, verificationId: string): Promise<void> {
  const admins = await db.users.filter((u) => ['SuperAdmin', 'SupportManager'].includes(u.role)).toArray();
  for (const a of admins) {
    await emitNotification({
      userId: a.id,
      businessId: a.businessId,
      code: 'N-002',
      vars: { businessName: business.name },
      entityType: 'Verification',
      entityId: verificationId,
    });
  }
}

export async function submitVerification(
  actor: User,
  business: Business,
  extras?: { documents?: VerificationDocument[]; documentIds?: string[] },
): Promise<Result<Verification>> {
  if (actor.businessId !== business.id) {
    return fail('Permission', 'PERM_DENIED', 'You can only submit verification for your own business.', 'Verification was not submitted.');
  }
  const perm = assertCan(actor, business, 'verification.submit');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Verification was not submitted.');
  const current = await getCurrentVerification(business.id);
  const from = (current?.status ?? 'NotStarted') as VerificationStatus;
  const amendable = ['NotStarted', 'Submitted', 'UnderReview', 'DocumentsRequested', 'Rejected'] as const;
  if (!amendable.includes(from as (typeof amendable)[number])) {
    return fail('BusinessRule', 'VER_NOT_RESUBMITTABLE', 'Verification cannot be resubmitted in this state.', 'No change made.');
  }
  const to: VerificationStatus = 'Submitted';
  if (from !== 'NotStarted') {
    const t = machines.verification(from, to);
    if (!t.ok) return fail('StateConflict', 'VER_BAD_STATE', t.reason!, 'Verification was not submitted.');
  }
  const ts = new Date().toISOString();
  const nextDocs = extras?.documents ?? current?.documents;
  const nextIds = extras?.documentIds ?? nextDocs?.map((d) => d.fileId) ?? current?.documentIds ?? [];

  if (!current) {
    const v: Verification = {
      id: crypto.randomUUID(),
      businessId: business.id,
      status: 'Submitted',
      submittedAt: ts,
      documentIds: nextIds,
      documents: nextDocs,
      decisionHistory: [{ from: 'NotStarted', to: 'Submitted', at: ts, actorId: actor.id }],
      createdAt: ts,
      updatedAt: ts,
    };
    await db.verifications.add(v);
    await db.businesses.update(business.id, { verificationStatus: 'Submitted', updatedAt: ts });
    await notifyPlatformAdminsVerificationSubmitted(business, v.id);
    return ok(v);
  }
  await db.verifications.update(current.id, {
    status: 'Submitted',
    submittedAt: ts,
    updatedAt: ts,
    documentIds: nextIds,
    documents: nextDocs,
    rejectReason: undefined,
    requestDocsNote: undefined,
    decisionHistory: [...current.decisionHistory, { from, to: 'Submitted', at: ts, actorId: actor.id }],
  });
  await db.businesses.update(business.id, { verificationStatus: 'Submitted', updatedAt: ts });
  await writeAudit({
    actorId: actor.id,
    actorName: actor.name,
    businessId: business.id,
    entityType: 'Verification',
    entityId: current.id,
    action: 'verification.resubmit',
    after: { status: 'Submitted', documentCount: nextIds.length },
  });
  await notifyPlatformAdminsVerificationSubmitted(business, current.id);
  return ok((await db.verifications.get(current.id))!);
}

export async function adminReviewVerification(params: {
  actor: User;
  business: Business;
  verificationId: string;
  decision: 'UnderReview' | 'Approved' | 'Rejected' | 'DocumentsRequested';
  /** Business-visible reason (reject / docs request). */
  reason?: string;
  /** Business-visible docs-request note (defaults to reason). */
  note?: string;
  /** Admin-only internal note — never shown to the business. */
  internalNotes?: string;
}): Promise<Result<Verification>> {
  const perm = assertCan(params.actor, params.business, 'verification.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Verification decision was not saved.');

  const v = await db.verifications.get(params.verificationId);
  if (!v) return fail('NotFound', 'VER_MISSING', 'Verification not found.', 'Verification decision was not saved.');

  const t = machines.verification(v.status, params.decision);
  if (!t.ok) return fail('StateConflict', 'VER_BAD_STATE', t.reason!, 'Verification decision was not saved.');
  if ((params.decision === 'Rejected' || params.decision === 'DocumentsRequested') && !params.reason?.trim() && !params.note?.trim()) {
    return fail('Validation', 'VER_REASON', 'Business-visible reason is required.', 'Verification decision was not saved.');
  }

  const ts = new Date().toISOString();
  const patch: Partial<Verification> = {
    status: params.decision,
    reviewedAt: ts,
    reviewerId: params.actor.id,
    updatedAt: ts,
    decisionHistory: [...v.decisionHistory, { from: v.status, to: params.decision, at: ts, actorId: params.actor.id, reason: params.reason }],
  };
  if (params.internalNotes !== undefined) patch.internalNotes = params.internalNotes.trim() || undefined;
  if (params.decision === 'Rejected') patch.rejectReason = params.reason?.trim();
  if (params.decision === 'DocumentsRequested') patch.requestDocsNote = (params.note ?? params.reason)?.trim();

  try {
    await db.transaction('rw', db.verifications, db.businesses, async () => {
      const fresh = await db.verifications.get(v.id);
      if (!fresh || fresh.status !== v.status) {
        throw new Error('CONCURRENCY');
      }
      await db.verifications.update(v.id, patch);
      const bizPatch: Partial<Business> = {
        verificationStatus: params.decision === 'Approved' ? 'Approved' : params.decision,
        updatedAt: ts,
      };
      // Approval activates a still-pending trader account (register starts as PendingActivation).
      if (params.decision === 'Approved') {
        const target = await db.businesses.get(v.businessId);
        if (target && (target.accountStatus === 'PendingActivation' || target.accountStatus === 'Active')) {
          bizPatch.accountStatus = 'Active';
        }
      }
      await db.businesses.update(v.businessId, bizPatch);
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'CONCURRENCY') {
      return fail('Concurrency', 'VER_CONFLICT', 'Another admin already decided.', 'Your decision was not applied.');
    }
    throw e;
  }

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
  /** Admin-only — stored separately; never merged into suspendReason or notifications */
  internalNotes?: string;
}): Promise<Result<Business>> {
  const perm = assertCan(params.actor, params.adminBusiness, 'business.suspend');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Business was not suspended.');
  if (!params.reason.trim()) return fail('Validation', 'SUSPEND_REASON', 'Reason is required.', 'Business was not suspended.');
  const biz = await db.businesses.get(params.targetBusinessId);
  if (!biz) return fail('NotFound', 'BIZ_MISSING', 'Business not found.', 'Business was not suspended.');
  if (biz.type === 'Platform') return fail('BusinessRule', 'SUSPEND_PLATFORM', 'Cannot suspend platform.', 'Business was not suspended.');
  if (biz.accountStatus !== 'Active' && biz.accountStatus !== 'PendingActivation') {
    return fail(
      'StateConflict',
      'SUSPEND_STATE',
      `Cannot suspend a business that is ${biz.accountStatus}.`,
      'Business was not suspended.',
    );
  }
  const ts = new Date().toISOString();
  const visibleReason = params.reason.trim();
  const internalNotes = params.internalNotes?.trim() || undefined;
  await db.businesses.update(biz.id, {
    accountStatus: 'Suspended',
    suspendedAt: ts,
    suspendReason: visibleReason,
    internalNotes,
    updatedAt: ts,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.adminBusiness.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.suspend',
    reason: visibleReason,
    after: internalNotes ? { internalNotes } : undefined,
  });
  await notifyBusinessUsers(biz.id, 'N-005', { businessName: biz.name, reason: visibleReason });
  return ok((await db.businesses.get(biz.id))!);
}

/** Pharmacy/stockist owner requests reactivation → N-057 to platform admins. */
export async function requestReactivation(params: {
  actor: User;
  business: Business;
  note?: string;
}): Promise<Result<true>> {
  if (params.actor.businessId !== params.business.id) {
    return fail('Permission', 'PERM_DENIED', 'You can only request reactivation for your own business.', 'No request sent.');
  }
  const biz = await db.businesses.get(params.business.id);
  if (!biz) return fail('NotFound', 'BIZ_MISSING', 'Business not found.', 'No request sent.');
  if (biz.accountStatus !== 'Suspended') {
    return fail('BusinessRule', 'NOT_SUSPENDED', 'Business is not suspended.', 'No request sent.');
  }
  const admins = await db.users.filter((u) => ['SuperAdmin', 'SupportManager'].includes(u.role)).toArray();
  for (const a of admins) {
    await emitNotification({
      userId: a.id,
      businessId: a.businessId,
      code: 'N-057',
      vars: { businessName: biz.name },
      entityType: 'Business',
      entityId: biz.id,
    });
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: biz.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.request_reactivation',
    reason: params.note,
  });
  return ok(true);
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
  if (biz.type === 'Platform') return fail('BusinessRule', 'REACTIVATE_PLATFORM', 'Cannot change platform account.', 'Business was not reactivated.');
  if (biz.accountStatus !== 'Suspended' && biz.accountStatus !== 'Deactivated') {
    return fail('BusinessRule', 'NOT_INACTIVE', 'Business is already active.', 'No change made.');
  }
  const ts = new Date().toISOString();
  // Unverified traders return to PendingActivation — not Active — so analytics/marketplace stay correct.
  const nextStatus = biz.verificationStatus === 'Approved' ? 'Active' : 'PendingActivation';
  await db.businesses.update(biz.id, {
    accountStatus: nextStatus,
    suspendedAt: undefined,
    suspendReason: undefined,
    internalNotes: undefined,
    updatedAt: ts,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.adminBusiness.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.reactivate',
    after: { accountStatus: nextStatus },
  });
  await notifyBusinessUsers(biz.id, 'N-006', { businessName: biz.name });
  return ok((await db.businesses.get(biz.id))!);
}

/** Permanent-style deactivation: login blocked, historical records retained (AD-20/AD-21). */
export async function deactivateBusiness(params: {
  actor: User;
  adminBusiness: Business;
  targetBusinessId: string;
  reason: string;
  /** Admin-only — stored separately; never merged into suspendReason */
  internalNotes?: string;
}): Promise<Result<Business>> {
  const perm = assertCan(params.actor, params.adminBusiness, 'business.suspend');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Business was not deactivated.');
  if (!params.reason.trim()) return fail('Validation', 'DEACTIVATE_REASON', 'Reason is required.', 'Business was not deactivated.');
  const biz = await db.businesses.get(params.targetBusinessId);
  if (!biz) return fail('NotFound', 'BIZ_MISSING', 'Business not found.', 'Business was not deactivated.');
  if (biz.type === 'Platform') return fail('BusinessRule', 'DEACTIVATE_PLATFORM', 'Cannot deactivate platform.', 'Business was not deactivated.');
  if (biz.accountStatus === 'Deactivated') {
    return fail('BusinessRule', 'ALREADY_DEACTIVATED', 'Business is already deactivated.', 'No change made.');
  }
  const ts = new Date().toISOString();
  const visibleReason = params.reason.trim();
  const internalNotes = params.internalNotes?.trim() || undefined;
  await db.businesses.update(biz.id, {
    accountStatus: 'Deactivated',
    suspendedAt: undefined,
    suspendReason: visibleReason,
    internalNotes,
    updatedAt: ts,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.adminBusiness.id,
    entityType: 'Business',
    entityId: biz.id,
    action: 'business.deactivate',
    reason: visibleReason,
    after: internalNotes ? { internalNotes } : undefined,
  });
  return ok((await db.businesses.get(biz.id))!);
}

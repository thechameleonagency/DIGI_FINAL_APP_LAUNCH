import type { VerificationDocKind } from '../../../domain/entities/types';
import { db } from '../../db';
import { registerBusiness, type RegistrationDocInput } from '../../../services/authService';
import { updatePlatformSettings } from '../../../services/platformSettingsService';
import { adminReviewVerification, submitVerification } from '../../../services/verificationService';
import { assertOk } from '../assert';
import { CAST, CAST_GST, DEMO_PASSWORD, type CastTrader } from '../cast';
import { advanceBusinessDay } from '../chronology';
import { getWorldCtx, requireAdmin, type TraderKey, type TraderParty } from '../context';
import { registerSeedAccount } from '../registry';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_PDF =
  'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQo+PgplbmRvYmoKdHJhaWxlcgo8PAovUm9vdCAxIDAgUgovU2l6ZSAzCj4+CnN0YXJ0eHJlZgoxNzMKJSVFT0YK';

/** Minimal fake registration document (PNG or PDF data URL). */
export function fakeDoc(kind: VerificationDocKind, licenseNumber?: string): RegistrationDocInput {
  const usePdf = kind === 'GstinCert' || kind === 'WholesaleLicense';
  return {
    kind,
    label: kind,
    licenseNumber,
    file: {
      name: usePdf ? `${kind}.pdf` : `${kind}.png`,
      mime: usePdf ? 'application/pdf' : 'image/png',
      size: usePdf ? 180 : 70,
      dataUrl: usePdf ? TINY_PDF : TINY_PNG,
    },
  };
}

function requiredDocs(type: 'Stockist' | 'Pharmacy', drugLicense: string): RegistrationDocInput[] {
  if (type === 'Stockist') {
    return [
      fakeDoc('DrugLicense', drugLicense),
      fakeDoc('GstinCert'),
      fakeDoc('WholesaleLicense', drugLicense),
    ];
  }
  return [fakeDoc('DrugLicense', drugLicense), fakeDoc('GstinCert'), fakeDoc('PharmacyCert', drugLicense)];
}

async function loadVerificationId(businessId: string): Promise<string> {
  const rows = await db.verifications.where('businessId').equals(businessId).toArray();
  const v = rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!v) throw new Error(`[worldSeed] verification missing for business ${businessId}`);
  return v.id;
}

async function refreshParty(party: TraderParty): Promise<TraderParty> {
  const user = (await db.users.get(party.user.id))!;
  const business = (await db.businesses.get(party.business.id))!;
  return { ...party, user, business };
}

async function registerTrader(params: {
  key: TraderKey;
  type: 'Stockist' | 'Pharmacy';
  gst: string;
  cast: CastTrader;
}): Promise<TraderParty> {
  advanceBusinessDay();
  const { cast, type, gst, key } = params;
  const registered = assertOk(
    `02-onboard.register.${key}`,
    await registerBusiness({
      type,
      ownerName: cast.owner.name,
      email: cast.owner.email,
      phone: cast.owner.phone,
      password: DEMO_PASSWORD,
      businessName: cast.site.businessName,
      gstNumber: gst,
      drugLicenseNumber: cast.site.drugLicenseNumber,
      pharmacyType: cast.site.pharmacyType,
      city: cast.site.city,
      state: cast.site.state,
      pincode: cast.site.pincode,
      address: cast.site.address,
      servicePins: cast.site.servicePins ? [...cast.site.servicePins] : undefined,
      bankAccountNumber: cast.site.bankAccountNumber,
      bankIfsc: cast.site.bankIfsc,
      bankName: cast.site.bankName,
      accountHolderName: cast.site.accountHolderName,
      upiId: cast.site.upiId,
      documents: requiredDocs(type, cast.site.drugLicenseNumber),
      phoneVerified: true,
    }),
  );

  registerSeedAccount({
    email: cast.owner.email,
    name: cast.owner.name,
    role: type === 'Stockist' ? 'Stockist' : 'Pharmacist',
    portal: type === 'Stockist' ? 'stockist' : 'pharmacy',
    businessName: cast.site.businessName,
  });

  return {
    key,
    user: registered.data.user,
    business: registered.data.business,
  };
}

async function underReviewThen(decision: 'Approved' | 'Rejected' | 'DocumentsRequested', opts: {
  step: string;
  verificationId: string;
  reason?: string;
  note?: string;
}): Promise<void> {
  const admin = requireAdmin();
  const current = await db.verifications.get(opts.verificationId);
  if (!current) throw new Error(`[worldSeed:${opts.step}] verification missing`);

  if (current.status === 'Submitted') {
    assertOk(
      `${opts.step}.underReview`,
      await adminReviewVerification({
        actor: admin.user,
        business: admin.business,
        verificationId: opts.verificationId,
        decision: 'UnderReview',
      }),
    );
  }

  if (decision === 'Approved' || decision === 'Rejected' || decision === 'DocumentsRequested') {
    // Reject can also be applied from Submitted without UnderReview; we already moved to UnderReview when needed.
    assertOk(
      `${opts.step}.${decision}`,
      await adminReviewVerification({
        actor: admin.user,
        business: admin.business,
        verificationId: opts.verificationId,
        decision,
        reason: opts.reason,
        note: opts.note,
      }),
    );
  }
}

async function approveDirect(step: string, party: TraderParty): Promise<TraderParty> {
  const verificationId = await loadVerificationId(party.business.id);
  await underReviewThen('Approved', { step, verificationId });
  return refreshParty(party);
}

async function approveViaDocsRequest(step: string, party: TraderParty): Promise<TraderParty> {
  const verificationId = await loadVerificationId(party.business.id);
  await underReviewThen('DocumentsRequested', {
    step: `${step}.docs`,
    verificationId,
    reason: 'Please re-upload a clearer GST certificate.',
    note: 'GST scan is blurry — resubmit GstinCert.',
  });
  advanceBusinessDay();
  const freshUser = (await db.users.get(party.user.id))!;
  const freshBiz = (await db.businesses.get(party.business.id))!;
  assertOk(`${step}.resubmit`, await submitVerification(freshUser, freshBiz));
  await underReviewThen('Approved', {
    step: `${step}.approve`,
    verificationId,
  });
  return refreshParty(party);
}

async function approveViaReject(step: string, party: TraderParty): Promise<TraderParty> {
  const admin = requireAdmin();
  const verificationId = await loadVerificationId(party.business.id);
  // Reject directly from Submitted (allowed by machine).
  assertOk(
    `${step}.reject`,
    await adminReviewVerification({
      actor: admin.user,
      business: admin.business,
      verificationId,
      decision: 'Rejected',
      reason: 'Drug license photo is incomplete — please resubmit.',
    }),
  );
  advanceBusinessDay();
  const freshUser = (await db.users.get(party.user.id))!;
  const freshBiz = (await db.businesses.get(party.business.id))!;
  assertOk(`${step}.resubmit`, await submitVerification(freshUser, freshBiz));
  await underReviewThen('Approved', { step: `${step}.approve`, verificationId });
  return refreshParty(party);
}

/** Phase 2 — Register traders & admin approve (Session B). */
export async function seedOnboardPhase(): Promise<void> {
  const ctx = getWorldCtx();
  const admin = requireAdmin();

  assertOk(
    '02-onboard.billAheadAllowed',
    await updatePlatformSettings({
      actor: admin.user,
      adminBusiness: admin.business,
      patch: { billAheadAllowed: true },
    }),
  );

  // Stockist A — approve direct
  let stockistA = await registerTrader({
    key: 'stockistA',
    type: 'Stockist',
    gst: CAST_GST.stockistA,
    cast: CAST.stockistA,
  });
  stockistA = await approveDirect('02-onboard.stockistA', stockistA);
  ctx.stockists.push(stockistA);

  // Stockist B — DocumentsRequested → resubmit → Approve
  let stockistB = await registerTrader({
    key: 'stockistB',
    type: 'Stockist',
    gst: CAST_GST.stockistB,
    cast: CAST.stockistB,
  });
  stockistB = await approveViaDocsRequest('02-onboard.stockistB', stockistB);
  ctx.stockists.push(stockistB);

  // Pharmacy A — approve direct
  let pharmacyA = await registerTrader({
    key: 'pharmacyA',
    type: 'Pharmacy',
    gst: CAST_GST.pharmacyA,
    cast: CAST.pharmacyA,
  });
  pharmacyA = await approveDirect('02-onboard.pharmacyA', pharmacyA);
  ctx.pharmacies.push(pharmacyA);

  // Pharmacy B — Reject → resubmit → Approve
  let pharmacyB = await registerTrader({
    key: 'pharmacyB',
    type: 'Pharmacy',
    gst: CAST_GST.pharmacyB,
    cast: CAST.pharmacyB,
  });
  pharmacyB = await approveViaReject('02-onboard.pharmacyB', pharmacyB);
  ctx.pharmacies.push(pharmacyB);

  // Pharmacy C — approve direct
  let pharmacyC = await registerTrader({
    key: 'pharmacyC',
    type: 'Pharmacy',
    gst: CAST_GST.pharmacyC,
    cast: CAST.pharmacyC,
  });
  pharmacyC = await approveDirect('02-onboard.pharmacyC', pharmacyC);
  ctx.pharmacies.push(pharmacyC);

  // Pending — register only
  const pending = await registerTrader({
    key: 'pharmacyPending',
    type: 'Pharmacy',
    gst: CAST_GST.pharmacyPending,
    cast: CAST.pharmacyPending,
  });
  ctx.pendingPharmacy = pending;
}

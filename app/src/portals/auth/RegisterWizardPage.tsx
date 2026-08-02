import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { INDIAN_STATES, PHARMACY_TYPES, STATE_CITIES } from '../../content/indiaRegions';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '../../content/legal';
import { db } from '../../data/db';
import type { VerificationDocKind } from '../../domain/entities/types';
import { DEMO_OTP } from '../../domain/utils/crypto';
import {
  bankNameFromIfsc,
  isEmail,
  isGstin,
  isIfsc,
  isLicenseNo,
  isPan,
  isPhone,
  isPin,
  isUpi,
  normalizePhone,
} from '../../domain/utils/validation';
import { registerBusiness, type RegistrationDocInput } from '../../services/authService';
import { readFilePayload } from '../../services/fileService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { BannerStrip } from '../../ui/components/BannerStrip';
import { ConfirmDialog } from '../../ui/components/ConfirmDialog';
import { Button, Field, Input, Modal, Select } from '../../ui/components/primitives';

type DeferredFile = { name: string; mime: string; size: number; dataUrl: string };
type DocSlot = {
  kind: VerificationDocKind;
  label: string;
  required: boolean;
  licenseNumber: string;
  file?: DeferredFile;
};

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <BannerStrip placement="Auth" />
        {children}
      </div>
    </div>
  );
}

type LegalKind = 'terms' | 'privacy' | null;

export function RegisterWizardPage() {
  const { type } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useSession();
  const { pushToast } = useUi();
  const typeOk = type === 'pharmacy' || type === 'stockist';
  const bizType = type === 'stockist' ? 'Stockist' : 'Pharmacy';
  const isStockist = bizType === 'Stockist';
  const inviteId = searchParams.get('invite');
  const stepLabels = useMemo(
    () =>
      isStockist
        ? ['Account', 'Business', 'Documents', 'Service PINs', 'Bank', 'Review']
        : ['Account', 'Business', 'Documents', 'Bank', 'Review'],
    [isStockist],
  );
  const lastStep = stepLabels.length - 1;

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinInput, setPinInput] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [legal, setLegal] = useState<LegalKind>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [docs, setDocs] = useState<DocSlot[]>(() =>
    isStockist
      ? [
          { kind: 'DrugLicense', label: 'Drug license', required: true, licenseNumber: '' },
          { kind: 'GstinCert', label: 'GSTIN certificate', required: true, licenseNumber: '' },
          { kind: 'WholesaleLicense', label: 'Wholesale license', required: true, licenseNumber: '' },
          { kind: 'Fssai', label: 'FSSAI (optional)', required: false, licenseNumber: '' },
        ]
      : [
          { kind: 'DrugLicense', label: 'Drug license', required: true, licenseNumber: '' },
          { kind: 'GstinCert', label: 'GSTIN certificate', required: true, licenseNumber: '' },
          { kind: 'PharmacyCert', label: 'Pharmacy registration cert', required: true, licenseNumber: '' },
          { kind: 'Fssai', label: 'FSSAI (optional)', required: false, licenseNumber: '' },
        ],
  );
  const [form, setForm] = useState({
    ownerName: '',
    email: '',
    phone: '',
    altPhone: '',
    password: '',
    businessName: '',
    pharmacyType: 'Retail',
    gstNumber: '',
    drugLicenseNumber: '',
    panNumber: '',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '',
    address: '',
    upiId: '',
    bankAccountNumber: '',
    bankAccountConfirm: '',
    bankIfsc: '',
    bankName: '',
    accountHolderName: '',
    servicePins: [] as string[],
    acceptTerms: false,
    acceptPrivacy: false,
  });

  const set = (k: keyof typeof form, v: string | boolean | string[]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty =
    Object.values(form).some((v) => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.length : !!v)) ||
    docs.some((d) => !!d.file);

  const citySuggestions = STATE_CITIES[form.state] ?? [];

  useEffect(() => {
    if (!inviteId || isStockist) return;
    void (async () => {
      const invite = await db.partnerInvites.get(inviteId);
      if (!invite || invite.status === 'Withdrawn') return;
      setForm((f) => ({
        ...f,
        businessName: f.businessName || invite.name,
        phone: f.phone || invite.phone,
        email: f.email || invite.email || '',
        gstNumber: f.gstNumber || invite.gst || '',
      }));
    })();
  }, [inviteId, isStockist]);

  const validateStep = async (s: number): Promise<boolean> => {
    const e: Record<string, string> = {};
    const label = stepLabels[s];

    if (label === 'Account') {
      if (!form.ownerName.trim()) e.ownerName = 'Required';
      if (!isEmail(form.email)) e.email = 'Valid email required';
      if (!isPhone(form.phone)) e.phone = '10-digit mobile starting 6–9';
      if (form.altPhone && !isPhone(form.altPhone)) e.altPhone = 'Invalid alternate phone';
      if (form.password.length < 6) e.password = 'Min 6 characters';
      if (!phoneVerified) e.otp = 'Verify phone with demo OTP';
      if (isPhone(form.phone)) {
        const phone = normalizePhone(form.phone);
        const dup = await db.users.filter((u) => normalizePhone(u.phone) === phone).count();
        if (dup) e.phone = 'Phone already registered';
      }
      if (isEmail(form.email)) {
        const dup = await db.users.filter((u) => u.email.toLowerCase() === form.email.trim().toLowerCase()).count();
        if (dup) e.email = 'Email already registered';
      }
    }

    if (label === 'Business') {
      if (!form.businessName.trim()) e.businessName = 'Required';
      if (!isGstin(form.gstNumber)) e.gstNumber = 'Invalid GSTIN';
      if (!isLicenseNo(form.drugLicenseNumber)) e.drugLicenseNumber = 'Invalid license number';
      if (!isPan(form.panNumber)) e.panNumber = 'Invalid PAN';
      if (!form.state) e.state = 'Select state';
      if (!form.city.trim()) e.city = 'Required';
      if (!isPin(form.pincode)) e.pincode = '6-digit PIN';
      if (!form.address.trim()) e.address = 'Required';
      if (isGstin(form.gstNumber)) {
        const gst = form.gstNumber.replace(/\s/g, '').toUpperCase();
        if (await db.businesses.where('gstNumber').equals(gst).count()) e.gstNumber = 'GSTIN already registered';
      }
      if (isLicenseNo(form.drugLicenseNumber)) {
        const dl = form.drugLicenseNumber.trim().toLowerCase();
        const dup = await db.businesses.filter((b) => (b.drugLicenseNumber ?? '').trim().toLowerCase() === dl).count();
        if (dup) e.drugLicenseNumber = 'Drug license already registered';
      }
    }

    if (label === 'Documents') {
      for (const d of docs.filter((x) => x.required)) {
        if (!d.file) e[`doc-${d.kind}`] = 'Upload required';
        if (!d.licenseNumber.trim()) e[`lic-${d.kind}`] = 'License number required';
      }
    }

    if (label === 'Service PINs') {
      if (!form.servicePins.length) e.servicePins = 'Add at least one PIN';
    }

    if (label === 'Bank') {
      const required = isStockist;
      const started = !!(form.bankAccountNumber || form.bankIfsc || form.bankName || form.accountHolderName);
      if (required || started) {
        if (!form.bankAccountNumber.trim()) e.bankAccountNumber = 'Required';
        if (form.bankAccountNumber !== form.bankAccountConfirm) e.bankAccountConfirm = 'Accounts must match';
        if (!isIfsc(form.bankIfsc)) e.bankIfsc = 'Invalid IFSC';
        if (!form.bankName.trim()) e.bankName = 'Required';
        if (!form.accountHolderName.trim()) e.accountHolderName = 'Required';
      }
      if (form.upiId && !isUpi(form.upiId)) e.upiId = 'Invalid UPI';
    }

    if (label === 'Review') {
      if (!form.acceptTerms) e.acceptTerms = 'Required';
      if (!form.acceptPrivacy) e.acceptPrivacy = 'Required';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = async () => {
    if (!(await validateStep(step))) return;
    setStep((x) => Math.min(lastStep, x + 1));
  };

  const submit = async () => {
    if (!(await validateStep(step))) return;
    setBusy(true);
    const documents: RegistrationDocInput[] = docs
      .filter((d) => d.file)
      .map((d) => ({
        kind: d.kind,
        label: d.label,
        licenseNumber: d.licenseNumber || undefined,
        file: d.file!,
      }));
    const res = await registerBusiness({
      type: bizType,
      ownerName: form.ownerName,
      email: form.email,
      phone: form.phone,
      alternatePhone: form.altPhone || undefined,
      password: form.password,
      businessName: form.businessName,
      pharmacyType: form.pharmacyType,
      gstNumber: form.gstNumber,
      drugLicenseNumber: form.drugLicenseNumber,
      panNumber: form.panNumber,
      city: form.city,
      state: form.state,
      pincode: form.pincode,
      address: form.address,
      upiId: form.upiId || undefined,
      bankAccountNumber: form.bankAccountNumber || undefined,
      bankIfsc: form.bankIfsc || undefined,
      bankName: form.bankName || undefined,
      accountHolderName: form.accountHolderName || undefined,
      servicePins: isStockist ? form.servicePins : undefined,
      documents,
      phoneVerified,
    });
    setBusy(false);
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
      return;
    }
    setSession(res.data.user, res.data.business);
    pushToast({ tone: 'success', title: 'Registered', message: 'Verification submitted.' });
    navigate('/auth/pending');
  };

  const addPin = () => {
    if (!isPin(pinInput)) {
      setErrors((e) => ({ ...e, servicePins: 'Enter a valid 6-digit PIN' }));
      return;
    }
    if (form.servicePins.includes(pinInput.trim())) {
      setErrors((e) => ({ ...e, servicePins: 'PIN already added' }));
      return;
    }
    set('servicePins', [...form.servicePins, pinInput.trim()]);
    setPinInput('');
    setErrors((e) => {
      const next = { ...e };
      delete next.servicePins;
      return next;
    });
  };

  const label = stepLabels[step];

  if (!typeOk) {
    return <Navigate to="/auth/register" replace />;
  }

  return (
    <AuthShell>
      <ConfirmDialog
        open={leaveOpen}
        title="Leave registration?"
        body="Your progress on this form will be lost."
        confirmLabel="Leave"
        tone="danger"
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => navigate('/auth/register')}
      />
      <Modal
        open={!!legal}
        title={legal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
        onClose={() => setLegal(null)}
        footer={
          <Button variant="secondary" onClick={() => setLegal(null)}>
            Close
          </Button>
        }
      >
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, margin: 0 }}>
          {legal === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY}
        </pre>
      </Modal>

      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">Register {bizType}</p>

      <ol className="wizard-steps" aria-label="Registration steps">
        {stepLabels.map((name, i) => (
          <li key={name} className={i < step ? 'done' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="wizard-step-index">{i + 1}</span>
            <span className="wizard-step-label">{name}</span>
          </li>
        ))}
      </ol>

      {label === 'Account' && (
        <div className="stack">
          <Field label="Owner name" error={errors.ownerName}>
            <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Phone" error={errors.phone} hint="10-digit Indian mobile">
            <Input
              value={form.phone}
              onChange={(e) => {
                set('phone', e.target.value);
                setPhoneVerified(false);
                setOtpSent(false);
              }}
              inputMode="tel"
            />
          </Field>
          <Field label="Alternate / WhatsApp phone (optional)" error={errors.altPhone}>
            <Input value={form.altPhone} onChange={(e) => set('altPhone', e.target.value)} inputMode="tel" />
          </Field>
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Phone verification</strong>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Demo OTP is <strong>{DEMO_OTP}</strong>. Send, then verify before continuing.
            </p>
            <div className="row">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!isPhone(form.phone)}
                onClick={() => {
                  setOtpSent(true);
                  pushToast({ tone: 'info', title: 'OTP sent', message: `Use demo OTP ${DEMO_OTP}` });
                }}
              >
                {otpSent ? 'Resend OTP' : 'Send OTP'}
              </Button>
              <Input
                placeholder="6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                style={{ maxWidth: 140 }}
                aria-label="Phone OTP"
              />
              <Button
                type="button"
                size="sm"
                disabled={!otpSent}
                onClick={() => {
                  if (otp.trim() !== DEMO_OTP) {
                    setErrors((er) => ({ ...er, otp: 'Invalid OTP' }));
                    setPhoneVerified(false);
                    return;
                  }
                  setPhoneVerified(true);
                  setErrors((er) => {
                    const next = { ...er };
                    delete next.otp;
                    return next;
                  });
                  pushToast({ tone: 'success', title: 'Phone verified' });
                }}
              >
                Verify
              </Button>
            </div>
            {phoneVerified ? <div className="muted" style={{ fontSize: 12 }}>Phone verified ✓</div> : null}
            {errors.otp ? <div className="error">{errors.otp}</div> : null}
          </div>
          <Field label="Password" error={errors.password} hint="Min 6 characters">
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
      )}

      {label === 'Business' && (
        <div className="stack">
          <Field label="Business name" error={errors.businessName}>
            <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
          </Field>
          {!isStockist ? (
            <Field label="Pharmacy type">
              <Select value={form.pharmacyType} onChange={(e) => set('pharmacyType', e.target.value)}>
                {PHARMACY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="GSTIN" error={errors.gstNumber}>
            <Input value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Drug license number" error={errors.drugLicenseNumber}>
            <Input value={form.drugLicenseNumber} onChange={(e) => set('drugLicenseNumber', e.target.value)} />
          </Field>
          <Field label="PAN" error={errors.panNumber}>
            <Input value={form.panNumber} onChange={(e) => set('panNumber', e.target.value.toUpperCase())} />
          </Field>
          <Field label="State" error={errors.state}>
            <Select value={form.state} onChange={(e) => set('state', e.target.value)}>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid-2">
            <Field label="City" error={errors.city}>
              <Input list="reg-city-list" value={form.city} onChange={(e) => set('city', e.target.value)} />
              <datalist id="reg-city-list">
                {citySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Pincode" error={errors.pincode}>
              <Input value={form.pincode} onChange={(e) => set('pincode', e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Address" error={errors.address}>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
      )}

      {label === 'Documents' && (
        <div className="stack">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            PDF/JPG/PNG · max 5 MB each. Required documents must include a license number.
          </p>
          {docs.map((d) => (
            <div key={d.kind} className="card card-pad stack" style={{ gap: 8 }}>
              <strong style={{ fontSize: 13 }}>
                {d.label}
                {d.required ? ' *' : ''}
              </strong>
              <Field label="License / certificate number" error={errors[`lic-${d.kind}`]}>
                <Input
                  value={d.licenseNumber}
                  onChange={(e) =>
                    setDocs((list) => list.map((x) => (x.kind === d.kind ? { ...x, licenseNumber: e.target.value } : x)))
                  }
                  data-testid={`lic-${d.kind}`}
                />
              </Field>
              <div className="row">
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {d.file ? 'Replace file' : 'Upload file'}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    hidden
                    data-testid={`file-${d.kind}`}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const res = await readFilePayload(file);
                      if (!res.ok) {
                        pushToast({ tone: 'error', title: res.message });
                        return;
                      }
                      setDocs((list) => list.map((x) => (x.kind === d.kind ? { ...x, file: res.data } : x)));
                    }}
                  />
                </label>
                {d.file ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDocs((list) => list.map((x) => (x.kind === d.kind ? { ...x, file: undefined } : x)))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              {d.file ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  {d.file.name} · {(d.file.size / 1024).toFixed(1)} KB
                </div>
              ) : null}
              {errors[`doc-${d.kind}`] ? <div className="error">{errors[`doc-${d.kind}`]}</div> : null}
            </div>
          ))}
        </div>
      )}

      {label === 'Service PINs' && (
        <div className="stack">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            PINs you can fulfil. Pharmacies discover you when their PIN matches.
          </p>
          <div className="row">
            <Input
              placeholder="6-digit PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              inputMode="numeric"
              style={{ flex: 1 }}
              aria-label="Serviceable PIN"
            />
            <Button type="button" variant="secondary" onClick={addPin}>
              Add PIN
            </Button>
          </div>
          {errors.servicePins ? <div className="error">{errors.servicePins}</div> : null}
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {form.servicePins.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                onClick={() => set('servicePins', form.servicePins.filter((x) => x !== p))}
                title="Remove"
              >
                {p} ×
              </button>
            ))}
          </div>
        </div>
      )}

      {label === 'Bank' && (
        <div className="stack">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {isStockist ? 'Bank details are required for stockists.' : 'Bank details are optional for pharmacies.'}
          </p>
          <Field label="Account holder name" error={errors.accountHolderName}>
            <Input value={form.accountHolderName} onChange={(e) => set('accountHolderName', e.target.value)} />
          </Field>
          <Field label="Bank account number" error={errors.bankAccountNumber}>
            <Input value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} />
          </Field>
          <Field label="Confirm account number" error={errors.bankAccountConfirm}>
            <Input value={form.bankAccountConfirm} onChange={(e) => set('bankAccountConfirm', e.target.value)} />
          </Field>
          <Field label="IFSC" error={errors.bankIfsc}>
            <Input
              value={form.bankIfsc}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                set('bankIfsc', v);
                const hint = bankNameFromIfsc(v);
                if (hint && !form.bankName) set('bankName', hint);
              }}
            />
          </Field>
          <Field label="Bank name" error={errors.bankName}>
            <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
          </Field>
          <Field label="UPI ID (optional)" error={errors.upiId}>
            <Input value={form.upiId} onChange={(e) => set('upiId', e.target.value)} />
          </Field>
        </div>
      )}

      {label === 'Review' && (
        <div className="stack">
          <div className="card card-pad" style={{ fontSize: 13 }}>
            <div>
              <strong>{form.businessName || '—'}</strong> · {bizType}
            </div>
            <div className="muted">
              {form.ownerName} · {form.email} · {form.phone}
            </div>
            <div className="muted">
              GST {form.gstNumber} · DL {form.drugLicenseNumber} · PAN {form.panNumber}
            </div>
            <div className="muted">
              {form.address}, {form.city}, {form.state} {form.pincode}
            </div>
            {isStockist ? <div className="muted">Service PINs: {form.servicePins.join(', ') || '—'}</div> : null}
            <div className="muted" style={{ marginTop: 8 }}>
              Verification typically takes 24–48 hours in this demo (admin queue).
            </div>
          </div>
          <label className="row" style={{ alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.acceptTerms}
              onChange={(e) => set('acceptTerms', e.target.checked)}
              aria-label="I agree to the Terms of Service"
            />
            <span>
              I agree to the{' '}
              <button type="button" className="linkish" onClick={() => setLegal('terms')}>
                Terms of Service
              </button>
              {errors.acceptTerms ? <span className="error"> — required</span> : null}
            </span>
          </label>
          <label className="row" style={{ alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.acceptPrivacy}
              onChange={(e) => set('acceptPrivacy', e.target.checked)}
              aria-label="I agree to the Privacy Policy"
            />
            <span>
              I agree to the{' '}
              <button type="button" className="linkish" onClick={() => setLegal('privacy')}>
                Privacy Policy
              </button>
              {errors.acceptPrivacy ? <span className="error"> — required</span> : null}
            </span>
          </label>
        </div>
      )}

      <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
        <Button
          variant="ghost"
          onClick={() => {
            if (step === 0) {
              if (dirty) setLeaveOpen(true);
              else navigate('/auth/register');
            } else setStep((x) => x - 1);
          }}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < lastStep ? (
          <Button onClick={() => void goNext()}>Continue</Button>
        ) : (
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? 'Submitting…' : 'Submit for verification'}
          </Button>
        )}
      </div>
      <Link to="/auth/login" style={{ display: 'block', textAlign: 'center', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
        Back to sign in
      </Link>
    </AuthShell>
  );
}

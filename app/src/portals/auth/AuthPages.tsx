import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { VerificationDocKind, VerificationDocument } from '../../domain/entities/types';
import { portalFor } from '../../domain/permissions';
import { DEMO_OTP } from '../../domain/utils/crypto';
import { acceptInvite, getInvitePreview, login, resetPassword } from '../../services/authService';
import { DEMO_ACCOUNTS } from '../../data/seed';
import { isGstin, isLicenseNo, isPhone, normalizeGstin } from '../../domain/utils/validation';
import { updateBusiness } from '../../services/businessService';
import { storeFile } from '../../services/fileService';
import { requestReactivation, submitVerification } from '../../services/verificationService';
import {
  getLoginLockoutRemainingMs,
  isCredentialLoginFailure,
  LOGIN_LOCKOUT_MS,
  recordLoginFailure,
  recordLoginSuccess,
  takeReauthReason,
  useSession,
} from '../../store/session';
import { useUi } from '../../store/ui';
import { BannerStrip } from '../../ui/components/BannerStrip';
import { FileLink } from '../../ui/components/FileUpload';
import { Button, Field, Input, Select } from '../../ui/components/primitives';

const PHARMACY_RESUBMIT_KINDS: { kind: VerificationDocKind; label: string }[] = [
  { kind: 'DrugLicense', label: 'Drug license' },
  { kind: 'GstinCert', label: 'GSTIN certificate' },
  { kind: 'PharmacyCert', label: 'Pharmacy registration cert' },
  { kind: 'Fssai', label: 'FSSAI (optional)' },
];

const STOCKIST_RESUBMIT_KINDS: { kind: VerificationDocKind; label: string }[] = [
  { kind: 'DrugLicense', label: 'Drug license' },
  { kind: 'GstinCert', label: 'GSTIN certificate' },
  { kind: 'WholesaleLicense', label: 'Wholesale license' },
  { kind: 'Fssai', label: 'FSSAI (optional)' },
];

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <BannerStrip placement="Auth" />
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [demoGroup, setDemoGroup] = useState<'Pharmacy' | 'Stockist' | 'Admin'>('Pharmacy');
  const { setSession, user, business } = useSession();
  const { pushToast } = useUi();
  const navigate = useNavigate();

  useEffect(() => {
    const reason = takeReauthReason();
    if (reason === 'timeout') {
      pushToast({ tone: 'warning', title: 'Session expired', message: 'Please sign in again to continue.' });
    } else if (reason === 'revoked' || reason === 'removed') {
      pushToast({ tone: 'warning', title: 'Signed out', message: 'Your access changed. Please sign in again.' });
    }
  }, [pushToast]);

  useEffect(() => {
    setLockRemaining(getLoginLockoutRemainingMs(email));
  }, [email]);

  useEffect(() => {
    if (lockRemaining <= 0) return;
    const id = window.setInterval(() => setLockRemaining(getLoginLockoutRemainingMs(email)), 1000);
    return () => window.clearInterval(id);
  }, [lockRemaining, email]);

  if (user && business) {
    if (business.accountStatus === 'Suspended') return <Navigate to="/auth/suspended" replace />;
    if (business.type !== 'Platform' && business.verificationStatus !== 'Approved') {
      return <Navigate to="/auth/pending" replace />;
    }
    return <Navigate to={`/${portalFor(business.type)}`} replace />;
  }

  const locked = lockRemaining > 0;

  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">B2B pharmaceutical commerce — sign in to your Pharmacy, Stockist, or Platform Admin workspace.</p>
      {locked ? (
        <div className="banner-strip warning" style={{ marginBottom: 12 }}>
          Too many failed attempts for this account. Try again in {Math.ceil(lockRemaining / 1000)}s.
        </div>
      ) : null}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (getLoginLockoutRemainingMs(email) > 0) {
            setLockRemaining(getLoginLockoutRemainingMs(email));
            pushToast({
              tone: 'warning',
              title: 'Temporarily locked',
              message: 'Wait before trying again with this email/phone.',
            });
            return;
          }
          setBusy(true);
          const res = await login(email, password);
          setBusy(false);
          if (!res.ok) {
            if (isCredentialLoginFailure(res.code)) {
              const fail = recordLoginFailure(email);
              setLockRemaining(getLoginLockoutRemainingMs(email));
              pushToast({
                tone: 'error',
                title: fail.locked ? 'Account login locked' : res.message,
                message: fail.locked
                  ? `Too many failures for this account. Retry in ${Math.ceil(LOGIN_LOCKOUT_MS / 60000)} minutes.`
                  : res.businessImpact,
              });
            } else {
              pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
            }
            if (res.code === 'AUTH_BIZ_INACTIVE') navigate('/auth/suspended');
            return;
          }
          recordLoginSuccess(email);
          setSession(res.data.user, res.data.business);
          if (res.data.business.accountStatus === 'Suspended') {
            navigate('/auth/suspended');
            return;
          }
          if (res.data.business.type !== 'Platform' && !['Approved'].includes(res.data.business.verificationStatus)) {
            navigate('/auth/pending');
            return;
          }
          navigate(`/${portalFor(res.data.business.type)}`);
        }}
      >
        <Field label="Email or phone" htmlFor="login-email">
          <Input id="login-email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Link to="/auth/forgot" style={{ fontSize: 12, fontWeight: 600 }}>
            Forgot password?
          </Link>
          <Link to="/auth/register" style={{ fontSize: 12, fontWeight: 600 }}>
            Register business
          </Link>
        </div>
        <Button type="submit" disabled={busy || locked}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <Link to="/verify-bill" style={{ textAlign: 'center', fontSize: 12, fontWeight: 600 }}>
          Verify a bill (anti-counterfeit)
        </Link>
      </form>
      <details className="card card-pad" style={{ marginTop: 18, fontSize: 12, color: 'var(--muted)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text)' }}>Demo accounts</summary>
        <p style={{ margin: '8px 0 10px' }}>
          Click a row to fill the form, then Sign in. Seed covers 5 pharmacies · 5 stockists · full trade lifecycles.
        </p>
        <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }} role="tablist" aria-label="Demo role group">
          {(['Pharmacy', 'Stockist', 'Admin'] as const).map((group) => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={demoGroup === group}
              className={`btn btn-sm ${demoGroup === group ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDemoGroup(group)}
            >
              {group}
            </button>
          ))}
        </div>
        <div className="stack" style={{ marginTop: 4 }}>
          {DEMO_ACCOUNTS.filter((a) => a.roleGroup === demoGroup).map((a) => (
            <button
              key={a.id}
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ textAlign: 'left', height: 'auto', padding: '8px 10px', whiteSpace: 'normal' }}
              onClick={() => {
                setEmail(a.email);
                setPassword(a.password);
              }}
            >
              {a.name} · {a.role} · {a.businessName}
              <br />
              <span style={{ opacity: 0.85 }}>
                {a.email} · {a.password}
              </span>
            </button>
          ))}
        </div>
      </details>
    </AuthShell>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">Choose your business type to begin registration and verification.</p>
      <div className="stack">
        <Button onClick={() => navigate('/auth/register/pharmacy')}>Register as Pharmacy</Button>
        <Button variant="secondary" onClick={() => navigate('/auth/register/stockist')}>
          Register as Stockist
        </Button>
        <Link to="/auth/login" style={{ textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

export { RegisterWizardPage } from './RegisterWizardPage';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">
        Reset password with demo OTP <strong>{DEMO_OTP}</strong>.
      </p>
      <div className="stack">
        <Field label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="OTP">
          <Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder={DEMO_OTP} />
        </Field>
        <Field label="New password" error={passwordError}>
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(undefined);
            }}
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setPasswordError(undefined);
            }}
          />
        </Field>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Show
          passwords
        </label>
        <Button
          onClick={async () => {
            if (password !== confirmPassword) {
              setPasswordError('New password and confirmation do not match');
              return;
            }
            const res = await resetPassword(email, otp, password);
            if (!res.ok) pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
            else {
              pushToast({ tone: 'success', title: 'Password updated' });
              navigate('/auth/login');
            }
          }}
        >
          Update password
        </Button>
        <Link to="/auth/login" style={{ textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

export function PendingVerificationPage() {
  const { user, business, clearSession, setSession } = useSession();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const [busy, setBusy] = useState(false);
  const [extraFileId, setExtraFileId] = useState<string | undefined>();
  const [replaceKind, setReplaceKind] = useState<VerificationDocKind>('DrugLicense');
  const [amendName, setAmendName] = useState('');
  const [amendGst, setAmendGst] = useState('');
  const [amendDl, setAmendDl] = useState('');
  const [amendPhone, setAmendPhone] = useState('');
  const [amendAddress, setAmendAddress] = useState('');
  const [amendHydrated, setAmendHydrated] = useState(false);
  const verification = useLiveQuery(
    () => (business ? db.verifications.where('businessId').equals(business.id).reverse().sortBy('updatedAt') : []),
    [business?.id],
  )?.[0];
  const liveBiz = useLiveQuery(() => (business ? db.businesses.get(business.id) : undefined), [business?.id]) ?? business;

  useEffect(() => {
    if (!liveBiz || amendHydrated) return;
    setAmendName(liveBiz.name ?? '');
    setAmendGst(liveBiz.gstNumber ?? '');
    setAmendDl(liveBiz.drugLicenseNumber ?? '');
    setAmendPhone(liveBiz.phone ?? '');
    setAmendAddress(liveBiz.address ?? '');
    setAmendHydrated(true);
  }, [liveBiz, amendHydrated]);

  if (!business || !user) return <Navigate to="/auth/login" replace />;
  if (liveBiz?.verificationStatus === 'Approved') return <Navigate to={`/${portalFor(business.type)}`} replace />;

  const status = liveBiz?.verificationStatus ?? business.verificationStatus;
  const docs: VerificationDocument[] = verification?.documents?.length
    ? verification.documents
    : (verification?.documentIds ?? []).map((id) => ({
        fileId: id,
        label: 'Document',
        kind: 'DrugLicense' as const,
        licenseNumber: undefined,
      }));
  const canAmendWhileQueued = status === 'Submitted' || status === 'UnderReview';
  const canResubmit = status === 'DocumentsRequested' || status === 'Rejected' || canAmendWhileQueued;
  const resubmitKinds = business.type === 'Stockist' ? STOCKIST_RESUBMIT_KINDS : PHARMACY_RESUBMIT_KINDS;
  const selectedKindMeta = resubmitKinds.find((k) => k.kind === replaceKind) ?? resubmitKinds[0];
  const timeline = ['Submitted', 'UnderReview', 'DocumentsRequested', 'Rejected', 'Approved'] as const;

  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">Verification status for {business.name}</p>
      <div className="banner-strip info" style={{ marginBottom: 14 }}>
        Workspace is locked for trading until an admin approves your verification.
      </div>
      <div className="timeline" style={{ marginBottom: 18 }}>
        {timeline.map((s) => {
          const active = status === s || (status === 'Approved' && s === 'Approved');
          return (
            <div key={s} className="timeline-item">
              <div className="timeline-dot" style={{ opacity: active || status === 'Approved' ? 1 : 0.35 }} />
              <div>
                <strong>{s.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong>
                {status === s ? <div className="muted">Current</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      {status === 'Rejected' && verification?.rejectReason ? (
        <div className="banner-strip danger" style={{ marginBottom: 14 }}>
          Rejected: {verification.rejectReason}
        </div>
      ) : null}
      {status === 'DocumentsRequested' && (verification?.requestDocsNote || verification?.rejectReason) ? (
        <div className="banner-strip warning" style={{ marginBottom: 14 }}>
          Documents requested: {verification.requestDocsNote ?? verification.rejectReason}
        </div>
      ) : null}

      <div className="card card-pad stack" style={{ marginBottom: 16 }}>
        <strong>Submitted documents</strong>
        {!docs.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No documents on file yet.
          </p>
        ) : (
          docs.map((d) => (
            <div key={d.fileId} style={{ fontSize: 13 }}>
              <div>
                <strong>{d.label}</strong>
                {d.licenseNumber ? <span className="muted"> · {d.licenseNumber}</span> : null}
              </div>
              <FileLink fileId={d.fileId} />
            </div>
          ))
        )}
      </div>

      {canResubmit ? (
        <div className="card card-pad stack" style={{ marginBottom: 16 }}>
          <strong>{canAmendWhileQueued ? 'Amend submission' : 'Re-upload & resubmit'}</strong>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {canAmendWhileQueued
              ? 'Fix typos or replace a document while you’re waiting. Saving marks the verification as updated for reviewers.'
              : 'Choose which required document you’re replacing, attach a PDF/JPG/PNG (≤5 MB), then resubmit.'}
          </p>
          {canAmendWhileQueued ? (
            <>
              <Field label="Business name">
                <Input value={amendName} onChange={(e) => setAmendName(e.target.value)} />
              </Field>
              <Field label="GSTIN">
                <Input value={amendGst} onChange={(e) => setAmendGst(e.target.value.toUpperCase())} />
              </Field>
              <Field label="Drug license">
                <Input value={amendDl} onChange={(e) => setAmendDl(e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={amendPhone} onChange={(e) => setAmendPhone(e.target.value)} />
              </Field>
              <Field label="Address">
                <Input value={amendAddress} onChange={(e) => setAmendAddress(e.target.value)} />
              </Field>
            </>
          ) : null}
          <Field label="Document being replaced">
            <Select
              value={replaceKind}
              onChange={(e) => setReplaceKind(e.target.value as VerificationDocKind)}
              aria-label="Document kind to replace"
            >
              {resubmitKinds.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
            {extraFileId ? 'Replace file' : canAmendWhileQueued ? 'Upload replacement document (optional)' : 'Upload updated document'}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const res = await storeFile({ actor: user, file });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message });
                  return;
                }
                setExtraFileId(res.data.id);
                pushToast({ tone: 'success', title: 'File stored', message: res.data.name });
              }}
            />
          </label>
          {extraFileId ? <FileLink fileId={extraFileId} /> : null}
          <Button
            disabled={busy || (!canAmendWhileQueued && !extraFileId)}
            onClick={async () => {
              if (!liveBiz || !selectedKindMeta) return;
              if (!canAmendWhileQueued && !extraFileId) return;
              setBusy(true);
              if (canAmendWhileQueued) {
                if (!amendName.trim()) {
                  setBusy(false);
                  pushToast({ tone: 'error', title: 'Business name is required' });
                  return;
                }
                if (!isGstin(amendGst)) {
                  setBusy(false);
                  pushToast({ tone: 'error', title: 'Invalid GSTIN' });
                  return;
                }
                if (!isLicenseNo(amendDl)) {
                  setBusy(false);
                  pushToast({ tone: 'error', title: 'Invalid drug license' });
                  return;
                }
                if (!isPhone(amendPhone)) {
                  setBusy(false);
                  pushToast({ tone: 'error', title: 'Invalid phone' });
                  return;
                }
                const gstNorm = normalizeGstin(amendGst);
                const gstTaken = await db.businesses
                  .filter((b) => b.id !== liveBiz.id && (b.gstNumber ?? '').replace(/\s/g, '').toUpperCase() === gstNorm)
                  .first();
                if (gstTaken) {
                  setBusy(false);
                  pushToast({ tone: 'error', title: 'GSTIN already registered' });
                  return;
                }
                const profileRes = await updateBusiness({
                  actor: user,
                  business: liveBiz,
                  patch: {
                    name: amendName.trim(),
                    gstNumber: gstNorm,
                    drugLicenseNumber: amendDl.trim(),
                    phone: amendPhone.trim(),
                    address: amendAddress.trim(),
                  },
                });
                if (!profileRes.ok) {
                  setBusy(false);
                  pushToast({ tone: 'error', title: profileRes.message });
                  return;
                }
              }
              let nextDocs = docs;
              if (extraFileId) {
                const replacement: VerificationDocument = {
                  kind: selectedKindMeta.kind,
                  label: selectedKindMeta.label,
                  fileId: extraFileId,
                };
                nextDocs = [...docs.filter((d) => d.kind !== selectedKindMeta.kind), replacement];
              }
              const bizForSubmit = (await db.businesses.get(liveBiz.id)) ?? liveBiz;
              const res = await submitVerification(user, bizForSubmit, {
                documents: nextDocs,
                documentIds: nextDocs.map((d) => d.fileId),
              });
              setBusy(false);
              if (!res.ok) {
                pushToast({ tone: 'error', title: res.message });
                return;
              }
              const refreshed = await db.businesses.get(liveBiz.id);
              if (refreshed) setSession(user, refreshed);
              setExtraFileId(undefined);
              pushToast({
                tone: 'success',
                title: canAmendWhileQueued ? 'Submission updated' : 'Resubmitted',
                message: canAmendWhileQueued
                  ? 'Reviewers will see the amended details in the queue.'
                  : `${selectedKindMeta.label} updated — back in the verification queue.`,
              });
            }}
          >
            {busy ? 'Submitting…' : canAmendWhileQueued ? 'Save & mark updated' : 'Resubmit for review'}
          </Button>
        </div>
      ) : null}

      <p className="muted" style={{ fontSize: 13 }}>
        Trade features unlock after admin approval. You can sign out and return later.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          clearSession();
          navigate('/auth/login');
        }}
      >
        Sign out
      </Button>
    </AuthShell>
  );
}

export function SuspendedPage() {
  const { user, business, clearSession } = useSession();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const [busy, setBusy] = useState(false);
  const portal =
    business?.type === 'Stockist' ? 'stockist' : business?.type === 'Platform' ? 'admin' : 'pharmacy';
  // Help Center is reachable without support.manage (ticket inbox may not be).
  const helpPath = `/${portal}/help`;
  const supportContact =
    business?.type === 'Stockist'
      ? 'Platform support · admin@digiswasthya.in'
      : 'Platform support · admin@digiswasthya.in · reply via Support tickets after history view';

  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <div className="banner-strip danger">This business is suspended. New trade is blocked. History is retained.</div>
      <p className="auth-sub">{business?.suspendReason ? `Reason: ${business.suspendReason}` : 'Contact platform support for reactivation.'}</p>
      <p className="muted" style={{ fontSize: 13 }}>
        Support: {supportContact}
      </p>
      <div className="stack">
        <Button
          disabled={busy || !user || !business}
          onClick={async () => {
            if (!user || !business) return;
            setBusy(true);
            const res = await requestReactivation({ actor: user, business });
            setBusy(false);
            pushToast(
              res.ok
                ? { tone: 'success', title: 'Reactivation requested', message: 'Platform admins were notified.' }
                : { tone: 'error', title: res.message },
            );
          }}
        >
          {busy ? 'Sending…' : 'Request reactivation'}
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/${portal}`)}>
          View history (read-only)
        </Button>
        <Button variant="ghost" onClick={() => navigate(helpPath)}>
          Open help center
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            clearSession();
            navigate('/auth/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </AuthShell>
  );
}

export function InviteAcceptPage() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    email: string;
    role: string;
    businessName: string;
    businessType: string;
    expiresAt?: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const { setSession } = useSession();
  const { pushToast } = useUi();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setPreviewError('Invite link is invalid.');
      return;
    }
    void getInvitePreview(token).then((res) => {
      if (!res.ok) {
        setPreview(null);
        setPreviewError(res.message);
        return;
      }
      setPreviewError(null);
      setPreview(res.data);
    });
  }, [token]);

  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">Accept your staff invite and set a password.</p>
      {previewError ? (
        <div className="banner-strip danger" style={{ marginBottom: 12 }}>
          {previewError}
        </div>
      ) : null}
      {preview ? (
        <div className="card card-pad stack" style={{ marginBottom: 14, fontSize: 13 }}>
          <div>
            <strong>{preview.businessName}</strong> · {preview.businessType}
          </div>
          <div className="muted">
            Invited as <strong>{preview.role}</strong> · {preview.name} · {preview.email}
          </div>
          {preview.expiresAt ? (
            <div className="muted">Expires {new Date(preview.expiresAt).toLocaleString()}</div>
          ) : null}
        </div>
      ) : null}
      <div className="stack">
        <Field label="New password" hint="Min 6 characters">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button
          disabled={busy || !!previewError || !preview}
          onClick={async () => {
            if (password !== confirm) {
              pushToast({ tone: 'error', title: 'Passwords do not match' });
              return;
            }
            setBusy(true);
            const res = await acceptInvite(token!, password);
            setBusy(false);
            if (!res.ok) pushToast({ tone: 'error', title: res.message });
            else {
              setSession(res.data.user, res.data.business);
              pushToast({ tone: 'success', title: 'Welcome', message: `Joined ${res.data.business.name}` });
              navigate(`/${portalFor(res.data.business.type)}`);
            }
          }}
        >
          {busy ? 'Activating…' : 'Activate account'}
        </Button>
        <Link to="/auth/login" style={{ textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

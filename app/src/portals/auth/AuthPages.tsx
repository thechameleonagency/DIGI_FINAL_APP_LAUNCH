import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { VerificationDocument } from '../../domain/entities/types';
import { portalFor } from '../../domain/permissions';
import { DEMO_OTP } from '../../domain/utils/crypto';
import { acceptInvite, getInvitePreview, login, resetPassword } from '../../services/authService';
import { DEMO_ACCOUNTS } from '../../data/seed';
import { storeFile } from '../../services/fileService';
import { requestReactivation, submitVerification } from '../../services/verificationService';
import {
  getLoginLockoutRemainingMs,
  LOGIN_LOCKOUT_MS,
  recordLoginFailure,
  recordLoginSuccess,
  takeReauthReason,
  useSession,
} from '../../store/session';
import { useUi } from '../../store/ui';
import { BannerStrip } from '../../ui/components/BannerStrip';
import { FileLink } from '../../ui/components/FileUpload';
import { Button, Field, Input } from '../../ui/components/primitives';

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
  const [lockRemaining, setLockRemaining] = useState(() => getLoginLockoutRemainingMs());
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
    if (lockRemaining <= 0) return;
    const id = window.setInterval(() => setLockRemaining(getLoginLockoutRemainingMs()), 1000);
    return () => window.clearInterval(id);
  }, [lockRemaining]);

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
          Too many failed attempts. Try again in {Math.ceil(lockRemaining / 1000)}s.
        </div>
      ) : null}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (getLoginLockoutRemainingMs() > 0) {
            setLockRemaining(getLoginLockoutRemainingMs());
            pushToast({ tone: 'warning', title: 'Temporarily locked', message: 'Wait before trying again.' });
            return;
          }
          setBusy(true);
          const res = await login(email, password);
          setBusy(false);
          if (!res.ok) {
            const fail = recordLoginFailure();
            setLockRemaining(getLoginLockoutRemainingMs());
            pushToast({
              tone: 'error',
              title: fail.locked ? 'Account login locked' : res.message,
              message: fail.locked
                ? `Too many failures. Retry in ${Math.ceil(LOGIN_LOCKOUT_MS / 60000)} minutes.`
                : res.businessImpact,
            });
            if (res.code === 'AUTH_BIZ_INACTIVE') navigate('/auth/suspended');
            return;
          }
          recordLoginSuccess();
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
      </form>
      <div className="card card-pad" style={{ marginTop: 18, fontSize: 12, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Demo accounts — click to fill, then Sign in</strong>
        <p style={{ margin: '6px 0 10px' }}>Rich seed (v5): 5 pharmacies · 5 stockists · full trade lifecycles</p>
        {(['Pharmacy', 'Stockist', 'Admin'] as const).map((group) => {
          const accounts = DEMO_ACCOUNTS.filter((a) => a.roleGroup === group);
          return (
            <div key={group} className="stack" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>{group}</div>
              {accounts.map((a, idx) => (
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
                  {idx === 0 ? `${group} — ` : ''}
                  {a.name} · {a.role} · {a.businessName}
                  <br />
                  <span style={{ opacity: 0.85 }}>
                    {a.email} · {a.password}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
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
        <Field label="New password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button
          onClick={async () => {
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
  const verification = useLiveQuery(
    () => (business ? db.verifications.where('businessId').equals(business.id).reverse().sortBy('updatedAt') : []),
    [business?.id],
  )?.[0];
  const liveBiz = useLiveQuery(() => (business ? db.businesses.get(business.id) : undefined), [business?.id]) ?? business;

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
  const canResubmit = status === 'DocumentsRequested' || status === 'Rejected';
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
          <strong>Re-upload & resubmit</strong>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Attach an updated PDF/JPG/PNG (≤5 MB), then resubmit to the admin queue.
          </p>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
            {extraFileId ? 'Replace file' : 'Upload updated document'}
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
            disabled={busy || !extraFileId}
            onClick={async () => {
              if (!extraFileId || !liveBiz) return;
              setBusy(true);
              const nextDocs: VerificationDocument[] = [
                ...docs,
                { kind: 'PharmacyCert', label: 'Updated document', fileId: extraFileId },
              ];
              const res = await submitVerification(user, liveBiz, {
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
              pushToast({ tone: 'success', title: 'Resubmitted', message: 'Back in the verification queue.' });
            }}
          >
            {busy ? 'Submitting…' : 'Resubmit for review'}
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
  const supportPath = `/${portal}/support`;
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
        <Button variant="ghost" onClick={() => navigate(supportPath)}>
          Open support
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

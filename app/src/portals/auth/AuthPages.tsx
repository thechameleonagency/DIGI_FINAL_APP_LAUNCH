import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { acceptInvite, login, registerBusiness, resetPassword } from '../../services/authService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, Field, Input, Select } from '../../ui/components/primitives';
import { portalFor } from '../../domain/permissions';
import { DEMO_OTP } from '../../domain/utils/crypto';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">{children}</div>
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('neha@careplus.pune.in');
  const [password, setPassword] = useState('Pharmacy@2026');
  const [busy, setBusy] = useState(false);
  const { setSession, user, business } = useSession();
  const { pushToast } = useUi();
  const navigate = useNavigate();

  if (user && business) {
    return <Navigate to={`/${portalFor(business.type)}`} replace />;
  }

  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">B2B pharmaceutical commerce — sign in to your Pharmacy, Stockist, or Platform Admin workspace.</p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await login(email, password);
          setBusy(false);
          if (!res.ok) {
            pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
            if (res.code === 'AUTH_BIZ_INACTIVE') navigate('/auth/suspended');
            return;
          }
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
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="card card-pad" style={{ marginTop: 18, fontSize: 12, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Demo accounts</strong>
        <div style={{ marginTop: 8 }} className="stack">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEmail('neha@careplus.pune.in'); setPassword('Pharmacy@2026'); }}>
            Pharmacy — neha@careplus.pune.in
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEmail('vikram@medroute.in'); setPassword('Stockist@2026'); }}>
            Stockist — vikram@medroute.in
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEmail('admin@digiswasthya.in'); setPassword('Admin@2026'); }}>
            Admin — admin@digiswasthya.in
          </button>
        </div>
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

export function RegisterWizardPage() {
  const { type } = useParams<{ type: string }>();
  const bizType = type === 'stockist' ? 'Stockist' : 'Pharmacy';
  const navigate = useNavigate();
  const { setSession } = useSession();
  const { pushToast } = useUi();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    businessName: '',
    gstNumber: '',
    drugLicenseNumber: '',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '',
    address: '',
    upiId: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">
        Register {bizType} — step {step + 1} of 3
      </p>
      {step === 0 && (
        <div className="stack">
          <Field label="Owner name">
            <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Password" hint="Min 6 characters">
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
          <Button onClick={() => setStep(1)}>Continue</Button>
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <Field label="Business name">
            <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
          </Field>
          <Field label="GSTIN">
            <Input value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} />
          </Field>
          <Field label="Drug license number">
            <Input value={form.drugLicenseNumber} onChange={(e) => set('drugLicenseNumber', e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="City">
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Pincode">
              <Input value={form.pincode} onChange={(e) => set('pincode', e.target.value)} />
            </Field>
          </div>
          <Field label="State">
            <Input value={form.state} onChange={(e) => set('state', e.target.value)} />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <div className="row">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={() => setStep(2)}>Continue</Button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <Field label="UPI ID (optional)">
            <Input value={form.upiId} onChange={(e) => set('upiId', e.target.value)} />
          </Field>
          <p className="muted" style={{ fontSize: 13 }}>
            Documents are stored locally for this demo. Submitting will place your business in the admin verification queue.
          </p>
          <div className="row">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await registerBusiness({ type: bizType, ...form });
                setBusy(false);
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  return;
                }
                setSession(res.data.user, res.data.business);
                pushToast({ tone: 'success', title: 'Registered', message: 'Verification submitted.' });
                navigate('/auth/pending');
              }}
            >
              {busy ? 'Submitting…' : 'Submit for verification'}
            </Button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}

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
  const { business, clearSession } = useSession();
  const navigate = useNavigate();
  if (!business) return <Navigate to="/auth/login" replace />;
  if (business.verificationStatus === 'Approved') return <Navigate to={`/${portalFor(business.type)}`} replace />;
  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">Verification status for {business.name}</p>
      <div className="timeline" style={{ marginBottom: 18 }}>
        {['Submitted', 'UnderReview', 'DocumentsRequested', 'Approved'].map((s) => (
          <div key={s} className="timeline-item">
            <div className="timeline-dot" style={{ opacity: business.verificationStatus === s || ['Approved'].includes(business.verificationStatus) ? 1 : 0.35 }} />
            <div>
              <strong>{s.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong>
              {business.verificationStatus === s ? <div className="muted">Current</div> : null}
            </div>
          </div>
        ))}
      </div>
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
  const { business, clearSession } = useSession();
  const navigate = useNavigate();
  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <div className="banner-strip danger">This business is suspended. New trade is blocked. History is retained.</div>
      <p className="auth-sub">{business?.suspendReason ? `Reason: ${business.suspendReason}` : 'Contact platform support for reactivation.'}</p>
      <div className="stack">
        <Button onClick={() => navigate('/pharmacy/support')}>Contact support</Button>
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
  const { setSession } = useSession();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  return (
    <AuthShell>
      <h1 className="auth-brand">DigiSwasthya</h1>
      <p className="auth-sub">Set a password to activate your staff invite.</p>
      <div className="stack">
        <Field label="New password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button
          onClick={async () => {
            const res = await acceptInvite(token!, password);
            if (!res.ok) pushToast({ tone: 'error', title: res.message });
            else {
              setSession(res.data.user, res.data.business);
              navigate(`/${portalFor(res.data.business.type)}`);
            }
          }}
        >
          Activate account
        </Button>
      </div>
    </AuthShell>
  );
}

export function DemoSelect() {
  return (
    <Field label="Quick fill">
      <Select disabled>
        <option>Use demo buttons on login</option>
      </Select>
    </Field>
  );
}

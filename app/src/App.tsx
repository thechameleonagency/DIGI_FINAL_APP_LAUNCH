import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePortal } from './app/guards';
import { db } from './data/db';
import { ensureSeeded } from './data/seed';
import {
  ForgotPasswordPage,
  InviteAcceptPage,
  LoginPage,
  PendingVerificationPage,
  RegisterPage,
  RegisterWizardPage,
  SuspendedPage,
} from './portals/auth/AuthPages';
import { AdminApp } from './portals/admin/AdminApp';
import { PharmacyApp } from './portals/pharmacy/PharmacyApp';
import { StockistApp } from './portals/stockist/StockistApp';
import { runPolicyClock } from './services/supportService';
import { clearPersistedSession, readPersistedSession, useSession } from './store/session';
import { useUi } from './store/ui';
import { ToastHost } from './ui/components/primitives';

export default function App() {
  const { setSession, setHydrated, clearSession } = useSession();
  const { toasts, dismissToast } = useUi();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSeeded();
      const persisted = readPersistedSession();
      if (persisted) {
        const user = await db.users.get(persisted.userId);
        const business = await db.businesses.get(persisted.businessId);
        if (user && business && user.status === 'Active' && business.accountStatus !== 'Deactivated') {
          if (!cancelled) setSession(user, business);
        } else {
          clearPersistedSession();
          if (!cancelled) clearSession();
        }
      }
      if (!cancelled) setHydrated(true);
      await runPolicyClock();
    })();
    return () => {
      cancelled = true;
    };
  }, [setSession, setHydrated, clearSession]);

  useEffect(() => {
    const onFocus = () => {
      void runPolicyClock();
    };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => void runPolicyClock(), 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, []);

  const { hydrated } = useSession();
  if (!hydrated) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-brand">DigiSwasthya</h1>
          <p className="auth-sub">Preparing local workspace…</p>
        </div>
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/auth/login" replace />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/register/:type" element={<RegisterWizardPage />} />
        <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
        <Route path="/auth/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/auth/pending" element={<PendingVerificationPage />} />
        <Route path="/auth/suspended" element={<SuspendedPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<RequirePortal type="Pharmacy" />}>
            <Route path="/pharmacy/*" element={<PharmacyApp />} />
          </Route>
          <Route element={<RequirePortal type="Stockist" />}>
            <Route path="/stockist/*" element={<StockistApp />} />
          </Route>
          <Route element={<RequirePortal type="Platform" />}>
            <Route path="/admin/*" element={<AdminApp />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </BrowserRouter>
  );
}

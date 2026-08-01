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
import { CatalogueSharePage } from './portals/public/CatalogueSharePage';
import { VerifyBillPage } from './portals/public/VerifyBillPage';
import { StockistApp } from './portals/stockist/StockistApp';
import { runPolicyClock } from './services/supportService';
import {
  clearPersistedSession,
  isSessionExpired,
  persistSession,
  readPersistedSession,
  setReauthReason,
  useSession,
} from './store/session';
import { useUi } from './store/ui';
import { ToastHost } from './ui/components/primitives';

async function revalidateSession(params: {
  clearSession: () => void;
  refreshEntities: (user: import('./domain/entities/types').User, business: import('./domain/entities/types').Business) => void;
}): Promise<void> {
  const persisted = readPersistedSession();
  if (!persisted) return;
  if (isSessionExpired(persisted.issuedAt)) {
    clearPersistedSession();
    params.clearSession();
    setReauthReason('timeout');
    return;
  }
  const user = await db.users.get(persisted.userId);
  const business = await db.businesses.get(persisted.businessId);
  if (!user || !business || business.accountStatus === 'Deactivated') {
    clearPersistedSession();
    params.clearSession();
    setReauthReason('revoked');
    return;
  }
  if (user.status === 'Suspended' || user.status === 'Removed') {
    clearPersistedSession();
    params.clearSession();
    setReauthReason('removed');
    return;
  }
  params.refreshEntities(user, business);
}

export default function App() {
  const { setSession, setHydrated, clearSession, refreshEntities } = useSession();
  const { toasts, dismissToast } = useUi();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSeeded();
      const persisted = readPersistedSession();
      if (persisted) {
        if (isSessionExpired(persisted.issuedAt)) {
          clearPersistedSession();
          setReauthReason('timeout');
          if (!cancelled) clearSession();
        } else {
          const user = await db.users.get(persisted.userId);
          const business = await db.businesses.get(persisted.businessId);
          if (
            user &&
            business &&
            user.status === 'Active' &&
            business.accountStatus !== 'Deactivated'
          ) {
            // Restore without resetting issuedAt (TTL continues).
            persistSession(user.id, business.id, persisted.issuedAt, persisted.impersonation);
            if (!cancelled) {
              if (persisted.impersonation) {
                const adminUser = await db.users.get(persisted.impersonation.adminUserId);
                const adminBusiness = await db.businesses.get(persisted.impersonation.adminBusinessId);
                if (adminUser && adminBusiness) {
                  useSession.setState({
                    user: { ...user, impersonationReadOnly: true, passwordHash: '', passwordSalt: '' },
                    business,
                    impersonation: {
                      adminUser,
                      adminBusiness,
                      reason: persisted.impersonation.reason,
                      startedAt: persisted.impersonation.startedAt,
                      targetBusinessId: persisted.impersonation.targetBusinessId,
                      notifyOwner: persisted.impersonation.notifyOwner,
                    },
                  });
                } else {
                  useSession.setState({ user, business, impersonation: null });
                }
              } else {
                useSession.setState({ user, business, impersonation: null });
              }
            }
          } else {
            clearPersistedSession();
            if (!cancelled) clearSession();
            setReauthReason('revoked');
          }
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
    const tick = () => {
      void revalidateSession({ clearSession, refreshEntities });
      void runPolicyClock();
    };
    window.addEventListener('focus', tick);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.removeEventListener('focus', tick);
      window.clearInterval(id);
    };
  }, [clearSession, refreshEntities]);

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
        <Route path="/verify-bill" element={<VerifyBillPage />} />
        <Route path="/catalogue-share/:stockistId" element={<CatalogueSharePage />} />

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

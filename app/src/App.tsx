import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePortal } from './app/guards';
import { db } from './data/db';
import { ensureEmptyWorkspace } from './data/seed';
import { ensureWorldSeeded } from './data/worldSeed';
import {
  ForgotPasswordPage,
  InviteAcceptPage,
  LoginPage,
  PendingVerificationPage,
  RegisterPage,
  RegisterWizardPage,
  SetupSuperAdminPage,
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
  extendPersistedSession,
  isSessionExpired,
  persistSession,
  readPersistedSession,
  SESSION_STORAGE_KEY,
  sessionMsRemaining,
  setReauthReason,
  shouldWarnSessionExpiry,
  useSession,
} from './store/session';
import { useUi } from './store/ui';
import { NotFoundPage } from './ui/components/NotFoundPage';
import { Button, Modal, ToastHost } from './ui/components/primitives';

async function revalidateSession(params: {
  clearSession: () => void;
  refreshEntities: (user: import('./domain/entities/types').User, business: import('./domain/entities/types').Business) => void;
  onWarnExpiry?: () => void;
}): Promise<void> {
  const persisted = readPersistedSession();
  if (!persisted) return;
  if (isSessionExpired(persisted.issuedAt)) {
    clearPersistedSession();
    params.clearSession();
    setReauthReason('timeout');
    return;
  }
  if (shouldWarnSessionExpiry(persisted.issuedAt)) {
    params.onWarnExpiry?.();
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
  const [expiryWarn, setExpiryWarn] = useState(false);
  const [expiryMinutes, setExpiryMinutes] = useState(15);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fast path: open IndexedDB + empty stamp only. Heavy world seed runs after UI paint.
      await ensureEmptyWorkspace();
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
      // Kick off rich demo seed in background (LoginPage also awaits / shows progress).
      void ensureWorldSeeded().catch((err) => {
        console.error('[worldSeed] background seed failed', err);
      });
      await runPolicyClock();
    })();
    return () => {
      cancelled = true;
    };
  }, [setSession, setHydrated, clearSession]);

  useEffect(() => {
    const tick = () => {
      void revalidateSession({
        clearSession,
        refreshEntities,
        onWarnExpiry: () => {
          const p = readPersistedSession();
          if (!p) return;
          setExpiryMinutes(Math.max(1, Math.ceil(sessionMsRemaining(p.issuedAt) / 60_000)));
          setExpiryWarn(true);
        },
      });
      void runPolicyClock();
    };
    window.addEventListener('focus', tick);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.removeEventListener('focus', tick);
      window.clearInterval(id);
    };
  }, [clearSession, refreshEntities]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_STORAGE_KEY) return;
      if (!e.newValue) {
        setExpiryWarn(false);
        clearSession();
        return;
      }
      void revalidateSession({ clearSession, refreshEntities });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
      <>
      <Modal
        open={expiryWarn}
        title="Session about to expire"
        onClose={() => setExpiryWarn(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setExpiryWarn(false);
                clearPersistedSession();
                clearSession();
                setReauthReason('timeout');
              }}
            >
              Sign out
            </Button>
            <Button
              onClick={() => {
                extendPersistedSession();
                setExpiryWarn(false);
              }}
            >
              Continue working
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          Your session expires in about {expiryMinutes} minute{expiryMinutes === 1 ? '' : 's'}. Continue to stay signed
          in, or sign out now. Unsaved form work is lost if the session ends.
        </p>
      </Modal>
      <Routes>
        <Route path="/" element={<Navigate to="/auth/login" replace />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/setup" element={<SetupSuperAdminPage />} />
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

        <Route path="*" element={<NotFoundPage homeTo="/auth/login" homeLabel="Back to sign in" />} />
      </Routes>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      </>
    </BrowserRouter>
  );
}

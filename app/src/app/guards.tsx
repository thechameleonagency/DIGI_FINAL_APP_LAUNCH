import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { portalFor, type Action } from '../domain/permissions';
import { useCan, useSession } from '../store/session';

export function RequireAuth() {
  const { user, business, hydrated } = useSession();
  const location = useLocation();
  if (!hydrated) {
    return (
      <div className="auth-page">
        <div className="muted">Loading DigiSwasthya…</div>
      </div>
    );
  }
  if (!user || !business) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  }
  // AD-11: suspended businesses may enter the portal read-only; trade stays permission-gated.
  return <Outlet />;
}

export function RequirePortal({ type }: { type: 'Pharmacy' | 'Stockist' | 'Platform' }) {
  const { business } = useSession();
  if (!business) return <Navigate to="/auth/login" replace />;
  if (business.type !== type) {
    return <Navigate to={`/${portalFor(business.type)}`} replace />;
  }
  // Trade stays permission-gated until Approved. Allow portal entry for resubmit/profile (PH-27/ST-11).
  if (
    type !== 'Platform' &&
    business.verificationStatus !== 'Approved' &&
    !['DocumentsRequested', 'Rejected'].includes(business.verificationStatus)
  ) {
    return <Navigate to="/auth/pending" replace />;
  }
  return <Outlet />;
}

/** Route guard for financial / fulfilment permission gates (F6). */
export function RequirePermission({ action, fallback }: { action: Action; fallback?: string }) {
  const allowed = useCan(action);
  const { business, impersonation } = useSession();
  // CF-25: view-as may open gated routes read-only; mutations stay blocked in services/UI.
  if (!allowed && !impersonation) {
    return <Navigate to={fallback ?? `/${portalFor(business!.type)}`} replace />;
  }
  return <Outlet />;
}

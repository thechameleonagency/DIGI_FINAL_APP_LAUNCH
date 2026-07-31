import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { portalFor } from '../domain/permissions';
import { useSession } from '../store/session';

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
  if (business.accountStatus === 'Suspended' && !location.pathname.startsWith('/auth')) {
    return <Navigate to="/auth/suspended" replace />;
  }
  return <Outlet />;
}

export function RequirePortal({ type }: { type: 'Pharmacy' | 'Stockist' | 'Platform' }) {
  const { business } = useSession();
  if (!business) return <Navigate to="/auth/login" replace />;
  if (business.type !== type) {
    return <Navigate to={`/${portalFor(business.type)}`} replace />;
  }
  if (type !== 'Platform' && business.verificationStatus !== 'Approved') {
    return <Navigate to="/auth/pending" replace />;
  }
  return <Outlet />;
}

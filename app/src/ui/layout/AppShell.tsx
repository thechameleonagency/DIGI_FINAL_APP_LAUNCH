import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Bell, Heart, Menu, ShoppingCart, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../../data/db';
import type { Action } from '../../domain/permissions';
import { exitImpersonation } from '../../services/impersonationService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { GlobalSearch } from '../components/GlobalSearch';
import { OnboardingWalkthrough } from '../components/OnboardingWalkthrough';
import { ProfileMenu } from '../components/ProfileMenu';
import { Sheet } from '../components/Sheet';
import { SuccessSummaryHost } from '../components/SuccessSummary';
import { ToastHost } from '../components/primitives';
import { PharmacyCartSheet } from '../../portals/pharmacy/pages/PharmacyCartSheet';
import { PharmacyWishlistSheet } from '../../portals/pharmacy/pages/PharmacyWishlistSheet';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Optional sidebar section header (rendered when the section changes). */
  section?: string;
  /** When set, nav item is hidden unless session.can(requires) (F6). */
  requires?: Action;
}

export function AppShell({
  title,
  nav,
  mobileNav,
  portal,
}: {
  title: string;
  nav: NavItem[];
  mobileNav: NavItem[];
  portal: 'pharmacy' | 'stockist' | 'admin';
}) {
  const { user, business, can, impersonation, endImpersonation, rolePreview, setRolePreview } = useSession();
  const { toasts, dismissToast, sidebarOpen, setSidebarOpen, pushToast } = useUi();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'cart' | 'wishlist' | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const maintenanceOn = !!useLiveQuery(() => db.platformSettings.get('platform'))?.maintenanceMode;

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    if (impersonation) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [impersonation]);
  const unread = useLiveQuery(
    async () => (user ? db.notifications.where({ userId: user.id, status: 'Unread' }).count() : 0),
    [user?.id],
  );
  const cartCount = useLiveQuery(
    async () => {
      if (portal !== 'pharmacy' || !business) return 0;
      const carts = await db.carts.where('pharmacyId').equals(business.id).toArray();
      return carts.reduce((n, c) => n + c.lines.reduce((s, l) => s + l.qty, 0), 0);
    },
    [portal, business?.id],
  );
  const wishCount = useLiveQuery(
    async () => (portal === 'pharmacy' && business ? db.wishlists.where('pharmacyId').equals(business.id).count() : 0),
    [portal, business?.id],
  );

  // During view-as, show all nav destinations (read-only); gating would hide most links.
  const visibleNav = impersonation ? nav : nav.filter((item) => !item.requires || can(item.requires));
  const visibleMobile = impersonation
    ? mobileNav
    : mobileNav.filter((item) => !item.requires || can(item.requires));

  const paths =
    portal === 'pharmacy'
      ? { profile: '/pharmacy/profile', settings: '/pharmacy/settings', help: '/pharmacy/help' }
      : portal === 'stockist'
        ? { profile: '/stockist/profile', settings: '/stockist/settings', help: '/stockist/help' }
        : { profile: '/admin/profile', settings: '/admin/settings', help: '/admin/help' };

  const showTradeTopbar = portal === 'pharmacy' && (impersonation || can('order.place'));

  const exitViewAs = async () => {
    if (!impersonation) return;
    const res = await exitImpersonation({ impersonation });
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message });
      return;
    }
    endImpersonation(res.data.user, res.data.business);
    pushToast({ tone: 'success', title: 'Exited view-as' });
    navigate('/admin/network/' + impersonation.targetBusinessId);
  };

  return (
    <div className={`app-shell${impersonation ? ' impersonation-readonly' : ''}`}>
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand row" style={{ justifyContent: 'space-between' }}>
          <span>DigiSwasthya</span>
          <button className="btn btn-ghost btn-sm sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '0 18px 12px', fontSize: 12, color: 'var(--muted)' }}>
          {title}
          <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{business?.name}</div>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map((item, idx) => {
            const prevSection = idx > 0 ? visibleNav[idx - 1]?.section : undefined;
            const showSection = item.section && item.section !== prevSection;
            return (
              <div key={item.to}>
                {showSection ? <div className="nav-section">{item.section}</div> : null}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{user?.role}</div>
        </div>
      </aside>
      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}
      <div className="main-col">
        <header className="topbar">
          <div className="row" style={{ flex: 1, minWidth: 0 }}>
            <button className="btn btn-ghost menu-toggle" aria-label="Menu" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <span className="topbar-badges row" style={{ gap: 6 }}>
              {business?.accountStatus === 'Suspended' ? <span className="badge badge-danger">Suspended</span> : null}
              {business?.plan === 'Premium' ? <span className="badge badge-success">Premium</span> : null}
              {business?.verificationStatus !== 'Approved' && business?.type !== 'Platform' ? (
                <span className="badge badge-warning">{business?.verificationStatus}</span>
              ) : null}
            </span>
            <GlobalSearch portal={portal} />
          </div>
          <div className="row">
            {user && business ? <OnboardingWalkthrough user={user} business={business} /> : null}
            {showTradeTopbar ? (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  aria-label="Wishlist"
                  type="button"
                  onClick={() => setSheet('wishlist')}
                  style={{ position: 'relative' }}
                >
                  <Heart size={16} />
                  {(wishCount ?? 0) > 0 ? (
                    <span className="topbar-count-badge">{wishCount}</span>
                  ) : null}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  aria-label="Cart"
                  type="button"
                  onClick={() => setSheet('cart')}
                  style={{ position: 'relative' }}
                >
                  <ShoppingCart size={16} />
                  {(cartCount ?? 0) > 0 ? (
                    <span className="topbar-count-badge">{cartCount}</span>
                  ) : null}
                </button>
              </>
            ) : null}
            <button
              className="btn btn-secondary btn-sm"
              aria-label="Notifications"
              onClick={() => navigate('notifications')}
              style={{ position: 'relative' }}
            >
              <Bell size={16} />
              {(unread ?? 0) > 0 ? (
                <span className="topbar-count-badge">{unread}</span>
              ) : null}
            </button>
            {impersonation ? (
              <button className="btn btn-primary btn-sm" type="button" onClick={() => void exitViewAs()}>
                Exit to admin
              </button>
            ) : (
              <ProfileMenu profilePath={paths.profile} settingsPath={paths.settings} helpPath={paths.help} />
            )}
          </div>
        </header>
        {impersonation ? (
          <div className="banner-strip warning" style={{ margin: 0, borderRadius: 0 }}>
            Viewing as {business?.name} — read-only.{' '}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void exitViewAs()}>
              Exit
            </button>
          </div>
        ) : rolePreview ? (
          <div className="banner-strip warning" style={{ margin: 0, borderRadius: 0 }}>
            Role preview: {rolePreview}.{' '}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRolePreview(null)}>
              Clear
            </button>
          </div>
        ) : null}
        {maintenanceOn && portal !== 'admin' ? (
          <div className="banner-strip warning" style={{ margin: 0, borderRadius: 0 }}>
            Platform maintenance is on — new orders and payments are paused until an admin turns it off.
          </div>
        ) : null}
        <main ref={mainRef} className="page">
          <Outlet />
        </main>
        <nav className="bottom-nav">
          {visibleMobile.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <SuccessSummaryHost />
      <Sheet open={sheet === 'cart'} title="Cart" onClose={() => setSheet(null)} width={480}>
        <PharmacyCartSheet onClose={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'wishlist'} title="Wishlist" onClose={() => setSheet(null)} width={440}>
        <PharmacyWishlistSheet onClose={() => setSheet(null)} />
      </Sheet>
    </div>
  );
}

import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Bell, Heart, Menu, Settings, ShoppingCart, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../../data/db';
import type { Action } from '../../domain/permissions';
import { exitImpersonation } from '../../services/impersonationService';
import { markRead, resolveNotificationLink } from '../../services/notificationService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { GlobalSearch } from '../components/GlobalSearch';
import { OnboardingWalkthrough } from '../components/OnboardingWalkthrough';
import { ProfileMenu } from '../components/ProfileMenu';
import { ThemeToggle } from '../components/AppearanceControls';
import { Sheet } from '../components/Sheet';
import { SuccessSummaryHost } from '../components/SuccessSummary';
import { ToastHost } from '../components/primitives';
import { BreadcrumbBar } from '../navigation/BreadcrumbBar';
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
  /** Pin to the bottom of the sidebar (e.g. Settings & data). */
  sticky?: boolean;
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
  const location = useLocation();
  const [sheet, setSheet] = useState<'cart' | 'wishlist' | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifWrapRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const maintenanceOn = !!useLiveQuery(() => db.platformSettings.get('platform'))?.maintenanceMode;
  const notificationsPath = `/${portal}/notifications`;

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    if (impersonation) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [impersonation]);

  useEffect(() => {
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!notifWrapRef.current?.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [notifOpen]);

  const unread = useLiveQuery(
    async () => (user ? db.notifications.where({ userId: user.id, status: 'Unread' }).count() : 0),
    [user?.id],
  );
  const previewNotes =
    useLiveQuery(
      () =>
        user
          ? db.notifications
              .where('userId')
              .equals(user.id)
              .filter((n) => n.status !== 'Archived')
              .reverse()
              .sortBy('createdAt')
              .then((rows) => rows.slice(0, 5))
          : [],
      [user?.id],
    ) ?? [];

  const openNotificationsPage = () => {
    setNotifOpen(false);
    navigate(notificationsPath);
  };

  const onBellClick = () => {
    if (location.pathname === notificationsPath) {
      setNotifOpen(false);
      return;
    }
    if (notifOpen) {
      openNotificationsPage();
      return;
    }
    setNotifOpen(true);
  };
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
  const mainNav = visibleNav.filter((item) => !item.sticky);
  const stickyNav = visibleNav.filter((item) => item.sticky);

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
        <div className="sidebar-brand">
          <div className="sidebar-brand-row">
            <span className="sidebar-logo-mark" aria-hidden>
              D
            </span>
            <div className="sidebar-brand-copy">
              <span className="sidebar-logo-text">DigiSwasthya</span>
              <span className="sidebar-brand-meta">
                {title}
                {business?.name ? ` · ${business.name}` : ''}
              </span>
            </div>
            <button className="btn btn-ghost btn-sm sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
        </div>
        <nav className="sidebar-nav">
          {mainNav.map((item, idx) => {
            const prevSection = idx > 0 ? mainNav[idx - 1]?.section : undefined;
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
                  <item.icon size={16} strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {stickyNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link sidebar-sticky-link${isActive ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={16} strokeWidth={1.75} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </aside>
      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}
      <div className="main-col">
        <header className="topbar">
          <div className="topbar-left">
            <button className="btn btn-ghost menu-toggle" aria-label="Menu" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <BreadcrumbBar portal={portal} variant="inline" />
          </div>
          <div className="topbar-center">
            <GlobalSearch portal={portal} />
          </div>
          <div className="topbar-right">
            {user && business ? <OnboardingWalkthrough user={user} business={business} /> : null}
            {showTradeTopbar ? (
              <>
                <button
                  className="topbar-icon-btn"
                  aria-label="Wishlist"
                  type="button"
                  onClick={() => setSheet('wishlist')}
                >
                  <Heart size={16} />
                  {(wishCount ?? 0) > 0 ? <span className="topbar-count-badge">{wishCount}</span> : null}
                </button>
                <button
                  className="topbar-icon-btn"
                  aria-label="Cart"
                  type="button"
                  onClick={() => setSheet('cart')}
                >
                  <ShoppingCart size={16} />
                  {(cartCount ?? 0) > 0 ? <span className="topbar-count-badge">{cartCount}</span> : null}
                </button>
              </>
            ) : null}
            <ThemeToggle />
            <Link to={paths.settings} className="topbar-icon-btn" aria-label="Settings">
              <Settings size={16} />
            </Link>
            <div className="notif-bell-wrap" ref={notifWrapRef}>
              <button
                className="topbar-icon-btn"
                aria-label="Notifications"
                aria-expanded={notifOpen}
                type="button"
                onClick={onBellClick}
              >
                <Bell size={16} />
                {(unread ?? 0) > 0 ? <span className="topbar-count-badge">{unread}</span> : null}
              </button>
              {notifOpen ? (
                <div className="notif-preview" role="dialog" aria-label="Notification preview">
                  <div className="notif-preview-head">
                    <strong>Notifications</strong>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={openNotificationsPage}>
                      View all
                    </button>
                  </div>
                  {!previewNotes.length ? (
                    <div className="muted" style={{ fontSize: 13, padding: '8px 4px' }}>
                      No notifications yet.
                    </div>
                  ) : (
                    <div className="notif-preview-list">
                      {previewNotes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className="notif-preview-item"
                          onClick={async () => {
                            if (user) await markRead(n.id, user.id);
                            setNotifOpen(false);
                            navigate(resolveNotificationLink(n, portal));
                          }}
                        >
                          <strong>{n.title}</strong>
                          <span className="muted">{n.body}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={openNotificationsPage}>
                    Open notifications
                  </button>
                </div>
              ) : null}
            </div>
            {impersonation ? (
              <button className="btn btn-primary btn-sm" type="button" onClick={() => void exitViewAs()}>
                Exit to admin
              </button>
            ) : (
              <ProfileMenu
                variant="header"
                profilePath={paths.profile}
                settingsPath={paths.settings}
                helpPath={paths.help}
              />
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

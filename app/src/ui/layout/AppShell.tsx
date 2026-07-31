import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Bell, LogOut, Menu } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { ToastHost } from '../components/primitives';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export function AppShell({
  title,
  nav,
  mobileNav,
}: {
  title: string;
  nav: NavItem[];
  mobileNav: NavItem[];
}) {
  const { user, business, clearSession } = useSession();
  const { toasts, dismissToast, setSidebarOpen } = useUi();
  const navigate = useNavigate();
  const unread = useLiveQuery(
    async () => (user ? db.notifications.where({ userId: user.id, status: 'Unread' }).count() : 0),
    [user?.id],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">DigiSwasthya</div>
        <div style={{ padding: '0 18px 12px', fontSize: 12, color: 'var(--muted)' }}>
          {title}
          <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{business?.name}</div>
        </div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{user?.role}</div>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <div className="row">
            <button className="btn btn-ghost" aria-label="Menu" onClick={() => setSidebarOpen(true)} style={{ display: 'none' }}>
              <Menu size={18} />
            </button>
            <strong style={{ fontSize: 14 }}>{business?.name}</strong>
            {business?.accountStatus === 'Suspended' ? <span className="badge badge-danger">Suspended</span> : null}
            {business?.verificationStatus !== 'Approved' && business?.type !== 'Platform' ? (
              <span className="badge badge-warning">{business?.verificationStatus}</span>
            ) : null}
          </div>
          <div className="row">
            <button
              className="btn btn-secondary btn-sm"
              aria-label="Notifications"
              onClick={() => navigate('notifications')}
              style={{ position: 'relative' }}
            >
              <Bell size={16} />
              {(unread ?? 0) > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    background: 'var(--danger)',
                    color: '#fff',
                    borderRadius: 99,
                    fontSize: 10,
                    padding: '1px 5px',
                    fontWeight: 700,
                  }}
                >
                  {unread}
                </span>
              ) : null}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                clearSession();
                navigate('/auth/login');
              }}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
        <nav className="bottom-nav">
          {mobileNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

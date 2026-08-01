import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, LifeBuoy, User } from 'lucide-react';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';

export function ProfileMenu({
  profilePath,
  settingsPath,
  helpPath,
}: {
  profilePath: string;
  settingsPath: string;
  helpPath: string;
}) {
  const { user, business, clearSession } = useSession();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user || !business) return null;

  const signOut = () => {
    if (!window.confirm(`Sign out ${user.name}?`)) return;
    clearSession();
    pushToast({ tone: 'info', title: 'Signed out' });
    navigate('/auth/login');
  };

  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <User size={14} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.name}
        </span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          role="menu"
          className="card card-pad"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            minWidth: 220,
            zIndex: 40,
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {user.role} · {business.name}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <Link className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} to={profilePath} onClick={() => setOpen(false)}>
              <User size={14} /> Profile
            </Link>
            <Link className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} to={settingsPath} onClick={() => setOpen(false)}>
              <Settings size={14} /> Settings
            </Link>
            <Link className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} to={helpPath} onClick={() => setOpen(false)}>
              <LifeBuoy size={14} /> Help
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={signOut}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, LifeBuoy, User } from 'lucide-react';
import { useSession } from '../../store/session';
import { signOutToLogin } from '../signOut';
import { ConfirmDialog } from './ConfirmDialog';

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
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
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

  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label="Open profile menu"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <User size={14} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.name}
        </span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
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
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {business.accountStatus === 'Suspended' ? <span className="badge badge-danger">Suspended</span> : null}
            {business.plan === 'Premium' ? <span className="badge badge-success">Premium</span> : null}
            {business.verificationStatus !== 'Approved' && business.type !== 'Platform' ? (
              <span className="badge badge-warning">{business.verificationStatus}</span>
            ) : null}
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
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ justifyContent: 'flex-start' }}
              onClick={() => {
                setOpen(false);
                setSignOutOpen(true);
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        body={`Sign out ${user.name} from ${business.name}?`}
        confirmLabel="Sign out"
        tone="danger"
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          signOutToLogin(clearSession);
        }}
      />
    </div>
  );
}

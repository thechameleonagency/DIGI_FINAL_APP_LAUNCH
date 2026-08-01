import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import {
  archiveNotification,
  markAllRead,
  markRead,
  resolveNotificationLink,
  setMutedCategories,
} from '../../services/notificationService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, EmptyState, PageHeader, Select, StatusBadge } from './primitives';

const MUTE_CATEGORIES = [
  'Order',
  'Payment',
  'Invoice',
  'Return',
  'Connection',
  'Delivery',
  'SupportTicket',
  'Announcement',
  'System',
] as const;

export function NotificationsPage({ portal }: { portal: 'pharmacy' | 'stockist' | 'admin' }) {
  const { user } = useSession();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const notes =
    useLiveQuery(() => (user ? db.notifications.where('userId').equals(user.id).reverse().sortBy('createdAt') : []), [
      user?.id,
    ]) ?? [];
  const liveUser = useLiveQuery(() => (user ? db.users.get(user.id) : undefined), [user?.id]);
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Read' | 'Archived'>('All');
  const muted = liveUser?.notificationPreferences?.mutedCategories ?? [];

  const visible = useMemo(() => {
    if (filter === 'All') return notes.filter((n) => n.status !== 'Archived');
    return notes.filter((n) => n.status === filter);
  }, [notes, filter]);

  if (!user) return null;

  const toggleMute = async (cat: string) => {
    const next = muted.includes(cat) ? muted.filter((c) => c !== cat) : [...muted, cat];
    await setMutedCategories(user.id, next);
    pushToast({ tone: 'info', title: muted.includes(cat) ? `Unmuted ${cat}` : `Muted ${cat}` });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Notifications"
        subtitle="Per-item read, filters, deep links, category mute preferences"
        actions={
          <div className="row">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              style={{ maxWidth: 140 }}
              aria-label="Filter notifications"
            >
              <option value="All">All</option>
              <option value="Unread">Unread</option>
              <option value="Read">Read</option>
              <option value="Archived">Archived</option>
            </Select>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await markAllRead(user.id);
                pushToast({ tone: 'success', title: 'All marked read' });
              }}
            >
              Mark all read
            </Button>
          </div>
        }
      />

      <div className="card card-pad stack">
        <strong>Mute categories</strong>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Muted categories are skipped when new notifications are created (CF-30).
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {MUTE_CATEGORIES.map((c) => (
            <label key={c} style={{ fontSize: 13 }}>
              <input type="checkbox" checked={muted.includes(c)} onChange={() => void toggleMute(c)} /> Mute {c}
            </label>
          ))}
        </div>
      </div>

      {!visible.length ? (
        <EmptyState
          title="No notifications"
          description="Actions and updates appear here."
          action={<Button onClick={() => navigate(`/${portal}`)}>Go to home</Button>}
        />
      ) : (
        visible.map((n) => (
          <div key={n.id} className="card card-pad stack">
            <button
              type="button"
              style={{
                textAlign: 'left',
                width: '100%',
                cursor: 'pointer',
                opacity: n.status === 'Read' || n.status === 'Archived' ? 0.75 : 1,
                border: 'none',
                background: 'transparent',
                padding: 0,
                color: 'inherit',
                borderLeft: n.status === 'Unread' ? '3px solid var(--accent)' : undefined,
                paddingLeft: n.status === 'Unread' ? 8 : 0,
              }}
              onClick={async () => {
                await markRead(n.id, user.id);
                navigate(resolveNotificationLink(n, portal));
              }}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{n.title}</strong>
                <div className="row">
                  <StatusBadge status={n.status} />
                  <span className="muted" style={{ fontSize: 11 }}>
                    {n.code}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 13.5, marginTop: 4 }}>{n.body}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                {new Date(n.createdAt).toLocaleString()}
                {n.entityType ? ` · ${n.entityType}` : ''}
              </div>
            </button>
            <div className="row">
              {n.status !== 'Read' && n.status !== 'Archived' ? (
                <Button size="sm" variant="secondary" onClick={() => void markRead(n.id, user.id)}>
                  Mark read
                </Button>
              ) : null}
              {n.status !== 'Archived' ? (
                <Button size="sm" variant="ghost" onClick={() => void archiveNotification(n.id, user.id)}>
                  Dismiss
                </Button>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

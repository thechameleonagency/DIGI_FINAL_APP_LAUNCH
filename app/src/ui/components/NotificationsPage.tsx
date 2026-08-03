import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { entityTypeLabel } from '../../domain/utils/humanLabels';
import {
  archiveNotification,
  markAllRead,
  markRead,
  resolveNotificationLink,
  unarchiveNotification,
} from '../../services/notificationService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { usePersistedPageSize } from '../hooks/usePersistedPageSize';
import { PaginationBar, useTableSectionRef } from './ListToolkit';
import { NotificationMutePreferences } from './NotificationMutePreferences';
import { Button, EmptyState, LoadingState, PageHeader, Select, StatusBadge } from './primitives';

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yday = new Date();
  yday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function NotificationsPage({ portal }: { portal: 'pharmacy' | 'stockist' | 'admin' }) {
  const { user } = useSession();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const notesRaw = useLiveQuery(
    () => (user ? db.notifications.where('userId').equals(user.id).reverse().sortBy('createdAt') : []),
    [user?.id],
  );
  const loading = notesRaw === undefined;
  const notes = notesRaw ?? [];
  const liveUser = useLiveQuery(() => (user ? db.users.get(user.id) : undefined), [user?.id]);
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Read' | 'Archived'>('All');
  const [page, setPage] = useState(0);
  const { pageSize, setPageSize } = usePersistedPageSize(`notifications-${portal}`);
  const tableRef = useTableSectionRef();
  const muted = liveUser?.notificationPreferences?.mutedCategories ?? [];

  const visible = useMemo(() => {
    if (filter === 'All') return notes.filter((n) => n.status !== 'Archived');
    return notes.filter((n) => n.status === filter);
  }, [notes, filter]);

  useEffect(() => {
    setPage(0);
  }, [filter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * pageSize, safePage * pageSize + pageSize);

  if (!user) return null;

  return (
    <div className="stack">
      <PageHeader
        title="Notifications"
        subtitle="Per-item read, filters, deep links, category mute preferences"
        actions={
          <div className="page-header-controls">
            <Select
              className="select-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
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

      <NotificationMutePreferences userId={user.id} muted={muted} />

      {loading ? (
        <LoadingState label="Loading notifications…" />
      ) : !visible.length ? (
        <EmptyState
          title="No notifications"
          description="Actions and updates appear here."
          action={<Button onClick={() => navigate(`/${portal}`)}>Go to home</Button>}
        />
      ) : (
        <>
          <section className="table-section" ref={tableRef}>
            {pageRows.map((n, i) => {
              const heading = dayHeading(n.createdAt);
              const prev = i > 0 ? dayHeading(pageRows[i - 1]!.createdAt) : null;
              const showDay = heading !== prev;
              return (
                <div key={n.id} className="stack" style={{ gap: 8 }}>
                  {showDay ? (
                    <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginTop: i === 0 ? 0 : 8 }}>
                      {heading}
                    </div>
                  ) : null}
                  <div className="card card-pad stack notification-item">
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
                      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                        <strong>{n.title}</strong>
                        <StatusBadge status={n.status} />
                      </div>
                      <div style={{ fontSize: 13.5, marginTop: 4 }}>{n.body}</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleString()}
                        {n.entityType ? ` · ${entityTypeLabel(n.entityType)}` : ''}
                      </div>
                    </button>
                    <div className="row notification-item-actions">
                      {n.status !== 'Read' && n.status !== 'Archived' ? (
                        <Button size="sm" variant="secondary" onClick={() => void markRead(n.id, user.id)}>
                          Mark read
                        </Button>
                      ) : null}
                      {n.status !== 'Archived' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const prev = n.status === 'Read' ? 'Read' : 'Unread';
                            void archiveNotification(n.id, user.id).then(() => {
                              pushToast({
                                tone: 'info',
                                title: 'Notification dismissed',
                                actionLabel: 'Undo',
                                onAction: () => unarchiveNotification(n.id, user.id, prev),
                              });
                            });
                          }}
                        >
                          Dismiss
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
          <PaginationBar
            page={safePage}
            pageCount={pageCount}
            total={visible.length}
            onPage={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
        </>
      )}
    </div>
  );
}

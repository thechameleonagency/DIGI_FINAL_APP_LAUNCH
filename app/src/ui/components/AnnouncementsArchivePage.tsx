import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { EmptyState, PageHeader } from './primitives';

export function AnnouncementsArchivePage({
  audience,
}: {
  audience: 'Pharmacy' | 'Stockist' | 'Admin';
}) {
  const items = useLiveQuery(() => db.announcements.toArray()) ?? [];
  // Admin archive is platform-wide; pharmacy/stockist see only their audience.
  const list = items
    .filter((a) => audience === 'Admin' || !a.targetRoles?.length || a.targetRoles.includes(audience))
    .sort((a, b) => (b.startsAt || b.createdAt || '').localeCompare(a.startsAt || a.createdAt || ''));

  return (
    <div className="stack">
      <PageHeader title="Announcements" subtitle="Current and past platform notices" />
      {!list.length ? (
        <EmptyState title="No announcements" description="Published notices will appear here." />
      ) : (
        list.map((a) => {
          const ended = a.endsAt ? new Date(a.endsAt) < new Date() : false;
          const inactive = !a.active || ended;
          return (
            <div key={a.id} className="card card-pad stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <strong>{a.title}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {inactive ? 'Archived' : a.priority ?? 'Active'}
                </span>
              </div>
              <div style={{ fontSize: 13 }}>{a.body}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {a.startsAt ? new Date(a.startsAt).toLocaleString() : '—'}
                {a.endsAt ? ` → ${new Date(a.endsAt).toLocaleString()}` : ''}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { isAnnouncementVisible } from '../../services/announcementService';
import { db } from '../../data/db';
import { useSession } from '../../store/session';

function dismissKey(userId: string) {
  return `ds.announcements.dismissed.${userId}`;
}

function readDismissed(userId: string): string[] {
  try {
    const raw = localStorage.getItem(dismissKey(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(userId: string, ids: string[]) {
  localStorage.setItem(dismissKey(userId), JSON.stringify(ids));
}

export function AnnouncementStrip({
  audience,
  placement,
  limit = 3,
  archivePath,
}: {
  audience: 'Pharmacy' | 'Stockist' | 'Admin';
  placement: string;
  limit?: number;
  archivePath?: string;
}) {
  const { user } = useSession();
  const items = useLiveQuery(() => db.announcements.toArray()) ?? [];
  const [dismissed, setDismissed] = useState<string[]>(() => (user ? readDismissed(user.id) : []));

  const visible = useMemo(() => {
    const dismissedSet = new Set(dismissed);
    return items
      .filter((a) => isAnnouncementVisible(a, { audience, placement }) && !dismissedSet.has(a.id))
      .sort((a, b) => {
        const pr = { High: 0, Medium: 1, Low: 2 } as const;
        const ap = pr[a.priority ?? 'Medium'];
        const bp = pr[b.priority ?? 'Medium'];
        if (ap !== bp) return ap - bp;
        return (b.startsAt || '').localeCompare(a.startsAt || '');
      })
      .slice(0, limit);
  }, [items, audience, placement, dismissed, limit]);

  if (!visible.length && !archivePath) return null;
  if (!visible.length) {
    return archivePath ? (
      <div className="muted" style={{ fontSize: 12 }}>
        <Link to={archivePath}>Announcement archive</Link>
      </div>
    ) : null;
  }

  return (
    <div className="stack">
      {visible.map((a) => (
        <div key={a.id} className={`banner-strip ${a.priority === 'High' ? 'warning' : ''}`}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div>
              <strong>{a.title}</strong>
              <div style={{ fontSize: 13 }}>{a.body}</div>
            </div>
            {user ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const next = [...new Set([...dismissed, a.id])];
                  setDismissed(next);
                  writeDismissed(user.id, next);
                }}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {archivePath ? (
        <div className="muted" style={{ fontSize: 12 }}>
          <Link to={archivePath}>Announcement archive</Link>
        </div>
      ) : null}
    </div>
  );
}

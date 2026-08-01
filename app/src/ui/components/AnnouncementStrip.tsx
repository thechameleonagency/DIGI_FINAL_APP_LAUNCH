import { useLiveQuery } from 'dexie-react-hooks';
import { isAnnouncementVisible } from '../../services/announcementService';
import { db } from '../../data/db';

export function AnnouncementStrip({
  audience,
  placement,
  limit = 3,
}: {
  audience: 'Pharmacy' | 'Stockist' | 'Admin';
  placement: string;
  limit?: number;
}) {
  const items = useLiveQuery(() => db.announcements.toArray()) ?? [];
  const visible = items
    .filter((a) => isAnnouncementVisible(a, { audience, placement }))
    .sort((a, b) => {
      const pr = { High: 0, Medium: 1, Low: 2 } as const;
      const ap = pr[a.priority ?? 'Medium'];
      const bp = pr[b.priority ?? 'Medium'];
      if (ap !== bp) return ap - bp;
      return (b.startsAt || '').localeCompare(a.startsAt || '');
    })
    .slice(0, limit);

  if (!visible.length) return null;
  return (
    <div className="stack">
      {visible.map((a) => (
        <div key={a.id} className={`banner-strip ${a.priority === 'High' ? 'warning' : ''}`}>
          <strong>{a.title}</strong>
          <div style={{ fontSize: 13 }}>{a.body}</div>
        </div>
      ))}
    </div>
  );
}

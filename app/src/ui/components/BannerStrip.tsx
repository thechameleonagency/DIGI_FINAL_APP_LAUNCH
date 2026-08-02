import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isBannerVisible } from '../../services/bannerService';
import { db } from '../../data/db';
import { useSession } from '../../store/session';

function dismissKey(userId: string) {
  return `ds.banners.dismissed.${userId}`;
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

export function BannerStrip({ placement, limit = 3 }: { placement: string; limit?: number }) {
  const { user } = useSession();
  const banners = useLiveQuery(() => db.banners.toArray()) ?? [];
  const [dismissed, setDismissed] = useState<string[]>(() => (user ? readDismissed(user.id) : []));
  const visible = useMemo(() => {
    const dismissedSet = new Set(dismissed);
    return banners.filter((b) => isBannerVisible(b, placement) && !dismissedSet.has(b.id)).slice(0, limit);
  }, [banners, placement, dismissed, limit]);

  if (!visible.length) return null;
  return (
    <div className="stack">
      {visible.map((b) => (
        <div key={b.id} className={`banner-strip ${b.tone === 'warning' || b.tone === 'danger' ? 'warning' : ''}`}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div>{b.text}</div>
            {user ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const next = [...new Set([...dismissed, b.id])];
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
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { isBannerVisible } from '../../services/bannerService';
import { db } from '../../data/db';

export function BannerStrip({ placement, limit = 3 }: { placement: string; limit?: number }) {
  const banners = useLiveQuery(() => db.banners.toArray()) ?? [];
  const visible = banners.filter((b) => isBannerVisible(b, placement)).slice(0, limit);
  if (!visible.length) return null;
  return (
    <div className="stack">
      {visible.map((b) => (
        <div key={b.id} className={`banner-strip ${b.tone === 'warning' || b.tone === 'danger' ? 'warning' : ''}`}>
          {b.text}
        </div>
      ))}
    </div>
  );
}

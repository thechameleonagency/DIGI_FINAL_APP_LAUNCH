import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface QuickActionItem {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  primary?: boolean;
}

/** MSS-style quick action card grid for portal home pages. */
export function QuickActions({
  title = 'Quick actions',
  items,
}: {
  title?: string;
  items: QuickActionItem[];
}) {
  if (!items.length) return null;
  return (
    <section className="stack" style={{ gap: 10 }}>
      <h2 className="quick-actions-heading">{title}</h2>
      <div className="quick-actions-grid">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={`${item.to}-${item.title}`}
              to={item.to}
              className={`quick-action-card${item.primary ? ' is-primary' : ''}`}
            >
              <span className="quick-action-icon" aria-hidden>
                <Icon size={18} strokeWidth={2} />
              </span>
              <span className="quick-action-copy">
                <strong>{item.title}</strong>
                <span className="muted">{item.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

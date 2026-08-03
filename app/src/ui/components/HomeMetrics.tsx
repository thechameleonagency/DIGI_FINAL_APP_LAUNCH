import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type HomeMetricTone = 'neutral' | 'danger' | 'warning' | 'success' | 'info';

export interface HomeMetricCardProps {
  title: string;
  value: ReactNode;
  icon: LucideIcon;
  badge?: string;
  tone?: HomeMetricTone;
  detail?: ReactNode;
  to: string;
  linkLabel: string;
  highlight?: boolean;
}

/** MSS-style dashboard metric tile: title, value, badge, footer link. */
export function HomeMetricCard({
  title,
  value,
  icon: Icon,
  badge,
  detail,
  to,
  linkLabel,
  highlight,
}: HomeMetricCardProps) {
  return (
    <article className={`home-metric-card${highlight ? ' is-highlight' : ''}`}>
      <div className="home-metric-top">
        <h3 className="home-metric-title">{title}</h3>
        <span className="home-metric-icon" aria-hidden>
          <Icon size={16} strokeWidth={2} />
        </span>
      </div>
      <div className="home-metric-value-row">
        <div className="home-metric-value">{value}</div>
        {badge ? <span className="home-metric-badge">{badge}</span> : null}
      </div>
      {detail ? <div className="home-metric-detail">{detail}</div> : null}
      <Link className="home-metric-link" to={to}>
        {linkLabel} <span aria-hidden>→</span>
      </Link>
    </article>
  );
}

export function HomeMetricGrid({ children }: { children: ReactNode }) {
  return <div className="home-metric-grid">{children}</div>;
}

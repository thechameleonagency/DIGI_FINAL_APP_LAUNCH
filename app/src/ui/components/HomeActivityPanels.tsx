import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MapPin } from 'lucide-react';
import type { Notification } from '../../domain/entities/types';

export type ActivityStat = { label: string; value: string | number };
export type ActivityItem = {
  id: string;
  title: string;
  meta?: string;
  badge?: string;
  to?: string;
};

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** MSS-style “Today’s activity” panel. */
export function TodaysActivityPanel({
  title = "Today's activity",
  badge,
  stats,
  items,
  emptyLabel = 'Nothing queued for today.',
  primaryAction,
  secondaryAction,
}: {
  title?: string;
  badge?: string;
  stats: ActivityStat[];
  items: ActivityItem[];
  emptyLabel?: string;
  primaryAction?: { to: string; label: string };
  secondaryAction?: { to: string; label: string };
}) {
  return (
    <section className="home-panel card card-pad stack">
      <div className="home-panel-head">
        <div className="home-panel-title-row">
          <MapPin size={16} aria-hidden className="home-panel-title-icon" />
          <div>
            <h2 className="home-panel-title">{title}</h2>
            <div className="muted" style={{ fontSize: 12 }}>
              {todayLabel()}
            </div>
          </div>
        </div>
        {badge ? <span className="home-panel-badge">{badge}</span> : null}
      </div>

      <div className="home-activity-stats">
        {stats.map((s) => (
          <div key={s.label} className="home-activity-stat">
            <div className="home-activity-stat-label">{s.label}</div>
            <div className="home-activity-stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="home-activity-list">
        {!items.length ? (
          <div className="muted" style={{ fontSize: 13 }}>
            {emptyLabel}
          </div>
        ) : (
          items.map((item) => {
            const body = (
              <>
                <div className="home-activity-item-copy">
                  <strong>{item.title}</strong>
                  {item.meta ? <span className="muted">{item.meta}</span> : null}
                </div>
                {item.badge ? <span className="home-activity-item-badge">{item.badge}</span> : null}
              </>
            );
            return item.to ? (
              <Link key={item.id} to={item.to} className="home-activity-item is-link">
                {body}
              </Link>
            ) : (
              <div key={item.id} className="home-activity-item">
                {body}
              </div>
            );
          })
        )}
      </div>

      {(primaryAction || secondaryAction) && (
        <div className="home-panel-actions">
          {primaryAction ? (
            <Link className="btn btn-primary btn-sm" to={primaryAction.to}>
              {primaryAction.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link className="btn btn-secondary btn-sm" to={secondaryAction.to}>
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Support alerts panel backed by notifications. */
export function SupportAlertsPanel({
  notifications,
  notificationsPath,
  title = 'Support alerts',
}: {
  notifications: Notification[];
  notificationsPath: string;
  title?: string;
}) {
  const unread = notifications.filter((n) => n.status === 'Unread');
  const list = (unread.length ? unread : notifications).slice(0, 5);

  return (
    <section className="home-panel card card-pad stack">
      <div className="home-panel-head">
        <div className="home-panel-title-row">
          <Bell size={16} aria-hidden className="home-panel-title-icon" />
          <h2 className="home-panel-title">{title}</h2>
        </div>
        <Link className="btn btn-ghost btn-sm" to={notificationsPath}>
          View all
        </Link>
      </div>
      {!list.length ? (
        <div className="muted" style={{ fontSize: 13 }}>
          No open alerts right now.
        </div>
      ) : (
        <div className="home-alerts-list">
          {list.map((n) => (
            <Link key={n.id} to={notificationsPath} className="home-alert-item">
              <strong>{n.title}</strong>
              <span className="muted">{n.body}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function HomeDashboardLayout({
  main,
  side,
}: {
  main: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="home-dashboard-layout">
      <div className="home-dashboard-main">{main}</div>
      <div className="home-dashboard-side stack">{side}</div>
    </div>
  );
}

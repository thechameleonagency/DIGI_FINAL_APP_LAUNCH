import { notificationCategoryLabel } from '../../domain/utils/humanLabels';
import { CRITICAL_NOTIFICATION_CATEGORIES } from '../../services/preferencesService';
import { setMutedCategories } from '../../services/notificationService';
import { useUi } from '../../store/ui';

/** Shared categories — keep Notifications and Preferences in sync. */
export const NOTIFICATION_MUTE_CATEGORIES = [
  ...CRITICAL_NOTIFICATION_CATEGORIES,
  'Order',
  'Payment',
  'Invoice',
  'Return',
  'Connection',
  'Delivery',
  'SupportTicket',
  'Announcement',
  'System',
  'UpgradeRequest',
] as const;

export function NotificationMutePreferences({
  userId,
  muted,
}: {
  userId: string;
  muted: string[];
}) {
  const { pushToast } = useUi();
  const critical = CRITICAL_NOTIFICATION_CATEGORIES as readonly string[];

  const toggleMute = async (cat: string) => {
    if (critical.includes(cat)) return;
    const next = muted.includes(cat) ? muted.filter((c) => c !== cat) : [...muted, cat];
    const prev = [...muted];
    await setMutedCategories(userId, next);
    const label = notificationCategoryLabel(cat);
    pushToast({
      tone: 'info',
      title: muted.includes(cat) ? `Unmuted ${label}` : `Muted ${label}`,
      actionLabel: 'Undo',
      onAction: () => setMutedCategories(userId, prev),
    });
  };

  return (
    <div className="card card-pad stack">
      <strong>Mute categories</strong>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Muted categories are skipped when new notifications are created. Critical alerts
        ({critical.map(notificationCategoryLabel).join(', ') || 'none'}) cannot be muted.
      </p>
      <div className="mute-categories-grid">
        {NOTIFICATION_MUTE_CATEGORIES.map((c) => {
          const locked = critical.includes(c);
          const label = notificationCategoryLabel(c);
          return (
            <label
              key={c}
              style={{ opacity: locked ? 0.55 : 1 }}
              title={locked ? 'This category cannot be muted' : undefined}
            >
              <input
                type="checkbox"
                checked={muted.includes(c)}
                disabled={locked}
                onChange={() => void toggleMute(c)}
              />
              <span>
                Mute {label}
                {locked ? <span className="muted"> (required)</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

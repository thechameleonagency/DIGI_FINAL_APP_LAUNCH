import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { requestWalkthroughReplay } from '../../content/help';
import {
  CRITICAL_NOTIFICATION_CATEGORIES,
  readStoredLocalFirstHint,
  readStoredTheme,
  saveUiPreferences,
  type ThemeMode,
} from '../../services/preferencesService';
import { setMutedCategories } from '../../services/notificationService';
import { readPersistedSession, useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, Field, PageHeader, Select } from './primitives';

const MUTE_CATEGORIES = [
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
  'CounterfeitReport',
  'Batch',
] as const;

export function PreferencesPanel({
  profilePath,
  helpPath,
}: {
  profilePath: string;
  helpPath: string;
}) {
  const { user, business, clearSession } = useSession();
  const { pushToast } = useUi();
  const liveUser = useLiveQuery(() => (user ? db.users.get(user.id) : undefined), [user?.id]);
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme());
  const [language, setLanguage] = useState<'en'>('en');
  const [localHint, setLocalHint] = useState(readStoredLocalFirstHint());
  const muted = liveUser?.notificationPreferences?.mutedCategories ?? [];
  const session = readPersistedSession();
  const sessionStarted = session ? new Date(session.issuedAt).toLocaleString() : '—';

  useEffect(() => {
    if (!liveUser?.uiPreferences) return;
    if (liveUser.uiPreferences.theme) setTheme(liveUser.uiPreferences.theme);
    if (liveUser.uiPreferences.language) setLanguage(liveUser.uiPreferences.language);
    if (liveUser.uiPreferences.showLocalFirstHint != null) {
      setLocalHint(liveUser.uiPreferences.showLocalFirstHint);
    }
  }, [liveUser?.uiPreferences]);

  if (!user || !business) return null;

  const persistUi = async (patch: { theme?: ThemeMode; language?: 'en'; showLocalFirstHint?: boolean }) => {
    await saveUiPreferences({ userId: user.id, patch });
    pushToast({ tone: 'success', title: 'Preferences saved' });
  };

  const toggleMute = async (cat: string) => {
    if ((CRITICAL_NOTIFICATION_CATEGORIES as readonly string[]).includes(cat)) return;
    const next = muted.includes(cat) ? muted.filter((c) => c !== cat) : [...muted, cat];
    await setMutedCategories(user.id, next);
    pushToast({ tone: 'info', title: muted.includes(cat) ? `Unmuted ${cat}` : `Muted ${cat}` });
  };

  return (
    <div className="stack">
      <PageHeader title="Preferences" subtitle="Appearance, notifications, and session (CF-30)" />

      <div className="card card-pad stack">
        <strong>Appearance</strong>
        <Field label="Theme">
          <Select
            value={theme}
            onChange={(e) => {
              const t = e.target.value as ThemeMode;
              setTheme(t);
              void persistUi({ theme: t });
            }}
          >
            <option value="light">Light (default)</option>
            <option value="dark">Dark</option>
          </Select>
        </Field>
        <Field label="Language">
          <Select
            value={language}
            onChange={(e) => {
              const lang = e.target.value as 'en';
              setLanguage(lang);
              void persistUi({ language: lang });
            }}
          >
            <option value="en">English</option>
          </Select>
        </Field>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Copy is English today; the selector is ready for additional locales.
        </p>
        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={localHint}
            onChange={(e) => {
              const v = e.target.checked;
              setLocalHint(v);
              void persistUi({ showLocalFirstHint: v });
            }}
          />{' '}
          Show “data stored locally in this browser” hint
        </label>
      </div>

      <div className="card card-pad stack">
        <strong>Notification mutes</strong>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Verification and Business alerts cannot be muted.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {MUTE_CATEGORIES.map((c) => (
            <label key={c} style={{ fontSize: 13 }}>
              <input type="checkbox" checked={muted.includes(c)} onChange={() => void toggleMute(c)} /> Mute {c}
            </label>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Also editable under Notifications.
        </p>
      </div>

      <div className="card card-pad stack">
        <strong>Session</strong>
        <div style={{ fontSize: 13 }}>
          {user.name} · {user.role} · {business.name}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Session started: {sessionStarted}
        </div>
        <div className="row gap">
          <Link className="btn btn-secondary btn-sm" to={profilePath}>
            Profile
          </Link>
          <Link className="btn btn-secondary btn-sm" to={helpPath}>
            Help
          </Link>
          <Button type="button" variant="secondary" size="sm" onClick={() => requestWalkthroughReplay()}>
            Replay walkthrough
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              if (window.confirm('Sign out of DigiSwasthya?')) {
                clearSession();
                window.location.href = '/auth/login';
              }
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

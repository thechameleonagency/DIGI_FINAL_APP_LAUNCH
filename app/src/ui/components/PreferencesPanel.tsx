import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { requestWalkthroughReplay } from '../../content/help';
import { portalFor } from '../../domain/permissions';
import {
  readStoredLocalFirstHint,
  saveUiPreferences,
} from '../../services/preferencesService';
import { readPersistedSession, useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { signOutToLogin } from '../signOut';
import { ConfirmDialog } from './ConfirmDialog';
import { NotificationMutePreferences } from './NotificationMutePreferences';
import { Button, Field, PageHeader, Select } from './primitives';

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
  const [language, setLanguage] = useState<'en'>('en');
  const [localHint, setLocalHint] = useState(readStoredLocalFirstHint());
  const [signOutOpen, setSignOutOpen] = useState(false);
  const muted = liveUser?.notificationPreferences?.mutedCategories ?? [];
  const session = readPersistedSession();
  const sessionStarted = session ? new Date(session.issuedAt).toLocaleString() : '—';

  useEffect(() => {
    if (!liveUser?.uiPreferences) return;
    if (liveUser.uiPreferences.language) setLanguage(liveUser.uiPreferences.language);
    if (liveUser.uiPreferences.showLocalFirstHint != null) {
      setLocalHint(liveUser.uiPreferences.showLocalFirstHint);
    }
  }, [liveUser?.uiPreferences]);

  if (!user || !business) return null;

  const appearancePath = `/${portalFor(business.type)}/appearance`;

  const persistUi = async (patch: { language?: 'en'; showLocalFirstHint?: boolean }) => {
    await saveUiPreferences({ userId: user.id, patch });
    pushToast({ tone: 'success', title: 'Preferences saved' });
  };

  return (
    <div className="stack">
      <PageHeader title="Preferences" subtitle="Appearance, notifications, and session" />

      <div className="card card-pad stack">
        <strong>Appearance</strong>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Theme and accent color live in the Appearance module.
        </p>
        <Link className="btn btn-secondary btn-sm" to={appearancePath} style={{ width: 'fit-content' }}>
          Open Appearance
        </Link>
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

      <NotificationMutePreferences userId={user.id} muted={muted} />

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
          <Button type="button" variant="danger" size="sm" onClick={() => setSignOutOpen(true)}>
            Sign out
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        body={`Sign out ${user.name} from ${business.name}?`}
        confirmLabel="Sign out"
        tone="danger"
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          signOutToLogin(clearSession);
        }}
      />
    </div>
  );
}

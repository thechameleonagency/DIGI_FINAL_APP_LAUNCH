import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, HelpCircle, Moon, Palette, Shield, Sun, User } from 'lucide-react';
import {
  ACCENT_OPTIONS,
  applyAccent,
  applyTheme,
  readStoredAccent,
  readStoredTheme,
  saveUiPreferences,
  type AccentColor,
  type ThemeMode,
} from '../../services/preferencesService';
import { portalFor } from '../../domain/permissions';
import { useSession } from '../../store/session';
import { PageHeader } from './primitives';

function useAppearancePrefs() {
  const { user } = useSession();
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());
  const [accent, setAccent] = useState<AccentColor>(() => readStoredAccent());

  useEffect(() => {
    const sync = () => {
      setTheme(readStoredTheme());
      setAccent(readStoredAccent());
    };
    window.addEventListener('storage', sync);
    window.addEventListener('ds-theme-change', sync);
    window.addEventListener('ds-accent-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('ds-theme-change', sync);
      window.removeEventListener('ds-accent-change', sync);
    };
  }, []);

  const setMode = async (next: ThemeMode) => {
    applyTheme(next);
    setTheme(next);
    window.dispatchEvent(new Event('ds-theme-change'));
    if (user) {
      try {
        await saveUiPreferences({ userId: user.id, patch: { theme: next } });
      } catch {
        /* local theme still applied */
      }
    }
  };

  const setAccentColor = async (next: AccentColor) => {
    applyAccent(next);
    setAccent(next);
    window.dispatchEvent(new Event('ds-accent-change'));
    if (user) {
      try {
        await saveUiPreferences({ userId: user.id, patch: { accent: next } });
      } catch {
        /* local accent still applied */
      }
    }
  };

  return { theme, setMode, accent, setAccentColor };
}

/** Header moon/sun control (MSS-style). */
export function ThemeToggle() {
  const { theme, setMode } = useAppearancePrefs();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="topbar-icon-btn"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      onClick={() => void setMode(next)}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/** MSS-style theme + accent picker (used on Appearance page). */
export function AppearanceModule() {
  const { theme, setMode, accent, setAccentColor } = useAppearancePrefs();

  return (
    <div className="appearance-page-card card card-pad stack">
      <div>
        <h2 className="appearance-page-heading">Appearance</h2>
        <p className="muted appearance-page-sub">Customize the look and feel.</p>
      </div>

      <div className="appearance-section">
        <div className="appearance-section-label">Theme</div>
        <div className="appearance-theme-grid">
          <button
            type="button"
            className={`appearance-theme-card${theme === 'dark' ? ' is-active' : ''}`}
            onClick={() => void setMode('dark')}
            aria-pressed={theme === 'dark'}
          >
            <span className="appearance-theme-orb is-dark" aria-hidden>
              <Moon size={22} />
            </span>
            <span className="appearance-theme-name">Dark</span>
          </button>
          <button
            type="button"
            className={`appearance-theme-card${theme === 'light' ? ' is-active' : ''}`}
            onClick={() => void setMode('light')}
            aria-pressed={theme === 'light'}
          >
            <span className="appearance-theme-orb is-light" aria-hidden>
              <Sun size={22} />
            </span>
            <span className="appearance-theme-name">Light</span>
          </button>
        </div>
      </div>

      <div className="appearance-section">
        <div className="appearance-section-label">Accent color</div>
        <div className="appearance-accent-row" role="listbox" aria-label="Accent color">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={accent === opt.id}
              aria-label={opt.label}
              title={opt.label}
              className={`appearance-accent-swatch${accent === opt.id ? ' is-active' : ''}`}
              style={{ ['--swatch' as string]: opt.swatch }}
              onClick={() => void setAccentColor(opt.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Dedicated Appearance settings page with side nav (MSS). */
export function AppearancePage() {
  const { user, business } = useSession();
  const location = useLocation();
  if (!user || !business) return null;

  const portal = portalFor(business.type);
  const base = `/${portal}`;
  const nav = [
    { to: `${base}/profile`, label: 'Profile', icon: User },
    { to: `${base}/appearance`, label: 'Appearance', icon: Palette },
    { to: `${base}/notifications`, label: 'Notifications', icon: Bell },
    { to: `${base}/settings`, label: 'Settings & data', icon: Shield },
    { to: `${base}/help`, label: 'Help', icon: HelpCircle },
  ];

  return (
    <div className="stack">
      <PageHeader title="Appearance" subtitle="Customize the look and feel of DigiSwasthya" />
      <div className="appearance-layout">
        <nav className="appearance-settings-nav card" aria-label="Account settings">
          {nav.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`appearance-settings-nav-item${active ? ' is-active' : ''}`}
              >
                <item.icon size={16} strokeWidth={1.75} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <AppearanceModule />
      </div>
    </div>
  );
}

import type { User } from '../domain/entities/types';
import { db } from '../data/db';
import { nowIso } from '../domain/utils/clock';

export type ThemeMode = 'light' | 'dark';
export type AccentColor = 'blue' | 'green' | 'grey' | 'orange' | 'red';
export type UiLanguage = 'en';

export type UiPreferences = NonNullable<User['uiPreferences']>;

const THEME_KEY = 'ds.theme';
const ACCENT_KEY = 'ds.accent';
const LOCAL_HINT_KEY = 'ds.localFirstHint';

export const ACCENT_OPTIONS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: '#4a7399' },
  { id: 'green', label: 'Green', swatch: '#2f7d4f' },
  { id: 'grey', label: 'Grey', swatch: '#64748b' },
  { id: 'orange', label: 'Orange', swatch: '#c2410c' },
  { id: 'red', label: 'Red', swatch: '#b91c1c' },
];

/** Categories that cannot be muted (action-required / account-critical). CF-30: recalls & reports. */
export const CRITICAL_NOTIFICATION_CATEGORIES = [
  'Verification',
  'Business',
  'CounterfeitReport',
  'Batch',
] as const;

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyAccent(accent: AccentColor): void {
  document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* ignore */
  }
}

export function readStoredAccent(): AccentColor {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    if (v === 'green' || v === 'grey' || v === 'orange' || v === 'red' || v === 'blue') return v;
    return 'blue';
  } catch {
    return 'blue';
  }
}

export function applyLocalFirstHint(show: boolean): void {
  document.documentElement.dataset.localFirst = show ? 'on' : 'off';
  try {
    localStorage.setItem(LOCAL_HINT_KEY, show ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function readStoredLocalFirstHint(): boolean {
  try {
    const v = localStorage.getItem(LOCAL_HINT_KEY);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

/** Boot: apply theme/hint from localStorage before React hydrates. */
export function hydrateUiPreferencesFromStorage(): void {
  applyTheme(readStoredTheme());
  applyAccent(readStoredAccent());
  applyLocalFirstHint(readStoredLocalFirstHint());
}

export async function saveUiPreferences(params: {
  userId: string;
  patch: UiPreferences;
}): Promise<UiPreferences> {
  const user = await db.users.get(params.userId);
  if (!user) throw new Error('User missing');
  const next: UiPreferences = { ...(user.uiPreferences ?? {}), ...params.patch };
  await db.users.update(params.userId, {
    uiPreferences: next,
    updatedAt: nowIso(),
  });
  if (next.theme) applyTheme(next.theme);
  if (next.accent) applyAccent(next.accent);
  if (next.showLocalFirstHint != null) applyLocalFirstHint(next.showLocalFirstHint);
  return next;
}

export function filterMutableCategories(muted: string[]): string[] {
  const blocked = new Set<string>(CRITICAL_NOTIFICATION_CATEGORIES);
  return muted.filter((c) => !blocked.has(c));
}

export async function markOnboardingSeen(userId: string): Promise<void> {
  await db.users.update(userId, {
    onboardingSeenAt: nowIso(),
    updatedAt: nowIso(),
  });
}

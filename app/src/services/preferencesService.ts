import type { User } from '../domain/entities/types';
import { db } from '../data/db';

export type ThemeMode = 'light' | 'dark';
export type UiLanguage = 'en';

export type UiPreferences = NonNullable<User['uiPreferences']>;

const THEME_KEY = 'ds.theme';
const LOCAL_HINT_KEY = 'ds.localFirstHint';

/** Categories that cannot be muted (action-required / account-critical). */
export const CRITICAL_NOTIFICATION_CATEGORIES = ['Verification', 'Business'] as const;

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
    updatedAt: new Date().toISOString(),
  });
  if (next.theme) applyTheme(next.theme);
  if (next.showLocalFirstHint != null) applyLocalFirstHint(next.showLocalFirstHint);
  return next;
}

export function filterMutableCategories(muted: string[]): string[] {
  const blocked = new Set<string>(CRITICAL_NOTIFICATION_CATEGORIES);
  return muted.filter((c) => !blocked.has(c));
}

export async function markOnboardingSeen(userId: string): Promise<void> {
  await db.users.update(userId, {
    onboardingSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

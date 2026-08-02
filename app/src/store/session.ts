import { create } from 'zustand';
import type { Business, OperationalRole, User } from '../domain/entities/types';
import { portalFor, type Action, can, normalizeRoleForBusiness } from '../domain/permissions';
import type { ImpersonationSession } from '../services/impersonationService';

/** Demo session TTL (docs/9 A7) — 8 hours from issuedAt. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Failed-login lockout (docs/9 A10): 5 failures → 15 minutes. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export interface SessionState {
  user: User | null;
  business: Business | null;
  hydrated: boolean;
  impersonation: ImpersonationSession | null;
  /** CF-34: UI-only role preview (primary account); services still use real role */
  rolePreview: OperationalRole | null;
  setSession: (user: User, business: Business) => void;
  clearSession: () => void;
  setHydrated: (v: boolean) => void;
  /** Refresh live user/business from Dexie without resetting issuedAt. */
  refreshEntities: (user: User, business: Business) => void;
  beginImpersonation: (user: User, business: Business, impersonation: ImpersonationSession) => void;
  endImpersonation: (user: User, business: Business) => void;
  setRolePreview: (role: OperationalRole | null) => void;
  can: (action: Action) => boolean;
  portal: () => 'pharmacy' | 'stockist' | 'admin' | null;
  role: () => OperationalRole | null;
}

/** Shared across tabs (localStorage). Legacy sessionStorage is migrated on read. */
export const SESSION_STORAGE_KEY = 'ds.session';
/** Warn this long before TTL expiry so users can continue without losing form work. */
export const SESSION_WARN_MS = 15 * 60 * 1000;
/** Per-identifier lockout map (v2). Legacy single-key `ds.loginLockout` is ignored. */
const LOCKOUT_KEY = 'ds.loginLockout.v2';
const LOCKOUT_KEY_LEGACY = 'ds.loginLockout';

export type PersistedSession = {
  userId: string;
  businessId: string;
  issuedAt: number;
  impersonation?: {
    adminUserId: string;
    adminBusinessId: string;
    reason: string;
    startedAt: string;
    targetBusinessId: string;
    notifyOwner: boolean;
  };
};

export function persistSession(
  userId: string,
  businessId: string,
  issuedAt = Date.now(),
  impersonation?: PersistedSession['impersonation'],
) {
  const payload: PersistedSession = { userId, businessId, issuedAt };
  if (impersonation) payload.impersonation = impersonation;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readPersistedSession(): PersistedSession | null {
  let raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    try {
      raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(SESSION_STORAGE_KEY, raw);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      raw = null;
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed.userId || !parsed.businessId || !parsed.issuedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPersistedSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const REAUTH_KEY = 'ds.reauthReason';

export function setReauthReason(reason: 'timeout' | 'revoked' | 'removed') {
  localStorage.setItem(REAUTH_KEY, reason);
}

export function takeReauthReason(): string | null {
  const v = localStorage.getItem(REAUTH_KEY) ?? sessionStorage.getItem(REAUTH_KEY);
  if (v) {
    localStorage.removeItem(REAUTH_KEY);
    try {
      sessionStorage.removeItem(REAUTH_KEY);
    } catch {
      /* ignore */
    }
  }
  return v;
}

export function isSessionExpired(issuedAt: number, now = Date.now()): boolean {
  return now - issuedAt > SESSION_TTL_MS;
}

export function sessionMsRemaining(issuedAt: number, now = Date.now()): number {
  return Math.max(0, SESSION_TTL_MS - (now - issuedAt));
}

export function shouldWarnSessionExpiry(issuedAt: number, now = Date.now()): boolean {
  const rem = sessionMsRemaining(issuedAt, now);
  return rem > 0 && rem <= SESSION_WARN_MS;
}

/** Reset the 8h TTL clock (Continue on expiry warning). */
export function extendPersistedSession(now = Date.now()): PersistedSession | null {
  const current = readPersistedSession();
  if (!current) return null;
  persistSession(current.userId, current.businessId, now, current.impersonation);
  return readPersistedSession();
}

export type LockoutState = { failures: number; lockedUntil?: number };
export type LockoutMap = Record<string, LockoutState>;

/** Normalize email/phone so lockout is scoped per login identity. */
export function normalizeLoginIdentifier(emailOrPhone: string): string {
  return emailOrPhone.trim().toLowerCase().replace(/\s/g, '');
}

/** Only wrong-credential outcomes count toward lockout — not deactivated/suspended/invite states. */
export function isCredentialLoginFailure(code: string | undefined): boolean {
  return code === 'AUTH_INVALID';
}

function readLockoutMap(): LockoutMap {
  try {
    // Drop legacy browser-global counter so one account cannot lock the whole shared PC.
    if (localStorage.getItem(LOCKOUT_KEY_LEGACY)) localStorage.removeItem(LOCKOUT_KEY_LEGACY);
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LockoutMap | LockoutState;
    if (!parsed || typeof parsed !== 'object') return {};
    const keys = Object.keys(parsed);
    // Legacy single-state shape under the new key — discard
    if (keys.length > 0 && keys.every((k) => k === 'failures' || k === 'lockedUntil')) return {};
    return parsed as LockoutMap;
  } catch {
    return {};
  }
}

function writeLockoutMap(map: LockoutMap) {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(map));
}

export function readLoginLockout(identifier: string): LockoutState {
  const id = normalizeLoginIdentifier(identifier);
  if (!id) return { failures: 0 };
  return readLockoutMap()[id] ?? { failures: 0 };
}

export function writeLoginLockout(identifier: string, state: LockoutState) {
  const id = normalizeLoginIdentifier(identifier);
  if (!id) return;
  const map = readLockoutMap();
  map[id] = state;
  writeLockoutMap(map);
}

export function clearLoginLockout(identifier?: string) {
  if (!identifier) {
    localStorage.removeItem(LOCKOUT_KEY);
    localStorage.removeItem(LOCKOUT_KEY_LEGACY);
    return;
  }
  const id = normalizeLoginIdentifier(identifier);
  const map = readLockoutMap();
  delete map[id];
  writeLockoutMap(map);
}

export function getLoginLockoutRemainingMs(identifier: string, now = Date.now()): number {
  const state = readLoginLockout(identifier);
  if (!state.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil - now);
}

export function recordLoginFailure(identifier: string): { locked: boolean; remainingMs: number; failures: number } {
  const id = normalizeLoginIdentifier(identifier);
  if (!id) return { locked: false, remainingMs: 0, failures: 0 };
  const state = readLoginLockout(id);
  // Still within an active lockout window — don't reset the timer on extra attempts
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    return { locked: true, remainingMs: state.lockedUntil - Date.now(), failures: state.failures ?? 0 };
  }
  const failures = (state.lockedUntil && state.lockedUntil <= Date.now() ? 0 : state.failures ?? 0) + 1;
  if (failures >= LOGIN_MAX_FAILURES) {
    const lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    writeLoginLockout(id, { failures, lockedUntil });
    return { locked: true, remainingMs: LOGIN_LOCKOUT_MS, failures };
  }
  writeLoginLockout(id, { failures });
  return { locked: false, remainingMs: 0, failures };
}

export function recordLoginSuccess(identifier: string) {
  clearLoginLockout(identifier);
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  business: null,
  hydrated: false,
  impersonation: null,
  rolePreview: null,
  setSession: (user, business) => {
    persistSession(user.id, business.id, Date.now());
    set({ user, business, impersonation: null, rolePreview: null });
  },
  clearSession: () => {
    clearPersistedSession();
    set({ user: null, business: null, impersonation: null, rolePreview: null });
  },
  setHydrated: (v) => set({ hydrated: v }),
  refreshEntities: (user, business) => {
    const { impersonation } = get();
    set({
      user: impersonation ? { ...user, impersonationReadOnly: true, passwordHash: '', passwordSalt: '' } : user,
      business,
    });
  },
  beginImpersonation: (user, business, impersonation) => {
    const issuedAt = readPersistedSession()?.issuedAt ?? Date.now();
    persistSession(user.id, business.id, issuedAt, {
      adminUserId: impersonation.adminUser.id,
      adminBusinessId: impersonation.adminBusiness.id,
      reason: impersonation.reason,
      startedAt: impersonation.startedAt,
      targetBusinessId: impersonation.targetBusinessId,
      notifyOwner: impersonation.notifyOwner,
    });
    set({ user, business, impersonation, rolePreview: null });
  },
  endImpersonation: (user, business) => {
    const issuedAt = readPersistedSession()?.issuedAt ?? Date.now();
    persistSession(user.id, business.id, issuedAt);
    set({ user, business, impersonation: null });
  },
  setRolePreview: (role) => set({ rolePreview: role }),
  can: (action) => {
    const { user, business, rolePreview } = get();
    if (!user || !business) return false;
    return can(action, {
      businessType: business.type,
      role: normalizeRoleForBusiness(rolePreview ?? user.role, business.type),
      accountStatus: business.accountStatus,
      verificationStatus: business.verificationStatus,
      overrides: rolePreview ? undefined : user.permissionOverrides,
      actorBusinessId: business.id,
      impersonationReadOnly: user.impersonationReadOnly,
    }).allow;
  },
  portal: () => {
    const { business } = get();
    if (!business) return null;
    return portalFor(business.type);
  },
  role: () => get().rolePreview ?? get().user?.role ?? null,
}));

/** Hook-friendly permission check (F6). */
export function useCan(action: Action): boolean {
  return useSession((s) => s.can(action));
}

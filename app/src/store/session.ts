import { create } from 'zustand';
import type { Business, OperationalRole, User } from '../domain/entities/types';
import { portalFor, type Action, can } from '../domain/permissions';
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
  /** CF-34: UI-only role preview (Owner); services still use real Owner role */
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

const SESSION_KEY = 'ds.session';
const LOCKOUT_KEY = 'ds.loginLockout';

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
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function readPersistedSession(): PersistedSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
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
  sessionStorage.removeItem(SESSION_KEY);
}

const REAUTH_KEY = 'ds.reauthReason';

export function setReauthReason(reason: 'timeout' | 'revoked' | 'removed') {
  sessionStorage.setItem(REAUTH_KEY, reason);
}

export function takeReauthReason(): string | null {
  const v = sessionStorage.getItem(REAUTH_KEY);
  if (v) sessionStorage.removeItem(REAUTH_KEY);
  return v;
}

export function isSessionExpired(issuedAt: number, now = Date.now()): boolean {
  return now - issuedAt > SESSION_TTL_MS;
}

export type LockoutState = { failures: number; lockedUntil?: number };

export function readLoginLockout(): LockoutState {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return { failures: 0 };
    return JSON.parse(raw) as LockoutState;
  } catch {
    return { failures: 0 };
  }
}

export function writeLoginLockout(state: LockoutState) {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
}

export function clearLoginLockout() {
  localStorage.removeItem(LOCKOUT_KEY);
}

export function getLoginLockoutRemainingMs(now = Date.now()): number {
  const state = readLoginLockout();
  if (!state.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil - now);
}

export function recordLoginFailure(): { locked: boolean; remainingMs: number; failures: number } {
  const state = readLoginLockout();
  const failures = (state.failures ?? 0) + 1;
  if (failures >= LOGIN_MAX_FAILURES) {
    const lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    writeLoginLockout({ failures, lockedUntil });
    return { locked: true, remainingMs: LOGIN_LOCKOUT_MS, failures };
  }
  writeLoginLockout({ failures, lockedUntil: state.lockedUntil });
  return { locked: false, remainingMs: 0, failures };
}

export function recordLoginSuccess() {
  clearLoginLockout();
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
      role: rolePreview ?? user.role,
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

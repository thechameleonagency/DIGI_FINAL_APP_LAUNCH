import { create } from 'zustand';
import type { Business, OperationalRole, User } from '../domain/entities/types';
import { portalFor, type Action, can } from '../domain/permissions';

export interface SessionState {
  user: User | null;
  business: Business | null;
  hydrated: boolean;
  setSession: (user: User, business: Business) => void;
  clearSession: () => void;
  setHydrated: (v: boolean) => void;
  can: (action: Action) => boolean;
  portal: () => 'pharmacy' | 'stockist' | 'admin' | null;
  role: () => OperationalRole | null;
}

const SESSION_KEY = 'ds.session';

export function persistSession(userId: string, businessId: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, businessId, issuedAt: Date.now() }));
}

export function readPersistedSession(): { userId: string; businessId: string } | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPersistedSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  business: null,
  hydrated: false,
  setSession: (user, business) => {
    persistSession(user.id, business.id);
    set({ user, business });
  },
  clearSession: () => {
    clearPersistedSession();
    set({ user: null, business: null });
  },
  setHydrated: (v) => set({ hydrated: v }),
  can: (action) => {
    const { user, business } = get();
    if (!user || !business) return false;
    return can(action, {
      businessType: business.type,
      role: user.role,
      accountStatus: business.accountStatus,
      verificationStatus: business.verificationStatus,
      overrides: user.permissionOverrides,
      actorBusinessId: business.id,
    }).allow;
  },
  portal: () => {
    const { business } = get();
    if (!business) return null;
    return portalFor(business.type);
  },
  role: () => get().user?.role ?? null,
}));

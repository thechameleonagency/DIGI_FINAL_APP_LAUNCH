import { useSession } from '../store/session';

/**
 * Shared sign-out: clear in-memory + persisted session, then hard-navigate
 * so portal state (Dexie live queries, UI stores) fully resets.
 */
export function signOutToLogin(clearSession: () => void): void {
  clearSession();
  window.location.assign('/auth/login');
}

/** Convenience when already inside a component that uses the session store. */
export function useSignOut() {
  const { clearSession } = useSession();
  return () => signOutToLogin(clearSession);
}

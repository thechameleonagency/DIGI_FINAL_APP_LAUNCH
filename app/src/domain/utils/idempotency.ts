const seen = new Map<string, string>();

export function rememberIdempotency(key: string, entityId: string): string | null {
  const existing = seen.get(key);
  if (existing) return existing;
  seen.set(key, entityId);
  return null;
}

export function clearIdempotency() {
  seen.clear();
}

/** Unique key for intentional new submissions (orders, etc.). Prefer stableIdempotencyKey for money actions. */
export function makeIdempotencyKey(action: string, actorId: string): string {
  return `${action}:${actorId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Deterministic key from stable inputs — same form state → same key.
 * Survives double-click / retry; Dexie unique lookup can dedupe.
 */
export function stableIdempotencyKey(action: string, parts: Array<string | number>): string {
  return `${action}:${parts.map((p) => String(p)).join('|')}`;
}

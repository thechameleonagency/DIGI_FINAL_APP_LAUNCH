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

export function makeIdempotencyKey(action: string, actorId: string): string {
  return `${action}:${actorId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

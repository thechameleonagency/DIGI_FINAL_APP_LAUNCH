/**
 * Controllable wall clock for world seed / tests.
 * When unset, mirrors real time. When set, `nowIso()` returns the frozen value.
 */

let frozen: string | null = null;

/** Current time as ISO string (frozen clock if set, else wall clock). */
export function nowIso(): string {
  return frozen ?? new Date().toISOString();
}

/** Freeze the clock to an ISO timestamp, or clear with `null`. */
export function setClock(iso: string | null): void {
  if (iso == null) {
    frozen = null;
    return;
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`setClock: invalid ISO timestamp: ${iso}`);
  }
  frozen = new Date(ms).toISOString();
}

/** Current frozen ISO, or `null` when using wall clock. */
export function getClock(): string | null {
  return frozen;
}

/** Advance the frozen clock by `n` calendar days (no-op if clock unset). */
export function advanceDays(n: number): void {
  if (frozen == null) return;
  const d = new Date(frozen);
  d.setUTCDate(d.getUTCDate() + n);
  frozen = d.toISOString();
}

/** Advance the frozen clock by `n` hours (no-op if clock unset). */
export function advanceHours(n: number): void {
  if (frozen == null) return;
  const d = new Date(frozen);
  d.setUTCHours(d.getUTCHours() + n);
  frozen = d.toISOString();
}

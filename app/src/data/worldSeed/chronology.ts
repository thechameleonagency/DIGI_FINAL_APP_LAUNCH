import { advanceDays as advanceClockDays, setClock } from '../../domain/utils/clock';

/** Freeze the seed clock at 09:00 UTC, 90 days before today. */
export function startClock90DaysAgo(): void {
  const d = new Date();
  d.setUTCHours(9, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 90);
  setClock(d.toISOString());
}

/** Advance one business day (UTC calendar day). */
export function advanceBusinessDay(): void {
  advanceClockDays(1);
}

/** Advance the seed clock by n calendar days. */
export function advanceDays(n: number): void {
  advanceClockDays(n);
}

/** Local calendar day key (YYYY-MM-DD) — avoids UTC bucketing for India-region activity. */
export function localDayKey(input?: string | Date | null): string {
  if (input == null || input === '') return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localTodayKey(): string {
  return localDayKey(new Date());
}

/** Last n local calendar days ending today, oldest → newest. */
export function localLastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(localDayKey(x));
  }
  return out;
}

/** Monday-start week key in local time. */
export function localWeekStartKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const monday = new Date(d);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(d.getDate() - diff);
  return localDayKey(monday);
}

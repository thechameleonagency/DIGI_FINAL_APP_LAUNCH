import { v4 as uuid } from 'uuid';

export function newId(): string {
  return uuid();
}

export function yearPrefix(): string {
  return String(new Date().getFullYear());
}

let counters: Record<string, number> = {};

export function resetCounters(seed?: Record<string, number>) {
  counters = seed ? { ...seed } : {};
}

export function nextNumber(prefix: string, pad = 4): string {
  const key = `${prefix}-${yearPrefix()}`;
  counters[key] = (counters[key] ?? 0) + 1;
  return `${prefix}-${yearPrefix()}-${String(counters[key]).padStart(pad, '0')}`;
}

export function setCounter(prefix: string, year: string, value: number) {
  counters[`${prefix}-${year}`] = value;
}

export function getCounters(): Record<string, number> {
  return { ...counters };
}

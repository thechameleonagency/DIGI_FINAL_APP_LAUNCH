import { describe, expect, it } from 'vitest';
import { getCounters, nextNumber, resetCounters, yearPrefix } from './ids';

describe('doc number counters (T-1 / F3)', () => {
  it('increments per prefix-year and pads', () => {
    resetCounters();
    const a = nextNumber('ORD');
    const b = nextNumber('ORD');
    expect(a).toBe(`ORD-${yearPrefix()}-0001`);
    expect(b).toBe(`ORD-${yearPrefix()}-0002`);
  });

  it('hydrate-style seed floors next value', () => {
    const y = yearPrefix();
    resetCounters({ [`ORD-${y}`]: 41 });
    expect(nextNumber('ORD')).toBe(`ORD-${y}-0042`);
    expect(getCounters()[`ORD-${y}`]).toBe(42);
  });

  it('separate series do not collide', () => {
    resetCounters();
    expect(nextNumber('PAY')).toContain('PAY-');
    expect(nextNumber('INV')).toContain('INV-');
    expect(nextNumber('PAY')).toMatch(/PAY-\d{4}-0002$/);
  });
});

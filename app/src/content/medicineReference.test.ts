import { describe, expect, it } from 'vitest';
import { applyReferenceFill, matchMedicineReference } from './medicineReference';

describe('medicineReference (CF-36)', () => {
  it('matches by name and never overwrites filled fields', () => {
    const ref = matchMedicineReference('Dolo');
    expect(ref?.name).toBe('Dolo 650');
    const { next, filled } = applyReferenceFill(
      { name: 'Dolo 650', brand: 'Keep Me', category: '', packSize: '', hsn: '', gstPercent: 0, mrp: 0 },
      ref!,
      { fillPrices: true },
    );
    expect(next.brand).toBe('Keep Me');
    expect(filled).not.toContain('brand');
    expect(filled).toContain('category');
    expect(next.category).toBe('Analgesic');
  });
});

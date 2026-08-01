import { describe, expect, it } from 'vitest';
import { faqsFor, guidesFor } from './help';

describe('help content (CF-27)', () => {
  it('returns audience-filtered FAQs and guides', () => {
    expect(faqsFor('pharmacy').length).toBeGreaterThan(0);
    expect(faqsFor('admin').every((f) => f.audiences.includes('admin'))).toBe(true);
    expect(guidesFor('stockist').some((g) => g.title.toLowerCase().includes('fulfil'))).toBe(true);
    expect(guidesFor('pharmacy').every((g) => g.audiences.includes('pharmacy'))).toBe(true);
  });
});

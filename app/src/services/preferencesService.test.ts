import { describe, expect, it } from 'vitest';
import { filterMutableCategories } from './preferencesService';

describe('preferencesService (CF-30)', () => {
  it('strips critical notification categories from mute lists', () => {
    expect(filterMutableCategories(['Order', 'Verification', 'Business', 'Payment'])).toEqual([
      'Order',
      'Payment',
    ]);
  });
});

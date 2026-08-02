import { describe, expect, it } from 'vitest';
import { parseCsvTable } from './csv';

describe('parseCsvTable', () => {
  it('strips BOM and parses quoted commas', () => {
    const { header, rows } = parseCsvTable('\uFEFFname,sku,brand\n"A, B",SKU-1,Brand\n');
    expect(header).toEqual(['name', 'sku', 'brand']);
    expect(rows).toEqual([['A, B', 'SKU-1', 'Brand']]);
  });

  it('returns empty header for blank input', () => {
    expect(parseCsvTable('   \n  ')).toEqual({ header: [], rows: [] });
  });
});

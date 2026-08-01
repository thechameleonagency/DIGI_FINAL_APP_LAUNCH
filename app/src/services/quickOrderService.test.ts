import { describe, expect, it } from 'vitest';
import { matchQuickOrderLines, parseQuickOrderText, type QuickOrderSeller } from './quickOrderService';

const sellers: QuickOrderSeller[] = [
  {
    stockistId: 's1',
    stockistName: 'MedRoute',
    productId: 'p1',
    productName: 'Dolo 650',
    brand: 'Micro Labs',
    sku: 'DOLO-650',
    ptr: 40,
    moq: 5,
    available: 100,
  },
  {
    stockistId: 's2',
    stockistName: 'Alpha Dist',
    productId: 'p2',
    productName: 'Dolo 650',
    brand: 'Micro Labs',
    sku: 'DOLO-650',
    ptr: 35,
    moq: 5,
    available: 80,
  },
  {
    stockistId: 's1',
    stockistName: 'MedRoute',
    productId: 'p3',
    productName: 'Crocin Advance',
    brand: 'GSK',
    sku: 'CRO-ADV',
    ptr: 22,
    moq: 10,
    available: 40,
  },
];

describe('parseQuickOrderText', () => {
  it('parses x / leading / comma / qty: patterns', () => {
    const parsed = parseQuickOrderText('Dolo 650 x 20\n20 Crocin Advance\nAugmentin, 12\nqty:8 Combiflam');
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toMatchObject({ phrase: 'Dolo 650', qty: 20 });
    expect(parsed[1]).toMatchObject({ phrase: 'Crocin Advance', qty: 20 });
    expect(parsed[2]).toMatchObject({ phrase: 'Augmentin', qty: 12 });
    expect(parsed[3]).toMatchObject({ phrase: 'Combiflam', qty: 8 });
  });

  it('keeps lines with no qty (defaults later to MOQ)', () => {
    expect(parseQuickOrderText('Dolo 650')[0].qty).toBeUndefined();
  });
});

describe('matchQuickOrderLines', () => {
  it('matches cheapest connected seller and never drops unmatched (E-CF-02a)', () => {
    const parsed = parseQuickOrderText('Dolo 650 x 20\nUnknown Potion\nCrocin');
    const { matched, unmatched } = matchQuickOrderLines({ parsed, sellable: sellers });
    expect(matched.some((m) => m.productName === 'Dolo 650')).toBe(true);
    expect(matched.find((m) => m.productName === 'Dolo 650')?.stockistId).toBe('s2');
    expect(unmatched.some((u) => /Unknown Potion/i.test(u.raw))).toBe(true);
    expect(matched.length + unmatched.length).toBe(parsed.length);
  });

  it('merges duplicate products with summed qty (E-CF-02b)', () => {
    const parsed = parseQuickOrderText('Dolo 650 x 10\nDolo 650 x 5');
    const { matched, unmatched } = matchQuickOrderLines({ parsed, sellable: sellers });
    expect(unmatched).toHaveLength(0);
    expect(matched).toHaveLength(1);
    expect(matched[0].qty).toBe(15);
  });

  it('defaults missing qty to MOQ', () => {
    const parsed = parseQuickOrderText('Crocin Advance');
    const { matched } = matchQuickOrderLines({ parsed, sellable: sellers });
    expect(matched[0].qty).toBe(10);
  });
});

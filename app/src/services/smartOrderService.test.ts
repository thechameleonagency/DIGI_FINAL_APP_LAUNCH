import { describe, expect, it } from 'vitest';
import type { Product } from '../domain/entities/types';
import { buildSmartOrderSuggestions, productMatchKey } from './smartOrderService';
import { nowIso } from '../domain/utils/clock';

function product(partial: Partial<Product> & Pick<Product, 'id' | 'stockistId' | 'name' | 'sku' | 'brand' | 'ptr' | 'moq'>): Product {
  return {
    catalogueId: 'cat',
    category: 'Analgesic',
    packSize: '10s',
    mrp: 100,
    gstPercent: 12,
    pricingClass: 'Generic',
    status: 'Active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...partial,
  };
}

describe('buildSmartOrderSuggestions', () => {
  const sellable = [
    {
      product: product({
        id: 'p1',
        stockistId: 's1',
        name: 'Dolo 650',
        brand: 'Micro',
        sku: 'DOLO',
        ptr: 40,
        moq: 5,
      }),
      stockistName: 'MedRoute',
      available: 100,
    },
    {
      product: product({
        id: 'p2',
        stockistId: 's2',
        name: 'Dolo 650',
        brand: 'Micro',
        sku: 'DOLO',
        ptr: 35,
        moq: 5,
      }),
      stockistName: 'CheapCo',
      available: 50,
    },
  ];

  it('returns empty suggestions when inventory and history are empty (E-CF-01a)', () => {
    const lines = buildSmartOrderSuggestions({
      scopes: ['lowStock', 'frequent', 'nearExpiry'],
      inventory: [],
      orderLinesByProduct: new Map(),
      sellable,
      nearExpiryDays: 90,
    });
    expect(lines).toEqual([]);
  });

  it('suggests low stock with cheapest connected seller pre-selected', () => {
    const lines = buildSmartOrderSuggestions({
      scopes: ['lowStock'],
      inventory: [{ productId: 'p1', productName: 'Dolo 650', onHand: 2, brand: 'Micro', sku: 'DOLO' }],
      orderLinesByProduct: new Map(),
      sellable,
      nearExpiryDays: 90,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].rules).toContain('LowStock');
    expect(lines[0].selectedStockistId).toBe('s2');
    expect(lines[0].selectedProductId).toBe('p2');
    expect(lines[0].suggestedQty).toBeGreaterThanOrEqual(5);
  });

  it('merges same product from two rules at max qty with both tags (E-CF-01c)', () => {
    const today = new Date('2026-08-01');
    const lines = buildSmartOrderSuggestions({
      scopes: ['lowStock', 'nearExpiry'],
      inventory: [
        {
          productId: 'p1',
          productName: 'Dolo 650',
          onHand: 3,
          expiryDate: '2026-09-15',
          brand: 'Micro',
          sku: 'DOLO',
        },
      ],
      orderLinesByProduct: new Map(),
      sellable,
      nearExpiryDays: 90,
      today,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].rules.sort()).toEqual(['LowStock', 'NearExpiry'].sort());
    expect(lines[0].suggestedQty).toBe(Math.max(Math.max(1, 10 - 3), 3));
  });

  it('marks unavailable when no connected seller', () => {
    const lines = buildSmartOrderSuggestions({
      scopes: ['lowStock'],
      inventory: [{ productId: 'orphan', productName: 'Ghost Pill', onHand: 0, brand: 'X' }],
      orderLinesByProduct: new Map(),
      sellable: [],
      nearExpiryDays: 90,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].unavailableReason).toMatch(/no connected stockist/i);
  });

  it('uses current seller ptr (not historical) via seller options (E-CF-01b)', () => {
    expect(productMatchKey(sellable[0].product)).toBe('dolo 650|micro');
    const lines = buildSmartOrderSuggestions({
      scopes: ['frequent'],
      inventory: [],
      orderLinesByProduct: new Map([
        ['p1', { qtys: [10, 20], productName: 'Dolo 650', brand: 'Micro', sku: 'DOLO' }],
      ]),
      sellable,
      nearExpiryDays: 90,
    });
    expect(lines[0].sellers[0].ptr).toBe(35);
    expect(lines[0].suggestedQty).toBe(15);
  });
});

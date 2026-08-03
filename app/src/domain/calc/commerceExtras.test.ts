import { describe, expect, it } from 'vitest';
import {
  defaultRulesFromPrefs,
  estimateDeliveryFee,
  isHolidayBlocked,
  listSelectableDeliveryDates,
} from './deliveryCommerce';
import { marginFromSale, saleFromMargin } from './pricingMargin';
import { applySchemeToUnitPrice } from './schemePricing';
import type { DeliveryDate, DeliveryRule, Scheme } from '../entities/types';

describe('estimateDeliveryFee', () => {
  const dates: DeliveryDate[] = [
    { id: 'd1', stockistId: 's1', date: '2026-08-10', active: true },
  ];

  it('applies free-above then flat', () => {
    const rules: DeliveryRule[] = [
      {
        id: 'r1',
        stockistId: 's1',
        ruleType: 'order_amount',
        priority: 10,
        active: true,
        minOrderAmount: 5000,
      },
      { id: 'r2', stockistId: 's1', ruleType: 'flat_fee', priority: 20, active: true, flatFee: 80 },
    ];
    expect(estimateDeliveryFee({ rules, goodsSubtotal: 6000 }).fee).toBe(0);
    expect(estimateDeliveryFee({ rules, goodsSubtotal: 1000 }).fee).toBe(80);
  });

  it('frees on delivery date', () => {
    const rules: DeliveryRule[] = [
      {
        id: 'r0',
        stockistId: 's1',
        ruleType: 'delivery_date',
        priority: 5,
        active: true,
        freeOnDeliveryDate: true,
      },
      { id: 'r2', stockistId: 's1', ruleType: 'flat_fee', priority: 20, active: true, flatFee: 80 },
    ];
    expect(
      estimateDeliveryFee({
        rules,
        goodsSubtotal: 100,
        preferredDate: '2026-08-10',
        deliveryDates: dates,
      }).fee,
    ).toBe(0);
  });

  it('skips distance when km missing', () => {
    const rules: DeliveryRule[] = [
      {
        id: 'rd',
        stockistId: 's1',
        ruleType: 'distance',
        priority: 1,
        active: true,
        perKmCharge: 10,
        baseDistanceKm: 0,
      },
      { id: 'r2', stockistId: 's1', ruleType: 'flat_fee', priority: 20, active: true, flatFee: 50 },
    ];
    expect(estimateDeliveryFee({ rules, goodsSubtotal: 100 }).fee).toBe(50);
    expect(estimateDeliveryFee({ rules, goodsSubtotal: 100, distanceKm: 5 }).fee).toBe(50);
  });

  it('builds defaults from prefs', () => {
    const rules = defaultRulesFromPrefs('s1', { deliveryFeeFlat: 40, deliveryFeeFreeAbove: 2000 });
    expect(rules).toHaveLength(2);
    expect(estimateDeliveryFee({ rules, goodsSubtotal: 2500 }).fee).toBe(0);
    expect(estimateDeliveryFee({ rules, goodsSubtotal: 100 }).fee).toBe(40);
  });
});

describe('isHolidayBlocked', () => {
  it('blocks when allowPreorder false', () => {
    const r = isHolidayBlocked({
      holidayEntries: [{ startDate: '2026-08-15', endDate: '2026-08-15', allowPreorder: false, reason: 'Holiday' }],
      date: '2026-08-15',
    });
    expect(r.blocked).toBe(true);
  });

  it('allows preorder holidays', () => {
    const r = isHolidayBlocked({
      holidays: ['2026-08-15|Diwali'],
      date: '2026-08-15',
    });
    expect(r.blocked).toBe(false);
    expect(r.allowPreorder).toBe(true);
  });
});

describe('listSelectableDeliveryDates', () => {
  it('filters past dates', () => {
    const list = listSelectableDeliveryDates(
      [
        { id: '1', stockistId: 's', date: '2020-01-01', active: true },
        { id: '2', stockistId: 's', date: '2099-01-01', active: true },
      ],
      new Date('2026-08-03'),
    );
    expect(list.map((d) => d.id)).toEqual(['2']);
  });
});

describe('margin helpers', () => {
  it('round-trips sale and margin', () => {
    const cost = 100;
    const sale = saleFromMargin(cost, 12);
    expect(sale).toBe(112);
    expect(marginFromSale(cost, sale)).toBe(12);
  });
});

describe('schemePricing', () => {
  const scheme: Scheme = {
    id: 'sch1',
    stockistId: 's1',
    title: '10% off',
    scope: 'sku',
    sku: 'SKU1',
    discountType: 'percent',
    discountValue: 10,
    startsOn: '2020-01-01',
    endsOn: '2099-01-01',
    active: true,
    stackable: false,
  };

  it('applies percent discount', () => {
    const r = applySchemeToUnitPrice({
      unitPrice: 200,
      product: { id: 'p1', sku: 'SKU1', category: 'X' },
      schemes: [scheme],
    });
    expect(r.unitPrice).toBe(180);
    expect(r.schemeDiscountAmount).toBe(20);
    expect(r.scheme?.id).toBe('sch1');
  });
});

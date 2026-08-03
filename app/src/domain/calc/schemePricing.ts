import type { Product, Scheme } from '../entities/types';
import { roundMoney } from '../utils/money';

export function activeSchemesForDate(schemes: Scheme[], atDate = new Date()): Scheme[] {
  const day = atDate.toISOString().slice(0, 10);
  return schemes.filter(
    (s) => s.active && s.startsOn.slice(0, 10) <= day && s.endsOn.slice(0, 10) >= day,
  );
}

export function matchSchemeForProduct(product: Pick<Product, 'id' | 'sku' | 'category'>, schemes: Scheme[]): Scheme | undefined {
  const byProduct = schemes.find((s) => s.scope === 'product' && s.productId === product.id);
  if (byProduct) return byProduct;
  const bySku = schemes.find((s) => s.scope === 'sku' && s.sku === product.sku);
  if (bySku) return bySku;
  return schemes.find((s) => s.scope === 'category' && s.category === product.category);
}

export function applySchemeToUnitPrice(params: {
  unitPrice: number;
  product: Pick<Product, 'id' | 'sku' | 'category'>;
  schemes: Scheme[];
  atDate?: Date;
}): {
  unitPrice: number;
  unitPriceBeforeScheme: number;
  scheme?: Scheme;
  schemeDiscountAmount: number;
} {
  const unitPriceBeforeScheme = params.unitPrice;
  const active = activeSchemesForDate(params.schemes, params.atDate);
  const scheme = matchSchemeForProduct(params.product, active);
  if (!scheme) {
    return { unitPrice: unitPriceBeforeScheme, unitPriceBeforeScheme, schemeDiscountAmount: 0 };
  }
  let discount = 0;
  if (scheme.discountType === 'percent') {
    discount = roundMoney(unitPriceBeforeScheme * (scheme.discountValue / 100));
  } else {
    discount = roundMoney(Math.min(scheme.discountValue, unitPriceBeforeScheme));
  }
  const unitPrice = roundMoney(Math.max(0, unitPriceBeforeScheme - discount));
  return { unitPrice, unitPriceBeforeScheme, scheme, schemeDiscountAmount: discount };
}

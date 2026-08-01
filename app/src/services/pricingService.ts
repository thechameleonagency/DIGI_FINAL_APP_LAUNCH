import type { PlatformSettings, Product } from '../domain/entities/types';
import { roundMoney } from '../domain/utils/money';

export type CommissionMode = 'PlatformGeneric' | 'PlatformEthical' | 'OfflineManaged';

export type PricedUnit = {
  basePtr: number;
  unitPrice: number;
  /** Commission attributable to one unit (Generic) or flat for Ethical/Offline when qty folded. */
  unitCommission: number;
  /** Always the full commission for the line (use this for snapshots). */
  lineCommission: number;
  pricingClass: 'Generic' | 'Ethical';
  commissionMode: CommissionMode;
};

function rates(settings?: PlatformSettings | null) {
  return {
    genericPct: settings?.genericCommissionPercent ?? 0.5,
    ethicalFlat: settings?.ethicalCommissionFlatPerProduct ?? 1,
    offlineFlat: settings?.offlineManagedFlatPerLine ?? 1,
  };
}

/** Inclusive unit price for platform-connected pharmacy trade (pharmacy-visible). */
export function priceForPlatformPharmacy(
  product: Pick<Product, 'ptr' | 'pricingClass'>,
  settings?: PlatformSettings | null,
): PricedUnit {
  const r = rates(settings);
  const pricingClass = product.pricingClass ?? 'Generic';
  const basePtr = product.ptr;
  if (pricingClass === 'Ethical') {
    const lineCommission = r.ethicalFlat;
    return {
      basePtr,
      unitPrice: roundMoney(basePtr + lineCommission),
      unitCommission: lineCommission,
      lineCommission,
      pricingClass,
      commissionMode: 'PlatformEthical',
    };
  }
  const unitCommission = roundMoney(basePtr * (r.genericPct / 100));
  return {
    basePtr,
    unitPrice: roundMoney(basePtr + unitCommission),
    unitCommission,
    lineCommission: unitCommission, // caller multiplies by qty via lineCommissionForQty
    pricingClass: 'Generic',
    commissionMode: 'PlatformGeneric',
  };
}

/**
 * Offline/managed: ₹ flat per line (not × qty).
 */
export function priceForOfflineManagedLine(
  product: Pick<Product, 'ptr' | 'pricingClass'>,
  qty: number,
  settings?: PlatformSettings | null,
): PricedUnit {
  const r = rates(settings);
  const pricingClass = product.pricingClass ?? 'Generic';
  const basePtr = product.ptr;
  const lineCommission = r.offlineFlat;
  const q = Math.max(1, qty);
  const unitCommission = roundMoney(lineCommission / q);
  return {
    basePtr,
    unitPrice: roundMoney(basePtr + unitCommission),
    unitCommission,
    lineCommission,
    pricingClass,
    commissionMode: 'OfflineManaged',
  };
}

/** Total commission for a line given qty. */
export function lineCommissionTotal(priced: PricedUnit, qty: number): number {
  if (priced.commissionMode === 'PlatformGeneric') {
    return roundMoney(priced.unitCommission * qty);
  }
  return roundMoney(priced.lineCommission);
}

/**
 * Inclusive money for an order line.
 * Generic: commission scales with qty via unitPrice.
 * Ethical / Offline: flat commission on the line (not × qty); unitPrice is effective inclusive average.
 */
export function calcInclusiveOrderLine(
  priced: PricedUnit,
  qty: number,
  gstPercent: number,
): {
  unitPrice: number;
  commissionAmount: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
} {
  const commissionAmount = lineCommissionTotal(priced, qty);
  let lineSubtotal: number;
  let unitPrice: number;
  if (priced.commissionMode === 'PlatformGeneric') {
    unitPrice = priced.unitPrice;
    lineSubtotal = roundMoney(qty * unitPrice);
  } else {
    lineSubtotal = roundMoney(priced.basePtr * qty + commissionAmount);
    unitPrice = qty > 0 ? roundMoney(lineSubtotal / qty) : priced.unitPrice;
  }
  const lineTax = roundMoney(lineSubtotal * (gstPercent / 100));
  const lineTotal = roundMoney(lineSubtotal + lineTax);
  return { unitPrice, commissionAmount, lineSubtotal, lineTax, lineTotal };
}

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
  /** Bank/MDR fee attributable to one unit (Generic) or folded for Ethical/Offline. */
  unitBankFee: number;
  /** Full bank/MDR fee for the line. */
  lineBankFee: number;
  pricingClass: 'Generic' | 'Ethical';
  commissionMode: CommissionMode;
};

function rates(settings?: PlatformSettings | null) {
  return {
    genericPct: settings?.genericCommissionPercent ?? 0.5,
    ethicalFlat: settings?.ethicalCommissionFlatPerProduct ?? 1,
    offlineFlat: settings?.offlineManagedFlatPerLine ?? 1,
    bankFeePct: settings?.bankFeePercent ?? 2,
  };
}

function bankFeeOnPtr(ptr: number, bankFeePct: number): number {
  return roundMoney(ptr * (bankFeePct / 100));
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
    const unitBankFee = bankFeeOnPtr(basePtr, r.bankFeePct);
    return {
      basePtr,
      unitPrice: roundMoney(basePtr + lineCommission + unitBankFee),
      unitCommission: lineCommission,
      lineCommission,
      unitBankFee,
      lineBankFee: unitBankFee,
      pricingClass,
      commissionMode: 'PlatformEthical',
    };
  }
  const unitCommission = roundMoney(basePtr * (r.genericPct / 100));
  const unitBankFee = bankFeeOnPtr(basePtr, r.bankFeePct);
  return {
    basePtr,
    unitPrice: roundMoney(basePtr + unitCommission + unitBankFee),
    unitCommission,
    lineCommission: unitCommission,
    unitBankFee,
    lineBankFee: unitBankFee,
    pricingClass: 'Generic',
    commissionMode: 'PlatformGeneric',
  };
}

/**
 * Offline/managed: ₹ flat commission per line (not × qty); bank fee still scales with PTR×qty.
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
  const unitBankFee = bankFeeOnPtr(basePtr, r.bankFeePct);
  const lineBankFee = roundMoney(unitBankFee * q);
  return {
    basePtr,
    unitPrice: roundMoney(basePtr + unitCommission + unitBankFee),
    unitCommission,
    lineCommission,
    unitBankFee,
    lineBankFee,
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

/** Total bank fee for a line given qty. */
export function lineBankFeeTotal(priced: PricedUnit, qty: number): number {
  if (priced.commissionMode === 'PlatformEthical') {
    // Ethical: bank fee scales with qty even though commission is flat
    return roundMoney(priced.unitBankFee * qty);
  }
  if (priced.commissionMode === 'OfflineManaged') {
    return roundMoney(priced.lineBankFee);
  }
  return roundMoney(priced.unitBankFee * qty);
}

/**
 * Inclusive money for an order line.
 * Pharmacy-visible unitPrice includes PTR + commission + bank fee (pre-GST).
 * Generic: fees scale with qty via unitPrice.
 * Ethical / Offline: flat commission on the line; bank fee scales with qty.
 */
export function calcInclusiveOrderLine(
  priced: PricedUnit,
  qty: number,
  gstPercent: number,
): {
  unitPrice: number;
  commissionAmount: number;
  bankFeeAmount: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
} {
  const commissionAmount = lineCommissionTotal(priced, qty);
  const bankFeeAmount = lineBankFeeTotal(priced, qty);
  let lineSubtotal: number;
  let unitPrice: number;
  if (priced.commissionMode === 'PlatformGeneric') {
    unitPrice = priced.unitPrice;
    lineSubtotal = roundMoney(qty * unitPrice);
  } else {
    lineSubtotal = roundMoney(priced.basePtr * qty + commissionAmount + bankFeeAmount);
    unitPrice = qty > 0 ? roundMoney(lineSubtotal / qty) : priced.unitPrice;
  }
  const lineTax = roundMoney(lineSubtotal * (gstPercent / 100));
  const lineTotal = roundMoney(lineSubtotal + lineTax);
  return { unitPrice, commissionAmount, bankFeeAmount, lineSubtotal, lineTax, lineTotal };
}

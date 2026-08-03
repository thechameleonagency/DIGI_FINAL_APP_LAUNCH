import { beforeEach, describe, expect, it } from 'vitest';
import {
  calcInclusiveOrderLine,
  lineBankFeeTotal,
  lineCommissionTotal,
  priceForOfflineManagedLine,
  priceForPlatformPharmacy,
} from './pricingService';

const withBank = { bankFeePercent: 2 } as never;
const noBank = { bankFeePercent: 0, genericCommissionPercent: 0.5 } as never;

describe('pricingService (AUDIT baked-in commission + bank fee)', () => {
  it('Generic adds 0.5% commission + bank fee by default settings', () => {
    const p = priceForPlatformPharmacy({ ptr: 100, pricingClass: 'Generic' }, withBank);
    expect(p.unitPrice).toBe(102.5);
    expect(p.commissionMode).toBe('PlatformGeneric');
    expect(lineCommissionTotal(p, 10)).toBe(5);
    expect(lineBankFeeTotal(p, 10)).toBe(20);
  });

  it('Ethical adds ₹1 flat commission + bank fee per unit', () => {
    const p = priceForPlatformPharmacy({ ptr: 100, pricingClass: 'Ethical' }, withBank);
    expect(p.unitPrice).toBe(103);
    expect(lineCommissionTotal(p, 50)).toBe(1);
    expect(lineBankFeeTotal(p, 50)).toBe(100);
  });

  it('Offline managed is ₹1 commission per line + bank fee', () => {
    const p = priceForOfflineManagedLine({ ptr: 100, pricingClass: 'Generic' }, 10, withBank);
    expect(p.lineCommission).toBe(1);
    expect(p.commissionMode).toBe('OfflineManaged');
    expect(lineBankFeeTotal(p, 10)).toBe(20);
  });

  it('respects admin rate overrides', () => {
    const p = priceForPlatformPharmacy(
      { ptr: 200, pricingClass: 'Generic' },
      { genericCommissionPercent: 1, bankFeePercent: 0 } as never,
    );
    expect(p.unitPrice).toBe(202);
  });

  it('calcInclusiveOrderLine snapshots bankFeeAmount', () => {
    const p = priceForPlatformPharmacy({ ptr: 100, pricingClass: 'Generic' }, withBank);
    const money = calcInclusiveOrderLine(p, 10, 12);
    expect(money.commissionAmount).toBe(5);
    expect(money.bankFeeAmount).toBe(20);
    expect(money.lineSubtotal).toBe(1025);
  });

  it('zero bank fee preserves legacy commission-only math', () => {
    const p = priceForPlatformPharmacy({ ptr: 100, pricingClass: 'Generic' }, noBank);
    expect(p.unitPrice).toBe(100.5);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  lineCommissionTotal,
  priceForOfflineManagedLine,
  priceForPlatformPharmacy,
} from './pricingService';

describe('pricingService (AUDIT baked-in commission)', () => {
  it('Generic adds 0.5% by default', () => {
    const p = priceForPlatformPharmacy({ ptr: 100, pricingClass: 'Generic' });
    expect(p.unitPrice).toBe(100.5);
    expect(p.commissionMode).toBe('PlatformGeneric');
    expect(lineCommissionTotal(p, 10)).toBe(5);
  });

  it('Ethical adds ₹1 flat per line not × qty', () => {
    const p = priceForPlatformPharmacy({ ptr: 100, pricingClass: 'Ethical' });
    expect(p.unitPrice).toBe(101);
    expect(lineCommissionTotal(p, 50)).toBe(1);
  });

  it('Offline managed is ₹1 per line', () => {
    const p = priceForOfflineManagedLine({ ptr: 100, pricingClass: 'Generic' }, 10);
    expect(p.lineCommission).toBe(1);
    expect(p.commissionMode).toBe('OfflineManaged');
  });

  it('respects admin rate overrides', () => {
    const p = priceForPlatformPharmacy(
      { ptr: 200, pricingClass: 'Generic' },
      { genericCommissionPercent: 1 } as never,
    );
    expect(p.unitPrice).toBe(202);
  });
});

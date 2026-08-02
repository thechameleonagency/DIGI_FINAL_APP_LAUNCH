import { describe, expect, it } from 'vitest';
import type { Business, Catalogue, Product } from '../../domain/entities/types';
import { resolveCatalogueSharePhase } from './catalogueShare';

const stockist = {
  id: 's1',
  type: 'Stockist',
  name: 'Share Stockist',
  accountStatus: 'Active',
  city: 'Pune',
  state: 'Maharashtra',
} as Business;

const catalogue = { id: 'c1', stockistId: 's1', status: 'Active' } as Catalogue;
const product = { id: 'p1', stockistId: 's1', status: 'Active', name: 'A' } as Product;

describe('resolveCatalogueSharePhase', () => {
  it('treats undefined live-query results as loading (not not-found/paused)', () => {
    expect(resolveCatalogueSharePhase({ stockist: undefined, catalogue: undefined, products: undefined }).kind).toBe(
      'loading',
    );
    expect(resolveCatalogueSharePhase({ stockist, catalogue: undefined, products: [] }).kind).toBe('loading');
    expect(resolveCatalogueSharePhase({ stockist, catalogue, products: undefined }).kind).toBe('loading');
  });

  it('returns not_found when stockist missing after load', () => {
    expect(resolveCatalogueSharePhase({ stockist: null, catalogue: null, products: [] }).kind).toBe('not_found');
  });

  it('blocks non-stockist and non-active account statuses', () => {
    expect(
      resolveCatalogueSharePhase({
        stockist: { ...stockist, type: 'Pharmacy' },
        catalogue,
        products: [product],
      }).kind,
    ).toBe('unavailable');
    expect(
      resolveCatalogueSharePhase({
        stockist: { ...stockist, accountStatus: 'Suspended' },
        catalogue,
        products: [product],
      }),
    ).toEqual({ kind: 'unavailable', reason: 'suspended' });
    expect(
      resolveCatalogueSharePhase({
        stockist: { ...stockist, accountStatus: 'Deactivated' },
        catalogue,
        products: [product],
      }),
    ).toEqual({ kind: 'unavailable', reason: 'deactivated' });
  });

  it('pauses when catalogue missing or not Active; empty vs ready otherwise', () => {
    expect(resolveCatalogueSharePhase({ stockist, catalogue: null, products: [product] }).kind).toBe('paused');
    expect(
      resolveCatalogueSharePhase({
        stockist,
        catalogue: { ...catalogue, status: 'Maintenance' },
        products: [product],
      }).kind,
    ).toBe('paused');
    expect(resolveCatalogueSharePhase({ stockist, catalogue, products: [] }).kind).toBe('empty');
    expect(
      resolveCatalogueSharePhase({
        stockist,
        catalogue,
        products: [{ ...product, status: 'Inactive' }],
      }).kind,
    ).toBe('empty');
    const ready = resolveCatalogueSharePhase({ stockist, catalogue, products: [product] });
    expect(ready.kind).toBe('ready');
    if (ready.kind === 'ready') expect(ready.products).toHaveLength(1);
  });
});

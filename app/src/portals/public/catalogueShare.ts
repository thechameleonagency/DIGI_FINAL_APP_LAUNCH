import type { Business, Catalogue, Product } from '../../domain/entities/types';

export type CatalogueSharePhase =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'unavailable'; reason: 'not_stockist' | 'suspended' | 'deactivated' }
  | { kind: 'paused'; stockist: Business }
  | { kind: 'empty'; stockist: Business }
  | { kind: 'ready'; stockist: Business; products: Product[] };

/** Pure resolver for public CF-21 share page states (loading vs not-found vs paused). */
export function resolveCatalogueSharePhase(input: {
  stockist: Business | null | undefined;
  catalogue: Catalogue | null | undefined;
  products: Product[] | undefined;
}): CatalogueSharePhase {
  // useLiveQuery returns undefined while the first result is pending.
  if (input.stockist === undefined || input.catalogue === undefined || input.products === undefined) {
    return { kind: 'loading' };
  }
  if (!input.stockist) return { kind: 'not_found' };
  if (input.stockist.type !== 'Stockist') return { kind: 'unavailable', reason: 'not_stockist' };
  if (input.stockist.accountStatus === 'Suspended') return { kind: 'unavailable', reason: 'suspended' };
  if (input.stockist.accountStatus === 'Deactivated') return { kind: 'unavailable', reason: 'deactivated' };
  if (input.stockist.accountStatus !== 'Active') return { kind: 'unavailable', reason: 'suspended' };
  // Missing catalogue row or non-Active = paused (hide listing).
  if (!input.catalogue || input.catalogue.status !== 'Active') {
    return { kind: 'paused', stockist: input.stockist };
  }
  const active = input.products.filter((p) => p.status === 'Active');
  if (!active.length) return { kind: 'empty', stockist: input.stockist };
  return { kind: 'ready', stockist: input.stockist, products: active };
}

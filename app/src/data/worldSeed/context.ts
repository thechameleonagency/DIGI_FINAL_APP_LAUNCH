import type { Business, Connection, ManagedPharmacy, User } from '../../domain/entities/types';

export type TraderKey = 'stockistA' | 'stockistB' | 'pharmacyA' | 'pharmacyB' | 'pharmacyC' | 'pharmacyPending';

export type TraderParty = {
  key: TraderKey;
  user: User;
  business: Business;
  delivery?: User;
};

export type WorldCtx = {
  adminUser?: User;
  adminBusiness?: Business;
  supportUser?: User;
  stockists: TraderParty[];
  pharmacies: TraderParty[];
  pendingPharmacy?: TraderParty;
  /** `${pharmacyKey}::${stockistKey}` → connection */
  connections: Map<string, Connection>;
  /** stockist business id → product ids */
  productIdsByStockist: Map<string, string[]>;
  managedPharmacies: ManagedPharmacy[];
};

function emptyCtx(): WorldCtx {
  return {
    stockists: [],
    pharmacies: [],
    connections: new Map(),
    productIdsByStockist: new Map(),
    managedPharmacies: [],
  };
}

let ctx: WorldCtx = emptyCtx();

/** Reset mutable world context at the start of each seed run. */
export function resetWorldCtx(): void {
  ctx = emptyCtx();
}

export function getWorldCtx(): WorldCtx {
  return ctx;
}

export function requireAdmin(): { user: User; business: Business } {
  if (!ctx.adminUser || !ctx.adminBusiness) {
    throw new Error('[worldSeed] admin not set — run phase 1 first');
  }
  return { user: ctx.adminUser, business: ctx.adminBusiness };
}

export function connectionKey(pharmacyKey: string, stockistKey: string): string {
  return `${pharmacyKey}::${stockistKey}`;
}

export function stockistByKey(key: TraderKey): TraderParty {
  const party = ctx.stockists.find((s) => s.key === key);
  if (!party) throw new Error(`[worldSeed] stockist ${key} missing`);
  return party;
}

export function pharmacyByKey(key: TraderKey): TraderParty {
  const party = ctx.pharmacies.find((p) => p.key === key);
  if (!party) throw new Error(`[worldSeed] pharmacy ${key} missing`);
  return party;
}

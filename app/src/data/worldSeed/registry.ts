import { CAST } from './cast';

export type SeedAccountPortal = 'admin' | 'pharmacy' | 'stockist';

export type SeedAccount = {
  email: string;
  role: string;
  portal: SeedAccountPortal;
  name: string;
  /** Business / workspace label for login directory + docs. */
  businessName: string;
};

const seededAccounts: SeedAccount[] = [];

/**
 * Canonical login directory for a completed world seed (from cast).
 * Pending pharmacy has no delivery staff (business stays PendingActivation).
 */
export function buildCastSeedAccountDirectory(): SeedAccount[] {
  return [
    {
      email: CAST.superAdmin.email,
      name: CAST.superAdmin.name,
      role: 'SuperAdmin',
      portal: 'admin',
      businessName: 'DigiSwasthya Platform',
    },
    {
      email: CAST.supportManager.email,
      name: CAST.supportManager.name,
      role: 'SupportManager',
      portal: 'admin',
      businessName: 'DigiSwasthya Platform',
    },
    {
      email: CAST.stockistA.owner.email,
      name: CAST.stockistA.owner.name,
      role: 'Stockist',
      portal: 'stockist',
      businessName: CAST.stockistA.site.businessName,
    },
    {
      email: CAST.stockistA.delivery.email,
      name: CAST.stockistA.delivery.name,
      role: 'DeliveryStaff',
      portal: 'stockist',
      businessName: CAST.stockistA.site.businessName,
    },
    {
      email: CAST.stockistB.owner.email,
      name: CAST.stockistB.owner.name,
      role: 'Stockist',
      portal: 'stockist',
      businessName: CAST.stockistB.site.businessName,
    },
    {
      email: CAST.stockistB.delivery.email,
      name: CAST.stockistB.delivery.name,
      role: 'DeliveryStaff',
      portal: 'stockist',
      businessName: CAST.stockistB.site.businessName,
    },
    {
      email: CAST.pharmacyA.owner.email,
      name: CAST.pharmacyA.owner.name,
      role: 'Pharmacist',
      portal: 'pharmacy',
      businessName: CAST.pharmacyA.site.businessName,
    },
    {
      email: CAST.pharmacyA.delivery.email,
      name: CAST.pharmacyA.delivery.name,
      role: 'DeliveryStaff',
      portal: 'pharmacy',
      businessName: CAST.pharmacyA.site.businessName,
    },
    {
      email: CAST.pharmacyB.owner.email,
      name: CAST.pharmacyB.owner.name,
      role: 'Pharmacist',
      portal: 'pharmacy',
      businessName: CAST.pharmacyB.site.businessName,
    },
    {
      email: CAST.pharmacyB.delivery.email,
      name: CAST.pharmacyB.delivery.name,
      role: 'DeliveryStaff',
      portal: 'pharmacy',
      businessName: CAST.pharmacyB.site.businessName,
    },
    {
      email: CAST.pharmacyC.owner.email,
      name: CAST.pharmacyC.owner.name,
      role: 'Pharmacist',
      portal: 'pharmacy',
      businessName: CAST.pharmacyC.site.businessName,
    },
    {
      email: CAST.pharmacyC.delivery.email,
      name: CAST.pharmacyC.delivery.name,
      role: 'DeliveryStaff',
      portal: 'pharmacy',
      businessName: CAST.pharmacyC.site.businessName,
    },
    {
      email: CAST.pharmacyPending.owner.email,
      name: CAST.pharmacyPending.owner.name,
      role: 'Pharmacist',
      portal: 'pharmacy',
      businessName: CAST.pharmacyPending.site.businessName,
    },
  ];
}

/** Clear login directory at the start of each world seed run. */
export function resetSeedAccountDirectory(): void {
  seededAccounts.length = 0;
}

/** Register a seeded login account as phases create them. */
export function registerSeedAccount(account: SeedAccount): void {
  if (seededAccounts.some((a) => a.email === account.email)) return;
  seededAccounts.push(account);
}

/**
 * Login helper directory for seeded demo accounts.
 * Prefers accounts registered during the current process; after reload falls back
 * to the full cast directory (login panel gates on worldSeedVersion).
 */
export function getSeedAccountDirectory(): SeedAccount[] {
  if (seededAccounts.length > 0) return [...seededAccounts];
  return buildCastSeedAccountDirectory();
}

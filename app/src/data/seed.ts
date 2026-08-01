import { formatISO, subDays } from 'date-fns';
import type { Business, PlatformSettings, User, Verification } from '../domain/entities/types';
import { hashPassword, randomSalt } from '../domain/utils/crypto';
import { resetCounters } from '../domain/utils/ids';
import { hydrateCounters } from './counters';
import { db } from './db';

/** Zero-state seed. Bump wipes existing local DBs once (delete-all mechanism). */
export const SEED_VERSION = 4;

const now = () => new Date();
const iso = (d: Date) => formatISO(d);

async function makeUser(
  partial: Omit<User, 'passwordSalt' | 'passwordHash' | 'createdAt' | 'updatedAt'> & { password: string },
): Promise<User> {
  const salt = randomSalt();
  const passwordHash = await hashPassword(partial.password, salt);
  const { password: _, ...rest } = partial;
  return {
    ...rest,
    passwordSalt: salt,
    passwordHash,
    onboardingSeenAt: rest.onboardingSeenAt ?? iso(now()),
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
}

async function clearAllTables(): Promise<void> {
  for (const table of db.tables) {
    try {
      await table.clear();
    } catch {
      // continue clearing other tables
    }
  }
}

/**
 * Skip when seed v3 is already present and at least 3 users exist.
 * Must NOT require orders — zero-state seed has none (BUG-8).
 */
export async function ensureSeeded(): Promise<void> {
  try {
    await db.open();
  } catch {
    // continue — open may already be in progress
  }
  const meta = await db.seedMeta.get('meta').catch(() => undefined);
  const userCount = await db.users.count().catch(() => 0);
  if (meta?.seedVersion === SEED_VERSION && userCount >= 3) {
    // Backfill walkthrough flag for older local DBs so demos/e2e are not blocked by the modal.
    const users = await db.users.toArray();
    const ts = iso(now());
    await Promise.all(
      users.filter((u) => !u.onboardingSeenAt).map((u) => db.users.update(u.id, { onboardingSeenAt: ts })),
    );
    await hydrateCounters();
    return;
  }

  await clearAllTables();
  try {
    await seedAll();
  } catch (err) {
    // Retry once after hard delete (handles half-written state / blocked prior clear)
    console.warn('Seed failed, retrying', err);
    try {
      await db.delete();
      await db.open();
    } catch {
      await clearAllTables();
    }
    await seedAll();
  }

  await hydrateCounters();
}

/**
 * Seeds ONLY: 3 businesses (Active + Approved), 3 owner users, 2 Approved
 * verification rows, 1 empty stockist catalogue, full platformSettings, seedMeta.
 * All trade / operational tables remain empty.
 */
export async function seedAll(): Promise<void> {
  resetCounters();

  const platformId = 'biz-platform';
  const stockistId = 'biz-medroute';
  const pharmacyId = 'biz-careplus';

  const adminId = 'user-admin';
  const stockistOwnerId = 'user-vikram';
  const pharmacyOwnerId = 'user-neha';

  const businesses: Business[] = [
    {
      id: platformId,
      type: 'Platform',
      name: 'DigiSwasthya Ops',
      phone: '+91 90000 00001',
      email: 'admin@digiswasthya.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      address: 'DigiSwasthya HQ, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: adminId,
      createdAt: iso(subDays(now(), 120)),
      updatedAt: iso(now()),
    },
    {
      id: stockistId,
      type: 'Stockist',
      name: 'MedRoute Distributors',
      legalName: 'MedRoute Distributors Pvt Ltd',
      gstNumber: '27ABCDE1234F1Z5',
      drugLicenseNumber: 'MH-WD-2024-8891',
      phone: '+91 98765 43210',
      email: 'vikram@medroute.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411037',
      address: '42 Wholesale Hub, Market Yard, Gultekdi, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: stockistOwnerId,
      createdAt: iso(subDays(now(), 90)),
      updatedAt: iso(now()),
    },
    {
      id: pharmacyId,
      type: 'Pharmacy',
      name: 'CarePlus Chemists',
      legalName: 'CarePlus Chemists',
      gstNumber: '27PQRSX6789L1Z2',
      drugLicenseNumber: 'MH-20-21456',
      phone: '+91 98230 11220',
      email: 'neha@careplus.pune.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      address: '18 Karve Road, Kothrud, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: pharmacyOwnerId,
      createdAt: iso(subDays(now(), 80)),
      updatedAt: iso(now()),
    },
  ];

  const users: User[] = await Promise.all([
    makeUser({
      id: adminId,
      businessId: platformId,
      name: 'Priya Nair',
      email: 'admin@digiswasthya.in',
      phone: '+91 90000 00001',
      role: 'SuperAdmin',
      status: 'Active',
      password: 'Admin@2026',
    }),
    makeUser({
      id: stockistOwnerId,
      businessId: stockistId,
      name: 'Vikram Rao',
      email: 'vikram@medroute.in',
      phone: '+91 98765 43210',
      role: 'Owner',
      status: 'Active',
      password: 'Stockist@2026',
    }),
    makeUser({
      id: pharmacyOwnerId,
      businessId: pharmacyId,
      name: 'Neha Kulkarni',
      email: 'neha@careplus.pune.in',
      phone: '+91 98230 11220',
      role: 'Owner',
      status: 'Active',
      password: 'Pharmacy@2026',
    }),
  ]);

  const verifications: Verification[] = [
    {
      id: 'ver-medroute',
      businessId: stockistId,
      status: 'Approved',
      submittedAt: iso(subDays(now(), 85)),
      reviewedAt: iso(subDays(now(), 84)),
      reviewerId: adminId,
      documentIds: [],
      decisionHistory: [
        { from: 'NotStarted', to: 'Submitted', at: iso(subDays(now(), 85)), actorId: stockistOwnerId },
        { from: 'Submitted', to: 'UnderReview', at: iso(subDays(now(), 85)), actorId: adminId },
        { from: 'UnderReview', to: 'Approved', at: iso(subDays(now(), 84)), actorId: adminId },
      ],
      createdAt: iso(subDays(now(), 85)),
      updatedAt: iso(subDays(now(), 84)),
    },
    {
      id: 'ver-careplus',
      businessId: pharmacyId,
      status: 'Approved',
      submittedAt: iso(subDays(now(), 78)),
      reviewedAt: iso(subDays(now(), 77)),
      reviewerId: adminId,
      documentIds: [],
      decisionHistory: [
        { from: 'NotStarted', to: 'Submitted', at: iso(subDays(now(), 78)), actorId: pharmacyOwnerId },
        { from: 'Submitted', to: 'UnderReview', at: iso(subDays(now(), 78)), actorId: adminId },
        { from: 'UnderReview', to: 'Approved', at: iso(subDays(now(), 77)), actorId: adminId },
      ],
      createdAt: iso(subDays(now(), 78)),
      updatedAt: iso(subDays(now(), 77)),
    },
  ];

  const settings: PlatformSettings = {
    id: 'platform',
    returnWindowDays: 7,
    inviteTtlDays: 7,
    verificationSlaHours: 72,
    orderSlaHours: 24,
    paymentSlaHours: 48,
    paymentProofMandatory: false,
    billAheadAllowed: false,
    roundingMode: 'nearest',
    expiryNearDays: 90,
    expiryCriticalDays: 30,
    creditNoteAutoExpire: false,
    genericCommissionPercent: 0.5,
    ethicalCommissionFlatPerProduct: 1,
    offlineManagedFlatPerLine: 1,
    lastPolicyRunAt: iso(now()),
  };

  const catalogueId = 'cat-medroute';

  await db.transaction('rw', db.tables, async () => {
    await db.businesses.bulkPut(businesses);
    await db.users.bulkPut(users);
    await db.verifications.bulkPut(verifications);
    await db.catalogues.put({ id: catalogueId, stockistId, status: 'Active', updatedAt: iso(now()) });
    await db.platformSettings.put(settings);
    await db.seedMeta.put({ id: 'meta', seedVersion: SEED_VERSION, seededAt: iso(now()) });
  });
}

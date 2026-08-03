/**
 * Empty-state workspace bootstrap.
 * Bump EMPTY_STATE_VERSION to force a one-time IndexedDB wipe (clears prior demo seeds).
 * Does not create users, businesses, or trade data.
 */
import type { PlatformSettings } from '../domain/entities/types';
import { nowIso } from '../domain/utils/clock';
import { resetCounters } from '../domain/utils/ids';
import { hydrateCounters } from './counters';
import { db } from './db';

/** Stamp used by ensureEmptyWorkspace + workspace import to avoid stale wipe loops. */
export const SEED_VERSION = 7;
export const EMPTY_STATE_VERSION = SEED_VERSION;

/** Bump to force a one-time world re-seed after clear. */
export const WORLD_SEED_VERSION = 5;

/** Default platform policy row — configuration only, not demo accounts or trade data. */
export function defaultPlatformSettings(): PlatformSettings {
  return {
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
    creditNoteExpiryDays: 90,
    genericCommissionPercent: 0.5,
    ethicalCommissionFlatPerProduct: 1,
    offlineManagedFlatPerLine: 1,
    bankFeePercent: 2,
    bankFeeBearer: 'Stockist',
    defaultGstPercent: 12,
  };
}

async function clearAllTables(): Promise<void> {
  for (const table of db.tables) {
    try {
      await table.clear();
    } catch {
      // continue
    }
  }
}

/**
 * Ensures IndexedDB is open with zero demo/trade data.
 * On version bump: wipe all tables, write default platform settings + meta stamp.
 * When already current: ensure platform settings exist; never reintroduce demo accounts.
 */
export async function ensureEmptyWorkspace(): Promise<void> {
  try {
    await db.open();
  } catch {
    // continue
  }

  const meta = await db.seedMeta.get('meta').catch(() => undefined);
  if (meta?.seedVersion === EMPTY_STATE_VERSION) {
    const settings = await db.platformSettings.get('platform').catch(() => undefined);
    if (!settings) {
      await db.platformSettings.put(defaultPlatformSettings());
    }
    await hydrateCounters();
    return;
  }

  await clearAllTables();
  resetCounters();
  await db.platformSettings.put(defaultPlatformSettings());
  await db.seedMeta.put({
    id: 'meta',
    seedVersion: EMPTY_STATE_VERSION,
    seededAt: nowIso(),
  });
  await hydrateCounters();
}

/**
 * True when world seed is missing or outdated (auto-run once on boot / after version bump).
 */
export async function needsWorldSeed(): Promise<boolean> {
  const meta = await db.seedMeta.get('meta').catch(() => undefined);
  return meta?.worldSeedVersion !== WORLD_SEED_VERSION;
}

/**
 * Wipe all tables and restore empty platform settings + EMPTY_STATE_VERSION stamp.
 * Does NOT stamp worldSeedVersion (caller runs world seed next, then stamps both).
 */
export async function clearWorkspaceForSeed(): Promise<void> {
  try {
    await db.open();
  } catch {
    // continue
  }
  await clearAllTables();
  resetCounters();
  await db.platformSettings.put(defaultPlatformSettings());
  await db.seedMeta.put({
    id: 'meta',
    seedVersion: EMPTY_STATE_VERSION,
    seededAt: nowIso(),
  });
  await hydrateCounters();
}

/** @deprecated Prefer ensureEmptyWorkspace — kept for call-site compatibility. */
export async function ensureSeeded(): Promise<void> {
  return ensureEmptyWorkspace();
}

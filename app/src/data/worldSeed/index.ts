import { nowIso, setClock } from '../../domain/utils/clock';
import {
  EMPTY_STATE_VERSION,
  WORLD_SEED_VERSION,
  clearWorkspaceForSeed,
  needsWorldSeed,
} from '../seed';
import { db } from '../db';
import { clearPersistedSession } from '../../store/session';
import { startClock90DaysAgo } from './chronology';
import { resetWorldCtx } from './context';
import { seedPlatformPhase } from './phases/01-platform';
import { seedOnboardPhase } from './phases/02-onboard';
import { seedStaffPhase } from './phases/03-staff';
import { seedNetworkPhase } from './phases/04-network';
import { seedCatalogueStockPhase } from './phases/05-catalogueStock';
import { seedOrderingFulfilPhase } from './phases/06-orderingFulfil';
import { seedMoneyPhase } from './phases/07-money';
import { seedRetailDeliveryPhase } from './phases/08-retailDelivery';
import { seedProcurementPhase } from './phases/09-procurement';
import { seedPlatformOpsPhase } from './phases/10-platformOps';
import { seedEdgeCasesPhase } from './phases/11-edgeCases';
import {
  reportWorldSeedDone,
  reportWorldSeedError,
  reportWorldSeedPhase,
  resetWorldSeedProgress,
  yieldToUi,
} from './progress';
import { resetSeedAccountDirectory } from './registry';

export { needsWorldSeed } from '../seed';
export { DEMO_PASSWORD } from './cast';
export { getSeedAccountDirectory, buildCastSeedAccountDirectory, type SeedAccount } from './registry';
export { getWorldCtx } from './context';
export {
  getWorldSeedProgress,
  subscribeWorldSeedProgress,
  type WorldSeedProgress,
} from './progress';

const PHASES: { label: string; run: () => Promise<void> }[] = [
  { label: 'Platform admin', run: seedPlatformPhase },
  { label: 'Register & verify businesses', run: seedOnboardPhase },
  { label: 'Staff invites', run: seedStaffPhase },
  { label: 'Connections & managed pharmacies', run: seedNetworkPhase },
  { label: 'Catalogue & stock', run: seedCatalogueStockPhase },
  { label: 'Orders & fulfilment', run: seedOrderingFulfilPhase },
  { label: 'Payments & returns', run: seedMoneyPhase },
  { label: 'Pharmacy sales & delivery', run: seedRetailDeliveryPhase },
  { label: 'Procurement', run: seedProcurementPhase },
  { label: 'Platform ops', run: seedPlatformOpsPhase },
  { label: 'Edge-case probes', run: seedEdgeCasesPhase },
];

/** Single-flight so boot + login page don't start two seeds. */
let inFlight: Promise<void> | null = null;

async function runWorldSeed(): Promise<void> {
  resetWorldCtx();
  resetSeedAccountDirectory();
  resetWorldSeedProgress();
  startClock90DaysAgo();
  try {
    for (let i = 0; i < PHASES.length; i++) {
      const phase = PHASES[i]!;
      reportWorldSeedPhase(i + 1, phase.label);
      await yieldToUi();
      await phase.run();
      await yieldToUi();
    }

    await db.seedMeta.put({
      id: 'meta',
      seedVersion: EMPTY_STATE_VERSION,
      worldSeedVersion: WORLD_SEED_VERSION,
      seededAt: nowIso(),
    });
    reportWorldSeedDone();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    reportWorldSeedError(message);
    throw e;
  } finally {
    setClock(null);
  }
}

/** Clear workspace and run the full world seed pipeline. */
export async function resetAndSeedWorld(): Promise<void> {
  if (inFlight) await inFlight;
  clearPersistedSession();
  await clearWorkspaceForSeed();
  inFlight = runWorldSeed().finally(() => {
    inFlight = null;
  });
  await inFlight;
}

/**
 * Seed once when worldSeedVersion is missing/outdated.
 * Clears any leftover setup/partial data first (e.g. old SuperAdmin from /auth/setup)
 * so phase 1 can create the cast `superadmin@digiswasthya.demo` account.
 * Safe to call from UI after paint — does not block App hydration.
 */
export async function ensureWorldSeeded(): Promise<void> {
  if (!(await needsWorldSeed())) {
    reportWorldSeedDone();
    return;
  }
  if (inFlight) {
    await inFlight;
    return;
  }
  inFlight = (async () => {
    // Wipe old platform admin / partial DB so createFirstSuperAdmin succeeds with cast creds.
    clearPersistedSession();
    await clearWorkspaceForSeed();
    await runWorldSeed();
  })().finally(() => {
    inFlight = null;
  });
  await inFlight;
}

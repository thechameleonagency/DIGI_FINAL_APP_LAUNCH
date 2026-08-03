import { beforeEach, describe, expect, it } from 'vitest';
import { getClock } from '../../domain/utils/clock';
import { isGstin } from '../../domain/utils/validation';
import { db } from '../db';
import { WORLD_SEED_VERSION, clearWorkspaceForSeed } from '../seed';
import { CAST_GST, DEMO_PASSWORD } from './cast';
import {
  buildCastSeedAccountDirectory,
  getSeedAccountDirectory,
  resetAndSeedWorld,
} from './index';

async function entityCounts() {
  return {
    users: await db.users.count(),
    businesses: await db.businesses.count(),
    products: await db.products.count(),
    activeConnections: await db.connections.where('status').equals('Active').count(),
    pendingBiz: await db.businesses
      .filter((b) => b.accountStatus === 'PendingActivation' && b.type === 'Pharmacy')
      .count(),
    managed: await db.managedPharmacies.count(),
    batches: await db.batches.count(),
    quarantined: await db.batches.where('status').equals('Quarantined').count(),
    expired: await db.batches.where('status').equals('Expired').count(),
    inactiveProducts: await db.products.where('status').equals('Inactive').count(),
    orders: await db.orders.count(),
    invoices: await db.invoices.count(),
    payments: await db.payments.count(),
    sales: await db.customerSales.count(),
    purchaseOrders: await db.purchaseOrders.count(),
    tickets: await db.supportTickets.count(),
    announcements: await db.announcements.count(),
    banners: await db.banners.count(),
    suppliers: await db.suppliers.count(),
    routes: await db.pharmacyRoutes.count(),
  };
}

describe('worldSeed Session E', () => {
  beforeEach(async () => {
    await clearWorkspaceForSeed();
  });

  it('resetAndSeedWorld meets strong volume mins, stamps version, clears clock', async () => {
    await resetAndSeedWorld();

    const c = await entityCounts();

    // Session E strong mins
    expect(c.users).toBeGreaterThanOrEqual(12);
    expect(c.products).toBeGreaterThanOrEqual(80);
    expect(c.orders).toBeGreaterThanOrEqual(40);
    expect(c.invoices).toBeGreaterThanOrEqual(10);
    expect(c.payments).toBeGreaterThanOrEqual(5);
    expect(c.sales).toBeGreaterThanOrEqual(20);
    expect(c.purchaseOrders).toBeGreaterThanOrEqual(5);

    // Structural invariants from B–D
    expect(c.businesses).toBeGreaterThanOrEqual(5);
    expect(c.activeConnections).toBeGreaterThanOrEqual(3);
    expect(c.pendingBiz).toBe(1);
    expect(c.managed).toBeGreaterThanOrEqual(2);
    expect(c.batches).toBeGreaterThan(0);
    expect(c.quarantined).toBeGreaterThanOrEqual(1);
    expect(c.expired).toBeGreaterThanOrEqual(1);
    expect(c.inactiveProducts).toBeGreaterThanOrEqual(1);
    expect(c.tickets).toBeGreaterThanOrEqual(2);
    expect(c.announcements).toBeGreaterThanOrEqual(2);
    expect(c.banners).toBeGreaterThanOrEqual(1);
    expect(c.suppliers).toBeGreaterThanOrEqual(4);
    expect(c.routes).toBeGreaterThanOrEqual(1);

    for (const gst of Object.values(CAST_GST)) {
      expect(isGstin(gst)).toBe(true);
    }

    const directory = getSeedAccountDirectory();
    expect(directory.length).toBeGreaterThanOrEqual(12);
    expect(directory.every((a) => a.businessName.length > 0)).toBe(true);
    expect(directory.some((a) => a.role === 'SuperAdmin')).toBe(true);
    expect(directory.some((a) => a.role === 'Stockist')).toBe(true);
    expect(directory.some((a) => a.role === 'Pharmacist')).toBe(true);
    expect(directory.some((a) => a.role === 'DeliveryStaff')).toBe(true);
    expect(DEMO_PASSWORD).toBe('Demo@1234');
    expect(buildCastSeedAccountDirectory().map((a) => a.email).sort()).toEqual(
      directory.map((a) => a.email).sort(),
    );

    const settings = await db.platformSettings.get('platform');
    expect(settings?.billAheadAllowed).toBe(true);
    expect(settings?.maintenanceMode).toBe(false);

    const meta = await db.seedMeta.get('meta');
    expect(meta?.worldSeedVersion).toBe(WORLD_SEED_VERSION);
    expect(getClock()).toBeNull();
  }, 240_000);

  it('resetAndSeedWorld twice yields identical entity counts (idempotent)', async () => {
    await resetAndSeedWorld();
    const first = await entityCounts();
    const meta1 = await db.seedMeta.get('meta');
    expect(meta1?.worldSeedVersion).toBe(WORLD_SEED_VERSION);
    expect(getClock()).toBeNull();

    await resetAndSeedWorld();
    const second = await entityCounts();
    const meta2 = await db.seedMeta.get('meta');
    expect(meta2?.worldSeedVersion).toBe(WORLD_SEED_VERSION);
    expect(getClock()).toBeNull();

    // Cast size is fixed; trade volume must match across full pipeline re-runs.
    expect(second.users).toBe(first.users);
    expect(second.businesses).toBe(first.businesses);
    expect(second.products).toBe(first.products);
    expect(second.activeConnections).toBe(first.activeConnections);
    expect(second.pendingBiz).toBe(first.pendingBiz);
    expect(second.managed).toBe(first.managed);
    expect(second.orders).toBe(first.orders);
    expect(second.invoices).toBe(first.invoices);
    expect(second.payments).toBe(first.payments);
    expect(second.sales).toBe(first.sales);
    expect(second.purchaseOrders).toBe(first.purchaseOrders);
    expect(second.tickets).toBe(first.tickets);
    expect(second.announcements).toBe(first.announcements);
    expect(second.banners).toBe(first.banners);
    expect(second.suppliers).toBe(first.suppliers);
  }, 600_000);
});

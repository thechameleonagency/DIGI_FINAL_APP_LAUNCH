import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { SEED_VERSION } from '../data/seed';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { exportWorkspace, importWorkspace } from './supportService';

const EXPECTED_TABLES = [
  'businesses',
  'users',
  'verifications',
  'connections',
  'catalogues',
  'products',
  'batches',
  'inventoryMovements',
  'orders',
  'deliveries',
  'invoices',
  'payments',
  'returns',
  'creditNotes',
  'notifications',
  'messageThreads',
  'messages',
  'supportTickets',
  'announcements',
  'banners',
  'auditLogs',
  'platformSettings',
  'files',
  'carts',
  'wishlists',
  'pharmacyInventory',
  'seedMeta',
  'smartOrderRuns',
  'customerSales',
  'deliveryAreas',
  'pharmacyRoutes',
  'partnerInvites',
  'managedPharmacies',
  'suppliers',
  'purchaseOrders',
  'purchaseBills',
  'supplierReturns',
  'stockistRoutes',
  'upgradeRequests',
  'counterfeitReports',
  'priceChanges',
  'favourites',
] as const;

describe('workspace export/import (SW-1 / G22)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('export includes every Dexie table name', async () => {
    const json = await exportWorkspace();
    const parsed = JSON.parse(json) as { data: Record<string, unknown[]> };
    const names = Object.keys(parsed.data).sort();
    expect(names).toEqual([...EXPECTED_TABLES].sort());
    expect(db.tables.map((t) => t.name).sort()).toEqual(names);
  });

  it('round-trips v2 trade tables and stamps seedMeta', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await db.favourites.add({
      id: 'fav-1',
      pharmacyId: 'biz-ph',
      stockistId: 'biz-st',
      note: 'Preferred',
    });
    await db.counterfeitReports.add({
      id: 'cf-1',
      reporterBusinessId: 'biz-ph',
      description: 'Suspected',
      evidenceFileIds: [],
      status: 'Reported',
      internalNotes: [],
      createdAt: '2026-03-10T12:00:00.000Z',
      updatedAt: '2026-03-10T12:00:00.000Z',
    });
    await db.smartOrderRuns.add({
      id: 'sor-1',
      pharmacyId: 'biz-ph',
      scope: 'lowStock',
      createdBy: owner.id,
      createdAt: '2026-03-10T12:00:00.000Z',
      suggestions: [],
      acceptedLines: [],
    });

    const exported = await exportWorkspace();
    await clearDb();
    const res = await importWorkspace(exported);
    expect(res.ok).toBe(true);

    expect(await db.favourites.count()).toBe(1);
    expect(await db.counterfeitReports.count()).toBe(1);
    expect(await db.smartOrderRuns.count()).toBe(1);
    expect(await db.users.count()).toBe(1);
    const meta = await db.seedMeta.get('meta');
    expect(meta?.seedVersion).toBe(SEED_VERSION);
  });
});

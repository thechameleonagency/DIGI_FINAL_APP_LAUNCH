import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { recordManualOrder } from './orderService';

describe('recordManualOrder (CF-11)', () => {
  beforeEach(async () => {
    await clearDb();
    const phOwner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Stockist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phOwner.id, name: 'CarePlus' });
    const stOwner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stOwner.id, name: 'MedRoute' });
    await db.catalogues.put({
      id: 'cat-st',
      stockistId: 'biz-st',
      status: 'Active',
      updatedAt: new Date().toISOString(),
    });
    await makeProduct('biz-st', 'prod-1');
    const ts = new Date().toISOString();
    await db.connections.add({
      id: 'conn-1',
      pharmacyId: 'biz-ph',
      stockistId: 'biz-st',
      status: 'Active',
      requestedAt: ts,
      statusHistory: [{ from: 'Requested', to: 'Active', at: ts, actorId: 'u-st' }],
      createdAt: ts,
      updatedAt: ts,
    });
  });

  it('creates Pending Manual order and notifies pharmacy (AC-Q03)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await recordManualOrder({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      lines: [{ productId: 'prod-1', qty: 5 }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('Pending');
    expect(res.data.source).toBe('Manual');
    expect(res.data.createdByBusinessId).toBe('biz-st');
    const n303 = await db.notifications.filter((n) => n.code === 'N-303' && n.businessId === 'biz-ph').first();
    expect(n303).toBeTruthy();
  });

  it('blocks suspended pharmacy (E-CF-11b)', async () => {
    await db.businesses.update('biz-ph', { accountStatus: 'Suspended' });
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await recordManualOrder({
      actor,
      stockist,
      pharmacyId: 'biz-ph',
      lines: [{ productId: 'prod-1', qty: 5 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/suspended/i);
  });
});

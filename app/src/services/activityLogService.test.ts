import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { exportOwnActivityCsv, listOwnActivity } from './activityLogService';

describe('activityLogService (CF-37)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('lists only own-business audit rows and filters by action', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: 'u-st' });
    const ts = '2026-03-10T12:00:00.000Z';
    await db.auditLogs.bulkAdd([
      {
        id: 'a1',
        at: ts,
        actorId: owner.id,
        actorName: owner.name,
        businessId: biz.id,
        entityType: 'Order',
        entityId: 'ord-1',
        action: 'order.place',
      },
      {
        id: 'a2',
        at: '2026-03-11T12:00:00.000Z',
        actorId: owner.id,
        actorName: owner.name,
        businessId: biz.id,
        entityType: 'Payment',
        entityId: 'pay-1',
        action: 'payment.submit',
      },
      {
        id: 'a3',
        at: ts,
        actorId: 'other',
        actorName: 'Other',
        businessId: 'biz-st',
        entityType: 'Order',
        entityId: 'ord-x',
        action: 'order.accept',
      },
    ]);

    const all = await listOwnActivity({ actor: owner, business: biz });
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.data.map((r) => r.id)).toEqual(['a2', 'a1']);

    const filtered = await listOwnActivity({
      actor: owner,
      business: biz,
      filters: { action: 'payment' },
    });
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0].id).toBe('a2');
  });

  it('exports CSV and writes activity.export audit', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await db.auditLogs.add({
      id: 'a1',
      at: '2026-03-10T12:00:00.000Z',
      actorId: owner.id,
      actorName: owner.name,
      businessId: biz.id,
      entityType: 'Order',
      entityId: 'ord-1',
      action: 'order.place',
    });

    const res = await exportOwnActivityCsv({ actor: owner, business: biz });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.csv).toContain('order.place');
    expect(res.data.filename).toMatch(/^activity-/);

    const exportAudits = await db.auditLogs.filter((r) => r.action === 'activity.export').toArray();
    expect(exportAudits).toHaveLength(1);
    expect(exportAudits[0].businessId).toBe(biz.id);
  });

  it('rejects platform business (admin uses platform audit)', async () => {
    const admin = await makeActor({ id: 'u-ad', businessId: 'biz-plat', role: 'SuperAdmin' });
    const plat = await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id });
    const res = await listOwnActivity({ actor: admin, business: plat });
    expect(res.ok).toBe(false);
  });
});

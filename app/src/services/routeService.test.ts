import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { scheduleDelivery, setRouteStops, upsertStockistRoute } from './routeService';
import { updateDeliveryStatus } from './fulfilmentService';

describe('routeService (CF-18)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: owner.id });
    await makeActor({ id: 'u-boy', businessId: 'biz-st', role: 'DeliveryStaff', name: 'Rider' });
    const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Stockist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id });
    const ts = new Date().toISOString();
    await db.deliveries.add({
      id: 'del-1',
      deliveryNo: 'DEL-1',
      orderId: 'ord-1',
      stockistId: 'biz-st',
      pharmacyId: 'biz-ph',
      status: 'Created',
      lines: [],
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
    });
    await db.orders.add({
      id: 'ord-1',
      orderNo: 'ORD-1',
      pharmacyId: 'biz-ph',
      stockistId: 'biz-st',
      connectionId: 'c1',
      status: 'Dispatched',
      source: 'Platform',
      lines: [],
      subtotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      deliveryAddress: {
        id: 'a1',
        label: 'Shop',
        line1: '1 Road',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
      },
      placedBy: 'u-ph',
      placedAt: ts,
      idempotencyKey: 'k1',
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    });
  });

  it('schedules delivery and notifies N-316', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await scheduleDelivery({
      actor,
      stockist,
      deliveryId: 'del-1',
      scheduledDate: '2026-09-01',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.scheduledDate).toBe('2026-09-01');
    const n = await db.notifications.filter((x) => x.code === 'N-316').first();
    expect(n).toBeTruthy();
  });

  it('blocks execution of unassigned route stop (E-CF-18a)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const route = await upsertStockistRoute({
      actor,
      stockist,
      name: 'East',
      pins: ['411001'],
    });
    expect(route.ok).toBe(true);
    if (!route.ok) return;
    await setRouteStops({ actor, stockist, routeId: route.data.id, deliveryIds: ['del-1'] });
    const del = await db.deliveries.get('del-1');
    expect(del?.routeId).toBe(route.data.id);
    expect(del?.assignedTo).toBeUndefined();
    const exec = await updateDeliveryStatus({
      actor,
      stockist,
      deliveryId: 'del-1',
      status: 'OutForDelivery',
    });
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe('ROUTE_UNASSIGNED');
  });
});

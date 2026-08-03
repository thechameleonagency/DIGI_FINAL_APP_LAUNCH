import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { createCustomerSale } from './salesService';
import {
  assignSaleToRoute,
  deletePharmacyRoute,
  updateRouteStopStatus,
  upsertDeliveryArea,
  upsertPharmacyRoute,
} from './pharmacyDeliveryService';
import { nowIso } from '../domain/utils/clock';

describe('pharmacyDeliveryService (CF-06)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
    await makeActor({ id: 'u-del', businessId: 'biz-ph', role: 'DeliveryStaff', name: 'Rider A' });
    await makeActor({ id: 'u-del-b', businessId: 'biz-ph', role: 'DeliveryStaff', name: 'Rider B' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await db.pharmacyInventory.add({
      id: 'inv-1',
      pharmacyId: 'biz-ph',
      productId: 'prod-1',
      productName: 'Dolo 650',
      expiryDate: '2028-01-01',
      onHand: 20,
      updatedAt: nowIso(),
    });
  });

  async function seedAssignedRoute(assigneeUserId?: string) {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const area = await upsertDeliveryArea({
      actor,
      pharmacy,
      name: 'North',
      pins: ['411001'],
    });
    expect(area.ok).toBe(true);
    if (!area.ok) throw new Error('area');
    const route = await upsertPharmacyRoute({
      actor,
      pharmacy,
      name: 'Morning',
      areaId: area.data.id,
      assigneeUserId,
    });
    expect(route.ok).toBe(true);
    if (!route.ok) throw new Error('route');
    const sale = await createCustomerSale({
      actor,
      pharmacy,
      customerName: 'Asha',
      paymentMode: 'Cash',
      homeDelivery: true,
      address: '12 MG Road',
      lines: [{ inventoryId: 'inv-1', qty: 1, unitPrice: 10 }],
    });
    expect(sale.ok).toBe(true);
    if (!sale.ok) throw new Error('sale');
    const assigned = await assignSaleToRoute({
      actor,
      pharmacy,
      saleId: sale.data.id,
      routeId: route.data.id,
    });
    expect(assigned.ok).toBe(true);
    return { actor, pharmacy, route: route.data, sale: sale.data };
  }

  it('deleting a route with open stops returns them to unassigned (E-CF-06a)', async () => {
    const { actor, pharmacy, route, sale } = await seedAssignedRoute();
    expect((await db.customerSales.get(sale.id))?.deliveryStatus).toBe('Assigned');

    const del = await deletePharmacyRoute({ actor, pharmacy, id: route.id });
    expect(del.ok).toBe(true);
    const after = await db.customerSales.get(sale.id);
    expect(after?.deliveryStatus).toBe('Unassigned');
    expect(after?.routeId).toBeUndefined();
  });

  it('failed stop returns sale to unassigned pool', async () => {
    const { actor, pharmacy, route, sale } = await seedAssignedRoute('u-del');
    const fail = await updateRouteStopStatus({
      actor,
      pharmacy,
      routeId: route.id,
      saleId: sale.id,
      status: 'Failed',
      failReason: 'Customer not home',
    });
    expect(fail.ok).toBe(true);
    const after = await db.customerSales.get(sale.id);
    expect(after?.deliveryStatus).toBe('Unassigned');
    expect(after?.routeId).toBeUndefined();
    const r = await db.pharmacyRoutes.get(route.id);
    expect(r?.stops.some((s) => s.saleId === sale.id)).toBe(false);
  });

  it('DeliveryStaff can mark delivered on their assigned route', async () => {
    const { pharmacy, route, sale } = await seedAssignedRoute('u-del');
    const rider = (await db.users.get('u-del'))!;
    const res = await updateRouteStopStatus({
      actor: rider,
      pharmacy,
      routeId: route.id,
      saleId: sale.id,
      status: 'Delivered',
    });
    expect(res.ok).toBe(true);
    expect((await db.customerSales.get(sale.id))?.deliveryStatus).toBe('Delivered');
  });

  it('DeliveryStaff cannot update an unassigned or other rider route', async () => {
    const unassigned = await seedAssignedRoute(undefined);
    const rider = (await db.users.get('u-del'))!;
    const deniedOpen = await updateRouteStopStatus({
      actor: rider,
      pharmacy: unassigned.pharmacy,
      routeId: unassigned.route.id,
      saleId: unassigned.sale.id,
      status: 'Delivered',
    });
    expect(deniedOpen.ok).toBe(false);

    const other = await seedAssignedRoute('u-del-b');
    const deniedOther = await updateRouteStopStatus({
      actor: rider,
      pharmacy: other.pharmacy,
      routeId: other.route.id,
      saleId: other.sale.id,
      status: 'Delivered',
    });
    expect(deniedOther.ok).toBe(false);
  });

  it('DeliveryStaff cannot manage areas, routes, or assign sales', async () => {
    const rider = (await db.users.get('u-del'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    expect(
      (await upsertDeliveryArea({ actor: rider, pharmacy, name: 'X', pins: ['411001'] })).ok,
    ).toBe(false);
    expect((await upsertPharmacyRoute({ actor: rider, pharmacy, name: 'R' })).ok).toBe(false);

    const { route, sale, actor } = await seedAssignedRoute();
    // ensure a sale exists to assign; rider still denied
    expect(
      (await assignSaleToRoute({ actor: rider, pharmacy, saleId: sale.id, routeId: route.id })).ok,
    ).toBe(false);
    // pharmacist can still re-assign after release
    await deletePharmacyRoute({ actor, pharmacy, id: route.id });
  });
});

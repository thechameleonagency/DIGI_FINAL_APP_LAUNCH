import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { createCustomerSale } from './salesService';
import {
  assignSaleToRoute,
  deletePharmacyRoute,
  upsertDeliveryArea,
  upsertPharmacyRoute,
} from './pharmacyDeliveryService';

describe('pharmacyDeliveryService (CF-06)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    await db.pharmacyInventory.add({
      id: 'inv-1',
      pharmacyId: 'biz-ph',
      productId: 'prod-1',
      productName: 'Dolo 650',
      expiryDate: '2028-01-01',
      onHand: 20,
      updatedAt: new Date().toISOString(),
    });
  });

  it('deleting a route with open stops returns them to unassigned (E-CF-06a)', async () => {
    const actor = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;

    const area = await upsertDeliveryArea({
      actor,
      pharmacy,
      name: 'North',
      pins: ['411001'],
    });
    expect(area.ok).toBe(true);
    if (!area.ok) return;

    const route = await upsertPharmacyRoute({
      actor,
      pharmacy,
      name: 'Morning',
      areaId: area.data.id,
    });
    expect(route.ok).toBe(true);
    if (!route.ok) return;

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
    if (!sale.ok) return;
    expect(sale.data.deliveryStatus).toBe('Unassigned');

    const assigned = await assignSaleToRoute({
      actor,
      pharmacy,
      saleId: sale.data.id,
      routeId: route.data.id,
    });
    expect(assigned.ok).toBe(true);
    expect((await db.customerSales.get(sale.data.id))?.deliveryStatus).toBe('Assigned');

    const del = await deletePharmacyRoute({ actor, pharmacy, id: route.data.id });
    expect(del.ok).toBe(true);
    const after = await db.customerSales.get(sale.data.id);
    expect(after?.deliveryStatus).toBe('Unassigned');
    expect(after?.routeId).toBeUndefined();
  });
});

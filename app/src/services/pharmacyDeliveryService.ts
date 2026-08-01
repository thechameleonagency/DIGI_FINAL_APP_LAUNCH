import type {
  Business,
  DeliveryArea,
  PharmacyRoute,
  PharmacyRouteStopStatus,
  User,
} from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';

function canManageRoutes(actor: User, pharmacy: Business) {
  const record = assertCan(actor, pharmacy, 'sale.record');
  if (record.allow) return record;
  // DeliveryBoy: view/update assigned route stops only
  return assertCan(actor, pharmacy, 'sale.view');
}

export async function upsertDeliveryArea(params: {
  actor: User;
  pharmacy: Business;
  id?: string;
  name: string;
  pins: string[];
}): Promise<Result<DeliveryArea>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Area was not saved.');
  const name = params.name.trim();
  if (!name) return fail('Validation', 'AREA_NAME', 'Area name is required.', 'Area was not saved.');
  const pins = [...new Set(params.pins.map((p) => p.trim()).filter(Boolean))];
  if (!pins.length) return fail('Validation', 'AREA_PINS', 'Add at least one PIN code.', 'Area was not saved.');
  if (pins.some((p) => !/^\d{6}$/.test(p))) {
    return fail('Validation', 'AREA_PIN_FMT', 'Each PIN must be a 6-digit code.', 'Area was not saved.');
  }

  const existing = params.id ? await db.deliveryAreas.get(params.id) : undefined;
  if (params.id && (!existing || existing.pharmacyId !== params.pharmacy.id)) {
    return fail('NotFound', 'AREA_MISSING', 'Delivery area not found.', 'Area was not saved.');
  }

  const row: DeliveryArea = {
    id: existing?.id ?? newId(),
    pharmacyId: params.pharmacy.id,
    name,
    pins,
  };
  await db.deliveryAreas.put(row);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'DeliveryArea',
    entityId: row.id,
    action: existing ? 'deliveryArea.update' : 'deliveryArea.create',
    after: row,
  });
  return ok(row);
}

export async function deleteDeliveryArea(params: {
  actor: User;
  pharmacy: Business;
  id: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Area was not deleted.');
  const area = await db.deliveryAreas.get(params.id);
  if (!area || area.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'AREA_MISSING', 'Delivery area not found.', 'Area was not deleted.');
  }
  const routes = await db.pharmacyRoutes.where('pharmacyId').equals(params.pharmacy.id).toArray();
  if (routes.some((r) => r.areaId === area.id)) {
    return fail('BusinessRule', 'AREA_IN_USE', 'Remove the area from routes first.', 'Area was not deleted.');
  }
  await db.deliveryAreas.delete(area.id);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'DeliveryArea',
    entityId: area.id,
    action: 'deliveryArea.delete',
    before: area,
  });
  return ok(true);
}

export async function upsertPharmacyRoute(params: {
  actor: User;
  pharmacy: Business;
  id?: string;
  name: string;
  areaId?: string;
  assigneeUserId?: string;
}): Promise<Result<PharmacyRoute>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Route was not saved.');
  const name = params.name.trim();
  if (!name) return fail('Validation', 'ROUTE_NAME', 'Route name is required.', 'Route was not saved.');
  if (params.areaId) {
    const area = await db.deliveryAreas.get(params.areaId);
    if (!area || area.pharmacyId !== params.pharmacy.id) {
      return fail('NotFound', 'AREA_MISSING', 'Delivery area not found.', 'Route was not saved.');
    }
  }
  if (params.assigneeUserId) {
    const u = await db.users.get(params.assigneeUserId);
    if (!u || u.businessId !== params.pharmacy.id || u.status !== 'Active') {
      return fail('Validation', 'ROUTE_ASSIGNEE', 'Assignee must be an active staff user.', 'Route was not saved.');
    }
  }

  const existing = params.id ? await db.pharmacyRoutes.get(params.id) : undefined;
  if (params.id && (!existing || existing.pharmacyId !== params.pharmacy.id)) {
    return fail('NotFound', 'ROUTE_MISSING', 'Route not found.', 'Route was not saved.');
  }

  const ts = new Date().toISOString();
  const row: PharmacyRoute = {
    id: existing?.id ?? newId(),
    pharmacyId: params.pharmacy.id,
    name,
    areaId: params.areaId || undefined,
    assigneeUserId: params.assigneeUserId || undefined,
    stops: existing?.stops ?? [],
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  };
  await db.pharmacyRoutes.put(row);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'PharmacyRoute',
    entityId: row.id,
    action: existing ? 'pharmacyRoute.update' : 'pharmacyRoute.create',
    after: { name: row.name, areaId: row.areaId, assigneeUserId: row.assigneeUserId },
  });
  return ok(row);
}

/** E-CF-06a: deleting a route with open stops returns them to the unassigned pool. */
export async function deletePharmacyRoute(params: {
  actor: User;
  pharmacy: Business;
  id: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Route was not deleted.');
  const route = await db.pharmacyRoutes.get(params.id);
  if (!route || route.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'ROUTE_MISSING', 'Route not found.', 'Route was not deleted.');
  }

  const openStops = route.stops.filter((s) => s.status === 'Pending');
  await db.transaction('rw', db.pharmacyRoutes, db.customerSales, async () => {
    for (const stop of openStops) {
      const sale = await db.customerSales.get(stop.saleId);
      if (sale && sale.pharmacyId === params.pharmacy.id) {
        await db.customerSales.update(sale.id, {
          deliveryStatus: 'Unassigned',
          routeId: undefined,
        });
      }
    }
    await db.pharmacyRoutes.delete(route.id);
  });

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'PharmacyRoute',
    entityId: route.id,
    action: 'pharmacyRoute.delete',
    before: route,
    after: { releasedStops: openStops.length },
  });
  return ok(true);
}

export async function assignSaleToRoute(params: {
  actor: User;
  pharmacy: Business;
  saleId: string;
  routeId: string;
}): Promise<Result<PharmacyRoute>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Sale was not assigned.');
  const sale = await db.customerSales.get(params.saleId);
  if (!sale || sale.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'SALE_MISSING', 'Sale not found.', 'Sale was not assigned.');
  }
  if (!sale.homeDelivery) {
    return fail('BusinessRule', 'SALE_NOT_HD', 'Only home-delivery sales can be assigned to a route.', 'Sale was not assigned.');
  }
  if (sale.status === 'Voided') {
    return fail('StateConflict', 'SALE_VOIDED', 'Voided sales cannot be assigned.', 'Sale was not assigned.');
  }
  if (sale.deliveryStatus === 'Delivered') {
    return fail('StateConflict', 'SALE_DELIVERED', 'Already delivered.', 'Sale was not assigned.');
  }

  const route = await db.pharmacyRoutes.get(params.routeId);
  if (!route || route.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'ROUTE_MISSING', 'Route not found.', 'Sale was not assigned.');
  }

  // Remove from any prior route
  const allRoutes = await db.pharmacyRoutes.where('pharmacyId').equals(params.pharmacy.id).toArray();
  const ts = new Date().toISOString();
  await db.transaction('rw', db.pharmacyRoutes, db.customerSales, async () => {
    for (const r of allRoutes) {
      if (!r.stops.some((s) => s.saleId === sale.id)) continue;
      const stops = r.stops.filter((s) => s.saleId !== sale.id).map((s, i) => ({ ...s, seq: i + 1 }));
      await db.pharmacyRoutes.update(r.id, { stops, updatedAt: ts });
    }
    const fresh = (await db.pharmacyRoutes.get(route.id))!;
    const stops = [
      ...fresh.stops.filter((s) => s.saleId !== sale.id),
      { saleId: sale.id, seq: fresh.stops.length + 1, status: 'Pending' as const },
    ].map((s, i) => ({ ...s, seq: i + 1 }));
    await db.pharmacyRoutes.update(route.id, { stops, updatedAt: ts });
    await db.customerSales.update(sale.id, { deliveryStatus: 'Assigned', routeId: route.id });
  });

  return ok((await db.pharmacyRoutes.get(route.id))!);
}

export async function updateRouteStopStatus(params: {
  actor: User;
  pharmacy: Business;
  routeId: string;
  saleId: string;
  status: Extract<PharmacyRouteStopStatus, 'Delivered' | 'Failed'>;
  failReason?: string;
}): Promise<Result<PharmacyRoute>> {
  const perm = canManageRoutes(params.actor, params.pharmacy);
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Stop was not updated.');

  const route = await db.pharmacyRoutes.get(params.routeId);
  if (!route || route.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'ROUTE_MISSING', 'Route not found.', 'Stop was not updated.');
  }

  if (
    params.actor.role === 'DeliveryBoy' &&
    route.assigneeUserId &&
    route.assigneeUserId !== params.actor.id
  ) {
    return fail('Permission', 'ROUTE_NOT_YOURS', 'This route is assigned to another rider.', 'Stop was not updated.');
  }

  const stop = route.stops.find((s) => s.saleId === params.saleId);
  if (!stop) return fail('NotFound', 'STOP_MISSING', 'Stop not found on this route.', 'Stop was not updated.');
  if (stop.status !== 'Pending') {
    return fail('StateConflict', 'STOP_DONE', 'Stop is already closed.', 'Stop was not updated.');
  }
  if (params.status === 'Failed' && !params.failReason?.trim()) {
    return fail('Validation', 'STOP_FAIL', 'Failure reason is required.', 'Stop was not updated.');
  }

  const ts = new Date().toISOString();
  const stops = route.stops.map((s) =>
    s.saleId === params.saleId
      ? {
          ...s,
          status: params.status,
          failReason: params.status === 'Failed' ? params.failReason!.trim() : undefined,
        }
      : s,
  );

  await db.transaction('rw', db.pharmacyRoutes, db.customerSales, async () => {
    if (params.status === 'Failed') {
      // Failed stops return to unassigned pool
      const nextStops = stops.filter((s) => s.saleId !== params.saleId).map((s, i) => ({ ...s, seq: i + 1 }));
      await db.pharmacyRoutes.update(route.id, { stops: nextStops, updatedAt: ts });
      // Return to unassigned pool for reassignment (E-CF-06 fail path)
      await db.customerSales.update(params.saleId, {
        deliveryStatus: 'Unassigned',
        routeId: undefined,
      });
    } else {
      await db.pharmacyRoutes.update(route.id, { stops, updatedAt: ts });
      await db.customerSales.update(params.saleId, { deliveryStatus: 'Delivered' });
    }
  });

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'PharmacyRoute',
    entityId: route.id,
    action: 'pharmacyRoute.stop',
    after: { saleId: params.saleId, status: params.status },
    reason: params.failReason,
  });
  return ok((await db.pharmacyRoutes.get(route.id))!);
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

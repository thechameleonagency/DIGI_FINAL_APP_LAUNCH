import type { Business, StockistRoute, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { localTodayKey } from '../domain/utils/dateKeys';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';
import { nowIso } from '../domain/utils/clock';

async function assertActiveDeliveryStaff(stockistId: string, assigneeId: string): Promise<Result<true>> {
  const assignee = await db.users.get(assigneeId);
  if (!assignee || assignee.businessId !== stockistId || assignee.role !== 'DeliveryStaff' || assignee.status !== 'Active') {
    return fail(
      'Validation',
      'ROUTE_ASSIGNEE',
      'Route assignee must be active delivery staff for this stockist.',
      'Route was not saved.',
    );
  }
  return ok(true);
}

export async function upsertStockistRoute(params: {
  actor: User;
  stockist: Business;
  id?: string;
  name: string;
  pins: string[];
  assigneeId?: string;
}): Promise<Result<StockistRoute>> {
  const perm = assertCan(params.actor, params.stockist, 'route.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Route was not saved.');
  const name = params.name.trim();
  if (!name) return fail('Validation', 'ROUTE_NAME', 'Route name is required.', 'Route was not saved.');
  const pins = params.pins.map((p) => p.trim()).filter(Boolean);
  if (params.assigneeId) {
    const assigneeOk = await assertActiveDeliveryStaff(params.stockist.id, params.assigneeId);
    if (!assigneeOk.ok) return assigneeOk;
  }

  if (params.id) {
    const existing = await db.stockistRoutes.get(params.id);
    if (!existing || existing.stockistId !== params.stockist.id) {
      return fail('NotFound', 'ROUTE_MISSING', 'Route not found.', 'Route was not saved.');
    }
    const next: StockistRoute = {
      ...existing,
      name,
      pins,
      assigneeId: params.assigneeId || undefined,
    };
    await db.stockistRoutes.put(next);
    return ok(next);
  }

  const route: StockistRoute = {
    id: newId(),
    stockistId: params.stockist.id,
    name,
    pins,
    assigneeId: params.assigneeId || undefined,
    stops: [],
  };
  await db.stockistRoutes.add(route);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'StockistRoute',
    entityId: route.id,
    action: 'route.create',
    after: route,
  });
  return ok(route);
}

export async function deleteStockistRoute(params: {
  actor: User;
  stockist: Business;
  id: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.stockist, 'route.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Route was not deleted.');
  const route = await db.stockistRoutes.get(params.id);
  if (!route || route.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ROUTE_MISSING', 'Route not found.', 'Route was not deleted.');
  }
  const ts = nowIso();
  await db.transaction('rw', db.stockistRoutes, db.deliveries, async () => {
    for (const s of route.stops) {
      const d = await db.deliveries.get(s.deliveryId);
      if (d && d.stockistId === params.stockist.id && d.routeId === route.id) {
        await db.deliveries.update(d.id, { routeId: undefined, updatedAt: ts });
      }
    }
    await db.stockistRoutes.delete(params.id);
  });
  return ok(true);
}

/** Assign deliveries to a route in given order (seq = array index). */
export async function setRouteStops(params: {
  actor: User;
  stockist: Business;
  routeId: string;
  deliveryIds: string[];
}): Promise<Result<StockistRoute>> {
  const perm = assertCan(params.actor, params.stockist, 'route.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Stops were not saved.');
  const route = await db.stockistRoutes.get(params.routeId);
  if (!route || route.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ROUTE_MISSING', 'Route not found.', 'Stops were not saved.');
  }
  for (const id of params.deliveryIds) {
    const d = await db.deliveries.get(id);
    if (!d || d.stockistId !== params.stockist.id) {
      return fail('NotFound', 'ROUTE_DEL', 'Delivery not found for this stockist.', 'Stops were not saved.');
    }
  }
  const stops = params.deliveryIds.map((deliveryId, seq) => ({ deliveryId, seq }));
  const next = { ...route, stops };
  const prevIds = new Set(route.stops.map((s) => s.deliveryId));
  const nextIds = new Set(params.deliveryIds);
  const ts = nowIso();

  await db.transaction('rw', db.stockistRoutes, db.deliveries, async () => {
    await db.stockistRoutes.put(next);
    for (const id of prevIds) {
      if (nextIds.has(id)) continue;
      const d = await db.deliveries.get(id);
      if (d && d.routeId === route.id) {
        await db.deliveries.update(id, { routeId: undefined, updatedAt: ts });
      }
    }
    for (const s of stops) {
      const patch: { routeId: string; assignedTo?: string; updatedAt: string } = {
        routeId: route.id,
        updatedAt: ts,
      };
      if (route.assigneeId) patch.assignedTo = route.assigneeId;
      await db.deliveries.update(s.deliveryId, patch);
    }
  });
  return ok(next);
}

export async function scheduleDelivery(params: {
  actor: User;
  stockist: Business;
  deliveryId: string;
  scheduledDate: string;
}): Promise<Result<import('../domain/entities/types').Delivery>> {
  const perm = assertCan(params.actor, params.stockist, 'delivery.assign');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Schedule was not saved.');
  const delivery = await db.deliveries.get(params.deliveryId);
  if (!delivery || delivery.stockistId !== params.stockist.id) {
    return fail('NotFound', 'DEL_MISSING', 'Delivery not found.', 'Schedule was not saved.');
  }
  if (['Delivered', 'Cancelled'].includes(delivery.status)) {
    return fail('StateConflict', 'DEL_SCHEDULE_STATE', 'Cannot schedule a closed delivery.', 'Schedule was not saved.');
  }
  const date = params.scheduledDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail('Validation', 'DEL_DATE', 'Use YYYY-MM-DD for scheduled date.', 'Schedule was not saved.');
  }
  if (date < localTodayKey()) {
    return fail('Validation', 'DEL_DATE_PAST', 'Scheduled date cannot be in the past.', 'Schedule was not saved.');
  }
  const was = delivery.scheduledDate;
  await db.deliveries.update(delivery.id, { scheduledDate: date, updatedAt: nowIso() });
  const order = await db.orders.get(delivery.orderId);
  if (order) {
    await notifyBusinessUsers(
      delivery.pharmacyId,
      'N-316',
      { orderNo: order.orderNo, date },
      { type: 'Delivery', id: delivery.id },
    );
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Delivery',
    entityId: delivery.id,
    action: was ? 'delivery.reschedule' : 'delivery.schedule',
    after: { scheduledDate: date, previous: was },
  });
  return ok((await db.deliveries.get(delivery.id))!);
}

/** E-CF-18a: execution requires assignee on the stop's delivery */
export function assertRouteStopExecutable(delivery: { assignedTo?: string }): Result<true> {
  if (!delivery.assignedTo) {
    return fail('BusinessRule', 'ROUTE_UNASSIGNED', 'Unassigned route stop cannot be executed.', 'No status change.');
  }
  return ok(true);
}

export function mapsDeepLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Google Maps directions for an ordered list of stop addresses (no API key). */
export function mapsDirectionsLink(addresses: string[]): string {
  const cleaned = addresses.map((a) => a.trim()).filter(Boolean);
  if (!cleaned.length) return mapsDeepLink('');
  if (cleaned.length === 1) return mapsDeepLink(cleaned[0]!);
  const path = cleaned.map((a) => encodeURIComponent(a)).join('/');
  return `https://www.google.com/maps/dir/${path}`;
}

/**
 * Greedy nearest-neighbor when stockist + stops have lat/lng; else numeric PIN sort.
 * Returns reordered delivery ids (unchanged ids if fewer than 2).
 */
export function optimizeStopOrder(params: {
  origin?: { latitude?: number; longitude?: number };
  stops: {
    deliveryId: string;
    latitude?: number;
    longitude?: number;
    pincode?: string;
  }[];
}): string[] {
  const { stops } = params;
  if (stops.length < 2) return stops.map((s) => s.deliveryId);

  const originLat = params.origin?.latitude;
  const originLng = params.origin?.longitude;
  const allHaveCoords =
    originLat != null &&
    originLng != null &&
    stops.every((s) => s.latitude != null && s.longitude != null);

  if (!allHaveCoords) {
    return [...stops]
      .sort((a, b) => Number(a.pincode ?? 0) - Number(b.pincode ?? 0))
      .map((s) => s.deliveryId);
  }

  const remaining = [...stops];
  const ordered: string[] = [];
  let curLat = originLat!;
  let curLng = originLng!;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]!;
      const dLat = (s.latitude! - curLat) * Math.PI / 180;
      const dLon = (s.longitude! - curLng) * Math.PI / 180;
      const lat1 = (curLat * Math.PI) / 180;
      const lat2 = (s.latitude! * Math.PI) / 180;
      const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const km = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      if (km < bestDist) {
        bestDist = km;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(next.deliveryId);
    curLat = next.latitude!;
    curLng = next.longitude!;
  }
  return ordered;
}

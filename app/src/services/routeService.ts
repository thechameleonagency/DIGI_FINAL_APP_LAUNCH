import type { Business, StockistRoute, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

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
  await db.stockistRoutes.delete(params.id);
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
  await db.stockistRoutes.put(next);

  // Mirror routeId on deliveries + optional default assignee
  for (const s of stops) {
    const patch: { routeId: string; assignedTo?: string; updatedAt: string } = {
      routeId: route.id,
      updatedAt: new Date().toISOString(),
    };
    if (route.assigneeId) patch.assignedTo = route.assigneeId;
    await db.deliveries.update(s.deliveryId, patch);
  }
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
  const date = params.scheduledDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail('Validation', 'DEL_DATE', 'Use YYYY-MM-DD for scheduled date.', 'Schedule was not saved.');
  }
  const was = delivery.scheduledDate;
  await db.deliveries.update(delivery.id, { scheduledDate: date, updatedAt: new Date().toISOString() });
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

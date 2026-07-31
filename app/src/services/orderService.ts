import type { Address, Business, Order, OrderLine, User } from '../domain/entities/types';
import { calcOrderLine, calcOrderTotals } from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

export async function placeOrder(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  address: Address;
  notes?: string;
  preferredDate?: string;
  idempotencyKey: string;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Order was not created.');

  const existing = await db.orders.where('idempotencyKey').equals(params.idempotencyKey).first();
  if (existing) {
    return fail('Duplicate', 'ORD_IDEMPOTENT', 'This order was already placed.', 'A duplicate order was not created.', {
      existingId: existing.id,
      retrySafe: true,
    });
  }

  const conn = await db.connections.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (!conn || conn.status !== 'Active') {
    return fail('BusinessRule', 'ORD_NO_CONN', 'Active connection required to place an order.', 'Order was not created.');
  }
  const stockist = await db.businesses.get(params.stockistId);
  if (!stockist || stockist.accountStatus === 'Suspended' || stockist.verificationStatus !== 'Approved') {
    return fail('BusinessRule', 'ORD_STOCKIST_GATE', 'Stockist is not available for ordering.', 'Order was not created.');
  }

  const cart = await db.carts.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (!cart?.lines.length) {
    return fail('Validation', 'ORD_EMPTY', 'Cart is empty.', 'Order was not created.');
  }

  const lines: OrderLine[] = [];
  for (const cl of cart.lines) {
    const product = await db.products.get(cl.productId);
    if (!product || product.status !== 'Active') {
      return fail('BusinessRule', 'ORD_PROD_INACTIVE', `Product unavailable: ${cl.productId}`, 'Order was not created.');
    }
    if (cl.qty < product.moq) {
      return fail('Validation', 'ORD_MOQ', `${product.name}: MOQ is ${product.moq}.`, 'Order was not created.');
    }
    const calc = calcOrderLine({ qty: cl.qty, unitPrice: product.ptr, gstPercent: product.gstPercent });
    lines.push({
      id: newId(),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      packSize: product.packSize,
      qty: cl.qty,
      unitPrice: product.ptr,
      mrp: product.mrp,
      gstPercent: product.gstPercent,
      ...calc,
    });
  }

  const totals = calcOrderTotals(lines);
  const ts = new Date().toISOString();
  const order: Order = {
    id: newId(),
    orderNo: nextNumber('ORD'),
    pharmacyId: params.pharmacy.id,
    stockistId: params.stockistId,
    connectionId: conn.id,
    status: 'Pending',
    lines,
    ...totals,
    deliveryAddress: params.address,
    preferredDate: params.preferredDate,
    notes: params.notes,
    idempotencyKey: params.idempotencyKey,
    statusHistory: [{ from: 'Draft', to: 'Pending', at: ts, actorId: params.actor.id }],
    placedBy: params.actor.id,
    placedAt: ts,
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };

  await db.transaction('rw', db.orders, db.carts, async () => {
    await db.orders.add(order);
    await db.carts.delete(cart.id);
  });

  await notifyBusinessUsers(
    params.stockistId,
    'N-016',
    { orderNo: order.orderNo, pharmacy: params.pharmacy.name },
    { type: 'Order', id: order.id },
  );
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.place',
    after: { orderNo: order.orderNo, grandTotal: order.grandTotal },
  });
  return ok(order);
}

export async function acceptOrder(params: {
  actor: User;
  stockist: Business;
  orderId: string;
  acceptedQtys?: Record<string, number>;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.stockist, 'order.accept');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Order was not accepted.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Order was not accepted.');
  }
  const conn = await db.connections.get(order.connectionId);
  if (!conn || conn.status !== 'Active') {
    return fail('BusinessRule', 'ORD_CONN_INACTIVE', 'Connection is not active; cannot accept new work.', 'Order was not accepted.');
  }

  let partial = false;
  const lines = order.lines.map((l) => {
    const aq = params.acceptedQtys?.[l.id] ?? l.qty;
    if (aq < l.qty) partial = true;
    return { ...l, acceptedQty: Math.max(0, Math.min(aq, l.qty)) };
  });
  if (lines.every((l) => !l.acceptedQty)) {
    return fail('Validation', 'ORD_ACCEPT_ZERO', 'Accepted quantities cannot all be zero. Reject instead.', 'Order was not accepted.');
  }

  const to = partial ? 'PartiallyAccepted' : 'Accepted';
  const t = machines.order(order.status, to);
  if (!t.ok) return fail('StateConflict', 'ORD_BAD_STATE', t.reason!, 'Order was not accepted.');

  const ts = new Date().toISOString();
  await db.orders.update(order.id, {
    status: to,
    lines,
    updatedAt: ts,
    version: order.version + 1,
    statusHistory: [...order.statusHistory, { from: order.status, to, at: ts, actorId: params.actor.id }],
  });
  const updated = (await db.orders.get(order.id))!;
  await notifyBusinessUsers(
    order.pharmacyId,
    'N-017',
    { orderNo: order.orderNo, stockist: params.stockist.name },
    { type: 'Order', id: order.id },
  );
  return ok(updated);
}

export async function rejectOrder(params: {
  actor: User;
  stockist: Business;
  orderId: string;
  reason: string;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.stockist, 'order.reject');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Order was not rejected.');
  if (!params.reason.trim()) return fail('Validation', 'ORD_REASON', 'Rejection reason is required.', 'Order was not rejected.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Order was not rejected.');
  }
  const t = machines.order(order.status, 'Rejected');
  if (!t.ok) return fail('StateConflict', 'ORD_BAD_STATE', t.reason!, 'Order was not rejected.');
  const ts = new Date().toISOString();
  await db.orders.update(order.id, {
    status: 'Rejected',
    updatedAt: ts,
    version: order.version + 1,
    statusHistory: [...order.statusHistory, { from: order.status, to: 'Rejected', at: ts, actorId: params.actor.id, reason: params.reason }],
  });
  await notifyBusinessUsers(order.pharmacyId, 'N-018', { orderNo: order.orderNo, reason: params.reason }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

export async function cancelOrder(params: {
  actor: User;
  business: Business;
  orderId: string;
  reason: string;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.business, 'order.cancel');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Order was not cancelled.');
  const order = await db.orders.get(params.orderId);
  if (!order) return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Order was not cancelled.');
  if (order.pharmacyId !== params.business.id && order.stockistId !== params.business.id) {
    return fail('Permission', 'ORD_BOUNDARY', 'Not a party to this order.', 'Order was not cancelled.');
  }
  const t = machines.order(order.status, 'Cancelled');
  if (!t.ok) return fail('StateConflict', 'ORD_BAD_STATE', t.reason!, 'Order was not cancelled.');
  const ts = new Date().toISOString();

  // release reservations
  for (const line of order.lines) {
    for (const alloc of line.batchAllocations ?? []) {
      const batch = await db.batches.get(alloc.batchId);
      if (batch) {
        await db.batches.update(batch.id, {
          reserved: Math.max(0, batch.reserved - alloc.qty),
          updatedAt: ts,
        });
      }
    }
  }

  await db.orders.update(order.id, {
    status: 'Cancelled',
    updatedAt: ts,
    version: order.version + 1,
    statusHistory: [...order.statusHistory, { from: order.status, to: 'Cancelled', at: ts, actorId: params.actor.id, reason: params.reason }],
  });
  const other = order.pharmacyId === params.business.id ? order.stockistId : order.pharmacyId;
  await notifyBusinessUsers(other, 'N-019', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

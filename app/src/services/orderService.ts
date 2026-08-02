import type { Address, Business, Order, OrderLine, User } from '../domain/entities/types';
import { calcOrderLine, calcOrderTotals, pairOutstanding } from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { makeIdempotencyKey } from '../domain/utils/idempotency';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';
import { calcInclusiveOrderLine, priceForOfflineManagedLine, priceForPlatformPharmacy } from './pricingService';

function addressFromPharmacy(pharmacy: Business): Address {
  const saved = pharmacy.deliveryAddresses?.find((a) => a.isDefault) ?? pharmacy.deliveryAddresses?.[0];
  if (saved) return saved;
  return {
    id: `addr-${pharmacy.id}`,
    label: 'Business',
    line1: pharmacy.address,
    city: pharmacy.city,
    state: pharmacy.state,
    pincode: pharmacy.pincode,
    isDefault: true,
  };
}

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

  if (params.pharmacy.accountStatus === 'Suspended') {
    return fail('BusinessRule', 'ORD_PHARM_SUSP', 'Pharmacy is suspended.', 'Order was not created.');
  }
  if (params.pharmacy.verificationStatus !== 'Approved' || params.pharmacy.accountStatus !== 'Active') {
    return fail('BusinessRule', 'ORD_PHARM_GATE', 'Pharmacy is not available for ordering.', 'Order was not created.');
  }

  const platform = await db.platformSettings.get('platform');
  if (platform?.maintenanceMode) {
    return fail(
      'BusinessRule',
      'ORD_MAINTENANCE',
      'Platform maintenance is on — new orders are paused. Try again after the banner clears.',
      'Order was not created.',
    );
  }

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
  const cat = await db.catalogues.where('stockistId').equals(params.stockistId).first();
  if (!cat || cat.status !== 'Active') {
    return fail('BusinessRule', 'ORD_CAT', 'Stockist catalogue is not available for ordering.', 'Order was not created.');
  }

  const cart = await db.carts.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (!cart?.lines.length) {
    return fail('Validation', 'ORD_EMPTY', 'Cart is empty.', 'Order was not created.');
  }

  const lines: OrderLine[] = [];
  for (const cl of cart.lines) {
    const product = await db.products.get(cl.productId);
    if (!product) {
      return fail('BusinessRule', 'ORD_PROD_DELETED', 'A cart product no longer exists. Remove it and try again.', 'Order was not created.');
    }
    if (product.status !== 'Active') {
      return fail('BusinessRule', 'ORD_PROD_INACTIVE', `${product.name} is inactive.`, 'Order was not created.');
    }
    if (product.stockistId !== params.stockistId) {
      return fail('BusinessRule', 'ORD_PROD_STOCKIST', `${product.name} is not sold by this stockist.`, 'Order was not created.');
    }
    if (cl.qty < product.moq) {
      return fail('Validation', 'ORD_MOQ', `${product.name}: MOQ is ${product.moq}.`, 'Order was not created.');
    }
    if (product.maxQty != null && cl.qty > product.maxQty) {
      return fail('Validation', 'ORD_MAX', `${product.name}: max quantity is ${product.maxQty}.`, 'Order was not created.');
    }
    const settings = await db.platformSettings.get('platform');
    const priced = priceForPlatformPharmacy(product, settings);
    const money = calcInclusiveOrderLine(priced, cl.qty, product.gstPercent);
    lines.push({
      id: newId(),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      packSize: product.packSize,
      qty: cl.qty,
      unitPrice: money.unitPrice,
      basePtr: priced.basePtr,
      commissionAmount: money.commissionAmount,
      pricingClass: priced.pricingClass,
      commissionMode: priced.commissionMode,
      mrp: product.mrp,
      gstPercent: product.gstPercent,
      lineSubtotal: money.lineSubtotal,
      lineTax: money.lineTax,
      lineTotal: money.lineTotal,
    });
  }

  const totals = calcOrderTotals(lines);
  if (conn.creditLimit != null && Number.isFinite(conn.creditLimit)) {
    const invoices = await db.invoices.where('pharmacyId').equals(params.pharmacy.id).toArray();
    const outstanding = pairOutstanding(invoices, params.pharmacy.id, params.stockistId);
    if (outstanding + totals.grandTotal > conn.creditLimit) {
      return fail(
        'BusinessRule',
        'ORD_CREDIT_LIMIT',
        'This order would exceed your credit limit with this stockist.',
        'Order was not created.',
      );
    }
  }
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
    preferredDeliveryDate: params.preferredDate,
    notes: params.notes,
    source: 'Platform',
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

/** CF-11: stockist records an order on behalf of a connected pharmacy or offline managed pharmacy. */
export async function recordManualOrder(params: {
  actor: User;
  stockist: Business;
  pharmacyId?: string;
  managedPharmacyId?: string;
  lines: { productId: string; qty: number }[];
  notes?: string;
  idempotencyKey?: string;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.stockist, 'order.recordManual');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Manual order was not created.');
  if (params.stockist.type !== 'Stockist') {
    return fail('BusinessRule', 'ORD_ROLE', 'Only stockists can record manual orders.', 'Manual order was not created.');
  }
  if (!params.lines.length) {
    return fail('Validation', 'ORD_EMPTY', 'Add at least one line.', 'Manual order was not created.');
  }
  if (!params.pharmacyId && !params.managedPharmacyId) {
    return fail('Validation', 'ORD_TARGET', 'Select a pharmacy.', 'Manual order was not created.');
  }

  const idempotencyKey = params.idempotencyKey ?? makeIdempotencyKey('manual-order', params.actor.id);
  const existing = await db.orders.where('idempotencyKey').equals(idempotencyKey).first();
  if (existing) {
    return fail('Duplicate', 'ORD_IDEMPOTENT', 'This order was already recorded.', 'A duplicate order was not created.', {
      existingId: existing.id,
      retrySafe: true,
    });
  }

  const settings = await db.platformSettings.get('platform');
  if (settings?.maintenanceMode) {
    return fail(
      'BusinessRule',
      'ORD_MAINTENANCE',
      'Platform maintenance is on — new orders are paused. Try again after the banner clears.',
      'Manual order was not created.',
    );
  }
  let pharmacyId = params.pharmacyId ?? '';
  let connectionId = '';
  let deliveryAddress: Address | undefined;
  let managedPharmacyId = params.managedPharmacyId;
  let offlinePricing = false;

  if (params.managedPharmacyId) {
    const managed = await db.managedPharmacies.get(params.managedPharmacyId);
    if (!managed || managed.stockistId !== params.stockist.id) {
      return fail('NotFound', 'ORD_MP', 'Managed pharmacy not found.', 'Manual order was not created.');
    }
    if (managed.status === 'Invited' && !managed.linkedBusinessId) {
      // invite-first without link: still allow offline ops only when OfflineOnly or Linked; Invited can do ops if created offline-first then invited
    }
    offlinePricing = managed.status !== 'Linked' || !managed.linkedBusinessId;
    managedPharmacyId = managed.id;
    pharmacyId = managed.linkedBusinessId ?? managed.id;
    connectionId = `offline-${managed.id}`;
    deliveryAddress = {
      id: `addr-${managed.id}`,
      label: 'Managed',
      line1: managed.address ?? managed.name,
      city: managed.city ?? '',
      state: managed.state ?? '',
      pincode: managed.pincode ?? '',
      isDefault: true,
    };
    if (managed.linkedBusinessId) {
      const linked = await db.businesses.get(managed.linkedBusinessId);
      if (linked) {
        pharmacyId = linked.id;
        const conn = await db.connections.where({ pharmacyId: linked.id, stockistId: params.stockist.id }).first();
        if (conn?.status === 'Active') {
          offlinePricing = false;
          connectionId = conn.id;
          deliveryAddress = addressFromPharmacy(linked);
        }
      }
    }
  } else {
    const pharmacy = await db.businesses.get(params.pharmacyId!);
    if (!pharmacy || pharmacy.type !== 'Pharmacy') {
      return fail('NotFound', 'ORD_PHARM', 'Pharmacy not found.', 'Manual order was not created.');
    }
    if (pharmacy.accountStatus === 'Suspended') {
      return fail('BusinessRule', 'ORD_PHARM_SUSP', 'Pharmacy is suspended.', 'Manual order was not created.');
    }
    if (pharmacy.verificationStatus !== 'Approved' || pharmacy.accountStatus !== 'Active') {
      return fail('BusinessRule', 'ORD_PHARM_GATE', 'Pharmacy is not available for ordering.', 'Manual order was not created.');
    }
    const conn = await db.connections.where({ pharmacyId: pharmacy.id, stockistId: params.stockist.id }).first();
    if (!conn || conn.status !== 'Active') {
      return fail('BusinessRule', 'ORD_NO_CONN', 'Active connection required to record a manual order.', 'Manual order was not created.');
    }
    pharmacyId = pharmacy.id;
    connectionId = conn.id;
    deliveryAddress = addressFromPharmacy(pharmacy);
  }

  const cat = await db.catalogues.where('stockistId').equals(params.stockist.id).first();
  if (!cat || cat.status !== 'Active') {
    return fail('BusinessRule', 'ORD_CAT', 'Catalogue must be Active.', 'Manual order was not created.');
  }

  const lines: OrderLine[] = [];
  for (const cl of params.lines) {
    const product = await db.products.get(cl.productId);
    if (!product || product.stockistId !== params.stockist.id || product.status !== 'Active') {
      return fail('BusinessRule', 'ORD_PROD', 'Product not available.', 'Manual order was not created.');
    }
    if (cl.qty < product.moq) {
      return fail('Validation', 'ORD_MOQ', `${product.name}: MOQ is ${product.moq}.`, 'Manual order was not created.');
    }
    if (product.maxQty != null && cl.qty > product.maxQty) {
      return fail('Validation', 'ORD_MAX', `${product.name}: max quantity is ${product.maxQty}.`, 'Manual order was not created.');
    }
    const priced = offlinePricing
      ? priceForOfflineManagedLine(product, cl.qty, settings)
      : priceForPlatformPharmacy(product, settings);
    const money = calcInclusiveOrderLine(priced, cl.qty, product.gstPercent);
    lines.push({
      id: newId(),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      packSize: product.packSize,
      qty: cl.qty,
      unitPrice: money.unitPrice,
      basePtr: priced.basePtr,
      commissionAmount: money.commissionAmount,
      pricingClass: priced.pricingClass,
      commissionMode: priced.commissionMode,
      mrp: product.mrp,
      gstPercent: product.gstPercent,
      lineSubtotal: money.lineSubtotal,
      lineTax: money.lineTax,
      lineTotal: money.lineTotal,
    });
  }

  const totals = calcOrderTotals(lines);
  if (!connectionId.startsWith('offline-')) {
    const creditConn = await db.connections.get(connectionId);
    if (creditConn?.creditLimit != null && Number.isFinite(creditConn.creditLimit)) {
      const invoices = await db.invoices.where('pharmacyId').equals(pharmacyId).toArray();
      const outstanding = pairOutstanding(invoices, pharmacyId, params.stockist.id);
      if (outstanding + totals.grandTotal > creditConn.creditLimit) {
        return fail(
          'BusinessRule',
          'ORD_CREDIT_LIMIT',
          'This order would exceed the pharmacy credit limit with this stockist.',
          'Manual order was not created.',
        );
      }
    }
  }
  const ts = new Date().toISOString();
  const order: Order = {
    id: newId(),
    orderNo: nextNumber('ORD'),
    pharmacyId,
    stockistId: params.stockist.id,
    connectionId,
    managedPharmacyId,
    status: 'Pending',
    lines,
    ...totals,
    deliveryAddress: deliveryAddress!,
    notes: params.notes,
    source: 'Manual',
    createdByBusinessId: params.stockist.id,
    idempotencyKey,
    statusHistory: [{ from: 'Draft', to: 'Pending', at: ts, actorId: params.actor.id }],
    placedBy: params.actor.id,
    placedAt: ts,
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };

  await db.orders.add(order);
  if (!offlinePricing && pharmacyId && !pharmacyId.startsWith('offline')) {
    await notifyBusinessUsers(pharmacyId, 'N-303', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.recordManual',
    after: {
      orderNo: order.orderNo,
      pharmacyId,
      managedPharmacyId,
      source: 'Manual',
      grandTotal: order.grandTotal,
    },
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
  const isOfflineManaged =
    !!order.managedPharmacyId &&
    (order.connectionId.startsWith('offline-') || !conn);
  if (!isOfflineManaged && (!conn || conn.status !== 'Active')) {
    return fail('BusinessRule', 'ORD_CONN_INACTIVE', 'Connection is not active; cannot accept new work.', 'Order was not accepted.');
  }

  // Soft credit-limit gate for Active platform connections
  if (conn?.creditLimit != null && Number.isFinite(conn.creditLimit)) {
    const invoices = await db.invoices.where('pharmacyId').equals(order.pharmacyId).toArray();
    const outstanding = pairOutstanding(invoices, order.pharmacyId, order.stockistId);
    if (outstanding + order.grandTotal > conn.creditLimit) {
      return fail(
        'BusinessRule',
        'ORD_CREDIT_LIMIT',
        `Credit limit exceeded (outstanding + order exceeds limit ${conn.creditLimit}).`,
        'Order was not accepted.',
      );
    }
  }

  let partial = false;
  for (const l of order.lines) {
    if (params.acceptedQtys && l.id in params.acceptedQtys) {
      const aq = Number(params.acceptedQtys[l.id]);
      if (!Number.isFinite(aq) || aq < 0) {
        return fail('Validation', 'ORD_ACCEPT_NAN', 'Accepted quantities must be valid numbers.', 'Order was not accepted.');
      }
    }
  }
  const lines = order.lines.map((l) => {
    const raw = params.acceptedQtys?.[l.id];
    const aq = raw == null ? l.qty : Number(raw);
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
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.accept',
    after: { status: to, orderNo: order.orderNo, partial },
  });
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
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.reject',
    reason: params.reason,
    after: { status: 'Rejected', orderNo: order.orderNo },
  });
  await notifyBusinessUsers(order.pharmacyId, 'N-018', { orderNo: order.orderNo, reason: params.reason }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

export async function closeOrder(params: {
  actor: User;
  stockist: Business;
  orderId: string;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.stockist, 'order.accept');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Order was not closed.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Order was not closed.');
  }
  const t = machines.order(order.status, 'Closed');
  if (!t.ok) return fail('StateConflict', 'ORD_BAD_STATE', t.reason!, 'Order was not closed.');
  const ts = new Date().toISOString();
  await db.orders.update(order.id, {
    status: 'Closed',
    updatedAt: ts,
    version: order.version + 1,
    statusHistory: [...order.statusHistory, { from: order.status, to: 'Closed', at: ts, actorId: params.actor.id }],
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.close',
    after: { status: 'Closed', orderNo: order.orderNo },
  });
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
  if (!params.reason.trim()) {
    return fail('Validation', 'ORD_REASON', 'Cancellation reason is required.', 'Order was not cancelled.');
  }
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
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.cancel',
    reason: params.reason,
    after: { status: 'Cancelled', orderNo: order.orderNo },
  });
  const other = order.pharmacyId === params.business.id ? order.stockistId : order.pharmacyId;
  await notifyBusinessUsers(other, 'N-019', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

export async function editOrderLines(params: {
  actor: User;
  business: Business;
  orderId: string;
  qtys: Record<string, number>;
}): Promise<Result<Order>> {
  const order = await db.orders.get(params.orderId);
  if (!order) return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Order lines were not updated.');
  if (order.pharmacyId !== params.business.id && order.stockistId !== params.business.id) {
    return fail('Permission', 'ORD_BOUNDARY', 'Not a party to this order.', 'Order lines were not updated.');
  }
  const action = params.business.type === 'Stockist' ? 'order.accept' : 'order.place';
  const perm = assertCan(params.actor, params.business, action);
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Order lines were not updated.');
  if (!['Pending', 'Accepted', 'PartiallyAccepted'].includes(order.status)) {
    return fail('StateConflict', 'ORD_LOCKED', 'Lines are locked after allocation — adjust via returns after delivery.', 'Order lines were not updated.');
  }
  const ts = new Date().toISOString();
  const lines = order.lines.map((l) => {
    const qty = params.qtys[l.id] ?? l.qty;
    if (qty < 1) return l;
    const priced = calcOrderLine({ qty, unitPrice: l.unitPrice, gstPercent: l.gstPercent });
    return {
      ...l,
      qty,
      acceptedQty: order.status === 'Pending' ? undefined : Math.min(l.acceptedQty ?? qty, qty),
      lineSubtotal: priced.lineSubtotal,
      lineTax: priced.lineTax,
      lineTotal: priced.lineTotal,
    };
  }).filter((l) => (params.qtys[l.id] ?? l.qty) >= 1);
  if (!lines.length) return fail('Validation', 'ORD_EMPTY', 'Order must keep at least one line.', 'Order lines were not updated.');
  const totals = calcOrderTotals(lines);
  if (totals.grandTotal > order.grandTotal && !order.connectionId.startsWith('offline-')) {
    const conn = await db.connections.get(order.connectionId);
    if (conn?.creditLimit != null && Number.isFinite(conn.creditLimit)) {
      const invoices = await db.invoices.where('pharmacyId').equals(order.pharmacyId).toArray();
      const outstanding = pairOutstanding(invoices, order.pharmacyId, order.stockistId);
      if (outstanding + totals.grandTotal > conn.creditLimit) {
        return fail(
          'BusinessRule',
          'ORD_CREDIT_LIMIT',
          'Updated totals would exceed the credit limit for this connection.',
          'Order lines were not updated.',
        );
      }
    }
  }
  await db.orders.update(order.id, {
    lines,
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
    updatedAt: ts,
    version: order.version + 1,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.editLines',
    before: { lines: order.lines.map((l) => ({ id: l.id, qty: l.qty })) },
    after: { lines: lines.map((l) => ({ id: l.id, qty: l.qty })), grandTotal: totals.grandTotal },
  });
  return ok((await db.orders.get(order.id))!);
}

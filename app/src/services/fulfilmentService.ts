import { addDays, formatISO } from 'date-fns';
import type { Batch, Business, Delivery, Invoice, Order, User } from '../domain/entities/types';
import {
  availableQty,
  calcInvoiceLine,
  calcInvoiceTotals,
  fefoSort,
  invoiceOutstanding,
} from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

export async function allocateOrder(params: {
  actor: User;
  stockist: Business;
  orderId: string;
  overrides?: Record<string, { batchId: string; qty: number }[]>;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.stockist, 'order.allocate');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Allocation was not saved.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Allocation was not saved.');
  }
  const t = machines.order(order.status, 'Allocated');
  if (!t.ok) return fail('StateConflict', 'ORD_BAD_STATE', t.reason!, 'Allocation was not saved.');

  const ts = new Date().toISOString();
  const lines = [...order.lines];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const need = line.acceptedQty ?? line.qty;
    let remaining = need;
    const allocations: NonNullable<Order['lines'][0]['batchAllocations']> = [];

    if (params.overrides?.[line.id]) {
      for (const o of params.overrides[line.id]) {
        const batch = await db.batches.get(o.batchId);
        if (!batch || batch.productId !== line.productId) {
          return fail('Validation', 'ALLOC_BATCH', 'Invalid batch for product.', 'Allocation was not saved.');
        }
        const avail = availableQty(batch);
        if (o.qty > avail) {
          return fail('Integrity', 'ALLOC_QTY', `Insufficient sellable qty in batch ${batch.batchNumber}.`, 'Allocation was not saved.');
        }
        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          qty: o.qty,
          expiryDate: batch.expiryDate,
        });
        remaining -= o.qty;
      }
    } else {
      const batches = fefoSort(await db.batches.where({ productId: line.productId, stockistId: params.stockist.id }).toArray());
      for (const batch of batches) {
        if (remaining <= 0) break;
        const avail = availableQty(batch);
        if (avail <= 0) continue;
        const take = Math.min(avail, remaining);
        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          qty: take,
          expiryDate: batch.expiryDate,
        });
        remaining -= take;
      }
    }

    if (remaining > 0) {
      return fail(
        'BusinessRule',
        'ALLOC_SHORT',
        `Insufficient sellable stock for ${line.productName}. Short by ${remaining}.`,
        'Allocation was not saved.',
      );
    }

    // reserve
    for (const a of allocations) {
      const batch = (await db.batches.get(a.batchId))!;
      await db.batches.update(batch.id, { reserved: batch.reserved + a.qty, updatedAt: ts });
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.stockist.id,
        productId: line.productId,
        batchId: batch.id,
        type: 'Reservation',
        qty: a.qty,
        reason: `Reserve for ${order.orderNo}`,
        sourceDocType: 'Order',
        sourceDocId: order.id,
        actorId: params.actor.id,
        prevQty: batch.onHand,
        newQty: batch.onHand,
        at: ts,
      });
    }

    lines[i] = { ...line, allocatedQty: need, batchAllocations: allocations };
  }

  await db.orders.update(order.id, {
    status: 'Allocated',
    lines,
    updatedAt: ts,
    version: order.version + 1,
    statusHistory: [...order.statusHistory, { from: order.status, to: 'Allocated', at: ts, actorId: params.actor.id }],
  });
  await notifyBusinessUsers(order.pharmacyId, 'N-020', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

export async function packOrder(params: {
  actor: User;
  stockist: Business;
  orderId: string;
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.stockist, 'order.pack');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Order was not packed.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Order was not packed.');
  }
  if (order.status !== 'Allocated') {
    return fail('StateConflict', 'ORD_BAD_STATE', 'Order must be Allocated before packing.', 'Order was not packed.');
  }
  const t = machines.order('Allocated', 'Packed');
  if (!t.ok) return fail('StateConflict', 'ORD_BAD_STATE', t.reason!, 'Order was not packed.');

  const ts = new Date().toISOString();
  const lines = order.lines.map((l) => ({ ...l, packedQty: l.allocatedQty ?? l.acceptedQty ?? l.qty }));
  await db.orders.update(order.id, {
    status: 'Packed',
    lines,
    updatedAt: ts,
    version: order.version + 1,
    statusHistory: [...order.statusHistory, { from: 'Allocated', to: 'Packed', at: ts, actorId: params.actor.id }],
  });
  await notifyBusinessUsers(order.pharmacyId, 'N-021', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

export async function issueInvoice(params: {
  actor: User;
  stockist: Business;
  orderId: string;
}): Promise<Result<Invoice>> {
  const perm = assertCan(params.actor, params.stockist, 'invoice.issue');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Invoice was not issued.');
  const settings = await db.platformSettings.get('platform');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Invoice was not issued.');
  }
  if (order.invoiceId) {
    return fail('Duplicate', 'INV_EXISTS', 'Invoice already exists for this order.', 'A second invoice was not created.', {
      existingId: order.invoiceId,
    });
  }
  if (!settings?.billAheadAllowed && !['Packed', 'Dispatched', 'Delivered', 'PartiallyDelivered'].includes(order.status)) {
    return fail('BusinessRule', 'INV_BILL_AHEAD', 'Invoice can be issued only after pack/dispatch (bill-ahead is OFF).', 'Invoice was not issued.');
  }

  const billableLines = order.lines
    .filter((l) => (l.packedQty ?? l.allocatedQty ?? l.acceptedQty ?? 0) > 0)
    .map((l) => {
      const qty = l.packedQty ?? l.allocatedQty ?? l.acceptedQty ?? l.qty;
      const calc = calcInvoiceLine({ qty, unitPrice: l.unitPrice, gstPercent: l.gstPercent });
      return {
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        qty,
        unitPrice: l.unitPrice,
        gstPercent: l.gstPercent,
        ...calc,
        batchNumber: l.batchAllocations?.[0]?.batchNumber,
        expiryDate: l.batchAllocations?.[0]?.expiryDate,
      };
    });
  if (!billableLines.length) {
    return fail('Validation', 'INV_EMPTY', 'No billable quantities.', 'Invoice was not issued.');
  }

  const totals = calcInvoiceTotals(billableLines, settings?.roundingMode ?? 'nearest');
  const conn = await db.connections.get(order.connectionId);
  const creditDays = conn?.creditDays ?? params.stockist.creditDaysDefault ?? 30;
  const ts = new Date().toISOString();
  const invoice: Invoice = {
    id: newId(),
    invoiceNo: nextNumber('INV'),
    orderId: order.id,
    stockistId: order.stockistId,
    pharmacyId: order.pharmacyId,
    status: 'Issued',
    lines: billableLines,
    ...totals,
    outstanding: totals.grandTotal,
    paidAmount: 0,
    creditApplied: 0,
    issuedAt: ts,
    dueDate: formatISO(addDays(new Date(), creditDays), { representation: 'date' }),
    statusHistory: [{ from: 'Draft', to: 'Issued', at: ts, actorId: params.actor.id }],
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };

  await db.transaction('rw', db.invoices, db.orders, async () => {
    await db.invoices.add(invoice);
    await db.orders.update(order.id, { invoiceId: invoice.id, updatedAt: ts });
  });

  await notifyBusinessUsers(
    order.pharmacyId,
    'N-027',
    { invoiceNo: invoice.invoiceNo, orderNo: order.orderNo },
    { type: 'Invoice', id: invoice.id },
  );
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Invoice',
    entityId: invoice.id,
    action: 'invoice.issue',
    after: { invoiceNo: invoice.invoiceNo, grandTotal: invoice.grandTotal },
  });
  return ok(invoice);
}

export async function createAndDispatchDelivery(params: {
  actor: User;
  stockist: Business;
  orderId: string;
  assigneeId?: string;
}): Promise<Result<Delivery>> {
  const perm = assertCan(params.actor, params.stockist, 'delivery.assign');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Delivery was not created.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Delivery was not created.');
  }
  if (order.status !== 'Packed' && order.status !== 'Dispatched') {
    return fail('StateConflict', 'DEL_STATE', 'Order must be Packed before dispatch.', 'Delivery was not created.');
  }
  if (!order.invoiceId) {
    return fail('BusinessRule', 'DEL_NO_INV', 'Issue invoice before dispatch (default policy).', 'Delivery was not created.');
  }

  const ts = new Date().toISOString();
  // consume reserved stock
  for (const line of order.lines) {
    for (const a of line.batchAllocations ?? []) {
      const batch = (await db.batches.get(a.batchId)) as Batch;
      const newOnHand = batch.onHand - a.qty;
      const newReserved = batch.reserved - a.qty;
      if (newOnHand < 0 || newReserved < 0) {
        return fail('Integrity', 'INV_NEG', 'Inventory would go negative.', 'Delivery was not created.');
      }
      if (availableQty({ ...batch, onHand: batch.onHand, reserved: batch.reserved - a.qty }) < 0) {
        return fail('Integrity', 'INV_EXPIRED', 'Cannot dispatch expired/unsellable batch.', 'Delivery was not created.');
      }
      // re-check expiry at dispatch
      if (new Date(batch.expiryDate) <= new Date()) {
        return fail('BusinessRule', 'DEL_EXPIRED', `Batch ${batch.batchNumber} is expired and cannot be delivered.`, 'Delivery was not created.');
      }
      await db.batches.update(batch.id, {
        onHand: newOnHand,
        reserved: Math.max(0, newReserved),
        status: newOnHand === 0 ? 'Depleted' : batch.status,
        updatedAt: ts,
      });
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.stockist.id,
        productId: line.productId,
        batchId: batch.id,
        type: 'DispatchConsume',
        qty: a.qty,
        reason: `Dispatch ${order.orderNo}`,
        sourceDocType: 'Order',
        sourceDocId: order.id,
        actorId: params.actor.id,
        prevQty: batch.onHand,
        newQty: newOnHand,
        at: ts,
      });
    }
  }

  const delivery: Delivery = {
    id: newId(),
    deliveryNo: nextNumber('DEL'),
    orderId: order.id,
    invoiceId: order.invoiceId,
    stockistId: order.stockistId,
    pharmacyId: order.pharmacyId,
    status: params.assigneeId ? 'Assigned' : 'Created',
    assignedTo: params.assigneeId,
    lines: order.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      qty: l.packedQty ?? l.qty,
      deliveredQty: 0,
      batchNumber: l.batchAllocations?.[0]?.batchNumber,
      expiryDate: l.batchAllocations?.[0]?.expiryDate,
    })),
    statusHistory: [
      { from: 'Created', to: params.assigneeId ? 'Assigned' : 'Created', at: ts, actorId: params.actor.id },
    ],
    createdAt: ts,
    updatedAt: ts,
  };

  await db.transaction('rw', db.deliveries, db.orders, async () => {
    await db.deliveries.add(delivery);
    await db.orders.update(order.id, {
      status: 'Dispatched',
      deliveryId: delivery.id,
      updatedAt: ts,
      version: order.version + 1,
      statusHistory: [...order.statusHistory, { from: order.status, to: 'Dispatched', at: ts, actorId: params.actor.id }],
    });
  });

  await notifyBusinessUsers(order.pharmacyId, 'N-022', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  if (params.assigneeId) {
    await notifyBusinessUsers(params.stockist.id, 'N-023', { deliveryNo: delivery.deliveryNo }, { type: 'Delivery', id: delivery.id }, [
      'DeliveryBoy',
    ]);
  }
  return ok(delivery);
}

export async function updateDeliveryStatus(params: {
  actor: User;
  stockist: Business;
  deliveryId: string;
  status: Delivery['status'];
  deliveredQtys?: Record<string, number>;
  failReason?: string;
  podFileId?: string;
}): Promise<Result<Delivery>> {
  const perm = assertCan(params.actor, params.stockist, 'delivery.update');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Delivery was not updated.');
  const delivery = await db.deliveries.get(params.deliveryId);
  if (!delivery || delivery.stockistId !== params.stockist.id) {
    return fail('NotFound', 'DEL_MISSING', 'Delivery not found.', 'Delivery was not updated.');
  }
  if (params.actor.role === 'DeliveryBoy' && delivery.assignedTo !== params.actor.id) {
    return fail('Permission', 'DEL_ASSIGN', 'Delivery Boy can only update assigned deliveries.', 'Delivery was not updated.');
  }
  const t = machines.delivery(delivery.status, params.status);
  if (!t.ok) return fail('StateConflict', 'DEL_BAD_STATE', t.reason!, 'Delivery was not updated.');
  if (params.status === 'Failed' && !params.failReason?.trim()) {
    return fail('Validation', 'DEL_FAIL_REASON', 'Failure reason is required.', 'Delivery was not updated.');
  }

  const ts = new Date().toISOString();
  let lines = delivery.lines;
  if (params.status === 'Delivered' || params.status === 'PartiallyDelivered') {
    lines = delivery.lines.map((l) => ({
      ...l,
      deliveredQty: params.deliveredQtys?.[l.productId] ?? (params.status === 'Delivered' ? l.qty : l.deliveredQty),
    }));
  }

  await db.deliveries.update(delivery.id, {
    status: params.status,
    lines,
    failReason: params.failReason,
    podFileId: params.podFileId,
    updatedAt: ts,
    deliveredAt: params.status === 'Delivered' || params.status === 'PartiallyDelivered' ? ts : delivery.deliveredAt,
    statusHistory: [...delivery.statusHistory, { from: delivery.status, to: params.status, at: ts, actorId: params.actor.id, reason: params.failReason }],
  });

  const order = await db.orders.get(delivery.orderId);
  if (order && (params.status === 'Delivered' || params.status === 'PartiallyDelivered')) {
    const orderStatus = params.status === 'Delivered' ? 'Delivered' : 'PartiallyDelivered';
    const ot = machines.order(order.status, orderStatus);
    if (ot.ok) {
      const orderLines = order.lines.map((l) => {
        const dl = lines.find((x) => x.productId === l.productId);
        return { ...l, deliveredQty: dl?.deliveredQty ?? l.deliveredQty };
      });
      await db.orders.update(order.id, {
        status: orderStatus,
        lines: orderLines,
        updatedAt: ts,
        version: order.version + 1,
        statusHistory: [...order.statusHistory, { from: order.status, to: orderStatus, at: ts, actorId: params.actor.id }],
      });
    }
    await notifyBusinessUsers(
      order.pharmacyId,
      params.status === 'Delivered' ? 'N-025' : 'N-053',
      { orderNo: order.orderNo },
      { type: 'Order', id: order.id },
    );
  }
  if (params.status === 'Failed') {
    await notifyBusinessUsers(delivery.pharmacyId, 'N-052', { deliveryNo: delivery.deliveryNo, reason: params.failReason ?? '' }, {
      type: 'Delivery',
      id: delivery.id,
    });
  }
  if (params.status === 'OutForDelivery') {
    await notifyBusinessUsers(delivery.pharmacyId, 'N-024', { deliveryNo: delivery.deliveryNo }, { type: 'Delivery', id: delivery.id });
  }

  return ok((await db.deliveries.get(delivery.id))!);
}

export async function recordGrn(params: {
  actor: User;
  pharmacy: Business;
  orderId: string;
  received: { lineId: string; receivedQty: number; discrepancyReason?: string }[];
}): Promise<Result<Order>> {
  const order = await db.orders.get(params.orderId);
  if (!order || order.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'GRN was not recorded.');
  }
  if (!['Delivered', 'PartiallyDelivered'].includes(order.status)) {
    return fail('StateConflict', 'GRN_STATE', 'GRN is only allowed after delivery.', 'GRN was not recorded.');
  }
  const ts = new Date().toISOString();
  const lines = order.lines.map((l) => {
    const r = params.received.find((x) => x.lineId === l.id);
    return r ? { ...l, receivedQty: r.receivedQty } : l;
  });
  await db.orders.update(order.id, { lines, updatedAt: ts });

  for (const l of lines) {
    if ((l.receivedQty ?? 0) > 0) {
      const existing = await db.pharmacyInventory.where({ pharmacyId: params.pharmacy.id, productId: l.productId }).first();
      if (existing) {
        await db.pharmacyInventory.update(existing.id, {
          onHand: existing.onHand + (l.receivedQty ?? 0),
          updatedAt: ts,
        });
      } else {
        await db.pharmacyInventory.add({
          id: newId(),
          pharmacyId: params.pharmacy.id,
          productId: l.productId,
          productName: l.productName,
          batchNumber: l.batchAllocations?.[0]?.batchNumber,
          expiryDate: l.batchAllocations?.[0]?.expiryDate,
          onHand: l.receivedQty ?? 0,
          updatedAt: ts,
        });
      }
    }
  }

  const shortage = params.received.some((r) => {
    const line = order.lines.find((l) => l.id === r.lineId);
    return line && r.receivedQty < (line.deliveredQty ?? line.qty);
  });
  if (shortage) {
    await notifyBusinessUsers(order.stockistId, 'N-026', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  }
  await notifyBusinessUsers(order.pharmacyId, 'N-054', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

export { invoiceOutstanding };

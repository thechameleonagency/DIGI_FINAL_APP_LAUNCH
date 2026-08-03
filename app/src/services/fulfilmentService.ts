import { addDays, formatISO } from 'date-fns';
import type { Batch, Business, Delivery, Invoice, Order, StockistRoute, User } from '../domain/entities/types';
import {
  availableQty,
  calcInvoiceLine,
  calcInvoiceTotals,
  fefoSort,
  invoiceOutstanding,
} from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { localTodayKey } from '../domain/utils/dateKeys';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';
import { nowIso } from '../domain/utils/clock';

type LineAllocation = NonNullable<Order['lines'][0]['batchAllocations']>[number];

async function assertActiveDeliveryStaff(stockistId: string, assigneeId: string): Promise<Result<true>> {
  const assignee = await db.users.get(assigneeId);
  if (!assignee || assignee.businessId !== stockistId || assignee.role !== 'DeliveryStaff' || assignee.status !== 'Active') {
    return fail(
      'Validation',
      'DEL_ASSIGNEE',
      'Assignee must be active delivery staff for this stockist.',
      'Assignment was not saved.',
    );
  }
  return ok(true);
}

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

  const planned: { line: Order['lines'][0]; need: number; allocations: LineAllocation[] }[] = [];

  for (const line of order.lines) {
    const need = line.acceptedQty ?? line.qty;
    let remaining = need;
    const allocations: LineAllocation[] = [];
    const overrideRows = params.overrides?.[line.id];

    if (overrideRows) {
      for (const o of overrideRows) {
        const batch = await db.batches.get(o.batchId);
        if (!batch || batch.productId !== line.productId || batch.stockistId !== params.stockist.id) {
          return fail('Validation', 'ALLOC_BATCH', 'Invalid batch for product.', 'Allocation was not saved.');
        }
        if (!Number.isFinite(o.qty) || o.qty <= 0) {
          return fail('Validation', 'ALLOC_QTY', 'Override quantities must be positive numbers.', 'Allocation was not saved.');
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
      if (remaining < 0) {
        return fail(
          'Validation',
          'ALLOC_OVER',
          `Override allocation for ${line.productName} exceeds accepted qty by ${-remaining}.`,
          'Allocation was not saved.',
        );
      }
      if (remaining > 0) {
        return fail(
          'Validation',
          'ALLOC_UNDER',
          `Override for ${line.productName} covers ${need - remaining} of ${need}. Cover the full qty or clear the line for FEFO.`,
          'Allocation was not saved.',
        );
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
      if (remaining > 0) {
        return fail(
          'BusinessRule',
          'ALLOC_SHORT',
          `Insufficient sellable stock for ${line.productName}. Short by ${remaining}.`,
          'Allocation was not saved.',
        );
      }
    }

    planned.push({ line, need, allocations });
  }

  const ts = nowIso();
  const lines = order.lines.map((line) => {
    const p = planned.find((x) => x.line.id === line.id)!;
    return { ...line, allocatedQty: p.need, batchAllocations: p.allocations };
  });

  try {
    await db.transaction('rw', db.batches, db.inventoryMovements, db.orders, async () => {
      const fresh = await db.orders.get(order.id);
      if (!fresh || fresh.stockistId !== params.stockist.id) throw new Error('ORD_MISSING');
      const st = machines.order(fresh.status, 'Allocated');
      if (!st.ok) throw new Error('ORD_BAD_STATE');

      for (const p of planned) {
        for (const a of p.allocations) {
          const batch = await db.batches.get(a.batchId);
          if (!batch) throw new Error('ALLOC_BATCH');
          if (availableQty(batch) < a.qty) throw new Error('ALLOC_QTY');
          await db.batches.update(batch.id, { reserved: batch.reserved + a.qty, updatedAt: ts });
          await db.inventoryMovements.add({
            id: newId(),
            businessId: params.stockist.id,
            productId: p.line.productId,
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
      }

      await db.orders.update(order.id, {
        status: 'Allocated',
        lines,
        updatedAt: ts,
        version: fresh.version + 1,
        statusHistory: [...fresh.statusHistory, { from: fresh.status, to: 'Allocated', at: ts, actorId: params.actor.id }],
      });
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'ORD_MISSING') return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Allocation was not saved.');
    if (code === 'ORD_BAD_STATE') return fail('StateConflict', 'ORD_BAD_STATE', 'Order is no longer allocatable.', 'Allocation was not saved.');
    if (code === 'ALLOC_BATCH') return fail('Validation', 'ALLOC_BATCH', 'Invalid batch for product.', 'Allocation was not saved.');
    if (code === 'ALLOC_QTY') {
      return fail('Integrity', 'ALLOC_QTY', 'Insufficient sellable qty — stock changed during allocation.', 'Allocation was not saved.');
    }
    throw e;
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Order',
    entityId: order.id,
    action: params.overrides ? 'order.allocate.override' : 'order.allocate',
    reason: params.overrides ? 'Manual batch allocation (FEFO override)' : 'FEFO allocation',
    after: { status: 'Allocated', orderNo: order.orderNo },
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

  const ts = nowIso();
  const lines = order.lines.map((l) => ({ ...l, packedQty: l.allocatedQty ?? l.acceptedQty ?? l.qty }));
  await db.orders.update(order.id, {
    status: 'Packed',
    lines,
    updatedAt: ts,
    version: order.version + 1,
    statusHistory: [...order.statusHistory, { from: 'Allocated', to: 'Packed', at: ts, actorId: params.actor.id }],
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.pack',
    after: { status: 'Packed', orderNo: order.orderNo },
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

  // CF-18: optional delivery fee at issue time (immutable thereafter — E-CF-18b)
  const feeFlat = params.stockist.preferences?.deliveryFeeFlat ?? 0;
  const feeFreeAbove = params.stockist.preferences?.deliveryFeeFreeAbove;
  if (feeFlat > 0) {
    const goodsSubtotal = billableLines.reduce((s, l) => s + l.lineSubtotal, 0);
    const waive = feeFreeAbove != null && feeFreeAbove > 0 && goodsSubtotal >= feeFreeAbove;
    if (!waive) {
      const feeCalc = calcInvoiceLine({ qty: 1, unitPrice: feeFlat, gstPercent: 0 });
      billableLines.push({
        productId: 'delivery-fee',
        productName: 'Delivery charge',
        sku: 'DEL-FEE',
        qty: 1,
        unitPrice: feeFlat,
        gstPercent: 0,
        ...feeCalc,
        batchNumber: undefined,
        expiryDate: undefined,
      });
    }
  }

  const totals = calcInvoiceTotals(billableLines, settings?.roundingMode ?? 'nearest');
  const conn = await db.connections.get(order.connectionId);
  const creditDays = conn?.creditDays ?? params.stockist.creditDaysDefault ?? 30;
  const ts = nowIso();
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

  // Accrue platform fees — Offline/Manual deferred; Platform online collected on Razorpay pay
  {
    const { accruePlatformFees } = await import('./settlementService');
    let commission = 0;
    let bankFee = 0;
    for (const l of order.lines) {
      commission += l.commissionAmount ?? 0;
      bankFee += l.bankFeeAmount ?? 0;
    }
    if (commission > 0 || bankFee > 0) {
      const source =
        order.source === 'Manual' || order.managedPharmacyId || order.paymentMode === 'Cash'
          ? 'Offline'
          : 'Online';
      await accruePlatformFees({
        stockistId: order.stockistId,
        pharmacyId: order.pharmacyId,
        orderId: order.id,
        invoiceId: invoice.id,
        source,
        commission,
        bankFee,
      });
    }
  }

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

/** CF-16: issue invoices for many ready orders; per-order success/failure (partial success). */
export async function bulkIssueInvoices(params: {
  actor: User;
  stockist: Business;
  orderIds: string[];
}): Promise<
  Result<{
    results: { orderId: string; orderNo?: string; ok: boolean; invoiceNo?: string; message?: string; code?: string }[];
    successCount: number;
    failureCount: number;
  }>
> {
  const perm = assertCan(params.actor, params.stockist, 'invoice.issue');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Bulk billing was not started.');
  if (!params.orderIds.length) {
    return fail('Validation', 'BULK_EMPTY', 'Select at least one order.', 'Bulk billing was not started.');
  }
  const results: {
    orderId: string;
    orderNo?: string;
    ok: boolean;
    invoiceNo?: string;
    message?: string;
    code?: string;
  }[] = [];
  for (const orderId of params.orderIds) {
    const order = await db.orders.get(orderId);
    const res = await issueInvoice({ actor: params.actor, stockist: params.stockist, orderId });
    if (res.ok) {
      results.push({ orderId, orderNo: order?.orderNo, ok: true, invoiceNo: res.data.invoiceNo });
    } else {
      results.push({
        orderId,
        orderNo: order?.orderNo,
        ok: false,
        message: res.message,
        code: res.code,
      });
    }
  }
  return ok({
    results,
    successCount: results.filter((r) => r.ok).length,
    failureCount: results.filter((r) => !r.ok).length,
  });
}

export async function createAndDispatchDelivery(params: {
  actor: User;
  stockist: Business;
  orderId: string;
  assigneeId?: string;
  scheduledDate?: string;
  routeId?: string;
}): Promise<Result<Delivery>> {
  const perm = assertCan(params.actor, params.stockist, 'delivery.assign');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Delivery was not created.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.stockistId !== params.stockist.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Delivery was not created.');
  }
  if (order.deliveryId) {
    return fail('Duplicate', 'DEL_EXISTS', 'Delivery already exists for this order.', 'A second delivery was not created.', {
      existingId: order.deliveryId,
    });
  }
  if (order.status !== 'Packed') {
    return fail('StateConflict', 'DEL_STATE', 'Order must be Packed before dispatch.', 'Delivery was not created.');
  }
  if (!order.invoiceId) {
    return fail('BusinessRule', 'DEL_NO_INV', 'Issue invoice before dispatch (default policy).', 'Delivery was not created.');
  }

  let route: StockistRoute | undefined;
  if (params.routeId) {
    route = await db.stockistRoutes.get(params.routeId);
    if (!route || route.stockistId !== params.stockist.id) {
      return fail('NotFound', 'DEL_ROUTE', 'Route not found for this stockist.', 'Delivery was not created.');
    }
  }

  let assigneeId = params.assigneeId || undefined;
  if (!assigneeId && route?.assigneeId) assigneeId = route.assigneeId;
  if (assigneeId) {
    const assigneeOk = await assertActiveDeliveryStaff(params.stockist.id, assigneeId);
    if (!assigneeOk.ok) {
      return fail('Validation', 'DEL_ASSIGNEE', assigneeOk.message, 'Delivery was not created.');
    }
  }

  const scheduledDate = params.scheduledDate?.slice(0, 10) || undefined;
  if (params.scheduledDate) {
    if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return fail('Validation', 'DEL_DATE', 'Use YYYY-MM-DD for scheduled date.', 'Delivery was not created.');
    }
    if (scheduledDate < localTodayKey()) {
      return fail('Validation', 'DEL_DATE_PAST', 'Scheduled date cannot be in the past.', 'Delivery was not created.');
    }
  }

  // Pre-validate consume plan (writes happen atomically with delivery create).
  for (const line of order.lines) {
    const shipQty = line.packedQty ?? line.qty;
    const allocs = line.batchAllocations ?? [];
    if (shipQty > 0 && allocs.length === 0) {
      return fail(
        'BusinessRule',
        'DEL_NO_ALLOC',
        `Line ${line.productName} has no batch allocations — re-allocate after recall before dispatch.`,
        'Delivery was not created.',
      );
    }
    for (const a of allocs) {
      const batch = (await db.batches.get(a.batchId)) as Batch | undefined;
      if (!batch || batch.stockistId !== params.stockist.id) {
        return fail('NotFound', 'INV_BATCH', `Batch missing for ${line.productName}.`, 'Delivery was not created.');
      }
      const newOnHand = batch.onHand - a.qty;
      const newReserved = batch.reserved - a.qty;
      if (newOnHand < 0 || newReserved < 0) {
        return fail('Integrity', 'INV_NEG', 'Inventory would go negative.', 'Delivery was not created.');
      }
      if (batch.expiryDate.slice(0, 10) <= localTodayKey()) {
        return fail('BusinessRule', 'DEL_EXPIRED', `Batch ${batch.batchNumber} is expired and cannot be delivered.`, 'Delivery was not created.');
      }
    }
  }

  const ts = nowIso();
  const deliveryId = newId();
  const deliveryNo = nextNumber('DEL');
  const delivery: Delivery = {
    id: deliveryId,
    deliveryNo,
    orderId: order.id,
    invoiceId: order.invoiceId,
    stockistId: order.stockistId,
    pharmacyId: order.pharmacyId,
    status: assigneeId ? 'Assigned' : 'Created',
    assignedTo: assigneeId,
    routeId: params.routeId,
    scheduledDate,
    lines: order.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      qty: l.packedQty ?? l.qty,
      deliveredQty: 0,
      batchNumber: l.batchAllocations?.[0]?.batchNumber,
      expiryDate: l.batchAllocations?.[0]?.expiryDate,
    })),
    statusHistory: [
      { from: 'Created', to: assigneeId ? 'Assigned' : 'Created', at: ts, actorId: params.actor.id },
    ],
    createdAt: ts,
    updatedAt: ts,
  };

  try {
    await db.transaction('rw', db.batches, db.inventoryMovements, db.deliveries, db.orders, db.stockistRoutes, async () => {
      const fresh = await db.orders.get(order.id);
      if (!fresh || fresh.stockistId !== params.stockist.id) throw new Error('ORD_MISSING');
      if (fresh.deliveryId) throw new Error('DEL_EXISTS');
      if (fresh.status !== 'Packed') throw new Error('DEL_STATE');
      if (!fresh.invoiceId) throw new Error('DEL_NO_INV');

      for (const line of fresh.lines) {
        for (const a of line.batchAllocations ?? []) {
          const batch = (await db.batches.get(a.batchId)) as Batch;
          const newOnHand = batch.onHand - a.qty;
          const newReserved = batch.reserved - a.qty;
          if (newOnHand < 0 || newReserved < 0) throw new Error('INV_NEG');
          if (batch.expiryDate.slice(0, 10) <= localTodayKey()) throw new Error('DEL_EXPIRED');
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
            reason: `Dispatch ${fresh.orderNo}`,
            sourceDocType: 'Order',
            sourceDocId: fresh.id,
            actorId: params.actor.id,
            prevQty: batch.onHand,
            newQty: newOnHand,
            at: ts,
          });
        }
      }

      await db.deliveries.add(delivery);
      await db.orders.update(fresh.id, {
        status: 'Dispatched',
        deliveryId: delivery.id,
        preferredDeliveryDate: scheduledDate ?? fresh.preferredDeliveryDate,
        updatedAt: ts,
        version: fresh.version + 1,
        statusHistory: [...fresh.statusHistory, { from: fresh.status, to: 'Dispatched', at: ts, actorId: params.actor.id }],
      });
      if (params.routeId) {
        const r = await db.stockistRoutes.get(params.routeId);
        if (!r || r.stockistId !== params.stockist.id) throw new Error('DEL_ROUTE');
        const seq = r.stops.length;
        await db.stockistRoutes.put({
          ...r,
          stops: [...r.stops, { deliveryId: delivery.id, seq }],
        });
      }
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'ORD_MISSING') return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Delivery was not created.');
    if (code === 'DEL_EXISTS') {
      const again = await db.orders.get(order.id);
      return fail('Duplicate', 'DEL_EXISTS', 'Delivery already exists for this order.', 'A second delivery was not created.', {
        existingId: again?.deliveryId,
      });
    }
    if (code === 'DEL_STATE') return fail('StateConflict', 'DEL_STATE', 'Order must be Packed before dispatch.', 'Delivery was not created.');
    if (code === 'DEL_NO_INV') {
      return fail('BusinessRule', 'DEL_NO_INV', 'Issue invoice before dispatch (default policy).', 'Delivery was not created.');
    }
    if (code === 'INV_NEG') return fail('Integrity', 'INV_NEG', 'Inventory would go negative.', 'Delivery was not created.');
    if (code === 'DEL_EXPIRED') {
      return fail('BusinessRule', 'DEL_EXPIRED', 'A batch is expired and cannot be delivered.', 'Delivery was not created.');
    }
    if (code === 'DEL_ROUTE') {
      return fail('NotFound', 'DEL_ROUTE', 'Route not found for this stockist.', 'Delivery was not created.');
    }
    throw e;
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Delivery',
    entityId: delivery.id,
    action: 'delivery.dispatch',
    after: { deliveryNo: delivery.deliveryNo, orderNo: order.orderNo, assignedTo: assigneeId, scheduledDate },
  });
  await notifyBusinessUsers(order.pharmacyId, 'N-022', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  if (scheduledDate) {
    await notifyBusinessUsers(
      order.pharmacyId,
      'N-316',
      { orderNo: order.orderNo, date: scheduledDate },
      { type: 'Delivery', id: delivery.id },
    );
  }
  if (assigneeId) {
    await notifyBusinessUsers(params.stockist.id, 'N-023', { deliveryNo: delivery.deliveryNo }, { type: 'Delivery', id: delivery.id }, [
      'DeliveryStaff',
    ]);
  }
  return ok((await db.deliveries.get(delivery.id))!);
}

export async function assignDelivery(params: {
  actor: User;
  stockist: Business;
  deliveryId: string;
  assigneeId?: string | null;
}): Promise<Result<Delivery>> {
  const perm = assertCan(params.actor, params.stockist, 'delivery.assign');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Assignment was not saved.');
  const delivery = await db.deliveries.get(params.deliveryId);
  if (!delivery || delivery.stockistId !== params.stockist.id) {
    return fail('NotFound', 'DEL_MISSING', 'Delivery not found.', 'Assignment was not saved.');
  }
  if (!['Created', 'Assigned', 'Failed'].includes(delivery.status)) {
    return fail('StateConflict', 'DEL_ASSIGN_STATE', 'Cannot reassign in current status.', 'Assignment was not saved.');
  }
  const assigneeId = params.assigneeId || undefined;
  if (assigneeId) {
    const assigneeOk = await assertActiveDeliveryStaff(params.stockist.id, assigneeId);
    if (!assigneeOk.ok) return assigneeOk;
  }
  const ts = nowIso();
  let status = delivery.status;
  if (assigneeId && delivery.status === 'Created') {
    const t = machines.delivery('Created', 'Assigned');
    if (!t.ok) return fail('StateConflict', 'DEL_BAD_STATE', t.reason!, 'Assignment was not saved.');
    status = 'Assigned';
  } else if (!assigneeId && delivery.status === 'Assigned') {
    const t = machines.delivery('Assigned', 'Created');
    if (!t.ok) return fail('StateConflict', 'DEL_BAD_STATE', t.reason!, 'Assignment was not saved.');
    status = 'Created';
  } else if (assigneeId && delivery.status === 'Failed') {
    const t = machines.delivery('Failed', 'Assigned');
    if (!t.ok) return fail('StateConflict', 'DEL_BAD_STATE', t.reason!, 'Assignment was not saved.');
    status = 'Assigned';
  }
  await db.deliveries.update(delivery.id, {
    assignedTo: assigneeId,
    status,
    updatedAt: ts,
    statusHistory: [
      ...delivery.statusHistory,
      {
        from: delivery.status,
        to: status,
        at: ts,
        actorId: params.actor.id,
        reason: assigneeId ? `Assigned to ${assigneeId}` : 'Unassigned',
      },
    ],
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Delivery',
    entityId: delivery.id,
    action: 'delivery.assign',
    after: { assignedTo: assigneeId, status },
  });
  if (assigneeId) {
    await notifyBusinessUsers(params.stockist.id, 'N-023', { deliveryNo: delivery.deliveryNo }, { type: 'Delivery', id: delivery.id }, [
      'DeliveryStaff',
    ]);
  }
  return ok((await db.deliveries.get(delivery.id))!);
}

export async function returnFailedDeliveryToStockist(params: {
  actor: User;
  stockist: Business;
  deliveryId: string;
}): Promise<Result<Delivery>> {
  const perm = assertCan(params.actor, params.stockist, 'delivery.assign');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Stock was not returned.');
  const delivery = await db.deliveries.get(params.deliveryId);
  if (!delivery || delivery.stockistId !== params.stockist.id) {
    return fail('NotFound', 'DEL_MISSING', 'Delivery not found.', 'Stock was not returned.');
  }
  if (delivery.status !== 'Failed') {
    return fail('StateConflict', 'DEL_NOT_FAILED', 'Only failed deliveries can be returned to stockist.', 'Stock was not returned.');
  }
  if (delivery.returnedToStockistAt) {
    return fail('Duplicate', 'DEL_RESTOCKED', 'Stock already returned for this delivery.', 'Stock was not returned again.');
  }
  const order = await db.orders.get(delivery.orderId);
  if (!order) return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Stock was not returned.');
  const t = machines.delivery('Failed', 'Cancelled');
  if (!t.ok) return fail('StateConflict', 'DEL_BAD_STATE', t.reason!, 'Stock was not returned.');
  const ts = nowIso();

  try {
    await db.transaction('rw', db.batches, db.inventoryMovements, db.deliveries, db.orders, async () => {
      const freshDel = await db.deliveries.get(delivery.id);
      if (!freshDel || freshDel.status !== 'Failed' || freshDel.returnedToStockistAt) throw new Error('DEL_RESTOCKED');
      const freshOrder = await db.orders.get(order.id);
      if (!freshOrder) throw new Error('ORD_MISSING');

      for (const line of freshOrder.lines) {
        for (const a of line.batchAllocations ?? []) {
          const batch = await db.batches.get(a.batchId);
          if (!batch) continue;
          const newOnHand = batch.onHand + a.qty;
          await db.batches.update(batch.id, {
            onHand: newOnHand,
            status: batch.status === 'Depleted' ? 'Available' : batch.status,
            updatedAt: ts,
          });
          await db.inventoryMovements.add({
            id: newId(),
            businessId: params.stockist.id,
            productId: line.productId,
            batchId: batch.id,
            type: 'ReturnIn',
            qty: a.qty,
            reason: `Returned to stockist from failed ${freshDel.deliveryNo}`,
            sourceDocType: 'Delivery',
            sourceDocId: freshDel.id,
            actorId: params.actor.id,
            prevQty: batch.onHand,
            newQty: newOnHand,
            at: ts,
          });
        }
      }

      await db.deliveries.update(freshDel.id, {
        status: 'Cancelled',
        updatedAt: ts,
        returnedToStockistAt: ts,
        statusHistory: [
          ...freshDel.statusHistory,
          { from: 'Failed', to: 'Cancelled', at: ts, actorId: params.actor.id, reason: 'Returned to stockist' },
        ],
      });
      const ot = machines.order(freshOrder.status, 'Packed');
      if (ot.ok) {
        // Re-reserve so Packed order inventory matches allocate/pack invariants for re-dispatch.
        for (const line of freshOrder.lines) {
          for (const a of line.batchAllocations ?? []) {
            const batch = await db.batches.get(a.batchId);
            if (!batch) continue;
            await db.batches.update(batch.id, {
              reserved: batch.reserved + a.qty,
              updatedAt: ts,
            });
            await db.inventoryMovements.add({
              id: newId(),
              businessId: params.stockist.id,
              productId: line.productId,
              batchId: batch.id,
              type: 'Reservation',
              qty: a.qty,
              reason: `Re-reserve for ${freshOrder.orderNo} after failed delivery`,
              sourceDocType: 'Order',
              sourceDocId: freshOrder.id,
              actorId: params.actor.id,
              prevQty: batch.onHand,
              newQty: batch.onHand,
              at: ts,
            });
          }
        }
        await db.orders.update(freshOrder.id, {
          status: 'Packed',
          deliveryId: undefined,
          updatedAt: ts,
          version: freshOrder.version + 1,
          statusHistory: [
            ...freshOrder.statusHistory,
            { from: freshOrder.status, to: 'Packed', at: ts, actorId: params.actor.id, reason: 'Failed delivery restocked' },
          ],
        });
      } else {
        await db.orders.update(freshOrder.id, {
          deliveryId: undefined,
          updatedAt: ts,
          version: freshOrder.version + 1,
        });
      }
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'DEL_RESTOCKED') {
      return fail('Duplicate', 'DEL_RESTOCKED', 'Stock already returned for this delivery.', 'Stock was not returned again.');
    }
    if (code === 'ORD_MISSING') return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Stock was not returned.');
    throw e;
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Delivery',
    entityId: delivery.id,
    action: 'delivery.returnToStockist',
    after: { status: 'Cancelled', deliveryNo: delivery.deliveryNo, orderReset: 'Packed' },
  });
  return ok((await db.deliveries.get(delivery.id))!);
}

export async function updateDeliveryStatus(params: {
  actor: User;
  stockist: Business;
  deliveryId: string;
  status: Delivery['status'];
  deliveredQtys?: Record<string, number>;
  failReason?: string;
  podFileId?: string;
  receivedBy?: string;
}): Promise<Result<Delivery>> {
  const perm = assertCan(params.actor, params.stockist, 'delivery.update');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Delivery was not updated.');
  const delivery = await db.deliveries.get(params.deliveryId);
  if (!delivery || delivery.stockistId !== params.stockist.id) {
    return fail('NotFound', 'DEL_MISSING', 'Delivery not found.', 'Delivery was not updated.');
  }
  if (params.actor.role === 'DeliveryStaff' && delivery.assignedTo !== params.actor.id) {
    return fail('Permission', 'DEL_ASSIGN', 'Delivery staff can only update assigned deliveries.', 'Delivery was not updated.');
  }
  // E-CF-18a: route stops require an assignee before execution actions
  if (
    delivery.routeId &&
    ['OutForDelivery', 'Delivered', 'PartiallyDelivered', 'Failed'].includes(params.status) &&
    !delivery.assignedTo
  ) {
    return fail(
      'BusinessRule',
      'ROUTE_UNASSIGNED',
      'Unassigned route stop cannot be executed.',
      'Delivery was not updated.',
    );
  }
  const t = machines.delivery(delivery.status, params.status);
  if (!t.ok) return fail('StateConflict', 'DEL_BAD_STATE', t.reason!, 'Delivery was not updated.');
  if (params.status === 'Failed' && !params.failReason?.trim()) {
    return fail('Validation', 'DEL_FAIL_REASON', 'Failure reason is required.', 'Delivery was not updated.');
  }

  const ts = nowIso();
  let lines = delivery.lines;
  if (params.status === 'Delivered' || params.status === 'PartiallyDelivered') {
    for (const l of delivery.lines) {
      if (params.deliveredQtys && l.productId in params.deliveredQtys) {
        const q = Number(params.deliveredQtys[l.productId]);
        if (!Number.isFinite(q) || q < 0 || q > l.qty) {
          return fail(
            'Validation',
            'DEL_QTY',
            `Delivered qty for ${l.productName} must be between 0 and ${l.qty}.`,
            'Delivery was not updated.',
          );
        }
      }
    }
    lines = delivery.lines.map((l) => {
      const raw = params.deliveredQtys?.[l.productId];
      const next =
        raw == null
          ? params.status === 'Delivered'
            ? l.qty
            : l.deliveredQty
          : Math.max(0, Math.min(Number(raw), l.qty));
      return { ...l, deliveredQty: next };
    });
    if (params.status === 'PartiallyDelivered') {
      const anyShort = lines.some((l) => (l.deliveredQty ?? 0) < l.qty);
      const anyPositive = lines.some((l) => (l.deliveredQty ?? 0) > 0);
      if (!anyShort || !anyPositive) {
        return fail(
          'Validation',
          'DEL_PARTIAL',
          'Partial delivery requires at least one short line and one positive delivered qty.',
          'Delivery was not updated.',
        );
      }
    }
  }

  await db.deliveries.update(delivery.id, {
    status: params.status,
    lines,
    failReason: params.failReason,
    podFileId: params.podFileId ?? delivery.podFileId,
    receivedBy: params.receivedBy ?? delivery.receivedBy,
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

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Delivery',
    entityId: delivery.id,
    action: 'delivery.status',
    reason: params.failReason,
    after: { status: params.status, deliveryNo: delivery.deliveryNo, podFileId: params.podFileId },
  });

  return ok((await db.deliveries.get(delivery.id))!);
}

/** Pending GRN qty for a delivery line (delivered this leg minus already receipted). */
export function deliveryPendingGrnQty(line: { deliveredQty: number; receivedQty?: number }): number {
  return Math.max(0, (line.deliveredQty ?? 0) - (line.receivedQty ?? 0));
}

export async function recordGrn(params: {
  actor: User;
  pharmacy: Business;
  orderId: string;
  /** When set, GRN applies to this delivery leg (required for partial / multi-leg receipt). */
  deliveryId?: string;
  received: {
    lineId: string;
    receivedQty: number;
    discrepancyReason?: string;
    batchNumber?: string;
    expiryDate?: string;
  }[];
}): Promise<Result<Order>> {
  const perm = assertCan(params.actor, params.pharmacy, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'GRN was not recorded.');

  const order = await db.orders.get(params.orderId);
  if (!order || order.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'GRN was not recorded.');
  }
  if (!['Delivered', 'PartiallyDelivered'].includes(order.status)) {
    return fail('StateConflict', 'GRN_STATE', 'GRN is only allowed after delivery.', 'GRN was not recorded.');
  }

  let delivery = params.deliveryId
    ? await db.deliveries.get(params.deliveryId)
    : order.deliveryId
      ? await db.deliveries.get(order.deliveryId)
      : undefined;
  if (!delivery || delivery.orderId !== order.id || delivery.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'GRN_DELIVERY', 'Delivery not found for this order.', 'GRN was not recorded.');
  }
  if (!['Delivered', 'PartiallyDelivered'].includes(delivery.status)) {
    return fail('StateConflict', 'GRN_DEL_STATE', 'GRN is only allowed after this delivery is marked delivered.', 'GRN was not recorded.');
  }

  let totalReceived = 0;
  for (const r of params.received) {
    const line = order.lines.find((l) => l.id === r.lineId);
    if (!line) {
      return fail('Validation', 'GRN_LINE', 'Unknown order line in GRN.', 'GRN was not recorded.');
    }
    const dLine = delivery.lines.find((l) => l.productId === line.productId);
    if (!dLine) {
      return fail('Validation', 'GRN_DEL_LINE', `${line.productName} is not on this delivery.`, 'GRN was not recorded.');
    }
    const maxQty = deliveryPendingGrnQty(dLine);
    if (maxQty <= 0 && r.receivedQty > 0) {
      return fail(
        'StateConflict',
        'GRN_CAUGHT_UP',
        `${line.productName} is already fully receipted for this delivery.`,
        'Stock was not counted again.',
      );
    }
    if (!Number.isFinite(r.receivedQty) || r.receivedQty < 0 || r.receivedQty > maxQty) {
      return fail(
        'Validation',
        'GRN_QTY',
        `Received qty for ${line.productName} must be between 0 and ${maxQty} (pending this delivery).`,
        'GRN was not recorded.',
      );
    }
    if (maxQty > 0 && r.receivedQty < maxQty && !r.discrepancyReason?.trim()) {
      return fail(
        'Validation',
        'GRN_REASON',
        `Discrepancy reason required for short receipt of ${line.productName}.`,
        'GRN was not recorded.',
      );
    }
    totalReceived += r.receivedQty;
  }
  if (totalReceived < 1) {
    return fail('Validation', 'GRN_MIN', 'Receive at least 1 unit to record a GRN.', 'GRN was not recorded.');
  }

  const ts = nowIso();
  const nextDeliveryLines = delivery.lines.map((dl) => {
    const orderLine = order.lines.find((l) => l.productId === dl.productId);
    const r = orderLine ? params.received.find((x) => x.lineId === orderLine.id) : undefined;
    if (!r) return dl;
    return {
      ...dl,
      receivedQty: (dl.receivedQty ?? 0) + r.receivedQty,
      discrepancyReason: r.discrepancyReason?.trim() || dl.discrepancyReason,
      batchNumber: r.batchNumber?.trim() || dl.batchNumber,
      expiryDate: r.expiryDate?.trim() || dl.expiryDate,
    };
  });

  const lines = order.lines.map((l) => {
    const r = params.received.find((x) => x.lineId === l.id);
    if (!r) return l;
    const nextReceived = (l.receivedQty ?? 0) + r.receivedQty;
    return {
      ...l,
      receivedQty: nextReceived,
      discrepancyReason: r.discrepancyReason?.trim() || l.discrepancyReason,
      // Keep stockist FEFO allocations intact — pharmacy receipt metadata lives on delivery lines / pharmacy inventory.
    };
  });

  const deliveryFullyReceipted = nextDeliveryLines.every((dl) => (dl.receivedQty ?? 0) >= (dl.deliveredQty ?? 0));

  await db.transaction('rw', db.orders, db.deliveries, db.pharmacyInventory, db.inventoryMovements, async () => {
    await db.deliveries.update(delivery!.id, {
      lines: nextDeliveryLines,
      grnRecordedAt: deliveryFullyReceipted ? ts : delivery!.grnRecordedAt,
      updatedAt: ts,
    });
    await db.orders.update(order.id, { lines, updatedAt: ts, grnRecordedAt: ts, version: order.version + 1 });

    for (const l of order.lines) {
      const r = params.received.find((x) => x.lineId === l.id);
      if (!r || r.receivedQty <= 0) continue;
      const qty = r.receivedQty;
      const batchNumber = r.batchNumber?.trim() || l.batchAllocations?.[0]?.batchNumber;
      const expiryDate = r.expiryDate?.trim() || l.batchAllocations?.[0]?.expiryDate;
      const existing = await db.pharmacyInventory.where({ pharmacyId: params.pharmacy.id, productId: l.productId }).first();
      const prevQty = existing?.onHand ?? 0;
      const newQty = prevQty + qty;
      if (existing) {
        await db.pharmacyInventory.update(existing.id, {
          onHand: newQty,
          batchNumber: batchNumber ?? existing.batchNumber,
          expiryDate: expiryDate ?? existing.expiryDate,
          updatedAt: ts,
        });
      } else {
        await db.pharmacyInventory.add({
          id: newId(),
          pharmacyId: params.pharmacy.id,
          productId: l.productId,
          productName: l.productName,
          batchNumber,
          expiryDate,
          onHand: qty,
          updatedAt: ts,
        });
      }
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.pharmacy.id,
        productId: l.productId,
        type: 'GRNIn',
        qty,
        reason: r.discrepancyReason?.trim() || 'Goods receipt',
        sourceDocType: 'Delivery',
        sourceDocId: delivery!.id,
        actorId: params.actor.id,
        prevQty,
        newQty,
        at: ts,
      });
    }
  });

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'Delivery',
    entityId: delivery.id,
    action: 'delivery.grn',
    after: { deliveryNo: delivery.deliveryNo, orderNo: order.orderNo, received: params.received },
  });

  const shortage = params.received.some((r) => {
    const line = order.lines.find((l) => l.id === r.lineId);
    const dLine = line ? delivery!.lines.find((x) => x.productId === line.productId) : undefined;
    if (!dLine) return false;
    return r.receivedQty < deliveryPendingGrnQty(dLine);
  });
  if (shortage) {
    await notifyBusinessUsers(order.stockistId, 'N-026', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  }
  await notifyBusinessUsers(order.stockistId, 'N-054', { orderNo: order.orderNo }, { type: 'Order', id: order.id });
  return ok((await db.orders.get(order.id))!);
}

export { invoiceOutstanding };

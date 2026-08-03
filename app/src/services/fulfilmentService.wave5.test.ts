import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { localTodayKey } from '../domain/utils/dateKeys';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import {
  allocateOrder,
  assignDelivery,
  bulkIssueInvoices,
  createAndDispatchDelivery,
  issueInvoice,
  packOrder,
  recordGrn,
  returnFailedDeliveryToStockist,
  updateDeliveryStatus,
} from './fulfilmentService';
import { deleteStockistRoute, scheduleDelivery, setRouteStops, upsertStockistRoute } from './routeService';
import { nowIso } from '../domain/utils/clock';

async function seedPlatform(billAhead = false) {
  await db.platformSettings.put({
    id: 'platform',
    maintenanceMode: false,
    billAheadAllowed: billAhead,
    returnWindowDays: 7,
    inviteTtlDays: 7,
    roundingMode: 'nearest',
    updatedAt: nowIso(),
  } as never);
}

async function seedTradePair(suffix: string) {
  const stockistUser = await makeActor({ id: `u-st-${suffix}`, businessId: `biz-st-${suffix}`, role: 'Stockist' });
  const stockist = await makeBusiness({ id: `biz-st-${suffix}`, type: 'Stockist', ownerUserId: stockistUser.id });
  const pharmacyUser = await makeActor({ id: `u-ph-${suffix}`, businessId: `biz-ph-${suffix}`, role: 'Pharmacist' });
  const pharmacy = await makeBusiness({ id: `biz-ph-${suffix}`, type: 'Pharmacy', ownerUserId: pharmacyUser.id });
  const rider = await makeActor({
    id: `u-rider-${suffix}`,
    businessId: stockist.id,
    role: 'DeliveryStaff',
    name: 'Rider',
  });
  const pharmacyRider = await makeActor({
    id: `u-ph-ds-${suffix}`,
    businessId: pharmacy.id,
    role: 'DeliveryStaff',
    name: 'Pharmacy Rider',
  });
  const ts = nowIso();
  await db.connections.add({
    id: `conn-${suffix}`,
    pharmacyId: pharmacy.id,
    stockistId: stockist.id,
    status: 'Active',
    creditDays: 30,
    createdAt: ts,
    updatedAt: ts,
  } as never);
  const productId = `prod-${suffix}`;
  await db.products.add({
    id: productId,
    stockistId: stockist.id,
    name: 'Para',
    sku: 'P500',
    packSize: '10s',
    status: 'Active',
    moq: 1,
    mrp: 20,
    gstPercent: 12,
    ptr: 10,
    updatedAt: ts,
  } as never);
  const batchId = `batch-${suffix}`;
  const expiry = new Date(Date.now() + 86400000 * 400).toISOString().slice(0, 10);
  await db.batches.add({
    id: batchId,
    stockistId: stockist.id,
    productId,
    batchNumber: `B-${suffix}`,
    expiryDate: expiry,
    onHand: 100,
    reserved: 0,
    status: 'Available',
    updatedAt: ts,
  } as never);
  return { stockistUser, stockist, pharmacyUser, pharmacy, rider, pharmacyRider, productId, batchId, expiry, ts };
}

async function seedAcceptedOrder(
  ctx: Awaited<ReturnType<typeof seedTradePair>>,
  orderId: string,
  qty = 5,
) {
  const lineId = `${orderId}-line`;
  await db.orders.add({
    id: orderId,
    orderNo: `ORD-${orderId}`,
    pharmacyId: ctx.pharmacy.id,
    stockistId: ctx.stockist.id,
    connectionId: `conn-${orderId.split('-').pop()}`,
    status: 'Accepted',
    lines: [
      {
        id: lineId,
        productId: ctx.productId,
        productName: 'Para',
        sku: 'P500',
        packSize: '10s',
        qty,
        acceptedQty: qty,
        unitPrice: 10,
        mrp: 20,
        gstPercent: 12,
        lineSubtotal: qty * 10,
        lineTax: qty * 10 * 0.12,
        lineTotal: qty * 10 * 1.12,
      },
    ],
    subtotal: qty * 10,
    taxTotal: qty * 10 * 0.12,
    grandTotal: qty * 10 * 1.12,
    deliveryAddress: {
      id: 'a1',
      label: 'Main',
      line1: '1 Main',
      city: 'Pune',
      state: 'MH',
      pincode: '411001',
      isDefault: true,
    },
    source: 'Platform',
    statusHistory: [],
    placedBy: ctx.pharmacyUser.id,
    placedAt: ctx.ts,
    createdAt: ctx.ts,
    updatedAt: ctx.ts,
    version: 1,
    idempotencyKey: `idem-${orderId}`,
  } as never);
  // Fix connection id to match seeded pair
  const suffix = ctx.stockist.id.replace('biz-st-', '');
  await db.orders.update(orderId, { connectionId: `conn-${suffix}` });
  return lineId;
}

async function packAndInvoice(ctx: Awaited<ReturnType<typeof seedTradePair>>, orderId: string) {
  const alloc = await allocateOrder({ actor: ctx.stockistUser, stockist: ctx.stockist, orderId });
  expect(alloc.ok).toBe(true);
  const packed = await packOrder({ actor: ctx.stockistUser, stockist: ctx.stockist, orderId });
  expect(packed.ok).toBe(true);
  const inv = await issueInvoice({ actor: ctx.stockistUser, stockist: ctx.stockist, orderId });
  expect(inv.ok).toBe(true);
  return inv;
}

describe('fulfilment Wave 5 completeness', () => {
  beforeEach(async () => {
    await clearDb();
    await seedPlatform();
  });

  it('happy path: allocate → pack → invoice → dispatch → deliver → GRN', async () => {
    const ctx = await seedTradePair('h');
    await seedAcceptedOrder(ctx, 'ord-h');
    await packAndInvoice(ctx, 'ord-h');

    const dispatch = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-h',
      assigneeId: ctx.rider.id,
    });
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;

    const ofd = await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'OutForDelivery',
    });
    expect(ofd.ok).toBe(true);

    const delivered = await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'Delivered',
      receivedBy: 'Counter',
    });
    expect(delivered.ok).toBe(true);

    const order = (await db.orders.get('ord-h'))!;
    const grn = await recordGrn({
      actor: ctx.pharmacyUser,
      pharmacy: ctx.pharmacy,
      orderId: order.id,
      deliveryId: dispatch.data.id,
      received: order.lines.map((l) => ({ lineId: l.id, receivedQty: l.qty })),
    });
    expect(grn.ok).toBe(true);
    const invRow = await db.pharmacyInventory.where({ pharmacyId: ctx.pharmacy.id, productId: ctx.productId }).first();
    expect(invRow?.onHand).toBe(5);
    const movements = await db.inventoryMovements.where({ businessId: ctx.pharmacy.id, type: 'GRNIn' }).count();
    expect(movements).toBe(1);
  });

  it('roles: stockist DeliveryStaff execute assigned only; pharmacy DeliveryStaff denied GRN', async () => {
    const ctx = await seedTradePair('r');
    await seedAcceptedOrder(ctx, 'ord-r');
    await packAndInvoice(ctx, 'ord-r');
    const otherRider = await makeActor({
      id: 'u-other-r',
      businessId: ctx.stockist.id,
      role: 'DeliveryStaff',
      name: 'Other',
    });

    const deniedAlloc = await allocateOrder({ actor: ctx.rider, stockist: ctx.stockist, orderId: 'ord-r' });
    expect(deniedAlloc.ok).toBe(false);
    if (!deniedAlloc.ok) expect(deniedAlloc.code).toBe('PERM_DENIED');

    const dispatch = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-r',
      assigneeId: ctx.rider.id,
    });
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;

    const foreign = await updateDeliveryStatus({
      actor: otherRider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'OutForDelivery',
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe('DEL_ASSIGN');

    const own = await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'OutForDelivery',
    });
    expect(own.ok).toBe(true);

    await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'Delivered',
    });

    const order = (await db.orders.get('ord-r'))!;
    const phDsGrn = await recordGrn({
      actor: ctx.pharmacyRider,
      pharmacy: ctx.pharmacy,
      orderId: order.id,
      deliveryId: dispatch.data.id,
      received: order.lines.map((l) => ({ lineId: l.id, receivedQty: 1 })),
    });
    expect(phDsGrn.ok).toBe(false);
    if (!phDsGrn.ok) expect(phDsGrn.code).toBe('PERM_DENIED');
  });

  it('fails: incomplete override, dispatch without invoice, GRN short without reason, GRN before delivery', async () => {
    const ctx = await seedTradePair('f');
    const lineId = await seedAcceptedOrder(ctx, 'ord-f', 5);

    const under = await allocateOrder({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-f',
      overrides: { [lineId]: [{ batchId: ctx.batchId, qty: 2 }] },
    });
    expect(under.ok).toBe(false);
    if (!under.ok) expect(under.code).toBe('ALLOC_UNDER');

    await allocateOrder({ actor: ctx.stockistUser, stockist: ctx.stockist, orderId: 'ord-f' });
    await packOrder({ actor: ctx.stockistUser, stockist: ctx.stockist, orderId: 'ord-f' });

    const noInv = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-f',
    });
    expect(noInv.ok).toBe(false);
    if (!noInv.ok) expect(noInv.code).toBe('DEL_NO_INV');

    await issueInvoice({ actor: ctx.stockistUser, stockist: ctx.stockist, orderId: 'ord-f' });
    const dispatch = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-f',
      assigneeId: ctx.rider.id,
    });
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;

    const earlyGrn = await recordGrn({
      actor: ctx.pharmacyUser,
      pharmacy: ctx.pharmacy,
      orderId: 'ord-f',
      deliveryId: dispatch.data.id,
      received: [{ lineId, receivedQty: 1 }],
    });
    expect(earlyGrn.ok).toBe(false);
    if (!earlyGrn.ok) expect(earlyGrn.code).toBe('GRN_STATE');

    await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'OutForDelivery',
    });
    await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'Delivered',
    });

    const shortNoReason = await recordGrn({
      actor: ctx.pharmacyUser,
      pharmacy: ctx.pharmacy,
      orderId: 'ord-f',
      deliveryId: dispatch.data.id,
      received: [{ lineId, receivedQty: 2 }],
    });
    expect(shortNoReason.ok).toBe(false);
    if (!shortNoReason.ok) expect(shortNoReason.code).toBe('GRN_REASON');
  });

  it('edges: route inherits assignee; invalid route; past schedule; restock clears delivery for re-dispatch', async () => {
    const ctx = await seedTradePair('e');
    await seedAcceptedOrder(ctx, 'ord-e');
    await packAndInvoice(ctx, 'ord-e');

    const badRoute = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-e',
      routeId: 'missing-route',
    });
    expect(badRoute.ok).toBe(false);
    if (!badRoute.ok) expect(badRoute.code).toBe('DEL_ROUTE');

    const route = await upsertStockistRoute({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      name: 'East',
      pins: ['411001'],
      assigneeId: ctx.rider.id,
    });
    expect(route.ok).toBe(true);
    if (!route.ok) return;

    const dispatch = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-e',
      routeId: route.data.id,
    });
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;
    expect(dispatch.data.assignedTo).toBe(ctx.rider.id);
    expect(dispatch.data.status).toBe('Assigned');
    expect(dispatch.data.routeId).toBe(route.data.id);

    const past = await scheduleDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      scheduledDate: '2020-01-01',
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.code).toBe('DEL_DATE_PAST');

    const okDate = await scheduleDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      scheduledDate: localTodayKey(),
    });
    expect(okDate.ok).toBe(true);

    await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'OutForDelivery',
    });
    await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'Failed',
      failReason: 'Shop closed',
    });

    const restock = await returnFailedDeliveryToStockist({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
    });
    expect(restock.ok).toBe(true);
    const order = await db.orders.get('ord-e');
    expect(order?.status).toBe('Packed');
    expect(order?.deliveryId).toBeUndefined();

    const again = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-e',
      assigneeId: ctx.rider.id,
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      const batch = await db.batches.get(ctx.batchId);
      expect(batch?.onHand).toBe(95);
      expect(batch?.reserved).toBe(0);
    }
  });

  it('edges: assign validates staff; setRouteStops clears removed; deleteRoute clears routeId; bulk empty', async () => {
    const ctx = await seedTradePair('x');
    await seedAcceptedOrder(ctx, 'ord-x');
    await packAndInvoice(ctx, 'ord-x');
    const dispatch = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-x',
    });
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;

    const badAssignee = await assignDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      assigneeId: ctx.pharmacyUser.id,
    });
    expect(badAssignee.ok).toBe(false);
    if (!badAssignee.ok) expect(badAssignee.code).toBe('DEL_ASSIGNEE');

    const route = await upsertStockistRoute({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      name: 'West',
      pins: [],
      assigneeId: ctx.rider.id,
    });
    expect(route.ok).toBe(true);
    if (!route.ok) return;

    await setRouteStops({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      routeId: route.data.id,
      deliveryIds: [dispatch.data.id],
    });
    expect((await db.deliveries.get(dispatch.data.id))?.routeId).toBe(route.data.id);
    expect((await db.deliveries.get(dispatch.data.id))?.assignedTo).toBe(ctx.rider.id);

    await setRouteStops({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      routeId: route.data.id,
      deliveryIds: [],
    });
    expect((await db.deliveries.get(dispatch.data.id))?.routeId).toBeUndefined();

    await setRouteStops({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      routeId: route.data.id,
      deliveryIds: [dispatch.data.id],
    });
    const deleted = await deleteStockistRoute({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      id: route.data.id,
    });
    expect(deleted.ok).toBe(true);
    expect((await db.deliveries.get(dispatch.data.id))?.routeId).toBeUndefined();

    const emptyBulk = await bulkIssueInvoices({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderIds: [],
    });
    expect(emptyBulk.ok).toBe(false);
    if (!emptyBulk.ok) expect(emptyBulk.code).toBe('BULK_EMPTY');
  });

  it('empty/fail UX: double GRN caught up; fail reason required; DeliveryStaff cannot assign', async () => {
    const ctx = await seedTradePair('g');
    const lineId = await seedAcceptedOrder(ctx, 'ord-g', 4);
    await packAndInvoice(ctx, 'ord-g');
    const dispatch = await createAndDispatchDelivery({
      actor: ctx.stockistUser,
      stockist: ctx.stockist,
      orderId: 'ord-g',
      assigneeId: ctx.rider.id,
    });
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;

    const noReason = await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'Failed',
    });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.code).toBe('DEL_BAD_STATE');

    await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'OutForDelivery',
    });
    const failNoReason = await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'Failed',
    });
    expect(failNoReason.ok).toBe(false);
    if (!failNoReason.ok) expect(failNoReason.code).toBe('DEL_FAIL_REASON');

    await updateDeliveryStatus({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      status: 'Delivered',
    });

    const grn1 = await recordGrn({
      actor: ctx.pharmacyUser,
      pharmacy: ctx.pharmacy,
      orderId: 'ord-g',
      deliveryId: dispatch.data.id,
      received: [{ lineId, receivedQty: 4 }],
    });
    expect(grn1.ok).toBe(true);

    const grn2 = await recordGrn({
      actor: ctx.pharmacyUser,
      pharmacy: ctx.pharmacy,
      orderId: 'ord-g',
      deliveryId: dispatch.data.id,
      received: [{ lineId, receivedQty: 1 }],
    });
    expect(grn2.ok).toBe(false);
    if (!grn2.ok) expect(grn2.code).toBe('GRN_CAUGHT_UP');

    const staffAssign = await assignDelivery({
      actor: ctx.rider,
      stockist: ctx.stockist,
      deliveryId: dispatch.data.id,
      assigneeId: ctx.rider.id,
    });
    expect(staffAssign.ok).toBe(false);
    if (!staffAssign.ok) expect(staffAssign.code).toBe('PERM_DENIED');
  });
});

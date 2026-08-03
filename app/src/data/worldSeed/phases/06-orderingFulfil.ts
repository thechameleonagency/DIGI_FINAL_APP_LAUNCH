import type { Address, Order, Product } from '../../../domain/entities/types';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { db } from '../../db';
import {
  addOrIncrementCartLine,
  setCartLine,
  toggleWishlist,
} from '../../../services/catalogueService';
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
} from '../../../services/fulfilmentService';
import { setBatchStatus, stockIn } from '../../../services/inventoryService';
import {
  acceptOrder,
  cancelOrder,
  editOrderLines,
  placeOrder,
  recordManualOrder,
  rejectOrder,
} from '../../../services/orderService';
import { confirmQuickOrder } from '../../../services/quickOrderService';
import { setRouteStops, upsertStockistRoute } from '../../../services/routeService';
import {
  completeSmartOrderRun,
  generateSmartOrderSuggestions,
} from '../../../services/smartOrderService';
import { nowIso } from '../../../domain/utils/clock';
import { assertOk } from '../assert';
import { advanceBusinessDay, advanceDays } from '../chronology';
import {
  getWorldCtx,
  pharmacyByKey,
  stockistByKey,
  type TraderKey,
  type TraderParty,
} from '../context';

type Pair = { pharmacyKey: TraderKey; stockistKey: TraderKey };

const PAIRS: Pair[] = [
  { pharmacyKey: 'pharmacyA', stockistKey: 'stockistA' },
  { pharmacyKey: 'pharmacyA', stockistKey: 'stockistB' },
  { pharmacyKey: 'pharmacyB', stockistKey: 'stockistA' },
  { pharmacyKey: 'pharmacyB', stockistKey: 'stockistB' },
  { pharmacyKey: 'pharmacyC', stockistKey: 'stockistA' },
  { pharmacyKey: 'pharmacyC', stockistKey: 'stockistB' },
];

/** Outcome bands — rotated so UI queues stay populated. */
type Outcome =
  | 'happy'
  | 'partialAcceptHappy'
  | 'reject'
  | 'cancel'
  | 'freezePending'
  | 'freezeAccepted'
  | 'freezeAllocated'
  | 'freezePacked'
  | 'freezeDispatched'
  | 'partialDeliver'
  | 'failRedispatch'
  | 'editThenHappy';

const OUTCOMES: Outcome[] = [
  'happy',
  'partialAcceptHappy',
  'reject',
  'cancel',
  'freezePending',
  'freezeAccepted',
  'freezeAllocated',
  'freezePacked',
  'freezeDispatched',
  'partialDeliver',
  'failRedispatch',
  'editThenHappy',
];

async function deliveryAddress(pharmacy: TraderParty): Promise<Address> {
  const biz = (await db.businesses.get(pharmacy.business.id))!;
  const saved = biz.deliveryAddresses?.find((a) => a.isDefault) ?? biz.deliveryAddresses?.[0];
  if (saved) return saved;
  return {
    id: `addr-${biz.id}`,
    label: 'Business',
    line1: biz.address,
    city: biz.city,
    state: biz.state,
    pincode: biz.pincode,
    isDefault: true,
  };
}

async function activeProducts(stockistId: string): Promise<Product[]> {
  const ids = getWorldCtx().productIdsByStockist.get(stockistId) ?? [];
  const rows = await db.products.bulkGet(ids);
  return rows.filter((p): p is Product => !!p && p.status === 'Active');
}

async function quarantineNearExpiryBatches(stockist: TraderParty): Promise<void> {
  const today = localTodayKey();
  const batches = await db.batches.where('stockistId').equals(stockist.business.id).toArray();
  for (const batch of batches) {
    if (batch.status !== 'Available') continue;
    const exp = batch.expiryDate.slice(0, 10);
    // Keep only batches with >90 days life for fulfilment FEFO during long seed clock runs
    const expDate = new Date(`${exp}T12:00:00`);
    const todayDate = new Date(`${today}T12:00:00`);
    const days = Math.round((expDate.getTime() - todayDate.getTime()) / 86400000);
    if (days > 0 && days <= 90) {
      assertOk(
        `06-stock.quarantineNear.${batch.batchNumber}`,
        await setBatchStatus({
          actor: stockist.user,
          stockist: stockist.business,
          batchId: batch.id,
          status: 'Quarantined',
          reason: 'Near-expiry held aside during world-seed fulfilment window',
        }),
      );
    }
  }
}

async function topUpStock(stockist: TraderParty, tag: string): Promise<void> {
  const products = await activeProducts(stockist.business.id);
  const d = new Date(nowIso());
  d.setUTCDate(d.getUTCDate() + 500);
  const expiry = d.toISOString().slice(0, 10);
  for (let i = 0; i < products.length; i++) {
    const product = products[i]!;
    assertOk(
      `06-stock.topup.${tag}.${i}`,
      await stockIn({
        actor: stockist.user,
        stockist: stockist.business,
        productId: product.id,
        batchNumber: `${tag}-TOP-${i + 1}`,
        expiryDate: expiry,
        qty: 400,
        location: 'Seed-TopUp',
      }),
    );
  }
}

async function fillCart(params: {
  pharmacy: TraderParty;
  stockistId: string;
  products: Product[];
  seed: number;
  lineCount?: number;
}): Promise<void> {
  const n = params.lineCount ?? 2 + (params.seed % 2);
  for (let i = 0; i < n; i++) {
    const product = params.products[(params.seed * 3 + i * 11) % params.products.length]!;
    const qty = product.moq * (1 + (params.seed + i) % 2);
    if (i % 2 === 0) {
      assertOk(
        `06-cart.set.${params.seed}.${i}`,
        await setCartLine({
          actor: params.pharmacy.user,
          pharmacy: params.pharmacy.business,
          stockistId: params.stockistId,
          productId: product.id,
          qty,
        }),
      );
    } else {
      assertOk(
        `06-cart.inc.${params.seed}.${i}`,
        await addOrIncrementCartLine({
          actor: params.pharmacy.user,
          pharmacy: params.pharmacy.business,
          stockistId: params.stockistId,
          productId: product.id,
          qty: Math.max(product.moq, qty),
        }),
      );
    }
  }
}

async function placeFromCart(params: {
  pharmacy: TraderParty;
  stockistId: string;
  seed: number;
  notes?: string;
}): Promise<Order> {
  const addr = await deliveryAddress(params.pharmacy);
  return assertOk(
    `06-order.place.${params.seed}`,
    await placeOrder({
      actor: params.pharmacy.user,
      pharmacy: params.pharmacy.business,
      stockistId: params.stockistId,
      address: addr,
      notes: params.notes ?? `World seed order #${params.seed}`,
      idempotencyKey: makeIdempotencyKey(`world-ord-${params.seed}`, params.pharmacy.user.id),
    }),
  ).data;
}

async function acceptFull(stockist: TraderParty, orderId: string, step: string): Promise<Order> {
  return assertOk(step, await acceptOrder({ actor: stockist.user, stockist: stockist.business, orderId })).data;
}

async function acceptPartial(stockist: TraderParty, order: Order, step: string): Promise<Order> {
  const acceptedQtys: Record<string, number> = {};
  for (let i = 0; i < order.lines.length; i++) {
    const line = order.lines[i]!;
    acceptedQtys[line.id] = i === 0 ? Math.max(1, Math.floor(line.qty / 2)) : line.qty;
  }
  return assertOk(
    step,
    await acceptOrder({
      actor: stockist.user,
      stockist: stockist.business,
      orderId: order.id,
      acceptedQtys,
    }),
  ).data;
}

async function allocatePack(stockist: TraderParty, orderId: string, tag: string): Promise<void> {
  assertOk(
    `06-alloc.${tag}`,
    await allocateOrder({ actor: stockist.user, stockist: stockist.business, orderId }),
  );
  assertOk(`06-pack.${tag}`, await packOrder({ actor: stockist.user, stockist: stockist.business, orderId }));
}

async function invoiceIfNeeded(stockist: TraderParty, orderId: string, tag: string): Promise<void> {
  const order = await db.orders.get(orderId);
  if (order?.invoiceId) return;
  assertOk(`06-inv.${tag}`, await issueInvoice({ actor: stockist.user, stockist: stockist.business, orderId }));
}

async function dispatchAssigned(params: {
  stockist: TraderParty;
  orderId: string;
  routeId?: string;
  tag: string;
}): Promise<string> {
  const delivery = assertOk(
    `06-dispatch.${params.tag}`,
    await createAndDispatchDelivery({
      actor: params.stockist.user,
      stockist: params.stockist.business,
      orderId: params.orderId,
      assigneeId: params.stockist.delivery?.id,
      routeId: params.routeId,
      scheduledDate: localTodayKey(),
    }),
  ).data;
  if (!delivery.assignedTo && params.stockist.delivery) {
    assertOk(
      `06-assign.${params.tag}`,
      await assignDelivery({
        actor: params.stockist.user,
        stockist: params.stockist.business,
        deliveryId: delivery.id,
        assigneeId: params.stockist.delivery.id,
      }),
    );
  }
  return delivery.id;
}

async function riderToOutForDelivery(stockist: TraderParty, deliveryId: string, tag: string): Promise<void> {
  const rider = stockist.delivery;
  if (!rider) throw new Error(`[worldSeed:06] delivery staff missing for ${stockist.key}`);
  assertOk(
    `06-ofd.${tag}`,
    await updateDeliveryStatus({
      actor: rider,
      stockist: stockist.business,
      deliveryId,
      status: 'OutForDelivery',
    }),
  );
}

async function riderDeliver(params: {
  stockist: TraderParty;
  pharmacy: TraderParty;
  orderId: string;
  deliveryId: string;
  tag: string;
  partial?: boolean;
  grn?: boolean;
}): Promise<void> {
  const rider = params.stockist.delivery!;
  const delivery = (await db.deliveries.get(params.deliveryId))!;
  let deliveredQtys: Record<string, number> | undefined;
  if (params.partial) {
    deliveredQtys = {};
    for (let i = 0; i < delivery.lines.length; i++) {
      const line = delivery.lines[i]!;
      deliveredQtys[line.productId] = i === 0 ? Math.max(1, line.qty - 1) : line.qty;
    }
  }
  assertOk(
    `06-del.${params.tag}`,
    await updateDeliveryStatus({
      actor: rider,
      stockist: params.stockist.business,
      deliveryId: params.deliveryId,
      status: params.partial ? 'PartiallyDelivered' : 'Delivered',
      deliveredQtys,
      receivedBy: params.pharmacy.user.name,
    }),
  );

  if (params.grn !== false) {
    const order = (await db.orders.get(params.orderId))!;
    const freshDel = (await db.deliveries.get(params.deliveryId))!;
    assertOk(
      `06-grn.${params.tag}`,
      await recordGrn({
        actor: params.pharmacy.user,
        pharmacy: params.pharmacy.business,
        orderId: order.id,
        deliveryId: params.deliveryId,
        received: order.lines
          .map((l) => {
            const dl = freshDel.lines.find((x) => x.productId === l.productId);
            const qty = dl?.deliveredQty ?? 0;
            return qty > 0 ? { lineId: l.id, receivedQty: qty } : null;
          })
          .filter((x): x is { lineId: string; receivedQty: number } => !!x),
      }),
    );
  }
}

async function happyChain(params: {
  stockist: TraderParty;
  pharmacy: TraderParty;
  orderId: string;
  routeId?: string;
  tag: string;
  partial?: boolean;
}): Promise<void> {
  await allocatePack(params.stockist, params.orderId, params.tag);
  await invoiceIfNeeded(params.stockist, params.orderId, params.tag);
  advanceBusinessDay();
  const deliveryId = await dispatchAssigned({
    stockist: params.stockist,
    orderId: params.orderId,
    routeId: params.routeId,
    tag: params.tag,
  });
  advanceBusinessDay();
  await riderToOutForDelivery(params.stockist, deliveryId, params.tag);
  await riderDeliver({
    stockist: params.stockist,
    pharmacy: params.pharmacy,
    orderId: params.orderId,
    deliveryId,
    tag: params.tag,
    partial: params.partial,
    grn: true,
  });
}

async function ensureRoutes(): Promise<Map<string, string>> {
  const routes = new Map<string, string>();
  for (const stockist of getWorldCtx().stockists) {
    if (!stockist.delivery) continue;
    const pins = stockist.business.servicePins?.length
      ? stockist.business.servicePins
      : [stockist.business.pincode];
    const route = assertOk(
      `06-route.${stockist.key}`,
      await upsertStockistRoute({
        actor: stockist.user,
        stockist: stockist.business,
        name: `${stockist.business.city} Seed Route`,
        pins,
        assigneeId: stockist.delivery.id,
      }),
    ).data;
    routes.set(stockist.business.id, route.id);
  }
  return routes;
}

async function seedManualOrders(stockistA: TraderParty, products: Product[]): Promise<void> {
  const ctx = getWorldCtx();
  const managed = ctx.managedPharmacies.find((m) => m.stockistId === stockistA.business.id);
  if (!managed) return;

  for (let i = 0; i < 4; i++) {
    advanceBusinessDay();
    const lines = [0, 1].map((j) => {
      const p = products[(i * 3 + j) % products.length]!;
      return { productId: p.id, qty: p.moq * (1 + (i % 2)) };
    });
    const order = assertOk(
      `06-manual.managed.${i}`,
      await recordManualOrder({
        actor: stockistA.user,
        stockist: stockistA.business,
        managedPharmacyId: managed.id,
        lines,
        notes: `Managed offline manual #${i}`,
        idempotencyKey: makeIdempotencyKey(`world-manual-m-${i}`, stockistA.user.id),
      }),
    ).data;
    await acceptFull(stockistA, order.id, `06-manual.accept.${i}`);
    // Offline managed has no platform pharmacy actor — fulfil without GRN
    if (i < 2) {
      await allocatePack(stockistA, order.id, `manual-${i}`);
      await invoiceIfNeeded(stockistA, order.id, `manual-${i}`);
      const deliveryId = await dispatchAssigned({
        stockist: stockistA,
        orderId: order.id,
        tag: `manual-${i}`,
      });
      advanceBusinessDay();
      await riderToOutForDelivery(stockistA, deliveryId, `manual-${i}`);
      assertOk(
        `06-manual.deliver.${i}`,
        await updateDeliveryStatus({
          actor: stockistA.delivery!,
          stockist: stockistA.business,
          deliveryId,
          status: 'Delivered',
          receivedBy: managed.name,
        }),
      );
    } else if (i === 2) {
      await allocatePack(stockistA, order.id, `manual-freeze-${i}`);
    }
  }

  // Also record a couple of manual orders against a connected platform pharmacy
  const pharmacyA = pharmacyByKey('pharmacyA');
  for (let i = 0; i < 3; i++) {
    advanceBusinessDay();
    const p = products[(i + 5) % products.length]!;
    const order = assertOk(
      `06-manual.platform.${i}`,
      await recordManualOrder({
        actor: stockistA.user,
        stockist: stockistA.business,
        pharmacyId: pharmacyA.business.id,
        lines: [{ productId: p.id, qty: p.moq * 2 }],
        notes: `Stockist-recorded for Sharma Medicals #${i}`,
        idempotencyKey: makeIdempotencyKey(`world-manual-p-${i}`, stockistA.user.id),
      }),
    ).data;
    await acceptFull(stockistA, order.id, `06-manual.platform.accept.${i}`);
    if (i === 0) {
      await happyChain({
        stockist: stockistA,
        pharmacy: pharmacyA,
        orderId: order.id,
        tag: `manual-plat-${i}`,
      });
    } else if (i === 1) {
      await allocatePack(stockistA, order.id, `manual-plat-packed-${i}`);
      await invoiceIfNeeded(stockistA, order.id, `manual-plat-inv-${i}`);
    }
  }
}

async function seedWishlistQuickSmart(routes: Map<string, string>): Promise<void> {
  const pharmacyA = pharmacyByKey('pharmacyA');
  const stockistA = stockistByKey('stockistA');
  const products = await activeProducts(stockistA.business.id);
  if (products.length < 3) return;

  advanceBusinessDay();
  assertOk(
    '06-wishlist.toggle',
    await toggleWishlist({
      actor: pharmacyA.user,
      pharmacy: pharmacyA.business,
      productId: products[0]!.id,
      stockistId: stockistA.business.id,
    }),
  );
  assertOk(
    '06-wishlist.toggle2',
    await toggleWishlist({
      actor: pharmacyA.user,
      pharmacy: pharmacyA.business,
      productId: products[1]!.id,
      stockistId: stockistA.business.id,
    }),
  );

  const quickLines = products.slice(0, 3).map((p, i) => ({
    productId: p.id,
    stockistId: stockistA.business.id,
    qty: p.moq * (1 + (i % 2)),
    productName: p.name,
  }));
  assertOk(
    '06-quick.confirm',
    await confirmQuickOrder({
      actor: pharmacyA.user,
      pharmacy: pharmacyA.business,
      lines: quickLines,
    }),
  );
  const quickOrder = await placeFromCart({
    pharmacy: pharmacyA,
    stockistId: stockistA.business.id,
    seed: 9001,
    notes: 'Quick-order confirmed cart',
  });
  await acceptFull(stockistA, quickOrder.id, '06-quick.accept');
  await happyChain({
    stockist: stockistA,
    pharmacy: pharmacyA,
    orderId: quickOrder.id,
    routeId: routes.get(stockistA.business.id),
    tag: 'quick',
  });

  // Smart order — after GRNs, frequent/lowStock scopes may suggest lines
  advanceBusinessDay();
  const suggestions = assertOk(
    '06-smart.generate',
    await generateSmartOrderSuggestions({
      actor: pharmacyA.user,
      pharmacy: pharmacyA.business,
      scopes: ['frequent', 'lowStock', 'nearExpiry'],
    }),
  ).data;
  const accept = suggestions
    .filter((s) => !s.unavailableReason && s.selectedProductId && s.selectedStockistId)
    .slice(0, 4)
    .map((s) => ({
      key: s.key,
      qty: s.suggestedQty,
      stockistId: s.selectedStockistId!,
      productId: s.selectedProductId!,
    }));
  if (accept.length) {
    assertOk(
      '06-smart.complete',
      await completeSmartOrderRun({
        actor: pharmacyA.user,
        pharmacy: pharmacyA.business,
        scopes: ['frequent', 'lowStock', 'nearExpiry'],
        suggestions,
        accept,
      }),
    );
    // Place per stockist present in cart
    const stockistIds = [...new Set(accept.map((a) => a.stockistId))];
    for (let i = 0; i < stockistIds.length; i++) {
      const sid = stockistIds[i]!;
      const cart = await db.carts.where({ pharmacyId: pharmacyA.business.id, stockistId: sid }).first();
      if (!cart?.lines.length) continue;
      const order = await placeFromCart({
        pharmacy: pharmacyA,
        stockistId: sid,
        seed: 9100 + i,
        notes: 'Smart-order run',
      });
      const stockist = getWorldCtx().stockists.find((s) => s.business.id === sid)!;
      await acceptFull(stockist, order.id, `06-smart.accept.${i}`);
      await happyChain({
        stockist,
        pharmacy: pharmacyA,
        orderId: order.id,
        routeId: routes.get(sid),
        tag: `smart-${i}`,
      });
    }
  }
}

async function applyOutcome(params: {
  outcome: Outcome;
  order: Order;
  pharmacy: TraderParty;
  stockist: TraderParty;
  routeId?: string;
  seed: number;
  bulkPackedIds: string[];
}): Promise<void> {
  const { outcome, order, pharmacy, stockist, routeId, seed, bulkPackedIds } = params;
  const tag = `${seed}`;

  switch (outcome) {
    case 'reject':
      assertOk(
        `06-reject.${tag}`,
        await rejectOrder({
          actor: stockist.user,
          stockist: stockist.business,
          orderId: order.id,
          reason: 'Credit hold / assortment gap for this cycle',
        }),
      );
      return;
    case 'cancel':
      assertOk(
        `06-cancel.${tag}`,
        await cancelOrder({
          actor: pharmacy.user,
          business: pharmacy.business,
          orderId: order.id,
          reason: 'Pharmacy cancelled — duplicate cart',
        }),
      );
      return;
    case 'freezePending':
      return;
    case 'editThenHappy': {
      const qtys: Record<string, number> = {};
      for (const line of order.lines) {
        qtys[line.id] = Math.max(1, line.qty + 1);
      }
      assertOk(
        `06-edit.${tag}`,
        await editOrderLines({
          actor: pharmacy.user,
          business: pharmacy.business,
          orderId: order.id,
          qtys,
        }),
      );
      await acceptFull(stockist, order.id, `06-edit.accept.${tag}`);
      await happyChain({ stockist, pharmacy, orderId: order.id, routeId, tag: `edit-${tag}` });
      return;
    }
    case 'partialAcceptHappy': {
      await acceptPartial(stockist, order, `06-partialAccept.${tag}`);
      await happyChain({ stockist, pharmacy, orderId: order.id, routeId, tag: `pa-${tag}` });
      return;
    }
    case 'freezeAccepted':
      await acceptFull(stockist, order.id, `06-freezeAccepted.${tag}`);
      return;
    case 'freezeAllocated':
      await acceptFull(stockist, order.id, `06-freezeAlloc.accept.${tag}`);
      assertOk(
        `06-freezeAlloc.${tag}`,
        await allocateOrder({ actor: stockist.user, stockist: stockist.business, orderId: order.id }),
      );
      return;
    case 'freezePacked':
      await acceptFull(stockist, order.id, `06-freezePacked.accept.${tag}`);
      await allocatePack(stockist, order.id, `freezePacked-${tag}`);
      bulkPackedIds.push(order.id);
      return;
    case 'freezeDispatched': {
      await acceptFull(stockist, order.id, `06-freezeDisp.accept.${tag}`);
      await allocatePack(stockist, order.id, `freezeDisp-${tag}`);
      await invoiceIfNeeded(stockist, order.id, `freezeDisp-${tag}`);
      await dispatchAssigned({ stockist, orderId: order.id, routeId, tag: `freezeDisp-${tag}` });
      return;
    }
    case 'partialDeliver':
      await acceptFull(stockist, order.id, `06-partialDel.accept.${tag}`);
      await happyChain({
        stockist,
        pharmacy,
        orderId: order.id,
        routeId,
        tag: `pd-${tag}`,
        partial: true,
      });
      return;
    case 'failRedispatch': {
      await acceptFull(stockist, order.id, `06-fail.accept.${tag}`);
      await allocatePack(stockist, order.id, `fail-${tag}`);
      await invoiceIfNeeded(stockist, order.id, `fail-${tag}`);
      const deliveryId = await dispatchAssigned({
        stockist,
        orderId: order.id,
        routeId,
        tag: `fail-${tag}`,
      });
      advanceBusinessDay();
      await riderToOutForDelivery(stockist, deliveryId, `fail-${tag}`);
      assertOk(
        `06-fail.status.${tag}`,
        await updateDeliveryStatus({
          actor: stockist.delivery!,
          stockist: stockist.business,
          deliveryId,
          status: 'Failed',
          failReason: 'Shop closed — nobody available to receive',
        }),
      );
      advanceBusinessDay();
      assertOk(
        `06-fail.restock.${tag}`,
        await returnFailedDeliveryToStockist({
          actor: stockist.user,
          stockist: stockist.business,
          deliveryId,
        }),
      );
      advanceBusinessDay();
      const reDel = await dispatchAssigned({
        stockist,
        orderId: order.id,
        routeId,
        tag: `redispatch-${tag}`,
      });
      advanceBusinessDay();
      await riderToOutForDelivery(stockist, reDel, `redispatch-${tag}`);
      await riderDeliver({
        stockist,
        pharmacy,
        orderId: order.id,
        deliveryId: reDel,
        tag: `redispatch-${tag}`,
      });
      return;
    }
    case 'happy':
    default:
      await acceptFull(stockist, order.id, `06-happy.accept.${tag}`);
      await happyChain({ stockist, pharmacy, orderId: order.id, routeId, tag: `happy-${tag}` });
      return;
  }
}

/** Phase 6 — High-volume ordering & B2B fulfilment across ~40–60 clock days. */
export async function seedOrderingFulfilPhase(): Promise<void> {
  const routes = await ensureRoutes();
  const stockistA = stockistByKey('stockistA');
  const productsA = await activeProducts(stockistA.business.id);
  const bulkPackedByStockist = new Map<string, string[]>();

  // Ensure sellable depth for high-volume fulfilment
  for (const stockist of getWorldCtx().stockists) {
    await quarantineNearExpiryBatches(stockist);
    await topUpStock(stockist, stockist.key === 'stockistA' ? 'SA6' : 'SB6');
  }

  // ~12 waves × 6 pairs ≈ 72 platform orders, plus manuals / quick / smart
  let seed = 0;
  for (let wave = 0; wave < 12; wave++) {
    advanceBusinessDay();
    if (wave % 2 === 1) advanceDays(1);
    if (wave > 0 && wave % 4 === 0) {
      for (const stockist of getWorldCtx().stockists) {
        await topUpStock(stockist, `W${wave}-${stockist.key === 'stockistA' ? 'A' : 'B'}`);
      }
    }

    for (let pi = 0; pi < PAIRS.length; pi++) {
      const pair = PAIRS[pi]!;
      const pharmacy = pharmacyByKey(pair.pharmacyKey);
      const stockist = stockistByKey(pair.stockistKey);
      const products = await activeProducts(stockist.business.id);
      if (products.length < 3) continue;

      seed += 1;
      const outcome = OUTCOMES[(wave + pi) % OUTCOMES.length]!;

      await fillCart({
        pharmacy,
        stockistId: stockist.business.id,
        products,
        seed,
      });
      const order = await placeFromCart({
        pharmacy,
        stockistId: stockist.business.id,
        seed,
        notes: `Wave ${wave} · ${outcome}`,
      });

      const bulkPackedIds = bulkPackedByStockist.get(stockist.business.id) ?? [];
      bulkPackedByStockist.set(stockist.business.id, bulkPackedIds);

      await applyOutcome({
        outcome,
        order,
        pharmacy,
        stockist,
        routeId: routes.get(stockist.business.id),
        seed,
        bulkPackedIds,
      });

      // Occasional mid-wave clock tick so dates span months
      if (seed % 5 === 0) advanceBusinessDay();
    }
  }

  // Bulk-issue invoices for packed-but-uninvoiced queues
  for (const stockist of getWorldCtx().stockists) {
    const ids = bulkPackedByStockist.get(stockist.business.id) ?? [];
    if (ids.length < 2) continue;
    advanceBusinessDay();
    assertOk(
      `06-bulk.invoice.${stockist.key}`,
      await bulkIssueInvoices({
        actor: stockist.user,
        stockist: stockist.business,
        orderIds: ids.slice(0, Math.min(8, ids.length)),
      }),
    );
  }

  // Attach a few dispatched deliveries onto routes via setRouteStops
  for (const stockist of getWorldCtx().stockists) {
    const routeId = routes.get(stockist.business.id);
    if (!routeId) continue;
    const open = await db.deliveries
      .where('stockistId')
      .equals(stockist.business.id)
      .filter((d) => ['Assigned', 'Created', 'OutForDelivery'].includes(d.status))
      .toArray();
    if (!open.length) continue;
    assertOk(
      `06-route.stops.${stockist.key}`,
      await setRouteStops({
        actor: stockist.user,
        stockist: stockist.business,
        routeId,
        deliveryIds: open.slice(0, 5).map((d) => d.id),
      }),
    );
  }

  await seedManualOrders(stockistA, productsA);
  await seedWishlistQuickSmart(routes);

  // Extra volume burst on primary pair to push past 80 when feasible
  const pharmacyB = pharmacyByKey('pharmacyB');
  const productsB = await activeProducts(stockistA.business.id);
  for (let i = 0; i < 8; i++) {
    advanceBusinessDay();
    seed += 1;
    await fillCart({
      pharmacy: pharmacyB,
      stockistId: stockistA.business.id,
      products: productsB,
      seed,
      lineCount: 2,
    });
    const order = await placeFromCart({
      pharmacy: pharmacyB,
      stockistId: stockistA.business.id,
      seed,
      notes: `Volume burst #${i}`,
    });
    const outcome = OUTCOMES[i % OUTCOMES.length]!;
    const bulkPackedIds = bulkPackedByStockist.get(stockistA.business.id) ?? [];
    await applyOutcome({
      outcome,
      order,
      pharmacy: pharmacyB,
      stockist: stockistA,
      routeId: routes.get(stockistA.business.id),
      seed,
      bulkPackedIds,
    });
  }
}

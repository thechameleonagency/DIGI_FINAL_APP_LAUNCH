import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { defaultPlatformSettings } from '../data/seed';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { setCartLine, toggleWishlist } from './catalogueService';
import {
  acceptOrder,
  cancelOrder,
  editOrderLines,
  placeOrder,
  recordManualOrder,
  rejectOrder,
} from './orderService';
import { confirmQuickOrder, resolveQuickOrder } from './quickOrderService';
import { completeSmartOrderRun, generateSmartOrderSuggestions } from './smartOrderService';
import { nowIso } from '../domain/utils/clock';

const address = {
  id: 'addr-1',
  label: 'Store',
  line1: '1 Test Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
  isDefault: true,
};

async function seedPair(opts?: { creditLimit?: number }) {
  const phOwner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
  const pharmacy = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phOwner.id, name: 'CarePlus' });
  const stOwner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
  const stockist = await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stOwner.id, name: 'MedRoute' });
  await db.platformSettings.put(defaultPlatformSettings());
  await db.catalogues.put({
    id: 'cat-biz-st',
    stockistId: stockist.id,
    status: 'Active',
    updatedAt: nowIso(),
  });
  await makeProduct(stockist.id, 'prod-1');
  const ts = nowIso();
  await db.connections.add({
    id: 'conn-1',
    pharmacyId: pharmacy.id,
    stockistId: stockist.id,
    status: 'Active',
    creditLimit: opts?.creditLimit,
    requestedAt: ts,
    statusHistory: [{ from: 'Requested', to: 'Active', at: ts, actorId: stOwner.id }],
    createdAt: ts,
    updatedAt: ts,
  });
  return { phOwner, pharmacy, stOwner, stockist };
}

async function fillCart(qty = 5) {
  const actor = (await db.users.get('u-ph'))!;
  const pharmacy = (await db.businesses.get('biz-ph'))!;
  const res = await setCartLine({
    actor,
    pharmacy,
    stockistId: 'biz-st',
    productId: 'prod-1',
    qty,
  });
  expect(res.ok).toBe(true);
}

describe('Wave 4 — Ordering', () => {
  beforeEach(async () => {
    await clearDb();
  });

  describe('placeOrder', () => {
    it('happy path: Pending order, clears cart, prices with commission', async () => {
      await seedPair();
      await fillCart(5);
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const res = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'place-1',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.status).toBe('Pending');
      expect(res.data.source).toBe('Platform');
      expect(res.data.lines).toHaveLength(1);
      expect(res.data.lines[0].unitPrice).toBeGreaterThan(10);
      expect(await db.carts.count()).toBe(0);
      const n016 = await db.notifications.filter((n) => n.code === 'N-016' && n.businessId === 'biz-st').first();
      expect(n016).toBeTruthy();
    });

    it('blocks maintenanceMode', async () => {
      await seedPair();
      await fillCart();
      await db.platformSettings.put({ ...defaultPlatformSettings(), maintenanceMode: true });
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const res = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'place-maint',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('ORD_MAINTENANCE');
    });

    it('blocks inactive catalogue', async () => {
      await seedPair();
      await fillCart();
      await db.catalogues.update('cat-biz-st', { status: 'Maintenance' });
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const res = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'place-cat',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('ORD_CAT');
    });

    it('blocks credit limit overrun', async () => {
      await seedPair({ creditLimit: 50 });
      await fillCart(20);
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const res = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'place-credit',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('ORD_CREDIT_LIMIT');
    });

    it('idempotent key returns Duplicate', async () => {
      await seedPair();
      await fillCart();
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const first = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'place-dup',
      });
      expect(first.ok).toBe(true);
      await fillCart();
      const second = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'place-dup',
      });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.code).toBe('ORD_IDEMPOTENT');
    });

    it('DeliveryStaff cannot place', async () => {
      await seedPair();
      await fillCart();
      const delivery = await makeActor({ id: 'u-ds', businessId: 'biz-ph', role: 'DeliveryStaff' });
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const res = await placeOrder({
        actor: delivery,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'place-ds',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('PERM_DENIED');
    });
  });

  describe('accept / reject / cancel / edit', () => {
    async function placedOrder() {
      await seedPair({ creditLimit: 100_000 });
      await fillCart(5);
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const res = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'lifecycle-1',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('place failed');
      return res.data;
    }

    it('stockist accepts; DeliveryStaff cannot', async () => {
      const order = await placedOrder();
      const stOwner = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const delivery = await makeActor({ id: 'u-st-ds', businessId: 'biz-st', role: 'DeliveryStaff' });
      const denied = await acceptOrder({ actor: delivery, stockist, orderId: order.id });
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.code).toBe('PERM_DENIED');
      const okRes = await acceptOrder({ actor: stOwner, stockist, orderId: order.id });
      expect(okRes.ok).toBe(true);
      if (okRes.ok) expect(okRes.data.status).toBe('Accepted');
    });

    it('reject requires reason', async () => {
      const order = await placedOrder();
      const stOwner = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const empty = await rejectOrder({ actor: stOwner, stockist, orderId: order.id, reason: '   ' });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.code).toBe('ORD_REASON');
      const okRes = await rejectOrder({ actor: stOwner, stockist, orderId: order.id, reason: 'Out of stock' });
      expect(okRes.ok).toBe(true);
      if (okRes.ok) expect(okRes.data.status).toBe('Rejected');
    });

    it('cancel requires reason; pharmacy can cancel Pending', async () => {
      const order = await placedOrder();
      const phOwner = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const empty = await cancelOrder({ actor: phOwner, business: pharmacy, orderId: order.id, reason: '' });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.code).toBe('ORD_REASON');
      const okRes = await cancelOrder({
        actor: phOwner,
        business: pharmacy,
        orderId: order.id,
        reason: 'Changed mind',
      });
      expect(okRes.ok).toBe(true);
      if (okRes.ok) expect(okRes.data.status).toBe('Cancelled');
    });

    it('editOrderLines blocks credit overrun on qty increase', async () => {
      await seedPair({ creditLimit: 80 });
      await fillCart(1);
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const placed = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'edit-credit',
      });
      expect(placed.ok).toBe(true);
      if (!placed.ok) return;
      const lineId = placed.data.lines[0].id;
      const bump = await editOrderLines({
        actor,
        business: pharmacy,
        orderId: placed.data.id,
        qtys: { [lineId]: 50 },
      });
      expect(bump.ok).toBe(false);
      if (!bump.ok) expect(bump.code).toBe('ORD_CREDIT_LIMIT');
    });

    it('accept blocks when credit limit exceeded', async () => {
      await seedPair({ creditLimit: 100_000 });
      await fillCart(5);
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const placed = await placeOrder({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        address,
        idempotencyKey: 'accept-credit',
      });
      expect(placed.ok).toBe(true);
      if (!placed.ok) return;
      await db.connections.update('conn-1', { creditLimit: 1 });
      const stOwner = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const res = await acceptOrder({ actor: stOwner, stockist, orderId: placed.data.id });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('ORD_CREDIT_LIMIT');
    });
  });

  describe('recordManualOrder credit + gates', () => {
    it('blocks platform manual order over credit limit', async () => {
      await seedPair({ creditLimit: 20 });
      const stOwner = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const res = await recordManualOrder({
        actor: stOwner,
        stockist,
        pharmacyId: 'biz-ph',
        lines: [{ productId: 'prod-1', qty: 20 }],
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('ORD_CREDIT_LIMIT');
    });

    it('blocks inactive catalogue and DeliveryStaff', async () => {
      await seedPair();
      await db.catalogues.update('cat-biz-st', { status: 'Inactive' });
      const stOwner = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const cat = await recordManualOrder({
        actor: stOwner,
        stockist,
        pharmacyId: 'biz-ph',
        lines: [{ productId: 'prod-1', qty: 2 }],
      });
      expect(cat.ok).toBe(false);
      if (!cat.ok) expect(cat.code).toBe('ORD_CAT');

      await db.catalogues.update('cat-biz-st', { status: 'Active' });
      const delivery = await makeActor({ id: 'u-st-ds2', businessId: 'biz-st', role: 'DeliveryStaff' });
      const denied = await recordManualOrder({
        actor: delivery,
        stockist,
        pharmacyId: 'biz-ph',
        lines: [{ productId: 'prod-1', qty: 2 }],
      });
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.code).toBe('PERM_DENIED');
    });

    it('records offline managed pharmacy without platform credit gate', async () => {
      await seedPair();
      const stOwner = (await db.users.get('u-st'))!;
      const stockist = (await db.businesses.get('biz-st'))!;
      const ts = nowIso();
      await db.managedPharmacies.add({
        id: 'mp-1',
        stockistId: 'biz-st',
        name: 'Offline Chemist',
        phone: '9000011111',
        status: 'OfflineOnly',
        createdAt: ts,
        updatedAt: ts,
      });
      const res = await recordManualOrder({
        actor: stOwner,
        stockist,
        managedPharmacyId: 'mp-1',
        lines: [{ productId: 'prod-1', qty: 3 }],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.source).toBe('Manual');
      expect(res.data.managedPharmacyId).toBe('mp-1');
      expect(res.data.connectionId.startsWith('offline-')).toBe(true);
      expect(res.data.lines[0].commissionMode).toBe('OfflineManaged');
    });
  });

  describe('cart / wishlist / smart / quick gates', () => {
    it('setCartLine blocks maintenance and inactive catalogue; DeliveryStaff denied', async () => {
      await seedPair();
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      await db.platformSettings.put({ ...defaultPlatformSettings(), maintenanceMode: true });
      const maint = await setCartLine({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        productId: 'prod-1',
        qty: 2,
      });
      expect(maint.ok).toBe(false);
      if (!maint.ok) expect(maint.code).toBe('CART_MAINTENANCE');

      await db.platformSettings.put(defaultPlatformSettings());
      await db.catalogues.update('cat-biz-st', { status: 'Maintenance' });
      const cat = await setCartLine({
        actor,
        pharmacy,
        stockistId: 'biz-st',
        productId: 'prod-1',
        qty: 2,
      });
      expect(cat.ok).toBe(false);
      if (!cat.ok) expect(cat.code).toBe('CART_CAT');

      await db.catalogues.update('cat-biz-st', { status: 'Active' });
      const delivery = await makeActor({ id: 'u-ph-ds', businessId: 'biz-ph', role: 'DeliveryStaff' });
      const denied = await setCartLine({
        actor: delivery,
        pharmacy,
        stockistId: 'biz-st',
        productId: 'prod-1',
        qty: 2,
      });
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.code).toBe('PERM_DENIED');
    });

    it('toggleWishlist rejects inactive product; allows Active', async () => {
      await seedPair();
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      await db.products.update('prod-1', { status: 'Inactive' });
      const bad = await toggleWishlist({
        actor,
        pharmacy,
        productId: 'prod-1',
        stockistId: 'biz-st',
      });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.code).toBe('WISH_INACTIVE');
      await db.products.update('prod-1', { status: 'Active' });
      const okRes = await toggleWishlist({
        actor,
        pharmacy,
        productId: 'prod-1',
        stockistId: 'biz-st',
      });
      expect(okRes.ok).toBe(true);
      if (okRes.ok) expect(okRes.data).toBe(true);
    });

    it('smart + quick block under maintenanceMode', async () => {
      await seedPair();
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      await db.platformSettings.put({ ...defaultPlatformSettings(), maintenanceMode: true });
      const smart = await generateSmartOrderSuggestions({
        actor,
        pharmacy,
        scopes: ['lowStock'],
      });
      expect(smart.ok).toBe(false);
      if (!smart.ok) expect(smart.code).toBe('SMART_MAINTENANCE');

      const complete = await completeSmartOrderRun({
        actor,
        pharmacy,
        scopes: ['lowStock'],
        suggestions: [],
        accept: [],
      });
      expect(complete.ok).toBe(false);
      if (!complete.ok) expect(complete.code).toBe('SMART_MAINTENANCE');

      const quick = await resolveQuickOrder({ actor, pharmacy, text: 'Dolo 650 x 5' });
      expect(quick.ok).toBe(false);
      if (!quick.ok) expect(quick.code).toBe('QUICK_MAINTENANCE');

      const confirm = await confirmQuickOrder({
        actor,
        pharmacy,
        lines: [{ productId: 'prod-1', stockistId: 'biz-st', qty: 5, productName: 'Test Dolo' }],
      });
      expect(confirm.ok).toBe(false);
      if (!confirm.ok) expect(confirm.code).toBe('QUICK_MAINTENANCE');
    });

    it('quick order confirm adds cart lines when Active catalogue', async () => {
      await seedPair();
      const actor = (await db.users.get('u-ph'))!;
      const pharmacy = (await db.businesses.get('biz-ph'))!;
      const resolved = await resolveQuickOrder({ actor, pharmacy, text: 'Test Dolo x 5' });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      expect(resolved.data.matched.length).toBeGreaterThan(0);
      const confirm = await confirmQuickOrder({
        actor,
        pharmacy,
        lines: resolved.data.matched.map((m) => ({
          productId: m.productId,
          stockistId: m.stockistId,
          qty: m.qty,
          productName: m.productName,
        })),
      });
      expect(confirm.ok).toBe(true);
      if (confirm.ok) expect(confirm.data.added).toBeGreaterThan(0);
      const cart = await db.carts.where({ pharmacyId: 'biz-ph', stockistId: 'biz-st' }).first();
      expect(cart?.lines.length).toBeGreaterThan(0);
    });
  });
});

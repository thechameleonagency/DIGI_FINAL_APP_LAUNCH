import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { defaultPlatformSettings, ensureEmptyWorkspace } from '../data/seed';
import { canTransition } from '../domain/machines/transitions';
import {
  buildBillQrPayload,
  buildBillVerifyUrl,
  parseBillQrPayload,
} from '../domain/utils/billIntegrity';
import { resolveCatalogueSharePhase } from '../portals/public/catalogueShare';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { EmptyState } from '../ui/components/primitives';
import { assertCan } from './authService';
import { respondConnection } from './connectionService';
import { updateDeliveryStatus } from './fulfilmentService';
import { setCartLine } from './catalogueService';
import { issueInvoice } from './fulfilmentService';
import { acceptOrder, cancelOrder, placeOrder, rejectOrder } from './orderService';
import { reviewPayment, reviewReturn, voidInvoice } from './paymentService';
import {
  assignSaleToRoute,
  upsertDeliveryArea,
  upsertPharmacyRoute,
} from './pharmacyDeliveryService';
import { calcInclusiveOrderLine, priceForPlatformPharmacy } from './pricingService';
import { setRouteStops, upsertStockistRoute } from './routeService';
import { createCustomerSale } from './salesService';
import { runPolicyClock } from './supportService';
import { verifyBillPayload } from './verifyBillService';

const address = {
  id: 'addr-1',
  label: 'Store',
  line1: '1 Test Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
  isDefault: true,
};

async function seedTradePair() {
  const phOwner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Pharmacist' });
  const pharmacy = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phOwner.id, name: 'CarePlus' });
  const stOwner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
  const stockist = await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stOwner.id, name: 'MedRoute' });
  await makeActor({ id: 'u-ph-ds', businessId: pharmacy.id, role: 'DeliveryStaff', name: 'Ph Rider' });
  await makeActor({ id: 'u-st-ds', businessId: stockist.id, role: 'DeliveryStaff', name: 'St Rider' });
  await db.platformSettings.put(defaultPlatformSettings());
  await db.catalogues.put({
    id: 'cat-biz-st',
    stockistId: stockist.id,
    status: 'Active',
    updatedAt: new Date().toISOString(),
  });
  await makeProduct(stockist.id, 'prod-1');
  const ts = new Date().toISOString();
  await db.connections.add({
    id: 'conn-1',
    pharmacyId: pharmacy.id,
    stockistId: stockist.id,
    status: 'Active',
    creditLimit: 100000,
    requestedAt: ts,
    statusHistory: [{ from: 'Requested', to: 'Active', at: ts, actorId: stOwner.id }],
    createdAt: ts,
    updatedAt: ts,
  });
  return { phOwner, pharmacy, stOwner, stockist };
}

describe('Wave 11 — cross-feature matrices + final gate', () => {
  beforeEach(async () => {
    await clearDb();
  });

  describe('assertCan aligns with can() for six roles', () => {
    it('mirrors matrix for Pharmacist, DeliveryStaff×2, Stockist, SuperAdmin, SupportManager', async () => {
      const ph = await makeActor({ id: 'a-ph', businessId: 'b-ph', role: 'Pharmacist' });
      const phBiz = await makeBusiness({ id: 'b-ph', type: 'Pharmacy', ownerUserId: ph.id });
      const phDs = await makeActor({ id: 'a-ph-ds', businessId: phBiz.id, role: 'DeliveryStaff' });
      const st = await makeActor({ id: 'a-st', businessId: 'b-st', role: 'Stockist' });
      const stBiz = await makeBusiness({ id: 'b-st', type: 'Stockist', ownerUserId: st.id });
      const stDs = await makeActor({ id: 'a-st-ds', businessId: stBiz.id, role: 'DeliveryStaff' });
      const sa = await makeActor({ id: 'a-sa', businessId: 'b-pl', role: 'SuperAdmin' });
      const platform = await makeBusiness({ id: 'b-pl', type: 'Platform', ownerUserId: sa.id });
      const sm = await makeActor({ id: 'a-sm', businessId: platform.id, role: 'SupportManager' });

      expect(assertCan(ph, phBiz, 'order.place').allow).toBe(true);
      expect(assertCan(phDs, phBiz, 'order.place').allow).toBe(false);
      expect(assertCan(phDs, phBiz, 'delivery.update').allow).toBe(true);
      expect(assertCan(st, stBiz, 'order.accept').allow).toBe(true);
      expect(assertCan(stDs, stBiz, 'order.accept').allow).toBe(false);
      expect(assertCan(stDs, stBiz, 'delivery.update').allow).toBe(true);
      expect(assertCan(sa, platform, 'settings.manage').allow).toBe(true);
      expect(assertCan(sm, platform, 'settings.manage').allow).toBe(false);
      expect(assertCan(sm, platform, 'support.manage').allow).toBe(true);
      expect(assertCan(sa, platform, 'impersonate').allow).toBe(true);
      expect(assertCan(sm, platform, 'impersonate').allow).toBe(false);
    });
  });

  describe('machine illegal transitions forbidden in services', () => {
    it('order: reject Accepted; cancel Closed', async () => {
      expect(canTransition('order', 'Accepted', 'Rejected').ok).toBe(false);
      expect(canTransition('order', 'Closed', 'Cancelled').ok).toBe(false);

      const { stOwner, stockist, pharmacy } = await seedTradePair();
      const ts = new Date().toISOString();
      await db.orders.bulkAdd([
        {
          id: 'ord-acc',
          orderNo: 'ORD-ACC',
          pharmacyId: pharmacy.id,
          stockistId: stockist.id,
          connectionId: 'conn-1',
          status: 'Accepted',
          source: 'Platform',
          lines: [],
          subtotal: 0,
          taxTotal: 0,
          grandTotal: 0,
          deliveryAddress: address,
          placedBy: 'u-ph',
          placedAt: ts,
          idempotencyKey: 'k-acc',
          statusHistory: [],
          createdAt: ts,
          updatedAt: ts,
          version: 1,
        },
        {
          id: 'ord-closed',
          orderNo: 'ORD-CL',
          pharmacyId: pharmacy.id,
          stockistId: stockist.id,
          connectionId: 'conn-1',
          status: 'Closed',
          source: 'Platform',
          lines: [],
          subtotal: 0,
          taxTotal: 0,
          grandTotal: 0,
          deliveryAddress: address,
          placedBy: 'u-ph',
          placedAt: ts,
          idempotencyKey: 'k-cl',
          statusHistory: [],
          createdAt: ts,
          updatedAt: ts,
          version: 1,
        },
      ]);

      const rej = await rejectOrder({
        actor: stOwner,
        stockist,
        orderId: 'ord-acc',
        reason: 'too late',
      });
      expect(rej.ok).toBe(false);
      if (!rej.ok) expect(rej.code).toBe('ORD_BAD_STATE');

      const cancel = await cancelOrder({
        actor: stOwner,
        business: stockist,
        orderId: 'ord-closed',
        reason: 'reopen attempt',
      });
      expect(cancel.ok).toBe(false);
      if (!cancel.ok) expect(cancel.code).toBe('ORD_BAD_STATE');
    });

    it('delivery: Failed → Delivered blocked', async () => {
      expect(canTransition('delivery', 'Failed', 'Delivered').ok).toBe(false);
      const { stOwner, stockist, pharmacy } = await seedTradePair();
      const ts = new Date().toISOString();
      await db.orders.add({
        id: 'ord-d',
        orderNo: 'ORD-D',
        pharmacyId: pharmacy.id,
        stockistId: stockist.id,
        connectionId: 'conn-1',
        status: 'Dispatched',
        source: 'Platform',
        lines: [],
        subtotal: 0,
        taxTotal: 0,
        grandTotal: 0,
        deliveryAddress: address,
        placedBy: 'u-ph',
        placedAt: ts,
        idempotencyKey: 'k-d',
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
        version: 1,
        deliveryId: 'del-fail',
      });
      await db.deliveries.add({
        id: 'del-fail',
        deliveryNo: 'DEL-F',
        orderId: 'ord-d',
        stockistId: stockist.id,
        pharmacyId: pharmacy.id,
        status: 'Failed',
        assignedTo: 'u-st-ds',
        lines: [],
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
      });
      const res = await updateDeliveryStatus({
        actor: stOwner,
        stockist,
        deliveryId: 'del-fail',
        status: 'Delivered',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('DEL_BAD_STATE');
    });

    it('payment / return / connection / invoice illegal paths', async () => {
      expect(canTransition('payment', 'Approved', 'Rejected').ok).toBe(false);
      expect(canTransition('return', 'Closed', 'Approved').ok).toBe(false);
      expect(canTransition('connection', 'Active', 'Active').ok).toBe(false);
      expect(canTransition('invoice', 'Paid', 'Void').ok).toBe(false);

      const { stOwner, stockist, pharmacy } = await seedTradePair();
      const ts = new Date().toISOString();

      await db.payments.add({
        id: 'pay-1',
        paymentNo: 'PAY-1',
        pharmacyId: pharmacy.id,
        stockistId: stockist.id,
        amount: 100,
        status: 'Approved',
        method: 'UPI',
        allocations: [],
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      } as never);
      const pay = await reviewPayment({
        actor: stOwner,
        stockist,
        paymentId: 'pay-1',
        decision: 'Rejected',
        reason: 'nope',
      });
      expect(pay.ok).toBe(false);
      if (!pay.ok) expect(pay.code).toBe('PAY_BAD_STATE');

      await db.returns.add({
        id: 'ret-1',
        returnNo: 'RET-1',
        pharmacyId: pharmacy.id,
        stockistId: stockist.id,
        orderId: 'ord-x',
        invoiceId: 'inv-x',
        status: 'Closed',
        lines: [{ productId: 'prod-1', productName: 'X', sku: 'S', qty: 1, unitPrice: 10 }],
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      } as never);
      const ret = await reviewReturn({
        actor: stOwner,
        stockist,
        returnId: 'ret-1',
        decision: 'Approved',
      });
      expect(ret.ok).toBe(false);
      if (!ret.ok) expect(ret.code).toBe('RET_BAD_STATE');

      const conn = await respondConnection({
        actor: stOwner,
        stockist,
        connectionId: 'conn-1',
        decision: 'Active',
      });
      expect(conn.ok).toBe(false);
      if (!conn.ok) expect(conn.code).toBe('CONN_BAD_STATE');

      await db.invoices.add({
        id: 'inv-paid',
        invoiceNo: 'INV-PAID',
        orderId: 'ord-x',
        stockistId: stockist.id,
        pharmacyId: pharmacy.id,
        status: 'Paid',
        lines: [],
        subtotal: 100,
        taxTotal: 0,
        roundOff: 0,
        grandTotal: 100,
        outstanding: 0,
        paidAmount: 100,
        creditApplied: 0,
        issuedAt: ts,
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      });
      const voided = await voidInvoice({
        actor: stOwner,
        stockist,
        invoiceId: 'inv-paid',
        reason: 'oops',
      });
      expect(voided.ok).toBe(false);
      if (!voided.ok) expect(voided.code).toBe('INV_VOID_STATE');
    });
  });

  describe('policy clock / overdue smoke', () => {
    it('marks overdue invoice and dedupes N-028', async () => {
      const owner = await makeActor({ id: 'ph-owner', businessId: 'biz-ph', role: 'Pharmacist' });
      await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id, name: 'Care' });
      await db.platformSettings.put(defaultPlatformSettings());
      const past = new Date(Date.now() - 86400000 * 3).toISOString();
      await db.invoices.put({
        id: 'inv-od',
        invoiceNo: 'INV-OD',
        orderId: 'o1',
        stockistId: 'biz-st',
        pharmacyId: 'biz-ph',
        status: 'Issued',
        lines: [],
        subtotal: 100,
        taxTotal: 0,
        roundOff: 0,
        grandTotal: 100,
        outstanding: 100,
        paidAmount: 0,
        creditApplied: 0,
        issuedAt: past,
        dueDate: past,
        statusHistory: [],
        createdAt: past,
        updatedAt: past,
        version: 1,
      });
      await runPolicyClock();
      await runPolicyClock();
      expect((await db.invoices.get('inv-od'))?.status).toBe('Overdue');
      const n028 = (await db.notifications.toArray()).filter((n) => n.code === 'N-028' && n.entityId === 'inv-od');
      expect(n028).toHaveLength(1);
    });
  });

  describe('pricing / commission on order path', () => {
    it('placeOrder unitPrice and commission match pricingService; invoice reuses order unitPrice', async () => {
      const { phOwner, pharmacy, stOwner, stockist } = await seedTradePair();
      const product = (await db.products.get('prod-1'))!;
      const settings = await db.platformSettings.get('platform');
      const priced = priceForPlatformPharmacy(product, settings);
      const money = calcInclusiveOrderLine(priced, 10, product.gstPercent);

      await setCartLine({
        actor: phOwner,
        pharmacy,
        stockistId: stockist.id,
        productId: product.id,
        qty: 10,
      });
      const placed = await placeOrder({
        actor: phOwner,
        pharmacy,
        stockistId: stockist.id,
        address,
        idempotencyKey: 'w11-price',
      });
      expect(placed.ok).toBe(true);
      if (!placed.ok) return;
      const line = placed.data.lines[0];
      expect(line.unitPrice).toBe(money.unitPrice);
      expect(line.commissionAmount).toBe(money.commissionAmount);
      expect(line.commissionMode).toBe('PlatformGeneric');
      expect(line.basePtr).toBe(10);

      // Simulate packed billable qty and issue invoice — unitPrice must carry through
      await db.orders.update(placed.data.id, {
        status: 'Packed',
        lines: placed.data.lines.map((l) => ({
          ...l,
          acceptedQty: l.qty,
          allocatedQty: l.qty,
          packedQty: l.qty,
        })),
      });
      const inv = await issueInvoice({ actor: stOwner, stockist, orderId: placed.data.id });
      expect(inv.ok).toBe(true);
      if (!inv.ok) return;
      const invLine = inv.data.lines.find((l) => l.productId === product.id)!;
      expect(invLine.unitPrice).toBe(line.unitPrice);
      expect(inv.data.grandTotal).toBeGreaterThan(0);
    });
  });

  describe('bill QR public verifyBillPayload round-trip', () => {
    it('buildBillQrPayload → verify URL → parse → Genuine', async () => {
      await seedTradePair();
      const ts = '2026-01-15T10:00:00.000Z';
      await db.invoices.add({
        id: 'inv-qr',
        invoiceNo: 'INV-QR',
        orderId: 'ord-1',
        stockistId: 'biz-st',
        pharmacyId: 'biz-ph',
        status: 'Issued',
        lines: [],
        subtotal: 100,
        taxTotal: 12,
        roundOff: 0,
        grandTotal: 112,
        outstanding: 112,
        paidAmount: 0,
        creditApplied: 0,
        issuedAt: ts,
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      });
      const inv = (await db.invoices.get('inv-qr'))!;
      const payload = buildBillQrPayload({ invoice: inv, stockistName: 'MedRoute', pharmacyName: 'CarePlus' });
      const url = buildBillVerifyUrl(payload, 'https://digi.local');
      const parsed = parseBillQrPayload(url);
      expect(parsed.ok).toBe(true);
      const res = await verifyBillPayload(url);
      expect(res.outcome).toBe('Genuine');
      if (res.outcome === 'Genuine') {
        expect(res.summary.invoiceNo).toBe('INV-QR');
        expect(res.summary.grandTotal).toBe(112);
      }
    });
  });

  describe('maintenance / suspend / unverified trade gates', () => {
    it('blocks placeOrder under maintenance, suspend, and unverified', async () => {
      const { phOwner, pharmacy, stockist } = await seedTradePair();
      await setCartLine({
        actor: phOwner,
        pharmacy,
        stockistId: stockist.id,
        productId: 'prod-1',
        qty: 2,
      });

      await db.platformSettings.put({ ...defaultPlatformSettings(), maintenanceMode: true });
      const maint = await placeOrder({
        actor: phOwner,
        pharmacy,
        stockistId: stockist.id,
        address,
        idempotencyKey: 'w11-maint',
      });
      expect(maint.ok).toBe(false);
      if (!maint.ok) expect(maint.code).toBe('ORD_MAINTENANCE');

      await db.platformSettings.put(defaultPlatformSettings());
      const suspended = { ...pharmacy, accountStatus: 'Suspended' as const };
      const susp = await placeOrder({
        actor: phOwner,
        pharmacy: suspended,
        stockistId: stockist.id,
        address,
        idempotencyKey: 'w11-susp',
      });
      // assertCan runs first — suspended trade is PERM_DENIED (ORD_PHARM_SUSP is defense-in-depth)
      expect(susp.ok).toBe(false);
      if (!susp.ok) expect(susp.code).toBe('PERM_DENIED');

      const unverified = { ...pharmacy, verificationStatus: 'Submitted' as const };
      const unv = await placeOrder({
        actor: phOwner,
        pharmacy: unverified,
        stockistId: stockist.id,
        address,
        idempotencyKey: 'w11-unv',
      });
      expect(unv.ok).toBe(false);
      if (!unv.ok) expect(unv.code).toBe('PERM_DENIED');

      // assertCan also denies trade for suspended/unverified (UI gate)
      expect(assertCan(phOwner, suspended, 'order.place').allow).toBe(false);
      expect(assertCan(phOwner, unverified, 'order.place').allow).toBe(false);
    });
  });

  describe('dual-delivery isolation', () => {
    it('pharmacyDeliveryService does not touch stockist deliveries/routes; routeService leaves pharmacy routes/sales alone', async () => {
      const { phOwner, pharmacy, stOwner, stockist } = await seedTradePair();
      await db.pharmacyInventory.add({
        id: 'inv-1',
        pharmacyId: pharmacy.id,
        productId: 'prod-1',
        productName: 'Dolo 650',
        expiryDate: '2028-01-01',
        onHand: 20,
        updatedAt: new Date().toISOString(),
      });
      const ts = new Date().toISOString();
      await db.deliveries.add({
        id: 'del-b2b',
        deliveryNo: 'DEL-B2B',
        orderId: 'ord-b2b',
        stockistId: stockist.id,
        pharmacyId: pharmacy.id,
        status: 'Created',
        lines: [],
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
      });
      await db.orders.add({
        id: 'ord-b2b',
        orderNo: 'ORD-B2B',
        pharmacyId: pharmacy.id,
        stockistId: stockist.id,
        connectionId: 'conn-1',
        status: 'Dispatched',
        source: 'Platform',
        lines: [],
        subtotal: 0,
        taxTotal: 0,
        grandTotal: 0,
        deliveryAddress: address,
        placedBy: phOwner.id,
        placedAt: ts,
        idempotencyKey: 'k-b2b',
        statusHistory: [],
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      });

      const area = await upsertDeliveryArea({ actor: phOwner, pharmacy, name: 'North', pins: ['411001'] });
      expect(area.ok).toBe(true);
      if (!area.ok) return;
      const phRoute = await upsertPharmacyRoute({
        actor: phOwner,
        pharmacy,
        name: 'Morning',
        areaId: area.data.id,
      });
      expect(phRoute.ok).toBe(true);
      if (!phRoute.ok) return;
      const sale = await createCustomerSale({
        actor: phOwner,
        pharmacy,
        customerName: 'Asha',
        paymentMode: 'Cash',
        homeDelivery: true,
        address: '12 MG Road',
        lines: [{ inventoryId: 'inv-1', qty: 1, unitPrice: 10 }],
      });
      expect(sale.ok).toBe(true);
      if (!sale.ok) return;
      await assignSaleToRoute({
        actor: phOwner,
        pharmacy,
        saleId: sale.data.id,
        routeId: phRoute.data.id,
      });

      // Snapshot B2B side before pharmacy ops already done; ensure still untouched
      expect(await db.deliveries.count()).toBe(1);
      expect((await db.deliveries.get('del-b2b'))?.status).toBe('Created');
      expect(await db.stockistRoutes.count()).toBe(0);

      const stRoute = await upsertStockistRoute({ actor: stOwner, stockist, name: 'East', pins: ['411001'] });
      expect(stRoute.ok).toBe(true);
      if (!stRoute.ok) return;
      await setRouteStops({
        actor: stOwner,
        stockist,
        routeId: stRoute.data.id,
        deliveryIds: ['del-b2b'],
      });

      // Pharmacy retail entities untouched by stockist route ops
      expect((await db.pharmacyRoutes.get(phRoute.data.id))?.stops.some((s) => s.saleId === sale.data.id)).toBe(true);
      expect((await db.customerSales.get(sale.data.id))?.deliveryStatus).toBe('Assigned');
      expect((await db.customerSales.get(sale.data.id))?.routeId).toBe(phRoute.data.id);

      // Cross-entity bleed: pharmacy route id is not a stockist delivery; stockist stop uses delivery id only
      expect((await db.deliveries.get('del-b2b'))?.routeId).toBe(stRoute.data.id);
      expect((await db.deliveries.get(phRoute.data.id))).toBeUndefined();
      expect((await db.pharmacyRoutes.get(stRoute.data.id))).toBeUndefined();
      expect((await db.stockistRoutes.get(phRoute.data.id))).toBeUndefined();
    });
  });

  describe('empty-state CTAs + public surfaces', () => {
    it('ensureEmptyWorkspace leaves zero trade; EmptyState with CTA action does not throw', async () => {
      await ensureEmptyWorkspace();
      expect(await db.users.count()).toBe(0);
      expect(await db.orders.count()).toBe(0);
      expect(await db.invoices.count()).toBe(0);
      expect(await db.businesses.count()).toBe(0);

      expect(() =>
        createElement(EmptyState, {
          title: 'No connections yet',
          description: 'Find stockists to start ordering.',
          action: createElement('a', { href: '/pharmacy/connections' }, 'Find and connect'),
        }),
      ).not.toThrow();
      const el = createElement(EmptyState, {
        title: 'No orders',
        description: 'Buy medicines to place your first PO.',
        action: createElement('a', { href: '/pharmacy/buy' }, 'Browse catalogue'),
      });
      expect(el.type).toBe(EmptyState);
      expect(el.props.action).toBeTruthy();
    });

    it('catalogue-share phases + verify-bill NotFound on empty workspace', async () => {
      await ensureEmptyWorkspace();
      const stockist = {
        id: 's1',
        type: 'Stockist' as const,
        name: 'Share',
        accountStatus: 'Active' as const,
        city: 'Pune',
        state: 'MH',
      };
      expect(
        resolveCatalogueSharePhase({
          stockist: stockist as never,
          catalogue: { id: 'c1', stockistId: 's1', status: 'Active' } as never,
          products: [],
        }).kind,
      ).toBe('empty');
      expect(
        resolveCatalogueSharePhase({
          stockist: { ...stockist, accountStatus: 'Suspended' } as never,
          catalogue: { id: 'c1', stockistId: 's1', status: 'Active' } as never,
          products: [{ id: 'p1', status: 'Active' } as never],
        }),
      ).toEqual({ kind: 'unavailable', reason: 'suspended' });

      const miss = await verifyBillPayload(
        JSON.stringify({
          invoiceNo: 'INV-NONE',
          stockistName: 'X',
          pharmacyName: 'Y',
          grandTotal: 1,
          issuedAt: '2026-01-01',
          integrity: 'deadbeef',
          stockistId: 'x',
          pharmacyId: 'y',
        }),
      );
      expect(miss.outcome).toBe('NotFound');
    });
  });

  it('acceptOrder from Pending still allowed (sanity happy path for matrix)', async () => {
    const { phOwner, pharmacy, stOwner, stockist } = await seedTradePair();
    await setCartLine({
      actor: phOwner,
      pharmacy,
      stockistId: stockist.id,
      productId: 'prod-1',
      qty: 3,
    });
    const placed = await placeOrder({
      actor: phOwner,
      pharmacy,
      stockistId: stockist.id,
      address,
      idempotencyKey: 'w11-accept',
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const acc = await acceptOrder({ actor: stOwner, stockist, orderId: placed.data.id });
    expect(acc.ok).toBe(true);
    if (acc.ok) expect(acc.data.status).toBe('Accepted');
  });
});

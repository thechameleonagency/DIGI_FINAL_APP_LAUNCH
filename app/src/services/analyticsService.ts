import type { Invoice, Order, Payment, ReturnRequest } from '../domain/entities/types';
import { invoiceOutstanding, pharmacyOutstanding, stockistReceivables } from '../domain/calc';
import { roundMoney } from '../domain/utils/money';
import { db } from '../data/db';

export interface KpiDrill {
  id: string;
  label: string;
  value: number | string;
  href?: string;
  meta?: string;
}

export interface AnalyticsBundle {
  calculatedAt: string;
  stale: boolean;
  kpis: { key: string; label: string; value: number; format: 'money' | 'number' | 'percent'; drill: KpiDrill[] }[];
  series: { key: string; label: string; points: { period: string; value: number }[] }[];
  outstandingCheck: { dashboard: number; invoiceSum: number; matches: boolean };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

function seriesFromOrders(orders: Order[], days = 14): { period: string; value: number }[] {
  const keys = lastNDays(days);
  const map = new Map(keys.map((k) => [k, 0]));
  for (const o of orders) {
    const k = dayKey(o.placedAt);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + o.grandTotal);
  }
  return keys.map((period) => ({ period: period.slice(5), value: roundMoney(map.get(period) ?? 0) }));
}

export async function pharmacyAnalytics(pharmacyId: string): Promise<AnalyticsBundle> {
  const [orders, invoices, payments, returns, connections] = await Promise.all([
    db.orders.where('pharmacyId').equals(pharmacyId).toArray(),
    db.invoices.where('pharmacyId').equals(pharmacyId).toArray(),
    db.payments.where('pharmacyId').equals(pharmacyId).toArray(),
    db.returns.where('pharmacyId').equals(pharmacyId).toArray(),
    db.connections.where('pharmacyId').equals(pharmacyId).toArray(),
  ]);

  const outstanding = pharmacyOutstanding(invoices, pharmacyId);
  const invoiceSum = roundMoney(invoices.filter((i) => i.status !== 'Void').reduce((s, i) => s + invoiceOutstanding(i), 0));
  const openOrders = orders.filter((o) => !['Delivered', 'Closed', 'Cancelled', 'Rejected'].includes(o.status));
  const overdue = invoices.filter((i) => i.status === 'Overdue' || (i.dueDate && new Date(i.dueDate) < new Date() && invoiceOutstanding(i) > 0));
  const paid = payments.filter((p) => p.status === 'Approved').reduce((s, p) => s + p.amount, 0);
  const delivered = orders.filter((o) => o.status === 'Delivered' || o.status === 'Closed');
  const fillRate = orders.length ? Math.round((delivered.length / orders.length) * 100) : 0;

  return {
    calculatedAt: new Date().toISOString(),
    stale: false,
    outstandingCheck: { dashboard: outstanding, invoiceSum, matches: Math.abs(outstanding - invoiceSum) < 0.01 },
    series: [
      { key: 'purchasing', label: 'Purchasing (14d)', points: seriesFromOrders(orders) },
    ],
    kpis: [
      {
        key: 'outstanding',
        label: 'Outstanding payables',
        value: outstanding,
        format: 'money',
        drill: invoices
          .filter((i) => invoiceOutstanding(i) > 0)
          .map((i) => ({
            id: i.id,
            label: i.invoiceNo,
            value: invoiceOutstanding(i),
            href: '/pharmacy/payments',
            meta: i.status,
          })),
      },
      {
        key: 'openOrders',
        label: 'Open orders',
        value: openOrders.length,
        format: 'number',
        drill: openOrders.map((o) => ({
          id: o.id,
          label: o.orderNo,
          value: o.grandTotal,
          href: `/pharmacy/orders/${o.orderNo}`,
          meta: o.status,
        })),
      },
      {
        key: 'overdue',
        label: 'Overdue invoices',
        value: overdue.length,
        format: 'number',
        drill: overdue.map((i) => ({
          id: i.id,
          label: i.invoiceNo,
          value: invoiceOutstanding(i),
          href: '/pharmacy/payments',
          meta: i.dueDate,
        })),
      },
      {
        key: 'paid',
        label: 'Approved payments',
        value: paid,
        format: 'money',
        drill: payments
          .filter((p) => p.status === 'Approved')
          .map((p) => ({ id: p.id, label: p.paymentNo, value: p.amount, href: '/pharmacy/payments', meta: p.method })),
      },
      {
        key: 'fillRate',
        label: 'Delivery completion %',
        value: fillRate,
        format: 'percent',
        drill: delivered.map((o) => ({
          id: o.id,
          label: o.orderNo,
          value: o.grandTotal,
          href: `/pharmacy/orders/${o.orderNo}`,
          meta: o.status,
        })),
      },
      {
        key: 'returns',
        label: 'Returns raised',
        value: returns.length,
        format: 'number',
        drill: returns.map((r) => ({
          id: r.id,
          label: r.returnNo,
          value: r.lines.reduce((s, l) => s + l.qty, 0),
          href: '/pharmacy/returns',
          meta: r.status,
        })),
      },
      {
        key: 'connections',
        label: 'Active connections',
        value: connections.filter((c) => c.status === 'Active').length,
        format: 'number',
        drill: connections.map((c) => ({
          id: c.id,
          label: c.stockistId,
          value: c.status,
          href: '/pharmacy/connections',
          meta: c.status,
        })),
      },
    ],
  };
}

export async function stockistAnalytics(stockistId: string): Promise<AnalyticsBundle> {
  const [orders, invoices, payments, returns, products, batches] = await Promise.all([
    db.orders.where('stockistId').equals(stockistId).toArray(),
    db.invoices.where('stockistId').equals(stockistId).toArray(),
    db.payments.where('stockistId').equals(stockistId).toArray(),
    db.returns.where('stockistId').equals(stockistId).toArray(),
    db.products.where('stockistId').equals(stockistId).toArray(),
    db.batches.where('stockistId').equals(stockistId).toArray(),
  ]);

  const receivables = stockistReceivables(invoices, stockistId);
  const invoiceSum = roundMoney(invoices.filter((i) => i.status !== 'Void').reduce((s, i) => s + invoiceOutstanding(i), 0));
  const pending = orders.filter((o) => o.status === 'Pending');
  const fulfilment = orders.filter((o) => ['Accepted', 'Allocated', 'Packed', 'Dispatched'].includes(o.status));
  const payQueue = payments.filter((p) => ['Submitted', 'UnderReview', 'OnHold'].includes(p.status));
  const gmv = orders.reduce((s, o) => s + o.grandTotal, 0);
  const lowStock = products.filter((p) => {
    const avail = batches.filter((b) => b.productId === p.id && b.status === 'Available').reduce((s, b) => s + Math.max(0, b.onHand - b.reserved), 0);
    return avail <= 10;
  });

  return {
    calculatedAt: new Date().toISOString(),
    stale: false,
    outstandingCheck: { dashboard: receivables, invoiceSum, matches: Math.abs(receivables - invoiceSum) < 0.01 },
    series: [{ key: 'sales', label: 'Sales (14d)', points: seriesFromOrders(orders) }],
    kpis: [
      {
        key: 'receivables',
        label: 'Receivables',
        value: receivables,
        format: 'money',
        drill: invoices
          .filter((i) => invoiceOutstanding(i) > 0)
          .map((i) => ({ id: i.id, label: i.invoiceNo, value: invoiceOutstanding(i), href: '/stockist/payments', meta: i.status })),
      },
      {
        key: 'pending',
        label: 'Pending orders',
        value: pending.length,
        format: 'number',
        drill: pending.map((o) => ({
          id: o.id,
          label: o.orderNo,
          value: o.grandTotal,
          href: `/stockist/orders/${o.orderNo}`,
          meta: o.status,
        })),
      },
      {
        key: 'fulfilment',
        label: 'In fulfilment',
        value: fulfilment.length,
        format: 'number',
        drill: fulfilment.map((o) => ({
          id: o.id,
          label: o.orderNo,
          value: o.grandTotal,
          href: `/stockist/orders/${o.orderNo}`,
          meta: o.status,
        })),
      },
      {
        key: 'payQueue',
        label: 'Payments to review',
        value: payQueue.length,
        format: 'number',
        drill: payQueue.map((p) => ({
          id: p.id,
          label: p.paymentNo,
          value: p.amount,
          href: '/stockist/payments',
          meta: p.status,
        })),
      },
      {
        key: 'gmv',
        label: 'Order GMV',
        value: gmv,
        format: 'money',
        drill: orders.slice(0, 50).map((o) => ({
          id: o.id,
          label: o.orderNo,
          value: o.grandTotal,
          href: `/stockist/orders/${o.orderNo}`,
          meta: o.status,
        })),
      },
      {
        key: 'returns',
        label: 'Open returns',
        value: returns.filter((r) => !['Closed', 'Rejected', 'Cancelled'].includes(r.status)).length,
        format: 'number',
        drill: returns.map((r: ReturnRequest) => ({
          id: r.id,
          label: r.returnNo,
          value: r.lines.length,
          href: '/stockist/returns',
          meta: r.status,
        })),
      },
      {
        key: 'lowStock',
        label: 'Low stock SKUs',
        value: lowStock.length,
        format: 'number',
        drill: lowStock.map((p) => ({ id: p.id, label: p.name, value: p.sku, href: '/stockist/inventory', meta: p.sku })),
      },
    ],
  };
}

export async function platformAnalytics(): Promise<AnalyticsBundle> {
  const [businesses, connections, orders, invoices, tickets, verifications] = await Promise.all([
    db.businesses.toArray(),
    db.connections.toArray(),
    db.orders.toArray(),
    db.invoices.toArray(),
    db.supportTickets.toArray(),
    db.verifications.toArray(),
  ]);

  const traders = businesses.filter((b) => b.type !== 'Platform');
  const gmv = orders.reduce((s, o) => s + o.grandTotal, 0);
  const outstanding = roundMoney(invoices.filter((i) => i.status !== 'Void').reduce((s, i) => s + invoiceOutstanding(i), 0));
  const pendingVer = verifications.filter((v) => ['Submitted', 'UnderReview', 'DocumentsRequested'].includes(v.status));
  const openTickets = tickets.filter((t) => ['Open', 'InProgress', 'Reopened', 'WaitingOnUser'].includes(t.status));

  return {
    calculatedAt: new Date().toISOString(),
    stale: false,
    outstandingCheck: { dashboard: outstanding, invoiceSum: outstanding, matches: true },
    series: [{ key: 'gmv', label: 'Platform order value (14d)', points: seriesFromOrders(orders) }],
    kpis: [
      {
        key: 'businesses',
        label: 'Active businesses',
        value: traders.filter((b) => b.accountStatus === 'Active').length,
        format: 'number',
        drill: traders.map((b) => ({
          id: b.id,
          label: b.name,
          value: b.type,
          href: '/admin/network',
          meta: b.accountStatus,
        })),
      },
      {
        key: 'connections',
        label: 'Active connections',
        value: connections.filter((c) => c.status === 'Active').length,
        format: 'number',
        drill: connections
          .filter((c) => c.status === 'Active')
          .map((c) => ({ id: c.id, label: c.id.slice(0, 8), value: c.status, href: '/admin/network', meta: 'Active' })),
      },
      {
        key: 'gmv',
        label: 'GMV (local)',
        value: gmv,
        format: 'money',
        drill: orders.slice(0, 40).map((o) => ({
          id: o.id,
          label: o.orderNo,
          value: o.grandTotal,
          href: '/admin/orders',
          meta: o.status,
        })),
      },
      {
        key: 'verifications',
        label: 'Pending verifications',
        value: pendingVer.length,
        format: 'number',
        drill: pendingVer.map((v) => ({
          id: v.id,
          label: v.businessId,
          value: v.status,
          href: '/admin/verifications',
          meta: v.status,
        })),
      },
      {
        key: 'tickets',
        label: 'Open tickets',
        value: openTickets.length,
        format: 'number',
        drill: openTickets.map((t) => ({
          id: t.id,
          label: t.ticketNo,
          value: t.priority,
          href: '/admin/support',
          meta: t.status,
        })),
      },
      {
        key: 'suspended',
        label: 'Suspended',
        value: traders.filter((b) => b.accountStatus === 'Suspended').length,
        format: 'number',
        drill: traders
          .filter((b) => b.accountStatus === 'Suspended')
          .map((b) => ({ id: b.id, label: b.name, value: b.suspendReason ?? '', href: '/admin/suspensions', meta: 'Suspended' })),
      },
    ],
  };
}

/** Recompute helper — always from source tables (no authoritative analytics cache). */
export async function recomputeAnalytics(scope: 'pharmacy' | 'stockist' | 'platform', businessId?: string): Promise<AnalyticsBundle> {
  if (scope === 'pharmacy' && businessId) return pharmacyAnalytics(businessId);
  if (scope === 'stockist' && businessId) return stockistAnalytics(businessId);
  return platformAnalytics();
}

export function assertOutstandingMatches(invoices: Invoice[], computed: number): boolean {
  const sum = roundMoney(invoices.filter((i) => i.status !== 'Void').reduce((s, i) => s + invoiceOutstanding(i), 0));
  return Math.abs(sum - computed) < 0.01;
}

export type { Payment };

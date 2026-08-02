import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../../data/db';
import { expiryRiskBand, lowStock, pharmacyOutstanding, remainingCredit } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { AnnouncementStrip } from '../../../ui/components/AnnouncementStrip';
import { BannerStrip } from '../../../ui/components/BannerStrip';
import { Kpi, Money, PageHeader } from '../../../ui/components/primitives';
import { chartColors } from '../../../ui/chartTheme';
import { useBiz } from './useBiz';
import { useCan, useSession } from '../../../store/session';

export function PharmacyHome() {
  const { business } = useBiz();
  const { user } = useSession();
  // sale.record gates POS; sale.view is delivery-context only (DeliveryStaff) and must not open sales.
  const canSale = useCan('sale.record');
  const canStaff = useCan('staff.manage');
  const isDeliveryStaff = user?.role === 'DeliveryStaff';
  const charts = chartColors();
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const connectionsRaw = useLiveQuery(
    () => db.connections.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const connectionsLoading = connectionsRaw === undefined;
  const connections = connectionsRaw ?? [];
  const returns = useLiveQuery(() => db.returns.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const credits = useLiveQuery(() => db.creditNotes.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const inventory = useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const notifications =
    useLiveQuery(
      () =>
        user
          ? db.notifications
              .where('userId')
              .equals(user.id)
              .filter((n) => n.status === 'Unread')
              .toArray()
          : [],
      [user?.id],
    ) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];

  const awaitingDelivery = orders.filter((o) => ['Packed', 'Dispatched'].includes(o.status)).length;
  const overdue = invoices.filter(
    (i) => i.status === 'Overdue' || (i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0),
  ).length;
  const openReturns = returns.filter((r) => !['Closed', 'Rejected', 'Cancelled'].includes(r.status)).length;
  const availableCredit = credits.reduce((s, c) => s + remainingCredit(c), 0);
  const low = inventory.filter((i) => lowStock(i.onHand)).length;
  const near = inventory.filter((i) => i.expiryDate && ['Near', 'Critical', 'Expired'].includes(expiryRiskBand(i.expiryDate))).length;
  const activeConn = connections.filter((c) => c.status === 'Active').length;

  const aging = useMemo(() => {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const now = Date.now();
    for (const inv of invoices.filter((i) => i.outstanding > 0 && i.status !== 'Void')) {
      const days = Math.floor((now - new Date(inv.issuedAt ?? inv.createdAt).getTime()) / 86400000);
      if (days <= 30) buckets['0-30'] += inv.outstanding;
      else if (days <= 60) buckets['31-60'] += inv.outstanding;
      else if (days <= 90) buckets['61-90'] += inv.outstanding;
      else buckets['90+'] += inv.outstanding;
    }
    return Object.entries(buckets).map(([band, total]) => ({ band, total }));
  }, [invoices]);

  const topSuppliers = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) map.set(o.stockistId, (map.get(o.stockistId) ?? 0) + o.grandTotal);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, total]) => ({ name: stockists.find((s) => s.id === id)?.name ?? id.slice(0, 6), total }));
  }, [orders, stockists]);

  if (isDeliveryStaff) {
    return (
      <div className="stack">
        <PageHeader title="Delivery home" subtitle="Customer home-delivery routes assigned to you" />
        <BannerStrip placement="Pharmacy Home" />
        <div className="card card-pad stack">
          <strong>Your board</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Update stop status on assigned routes. Sales totals and catalogue stay with the Pharmacist.
          </p>
          <Link className="btn btn-primary" to="/pharmacy/delivery">
            Open delivery board
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Pharmacy home" subtitle="Purchasing queues, payables, and next actions" />
      <BannerStrip placement="Pharmacy Home" />
      <AnnouncementStrip audience="Pharmacy" placement="Pharmacy Home" archivePath="/pharmacy/announcements" />
      {connectionsLoading ? (
        <p className="muted" role="status" style={{ margin: 0 }}>
          Loading workspace…
        </p>
      ) : !activeConn ? (
        <div className="banner-strip warning">
          No active stockist connections yet.{' '}
          <Link to="/pharmacy/connections">Find and connect</Link> to start ordering.
        </div>
      ) : null}
      <div className="card card-pad stack">
        <strong>Today&apos;s work</strong>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/orders?awaiting=1">
            Receive ({awaitingDelivery})
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/payments?status=Overdue">
            Pay ({overdue} overdue)
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/inventory?filter=low">
            Low stock ({low})
          </Link>
        </div>
      </div>
      <div className="card card-pad stack">
        <strong>Quick actions</strong>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-primary btn-sm" to="/pharmacy/buy">
            New order
          </Link>
          {canSale ? (
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/sales">
              Record sale
            </Link>
          ) : null}
          {canStaff ? (
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/staff">
              Invite staff
            </Link>
          ) : null}
        </div>
      </div>
      {(() => {
        const verified = business.verificationStatus === 'Approved';
        const connected = activeConn > 0;
        const ordered = orders.length > 0;
        const paid = invoices.some((i) => i.paidAmount > 0);
        const done = verified && connected && ordered && paid;
        if (done) {
          return (
            <div className="card card-pad stack">
              <strong>Setup complete</strong>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                You&apos;re verified, connected, ordered, and paid — ready for daily purchasing.
              </p>
            </div>
          );
        }
        return (
          <div className="card card-pad stack">
            <strong>Setup checklist</strong>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" readOnly checked={verified} /> Verify business
            </label>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" readOnly checked={connected} /> Connect to a stockist
            </label>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" readOnly checked={ordered} /> Place first order
            </label>
            <label style={{ fontSize: 13 }}>
              <input type="checkbox" readOnly checked={paid} /> Submit a payment
            </label>
          </div>
        );
      })()}
      <div className="kpi-grid">
        <Link className="kpi-link" to="/pharmacy/orders?awaiting=1">
          <Kpi label="Awaiting delivery" value={awaitingDelivery} />
        </Link>
        <Link className="kpi-link" to="/pharmacy/payments?status=Overdue">
          <Kpi label="Overdue payables" value={overdue} sub={formatINR(pharmacyOutstanding(invoices, business.id))} />
        </Link>
        <Link className="kpi-link" to="/pharmacy/returns">
          <Kpi label="Open returns" value={openReturns} />
        </Link>
        <Link className="kpi-link" to="/pharmacy/payments?tab=Credits">
          <Kpi label="Available credit" value={<Money value={availableCredit} />} />
        </Link>
        <Link className="kpi-link" to="/pharmacy/inventory?filter=low">
          <Kpi label="Low stock" value={low} />
        </Link>
        <Link className="kpi-link" to="/pharmacy/expiry">
          <Kpi label="Near expiry" value={near} />
        </Link>
        <Link className="kpi-link" to="/pharmacy/notifications">
          <Kpi label="Unread" value={notifications.length} />
        </Link>
      </div>
      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Payables aging</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" stroke={charts.grid} />
                <XAxis dataKey="band" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Bar dataKey="total" fill={charts.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Top suppliers</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={topSuppliers}>
                <CartesianGrid strokeDasharray="3 3" stroke={charts.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Bar dataKey="total" fill={charts.secondary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="row">
        <Link className="btn btn-primary" to="/pharmacy/buy">
          Discover & buy
        </Link>
        <Link className="btn btn-secondary" to="/pharmacy/payments">
          Pay outstanding
        </Link>
        <Link className="btn btn-secondary" to="/pharmacy/orders">
          View orders
        </Link>
      </div>
    </div>
  );
}

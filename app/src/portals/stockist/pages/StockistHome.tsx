import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../../data/db';
import { availableQty, expiryRiskBand, lowStock, stockistReceivables } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { AnnouncementStrip } from '../../../ui/components/AnnouncementStrip';
import { BannerStrip } from '../../../ui/components/BannerStrip';
import { Kpi, Money, PageHeader } from '../../../ui/components/primitives';
import { chartColors } from '../../../ui/chartTheme';
import { useCan } from '../../../store/session';
import { useBiz } from './useBiz';

export function StockistHome() {
  const { business, user } = useBiz();
  const canStaff = useCan('staff.manage');
  const charts = chartColors();
  const slaReminders =
    useLiveQuery(
      () =>
        db.notifications
          .where('userId')
          .equals(user.id)
          .filter((n) => n.code === 'N-048' && n.status === 'Unread')
          .toArray(),
      [user.id],
    ) ?? [];
  const ordersRaw = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]);
  const homeLoading = ordersRaw === undefined;
  const orders = ordersRaw ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const payments = useLiveQuery(() => db.payments.where({ stockistId: business.id, status: 'Submitted' }).toArray(), [business.id]) ?? [];
  const returns = useLiveQuery(() => db.returns.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const deliveries = useLiveQuery(() => db.deliveries.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const batches = useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const isBoy = user.role === 'DeliveryBoy';
  const isAccountant = user.role === 'Accountant';

  const toPack = orders.filter((o) => o.status === 'Allocated').length;
  const toDispatch = orders.filter((o) => o.status === 'Packed').length;
  const outForDelivery = deliveries.filter((d) => d.status === 'OutForDelivery').length;
  const overdue = invoices.filter((i) => i.status === 'Overdue' || (i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0)).length;
  const returnsReview = returns.filter((r) => ['Submitted', 'UnderReview'].includes(r.status)).length;
  const low = batches.filter((b) => {
    const avail = availableQty(b);
    const p = products.find((x) => x.id === b.productId);
    return b.status === 'Available' && (lowStock(avail) || (p?.reorderLevel != null && avail <= p.reorderLevel));
  }).length;
  const near = batches.filter((b) => ['Near', 'Critical'].includes(expiryRiskBand(b.expiryDate))).length;

  const myDeliveries = isBoy ? deliveries.filter((d) => d.assignedTo === user.id) : deliveries;
  const boyAssigned = myDeliveries.filter((d) => d.status === 'Assigned').length;
  const boyOut = myDeliveries.filter((d) => d.status === 'OutForDelivery').length;
  const boyDone = myDeliveries.filter((d) => d.status === 'Delivered').length;
  const boyFail = myDeliveries.filter((d) => d.status === 'Failed').length;

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

  const topPharmacies = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) map.set(o.pharmacyId, (map.get(o.pharmacyId) ?? 0) + o.grandTotal);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, total]) => ({ name: pharmacies.find((p) => p.id === id)?.name ?? id.slice(0, 6), total }));
  }, [orders, pharmacies]);

  const deliveryStats = useMemo(() => {
    const ok = deliveries.filter((d) => d.status === 'Delivered').length;
    const fail = deliveries.filter((d) => d.status === 'Failed').length;
    return [
      { label: 'Delivered', count: ok },
      { label: 'Failed', count: fail },
    ];
  }, [deliveries]);

  if (isBoy) {
    return (
      <div className="stack">
        <PageHeader title="Delivery board" subtitle="Your assigned work only" />
        <div className="kpi-grid">
          <Kpi label="Assigned" value={boyAssigned} />
          <Kpi label="Out for delivery" value={boyOut} />
          <Kpi label="Completed" value={boyDone} />
          <Kpi label="Failed" value={boyFail} />
        </div>
        <Link className="btn btn-primary" to="/stockist/delivery">
          Open delivery
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Stockist home" subtitle="Fulfilment queues and receivables" />
      <BannerStrip placement="Stockist Home" />
      <AnnouncementStrip audience="Stockist" placement="Stockist Home" archivePath="/stockist/announcements" />
      {homeLoading ? (
        <p className="muted" role="status" style={{ margin: 0 }}>
          Loading workspace…
        </p>
      ) : null}
      {slaReminders.length ? (
        <div className="card card-pad stack">
          <strong>SLA reminders</strong>
          {slaReminders.slice(0, 5).map((n) => (
            <div key={n.id} style={{ fontSize: 13 }}>
              {n.body}{' '}
              <Link to="/stockist/notifications" style={{ fontSize: 12 }}>
                Open
              </Link>
            </div>
          ))}
        </div>
      ) : null}
      <div className="card card-pad stack">
        <strong>Today&apos;s work</strong>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          {!isAccountant ? (
            <>
              <Link className="btn btn-secondary btn-sm" to="/stockist/orders?status=Pending">
                Accept queue
              </Link>
              <Link className="btn btn-secondary btn-sm" to="/stockist/orders?status=Allocated">
                Pack ({toPack})
              </Link>
              <Link className="btn btn-secondary btn-sm" to="/stockist/orders?status=Packed">
                Dispatch ({toDispatch})
              </Link>
            </>
          ) : null}
          <Link className="btn btn-secondary btn-sm" to="/stockist/payments">
            Payments ({payments.length})
          </Link>
        </div>
      </div>
      <div className="card card-pad stack">
        <strong>Quick actions</strong>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-primary btn-sm" to="/stockist/catalogue">
            Add product
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/stockist/inventory">
            Stock in
          </Link>
          {canStaff ? (
            <Link className="btn btn-secondary btn-sm" to="/stockist/staff">
              Invite staff
            </Link>
          ) : null}
        </div>
      </div>
      {!isAccountant ? (
        <div className="kpi-grid">
          <Link className="kpi-link" to="/stockist/orders?status=Allocated">
            <Kpi label="To pack" value={toPack} />
          </Link>
          <Link className="kpi-link" to="/stockist/orders?status=Packed">
            <Kpi label="To dispatch" value={toDispatch} />
          </Link>
          <Link className="kpi-link" to="/stockist/delivery">
            <Kpi label="Out for delivery" value={outForDelivery} />
          </Link>
          <Link className="kpi-link" to="/stockist/inventory?filter=low">
            <Kpi label="Low stock" value={low} />
          </Link>
          <Link className="kpi-link" to="/stockist/inventory?filter=near-expiry">
            <Kpi label="Near expiry" value={near} />
          </Link>
          <Link className="kpi-link" to="/stockist/returns">
            <Kpi label="Returns to review" value={returnsReview} />
          </Link>
        </div>
      ) : null}
      <div className="kpi-grid">
        <Link className="kpi-link" to="/stockist/payments?status=Overdue">
          <Kpi label="Overdue receivables" value={overdue} sub={formatINR(stockistReceivables(invoices, business.id))} />
        </Link>
        <Link className="kpi-link" to="/stockist/payments">
          <Kpi label="Payments to review" value={payments.length} />
        </Link>
        <Kpi label="Receivables" value={<Money value={stockistReceivables(invoices, business.id)} />} />
      </div>
      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Receivables aging</h3>
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
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Top pharmacies</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={topPharmacies}>
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
      {!isAccountant ? (
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Delivery outcomes</h3>
          <div className="row">
            {deliveryStats.map((d) => (
              <Kpi key={d.label} label={d.label} value={d.count} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

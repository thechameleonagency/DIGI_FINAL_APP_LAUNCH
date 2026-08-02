import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { availableQty } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { stockistAnalytics, type AnalyticsBundle } from '../../../services/analyticsService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Field, Kpi, Money, PageHeader, Select } from '../../../ui/components/primitives';
import { chartColors } from '../../../ui/chartTheme';
import { db } from '../../../data/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useBiz } from './useBiz';

type PeriodKey = '7' | '14' | '30' | '90';

function inPeriod(iso: string | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= Date.now() - days * 86400000;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StockistAnalytics() {
  const { business } = useBiz();
  const { pushToast } = useUi();
  const charts = chartColors();
  const [period, setPeriod] = useState<PeriodKey>('14');
  const days = Number(period);
  const [bundle, setBundle] = useState<AnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orders = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const payments = useLiveQuery(() => db.payments.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const deliveries = useLiveQuery(() => db.deliveries.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const batches = useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const returns = useLiveQuery(() => db.returns.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setBundle(await stockistAnalytics(business.id, days));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to recompute analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id, days]);

  const periodOrders = useMemo(() => orders.filter((o) => inPeriod(o.placedAt, days)), [orders, days]);
  const periodPayments = useMemo(() => payments.filter((p) => inPeriod(p.submittedAt ?? p.createdAt, days)), [payments, days]);
  const periodDeliveries = useMemo(() => deliveries.filter((d) => inPeriod(d.updatedAt ?? d.createdAt, days)), [deliveries, days]);

  const sales = {
    gmv: periodOrders.reduce((s, o) => s + o.grandTotal, 0),
    orders: periodOrders.length,
    activeCustomers: new Set(periodOrders.map((o) => o.pharmacyId)).size,
  };
  const collections = {
    approved: periodPayments.filter((p) => p.status === 'Approved').reduce((s, p) => s + p.amount, 0),
    submitted: periodPayments.filter((p) => p.status === 'Submitted').length,
    rejected: periodPayments.filter((p) => p.status === 'Rejected').length,
    credits: returns.filter((r) => inPeriod(r.updatedAt ?? r.createdAt, days) && !!r.creditNoteId).length,
  };
  const inventory = {
    value: batches.reduce((s, b) => {
      const p = products.find((x) => x.id === b.productId);
      return s + availableQty(b) * (p?.ptr ?? 0);
    }, 0),
    skus: products.length,
    batches: batches.length,
    low: products.filter((p) => {
      const avail = batches
        .filter((b) => b.productId === p.id && b.status === 'Available')
        .reduce((s, b) => s + Math.max(0, b.onHand - b.reserved), 0);
      return avail <= (p.reorderLevel ?? 10);
    }).length,
  };
  const operations = {
    delivered: periodDeliveries.filter((d) => d.status === 'Delivered').length,
    failed: periodDeliveries.filter((d) => d.status === 'Failed').length,
    out: deliveries.filter((d) => d.status === 'OutForDelivery').length,
    packed: orders.filter((o) => o.status === 'Packed').length,
  };

  const exportCsv = () => {
    const rows: string[][] = [
      ['Section', 'Metric', 'Value', `PeriodDays=${days}`],
      ['Sales', 'GMV', String(sales.gmv)],
      ['Sales', 'Orders', String(sales.orders)],
      ['Sales', 'Active customers', String(sales.activeCustomers)],
      ['Collections', 'Approved amount', String(collections.approved)],
      ['Collections', 'Submitted count', String(collections.submitted)],
      ['Collections', 'Rejected count', String(collections.rejected)],
      ['Collections', 'Credits issued', String(collections.credits)],
      ['Inventory', 'Value', String(inventory.value)],
      ['Inventory', 'SKUs', String(inventory.skus)],
      ['Inventory', 'Batches', String(inventory.batches)],
      ['Inventory', 'Low stock SKUs', String(inventory.low)],
      ['Operations', 'Delivered', String(operations.delivered)],
      ['Operations', 'Failed', String(operations.failed)],
      ['Operations', 'Out for delivery', String(operations.out)],
      ['Operations', 'Packed queue', String(operations.packed)],
    ];
    if (bundle) {
      for (const k of bundle.kpis) rows.push(['KPI', k.label, String(k.value)]);
    }
    downloadCsv(`stockist-analytics-${business.id}-${days}d.csv`, rows);
    pushToast({ tone: 'success', title: 'Analytics exported' });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Stockist analytics"
        subtitle="Sales, collections, inventory, and operations — recomputed from source documents"
        actions={
          <div className="row">
            <Field label="Period">
              <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </Select>
            </Field>
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Recomputing…' : 'Recompute'}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        }
      />
      {error ? <div className="banner-strip danger">{error}</div> : null}
      {bundle && !bundle.outstandingCheck.matches ? (
        <div className="banner-strip warning">
          Analytics mismatch — trusting invoice ledger ({formatINR(bundle.outstandingCheck.invoiceSum)}) over cache (
          {formatINR(bundle.outstandingCheck.dashboard)}).
        </div>
      ) : null}

      <section className="stack">
        <h3 style={{ margin: 0, fontSize: 15 }}>Sales</h3>
        <div className="kpi-grid">
          <Kpi label="GMV (period)" value={<Money value={sales.gmv} />} />
          <Kpi label="Orders (period)" value={sales.orders} />
          <Kpi label="Active customers" value={sales.activeCustomers} />
          <Kpi label="Receivables" value={<Money value={bundle?.outstandingCheck.invoiceSum ?? 0} />} />
        </div>
      </section>

      <section className="stack">
        <h3 style={{ margin: 0, fontSize: 15 }}>Collections</h3>
        <div className="kpi-grid">
          <Kpi label="Approved (period)" value={<Money value={collections.approved} />} />
          <Kpi label="Submitted (period)" value={collections.submitted} />
          <Kpi label="Rejected (period)" value={collections.rejected} />
          <Kpi label="Credits issued (period)" value={collections.credits} />
        </div>
      </section>

      <section className="stack">
        <h3 style={{ margin: 0, fontSize: 15 }}>Inventory</h3>
        <div className="kpi-grid">
          <Kpi label="Inventory value" value={<Money value={inventory.value} />} />
          <Kpi label="SKUs" value={inventory.skus} />
          <Kpi label="Batches" value={inventory.batches} />
          <Kpi label="Low stock SKUs" value={inventory.low} sub="See Inventory → Low stock" />
          <Link className="btn btn-secondary btn-sm" to="/stockist/inventory?filter=low">
            Open low stock
          </Link>
        </div>
      </section>

      <section className="stack">
        <h3 style={{ margin: 0, fontSize: 15 }}>Operations</h3>
        <div className="kpi-grid">
          <Kpi label="Delivered (period)" value={operations.delivered} />
          <Kpi label="Failed (period)" value={operations.failed} />
          <Kpi label="Out for delivery" value={operations.out} />
          <Kpi label="Packed queue" value={operations.packed} />
        </div>
      </section>

      <div className="card card-pad">
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{bundle?.series[0]?.label ?? 'Sales trend'}</h3>
        {!bundle?.series[0]?.points.length ? (
          <EmptyState title="No trend data" description="Place orders in this period to see the sales chart." />
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={bundle.series[0].points}>
                <CartesianGrid strokeDasharray="3 3" stroke={charts.grid} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Bar dataKey="value" fill={charts.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

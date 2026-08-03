import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../../data/db';
import { invoiceOutstanding, pharmacyOutstanding } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { pharmacyAnalytics, type AnalyticsBundle } from '../../../services/analyticsService';
import { saveReportPreset } from '../../../services/planService';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { PaginationBar, usePagedRows } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Kpi, Money, PageHeader, Select } from '../../../ui/components/primitives';
import { chartColors } from '../../../ui/chartTheme';
import { useBiz } from './useBiz';

type PeriodKey = '7' | '14' | '30' | '90';

function inPeriod(iso: string | undefined, days: number): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() >= Date.now() - days * 86400000;
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

export function PharmacyAnalytics() {
  const { business: sessionBiz, user } = useBiz();
  const { refreshEntities } = useSession();
  const { pushToast } = useUi();
  const charts = chartColors();
  const [period, setPeriod] = useState<PeriodKey>('14');
  const [presetName, setPresetName] = useState('');
  const days = Number(period);
  const [bundle, setBundle] = useState<AnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const business = useLiveQuery(() => db.businesses.get(sessionBiz.id), [sessionBiz.id]) ?? sessionBiz;

  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const payments = useLiveQuery(() => db.payments.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const presets = business.preferences?.reportPresets ?? [];
  const isPremium = (business.plan ?? 'Free') === 'Premium';

  useEffect(() => {
    setLoading(true);
    pharmacyAnalytics(business.id, days)
      .then(setBundle)
      .finally(() => setLoading(false));
  }, [business.id, days]);

  const periodOrders = useMemo(() => orders.filter((o) => inPeriod(o.placedAt, days)), [orders, days]);
  const periodPayments = useMemo(
    () => payments.filter((p) => inPeriod(p.submittedAt ?? p.createdAt, days)),
    [payments, days],
  );

  const supplierPerf = useMemo(() => {
    const map = new Map<string, { orders: number; gmv: number; name: string }>();
    for (const o of periodOrders) {
      const cur = map.get(o.stockistId) ?? {
        orders: 0,
        gmv: 0,
        name: stockists.find((s) => s.id === o.stockistId)?.name ?? o.stockistId.slice(0, 6),
      };
      cur.orders += 1;
      cur.gmv += o.grandTotal;
      map.set(o.stockistId, cur);
    }
    return [...map.values()].sort((a, b) => b.gmv - a.gmv);
  }, [periodOrders, stockists]);
  const supplierList = usePagedRows(supplierPerf, 7, days);

  const aging = useMemo(() => {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const now = Date.now();
    for (const inv of invoices.filter((i) => invoiceOutstanding(i) > 0 && i.status !== 'Void')) {
      const d = Math.floor((now - new Date(inv.issuedAt ?? inv.createdAt).getTime()) / 86400000);
      if (d <= 30) buckets['0-30'] += invoiceOutstanding(inv);
      else if (d <= 60) buckets['31-60'] += invoiceOutstanding(inv);
      else if (d <= 90) buckets['61-90'] += invoiceOutstanding(inv);
      else buckets['90+'] += invoiceOutstanding(inv);
    }
    return Object.entries(buckets).map(([band, total]) => ({ band, total }));
  }, [invoices]);

  const exportCsv = () => {
    const rows: string[][] = [
      ['Section', 'Metric', 'Value', `PeriodDays=${days}`],
      ['Payables', 'Outstanding', String(pharmacyOutstanding(invoices, business.id))],
      ['Purchasing', 'Orders', String(periodOrders.length)],
      ['Purchasing', 'GMV', String(periodOrders.reduce((s, o) => s + o.grandTotal, 0))],
      ['Payments', 'Approved', String(periodPayments.filter((p) => p.status === 'Approved').reduce((s, p) => s + p.amount, 0))],
      ...supplierPerf.map((s) => ['Supplier', s.name, String(s.gmv)]),
      ...aging.map((a) => ['Aging', a.band, String(a.total)]),
    ];
    downloadCsv(`pharmacy-analytics-${business.id}-${days}d.csv`, rows);
    pushToast({ tone: 'success', title: 'Analytics exported' });
  };

  const savePreset = async () => {
    const res = await saveReportPreset({ actor: user, business, name: presetName, periodDays: days });
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message });
      return;
    }
    const fresh = await db.businesses.get(business.id);
    if (fresh) refreshEntities(user, fresh);
    setPresetName('');
    pushToast({ tone: 'success', title: 'Preset saved' });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Pharmacy analytics"
        subtitle="Period KPIs, supplier performance, payables aging"
        actions={
          <div className="page-header-controls">
            <div className="header-period">
              <label htmlFor="pharmacy-analytics-period">Period</label>
              <Select
                id="pharmacy-analytics-period"
                className="select-sm"
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              >
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </Select>
            </div>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        }
      />
      {isPremium ? (
        <div className="card card-pad row gap" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <Field label="Save period preset (Premium)">
            <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Month close" />
          </Field>
          <Button size="sm" onClick={() => void savePreset()} disabled={!presetName.trim()}>
            Save preset
          </Button>
          {presets.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="ghost"
              onClick={() => setPeriod(String(p.periodDays) as PeriodKey)}
            >
              {p.name} ({p.periodDays}d)
            </Button>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          <Link to="/pharmacy/upgrade">Upgrade to Premium</Link> to save report period presets.
        </p>
      )}
      <div className="kpi-grid">
        <Kpi label="Outstanding" value={<Money value={pharmacyOutstanding(invoices, business.id)} />} />
        <Kpi label="Orders (period)" value={periodOrders.length} />
        <Kpi label="Spend (period)" value={<Money value={periodOrders.reduce((s, o) => s + o.grandTotal, 0)} />} />
        <Kpi
          label="Approved payments"
          value={<Money value={periodPayments.filter((p) => p.status === 'Approved').reduce((s, p) => s + p.amount, 0)} />}
        />
      </div>

      <section className="stack">
        <h3 style={{ margin: 0, fontSize: 15 }}>Supplier performance</h3>
        {!supplierPerf.length ? (
          <EmptyState title="No supplier trade in period" description="Place orders to see supplier KPIs." />
        ) : (
          <>
            <div className="table-wrap queue-responsive">
              <table className="data">
                <thead>
                  <tr>
                    <th>Stockist</th>
                    <th>Orders</th>
                    <th>GMV</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierList.pageRows.map((s) => (
                    <tr key={s.name}>
                      <td data-label="Stockist">{s.name}</td>
                      <td data-label="Orders">{s.orders}</td>
                      <td data-label="GMV">
                        <Money value={s.gmv} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={supplierList.page}
              pageCount={supplierList.pageCount}
              total={supplierList.total}
              onPage={supplierList.setPage}
            />
          </>
        )}
      </section>

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
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{bundle?.series[0]?.label ?? 'Purchasing trend'}</h3>
          {loading || !bundle?.series[0]?.points.length ? (
            <EmptyState title="No trend data" description="Orders in this period appear here." />
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={bundle.series[0].points}>
                  <CartesianGrid strokeDasharray="3 3" stroke={charts.grid} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Bar dataKey="value" fill={charts.secondary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/payments">
            Open payments
          </Link>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsBundle } from '../../services/analyticsService';
import { formatINR } from '../../domain/utils/money';
import { chartColors } from '../chartTheme';
import { Button, Kpi, Money, PageHeader } from './primitives';

export function AnalyticsDashboard({
  title,
  subtitle,
  load,
}: {
  title: string;
  subtitle: string;
  load: () => Promise<AnalyticsBundle>;
}) {
  const [data, setData] = useState<AnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const charts = chartColors();

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const bundle = await load();
      setData(bundle);
      if (!activeKpi && bundle.kpis[0]) setActiveKpi(bundle.kpis[0].key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to recompute analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = data?.kpis.find((k) => k.key === activeKpi) ?? data?.kpis[0];

  return (
    <div className="stack">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Recomputing…' : 'Recompute'}
          </Button>
        }
      />
      {error ? <div className="banner-strip danger">{error}</div> : null}
      {data && !data.outstandingCheck.matches ? (
        <div className="banner-strip warning">
          Analytics mismatch detected — trusting invoice ledger ({formatINR(data.outstandingCheck.invoiceSum)}) over cache (
          {formatINR(data.outstandingCheck.dashboard)}).
        </div>
      ) : null}
      {data ? (
        <div className="muted" style={{ fontSize: 12 }}>
          Calculated at {new Date(data.calculatedAt).toLocaleString()} · source documents are authoritative
          {data.outstandingCheck.matches ? ' · outstanding reconciles' : ''}
        </div>
      ) : null}

      <div className="kpi-grid">
        {(data?.kpis ?? []).map((k) => (
          <button
            key={k.key}
            type="button"
            className="card kpi queue-card"
            style={{
              textAlign: 'left',
              borderColor: selected?.key === k.key ? 'var(--accent)' : undefined,
              cursor: 'pointer',
              width: '100%',
            }}
            onClick={() => setActiveKpi(k.key)}
          >
            <div className="label">{k.label}</div>
            <div className="value">
              {k.format === 'money' ? <Money value={k.value} /> : null}
              {k.format === 'number' ? k.value : null}
              {k.format === 'percent' ? `${k.value}%` : null}
            </div>
            <div className="sub">Click for drill-down</div>
          </button>
        ))}
        {loading && !data
          ? [1, 2, 3, 4].map((i) => <Kpi key={i} label="Loading" value="…" />)
          : null}
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{data?.series[0]?.label ?? 'Trend'}</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={data?.series[0]?.points ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={charts.grid} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Bar dataKey="value" fill={charts.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{selected?.label ?? 'Drill-down'}</strong>
            {selected ? <span className="muted" style={{ fontSize: 12 }}>{selected.drill.length} rows</span> : null}
          </div>
          {!selected?.drill.length ? (
            <div className="empty" style={{ padding: 24 }}>
              <h3>No drill-down rows</h3>
              <p>This KPI has no underlying documents right now.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Value</th>
                    <th>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.drill.map((d) => (
                    <tr key={d.id}>
                      <td>{d.href ? <Link to={d.href}>{d.label}</Link> : d.label}</td>
                      <td>{typeof d.value === 'number' ? <Money value={d.value} /> : d.value}</td>
                      <td className="muted">{d.meta ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

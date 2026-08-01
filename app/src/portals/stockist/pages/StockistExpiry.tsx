import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { availableQty, expiryRiskBand } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { Button, EmptyState, Kpi, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistExpiry() {
  const { business } = useBiz();
  const batches = useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [band, setBand] = useState<'All' | 'Expired' | 'Critical' | 'Near' | 'Healthy'>('All');

  const enriched = useMemo(
    () =>
      batches.map((b) => {
        const p = products.find((x) => x.id === b.productId);
        const bandName = expiryRiskBand(b.expiryDate);
        const qty = availableQty(b);
        return { b, p, bandName, qty, value: qty * (p?.ptr ?? 0) };
      }),
    [batches, products],
  );

  const tiles = {
    Expired: enriched.filter((x) => x.bandName === 'Expired'),
    Critical: enriched.filter((x) => x.bandName === 'Critical'),
    Near: enriched.filter((x) => x.bandName === 'Near'),
    Healthy: enriched.filter((x) => x.bandName === 'Healthy'),
  };
  const filtered = band === 'All' ? enriched : enriched.filter((x) => x.bandName === band);

  const riskValue = [...tiles.Expired, ...tiles.Critical, ...tiles.Near].reduce((s, x) => s + x.value, 0);

  return (
    <div className="stack">
      <PageHeader title="Expiry management" subtitle={`Value at risk ${formatINR(riskValue)}`} />
      <div className="kpi-grid">
        <Kpi label="Expired" value={tiles.Expired.length} sub={formatINR(tiles.Expired.reduce((s, x) => s + x.value, 0))} />
        <Kpi label="≤30 days" value={tiles.Critical.length} sub={formatINR(tiles.Critical.reduce((s, x) => s + x.value, 0))} />
        <Kpi label="≤90 days" value={tiles.Near.length} sub={formatINR(tiles.Near.reduce((s, x) => s + x.value, 0))} />
        <Kpi label="Safe" value={tiles.Healthy.length} />
      </div>
      <div className="row">
        {(['All', 'Expired', 'Critical', 'Near', 'Healthy'] as const).map((b) => (
          <Button key={b} size="sm" variant={band === b ? 'primary' : 'secondary'} onClick={() => setBand(b)}>
            {b === 'Critical' ? '≤30' : b === 'Near' ? '≤90' : b === 'Healthy' ? 'Safe' : b}
          </Button>
        ))}
      </div>
      {!filtered.length ? (
        <EmptyState title="No batches in this band" description="Stock in products to track expiry." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Avail</th>
                <th>Value</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ b, p, bandName, qty, value }) => (
                <tr key={b.id}>
                  <td>{p?.name ?? b.productId}</td>
                  <td>{b.batchNumber}</td>
                  <td>{b.expiryDate}</td>
                  <td>{qty}</td>
                  <td>
                    <Money value={value} />
                  </td>
                  <td>
                    <StatusBadge status={bandName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

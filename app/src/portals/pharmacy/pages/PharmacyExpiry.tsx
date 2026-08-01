import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { expiryRiskBand } from '../../../domain/calc';
import { stockAdjust } from '../../../services/inventoryService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Kpi, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyExpiry() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const items = useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const [band, setBand] = useState<'All' | 'Expired' | 'Critical' | 'Near' | 'Healthy'>('All');

  const enriched = useMemo(
    () =>
      items.map((i) => {
        const bandName = i.expiryDate ? expiryRiskBand(i.expiryDate) : 'Healthy';
        return { i, bandName, value: i.onHand };
      }),
    [items],
  );

  const tiles = {
    Expired: enriched.filter((x) => x.bandName === 'Expired'),
    Critical: enriched.filter((x) => x.bandName === 'Critical'),
    Near: enriched.filter((x) => x.bandName === 'Near'),
    Healthy: enriched.filter((x) => x.bandName === 'Healthy'),
  };
  const filtered = band === 'All' ? enriched : enriched.filter((x) => x.bandName === band);
  const riskUnits = [...tiles.Expired, ...tiles.Critical, ...tiles.Near].reduce((s, x) => s + x.value, 0);

  return (
    <div className="stack">
      <PageHeader
        title="Expiry management"
        subtitle={`At-risk units ${riskUnits}`}
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/inventory">
            Inventory
          </Link>
        }
      />
      <div className="kpi-grid">
        <Kpi label="Expired" value={tiles.Expired.length} sub={`${tiles.Expired.reduce((s, x) => s + x.value, 0)} units`} />
        <Kpi label="≤30 days" value={tiles.Critical.length} sub={`${tiles.Critical.reduce((s, x) => s + x.value, 0)} units`} />
        <Kpi label="≤90 days" value={tiles.Near.length} sub={`${tiles.Near.reduce((s, x) => s + x.value, 0)} units`} />
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
        <EmptyState title="No batches in this band" description="Stock received via GRN or Add medicine appears here." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>On hand</th>
                <th>Band</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ i, bandName }) => (
                <tr key={i.id}>
                  <td>{i.productName}</td>
                  <td>{i.batchNumber ?? '—'}</td>
                  <td>{i.expiryDate ?? '—'}</td>
                  <td>{i.onHand}</td>
                  <td>
                    <StatusBadge status={bandName} />
                  </td>
                  <td>
                    <div className="row">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={i.onHand <= 0}
                        onClick={async () => {
                          const res = await stockAdjust({
                            actor: user,
                            pharmacy: business,
                            inventoryId: i.id,
                            delta: -i.onHand,
                            reason: `Write-off expired/near-expiry (${bandName})`,
                          });
                          pushToast(res.ok ? { tone: 'success', title: 'Written off' } : { tone: 'error', title: res.message });
                        }}
                      >
                        Write off
                      </Button>
                      <Link className="btn btn-ghost btn-sm" to="/pharmacy/returns">
                        Mark return
                      </Link>
                    </div>
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

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { expiryRiskBand } from '../../../domain/calc';
import type { PharmacyInventoryItem } from '../../../domain/entities/types';
import { stockAdjust } from '../../../services/inventoryService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { PaginationBar, usePagedRows } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Kpi, Modal, PageHeader, StatusBadge, Tabs } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyExpiry() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canAdjust = useCan('inventory.adjust');
  const items = useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const [band, setBand] = useState<'All' | 'Expired' | 'Critical' | 'Near' | 'Healthy'>('All');
  const [adjustItem, setAdjustItem] = useState<PharmacyInventoryItem | null>(null);
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjBand, setAdjBand] = useState('');

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
  const list = usePagedRows(filtered, 7, band);
  const riskUnits = [...tiles.Expired, ...tiles.Critical, ...tiles.Near].reduce((s, x) => s + x.value, 0);

  const openWriteOff = (item: PharmacyInventoryItem, bandName: string) => {
    setAdjustItem(item);
    setAdjDelta(String(-item.onHand));
    setAdjReason(`Write-off expired/near-expiry (${bandName})`);
    setAdjBand(bandName);
  };

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
      <Tabs
        ariaLabel="Expiry bands"
        value={band}
        onChange={setBand}
        items={[
          { id: 'All', label: 'All' },
          { id: 'Expired', label: 'Expired' },
          { id: 'Critical', label: '≤30' },
          { id: 'Near', label: '≤90' },
          { id: 'Healthy', label: 'Safe' },
        ]}
      />
      {!filtered.length ? (
        <EmptyState title="No batches in this band" description="Stock received via GRN or Add medicine appears here." />
      ) : (
        <>
          <div className="table-wrap queue-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>On hand</th>
                  <th>Band</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.pageRows.map(({ i, bandName }) => (
                  <tr key={i.id}>
                    <td data-label="Product">{i.productName}</td>
                    <td data-label="Batch">{i.batchNumber ?? '—'}</td>
                    <td data-label="Expiry">{i.expiryDate ?? '—'}</td>
                    <td data-label="On hand">{i.onHand}</td>
                    <td data-label="Band">
                      <StatusBadge status={bandName} />
                    </td>
                    <td className="col-actions" data-label="Actions">
                      <div className="table-row-actions">
                        {canAdjust ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={i.onHand <= 0}
                            onClick={() => openWriteOff(i, bandName)}
                          >
                            Write off
                          </Button>
                        ) : null}
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
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}

      <Modal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        title={adjustItem ? `Write off ${adjustItem.productName}` : 'Write off'}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setAdjustItem(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!adjustItem) return;
                if (!adjReason.trim()) {
                  pushToast({ tone: 'error', title: 'Reason is required' });
                  return;
                }
                const delta = Number(adjDelta);
                if (!Number.isFinite(delta) || delta >= 0) {
                  pushToast({ tone: 'error', title: 'Write-off delta must be negative' });
                  return;
                }
                const res = await stockAdjust({
                  actor: user,
                  pharmacy: business,
                  inventoryId: adjustItem.id,
                  delta,
                  reason: adjReason.trim(),
                });
                pushToast(res.ok ? { tone: 'success', title: 'Written off' } : { tone: 'error', title: res.message });
                if (res.ok) setAdjustItem(null);
              }}
            >
              Confirm write-off
            </Button>
          </div>
        }
      >
        <div className="stack">
          <div className="muted" style={{ fontSize: 13 }}>
            On hand <strong>{adjustItem?.onHand}</strong>
            {adjustItem?.batchNumber ? ` · batch ${adjustItem.batchNumber}` : ''}
            {adjBand ? ` · ${adjBand}` : ''}. Delta defaults to zeroing the batch — edit if writing off a partial qty.
          </div>
          <Field label="Delta (− to remove)">
            <Input type="number" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} />
          </Field>
          <Field label="Reason">
            <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

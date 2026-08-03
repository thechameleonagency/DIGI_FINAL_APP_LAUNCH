import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { localWeekStartKey } from '../../../domain/utils/dateKeys';
import { formatINR } from '../../../domain/utils/money';
import { EmptyState, Field, Money, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type GroupBy = 'week' | 'schedule' | 'route';

const OPEN = new Set(['Pending', 'Accepted', 'PartiallyAccepted', 'Allocated', 'Packed']);

/** Batch planning body — embeddable in Orders hub Plan tab. */
export function StockistBatchOrderingPanel() {
  const { business } = useBiz();
  const [groupBy, setGroupBy] = useState<GroupBy>('week');
  const orders =
    useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const deliveries =
    useLiveQuery(() => db.deliveries.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const routes =
    useLiveQuery(() => db.stockistRoutes.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];

  const openOrders = useMemo(() => orders.filter((o) => OPEN.has(o.status)), [orders]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof openOrders>();
    for (const o of openOrders) {
      let key = 'Ungrouped';
      if (groupBy === 'week') {
        key = `Week of ${localWeekStartKey(o.placedAt)}`;
      } else if (groupBy === 'schedule') {
        const del = o.deliveryId ? deliveries.find((d) => d.id === o.deliveryId) : undefined;
        const date = del?.scheduledDate ?? o.preferredDeliveryDate ?? o.preferredDate;
        key = date ? `Scheduled ${date}` : 'No schedule date';
      } else {
        const del = o.deliveryId ? deliveries.find((d) => d.id === o.deliveryId) : undefined;
        const route = del?.routeId ? routes.find((r) => r.id === del.routeId) : undefined;
        key = route ? `Route: ${route.name}` : 'No route';
      }
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [openOrders, groupBy, deliveries, routes]);

  const pharmacyName = (id: string) => pharmacies.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Field label="Group by">
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} style={{ maxWidth: 240 }}>
            <option value="week">Placement week</option>
            <option value="schedule">Scheduled delivery date</option>
            <option value="route">Delivery route</option>
          </Select>
        </Field>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" to="/stockist/bulk-bill">
            Bulk bill
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/stockist/delivery">
            Routes
          </Link>
        </div>
      </div>
      {!openOrders.length ? (
        <EmptyState title="No open orders" description="Pending through Packed orders appear here for cycle planning." />
      ) : (
        groups.map(([label, list]) => {
          const value = list.reduce((s, o) => s + o.grandTotal, 0);
          const byPharmacy = new Map<string, typeof list>();
          for (const o of list) {
            const rows = byPharmacy.get(o.pharmacyId) ?? [];
            rows.push(o);
            byPharmacy.set(o.pharmacyId, rows);
          }
          return (
            <div key={label} className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{label}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  {list.length} orders · {formatINR(value)}
                </span>
              </div>
              {[...byPharmacy.entries()].map(([phId, phOrders]) => (
                <div key={phId} className="stack" style={{ gap: 4 }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{pharmacyName(phId)}</strong>
                    <span className="muted">
                      {' '}
                      · {phOrders.length} · {formatINR(phOrders.reduce((s, o) => s + o.grandTotal, 0))}
                    </span>
                  </div>
                  {phOrders.map((o) => (
                    <div key={o.id} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                      <span>
                        <Link to={`/stockist/orders/${o.orderNo}`}>{o.orderNo}</Link>{' '}
                        <StatusBadge status={o.status} />
                      </span>
                      <Money value={o.grandTotal} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

/** Standalone route redirects into Orders hub Plan tab. */
export function StockistBatchOrdering() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('tab', 'Plan');
  const qs = next.toString();
  return <Navigate to={`/stockist/orders${qs ? `?${qs}` : ''}`} replace />;
}

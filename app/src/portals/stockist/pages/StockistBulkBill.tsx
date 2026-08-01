import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { bulkIssueInvoices } from '../../../services/fulfilmentService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const BILLABLE = new Set(['Packed', 'Dispatched', 'Delivered', 'PartiallyDelivered']);

export function StockistBulkBill() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const orders =
    useLiveQuery(() => db.orders.where('stockistId').equals(business.id).reverse().sortBy('placedAt'), [business.id]) ??
    [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [report, setReport] = useState<
    { orderId: string; orderNo?: string; ok: boolean; invoiceNo?: string; message?: string }[] | null
  >(null);

  const ready = useMemo(() => {
    const billAhead = !!settings?.billAheadAllowed;
    return orders.filter((o) => {
      if (o.invoiceId) return false;
      if (billAhead) return !['Cancelled', 'Rejected', 'Draft'].includes(o.status);
      return BILLABLE.has(o.status);
    });
  }, [orders, settings?.billAheadAllowed]);

  const selectedIds = ready.filter((o) => selected[o.id]).map((o) => o.id);
  const pharmacyName = (id: string) => pharmacies.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="stack">
      <PageHeader
        title="Bulk bill generation"
        subtitle="Issue one invoice per selected ready order — partial success reported per row"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/stockist/orders">
            Orders
          </Link>
        }
      />

      {!ready.length ? (
        <EmptyState
          title="No billable orders"
          description="Pack (or deliver) orders without invoices to queue them here."
          action={
            <Link className="btn btn-primary" to="/stockist/orders?status=Packed">
              Packed orders
            </Link>
          }
        />
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const all = Object.fromEntries(ready.map((o) => [o.id, true]));
                setSelected(all);
              }}
            >
              Select all
            </Button>
            <Button
              disabled={busy || !selectedIds.length}
              onClick={() =>
                void run(async () => {
                  const res = await bulkIssueInvoices({
                    actor: user,
                    stockist: business,
                    orderIds: selectedIds,
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  setReport(res.data.results);
                  setSelected({});
                  pushToast({
                    tone: res.data.failureCount ? 'warning' : 'success',
                    title: `Issued ${res.data.successCount}/${res.data.results.length}`,
                    message: res.data.failureCount ? `${res.data.failureCount} failed` : undefined,
                  });
                })
              }
            >
              {busy ? 'Issuing…' : `Issue ${selectedIds.length || ''} invoice${selectedIds.length === 1 ? '' : 's'}`}
            </Button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>Order</th>
                  <th>Pharmacy</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selected[o.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [o.id]: e.target.checked }))}
                        aria-label={`Select ${o.orderNo}`}
                      />
                    </td>
                    <td>
                      <Link to={`/stockist/orders/${o.id}`}>{o.orderNo}</Link>
                    </td>
                    <td>{pharmacyName(o.pharmacyId)}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      <Money value={o.grandTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {report ? (
        <div className="card card-pad stack">
          <strong>Last batch report</strong>
          {report.map((r) => (
            <div key={r.orderId} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
              <span>{r.orderNo ?? r.orderId}</span>
              <span className={r.ok ? '' : 'muted'}>
                {r.ok ? r.invoiceNo : r.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

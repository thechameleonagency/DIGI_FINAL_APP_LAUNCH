import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { bulkIssueInvoices } from '../../../services/fulfilmentService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { ShortcutHints } from '../../../ui/components/ShortcutHints';
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
  const [focusIdx, setFocusIdx] = useState(0);
  const [report, setReport] = useState<
    { orderId: string; orderNo?: string; ok: boolean; invoiceNo?: string; message?: string }[] | null
  >(null);
  const firstCheckRef = useRef<HTMLInputElement>(null);

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

  const issueSelected = () => {
    if (busy || !selectedIds.length) return;
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
    });
  };

  useEffect(() => {
    if (!ready.length) return;
    window.setTimeout(() => firstCheckRef.current?.focus(), 0);
  }, [ready.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ready.length) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        issueSelected();
        return;
      }
      if (inField && (e.target as HTMLInputElement).type === 'checkbox') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusIdx((i) => Math.min(i + 1, ready.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusIdx((i) => Math.max(i - 1, 0));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- issueSelected closes over latest selection
  }, [ready, selectedIds, busy]);

  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>(`[data-bulk-row="${focusIdx}"]`);
    el?.focus();
  }, [focusIdx]);

  return (
    <div className="stack">
      <PageHeader
        title="Bulk bill generation"
        subtitle="Issue one invoice per selected ready order — partial success reported per row"
        actions={
          <ShortcutHints
            hints={[
              { keys: 'Ctrl+I', label: 'Create invoice' },
              { keys: 'Space', label: 'Toggle row' },
              { keys: 'Ctrl+Enter', label: 'Issue selected' },
            ]}
            extra={
              <Link className="btn btn-secondary btn-sm" to="/stockist/orders">
                Orders
              </Link>
            }
          />
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
            <Button disabled={busy || !selectedIds.length} onClick={issueSelected}>
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
                {ready.map((o, idx) => (
                  <tr
                    key={o.id}
                    className={focusIdx === idx ? 'is-row-focused' : undefined}
                    onClick={() => setFocusIdx(idx)}
                  >
                    <td>
                      <input
                        ref={idx === 0 ? firstCheckRef : undefined}
                        data-bulk-row={idx}
                        type="checkbox"
                        checked={!!selected[o.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [o.id]: e.target.checked }))}
                        onFocus={() => setFocusIdx(idx)}
                        aria-label={`Select ${o.orderNo}`}
                      />
                    </td>
                    <td>
                      <Link to={`/stockist/orders/${encodeURIComponent(o.orderNo)}`}>{o.orderNo}</Link>
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
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Last batch report</strong>
            {report.some((r) => !r.ok) ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const failedIds = report.filter((r) => !r.ok).map((r) => r.orderId);
                  setSelected(Object.fromEntries(failedIds.map((id) => [id, true])));
                  void run(async () => {
                    const res = await bulkIssueInvoices({
                      actor: user,
                      stockist: business,
                      orderIds: failedIds,
                    });
                    if (!res.ok) {
                      pushToast({ tone: 'error', title: res.message });
                      return;
                    }
                    setReport(res.data.results);
                    setSelected({});
                    pushToast({
                      tone: res.data.failureCount ? 'warning' : 'success',
                      title: `Retry issued ${res.data.successCount}/${res.data.results.length}`,
                      message: res.data.failureCount ? `${res.data.failureCount} still failed` : undefined,
                    });
                  });
                }}
              >
                Retry failed
              </Button>
            ) : null}
          </div>
          {report.map((r) => (
            <div key={r.orderId} className="row" style={{ justifyContent: 'space-between', fontSize: 13, gap: 8 }}>
              <span>{r.orderNo ?? r.orderId}</span>
              <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                <StatusBadge status={r.ok ? 'Paid' : 'Rejected'} />
                <span style={{ color: r.ok ? undefined : 'var(--danger, #b91c1c)' }}>
                  {r.ok ? r.invoiceNo : r.message}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

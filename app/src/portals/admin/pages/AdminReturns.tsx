import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { EmptyState, Field, Input, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';

function dayKey(iso?: string): string {
  return iso ? iso.slice(0, 10) : '';
}

/** Platform returns oversight (AD-22 / P6) — read-only. */
export function AdminReturns() {
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const returns = useLiveQuery(() => db.returns.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray()) ?? [];
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  const rows = useMemo(() => {
    return returns
      .filter((r) => {
        const d = dayKey(r.createdAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .map((r) => ({
        ...r,
        pharmacyName: nameOf(r.pharmacyId),
        stockistName: nameOf(r.stockistId),
        orderNo: orders.find((o) => o.id === r.orderId)?.orderNo ?? r.orderId.slice(0, 8),
        lineQty: r.lines.reduce((s, l) => s + l.qty, 0),
        lineValue: r.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
      }));
  }, [returns, businesses, orders, from, to]);

  const columns = useMemo(
    () => [
      { key: 'returnNo', label: 'Return', getValue: (r: (typeof rows)[0]) => r.returnNo },
      { key: 'orderNo', label: 'Order', getValue: (r: (typeof rows)[0]) => r.orderNo },
      { key: 'pharmacyName', label: 'Pharmacy', getValue: (r: (typeof rows)[0]) => r.pharmacyName },
      { key: 'stockistName', label: 'Stockist', getValue: (r: (typeof rows)[0]) => r.stockistName },
      {
        key: 'status',
        label: 'Status',
        getValue: (r: (typeof rows)[0]) => r.status,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.status} />,
      },
      { key: 'lineQty', label: 'Qty', getValue: (r: (typeof rows)[0]) => r.lineQty },
      {
        key: 'lineValue',
        label: 'Value',
        getValue: (r: (typeof rows)[0]) => r.lineValue,
        render: (r: (typeof rows)[0]) => <Money value={r.lineValue} />,
      },
      {
        key: 'createdAt',
        label: 'Created',
        getValue: (r: (typeof rows)[0]) => r.createdAt,
        render: (r: (typeof rows)[0]) => <span className="muted">{new Date(r.createdAt).toLocaleString()}</span>,
      },
    ],
    [],
  );

  const statusOpts = [
    'Submitted',
    'UnderReview',
    'Approved',
    'PartiallyApproved',
    'Rejected',
    'GoodsReceived',
    'Closed',
    'Cancelled',
  ].map((s) => ({ value: s, label: s }));

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.returnNo} ${r.orderNo} ${r.pharmacyName} ${r.stockistName} ${r.status}`],
    filters: [{ key: 'status', label: 'Status', options: statusOpts }],
    defaultSortKey: 'createdAt',
  });

  const selected = selectedId ? rows.find((r) => r.id === selectedId) : undefined;

  return (
    <div className="stack">
      <PageHeader title="Platform returns" subtitle="Read-only oversight across pharmacies and stockists (P6)" />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search return / order / counterparty"
        filters={[{ key: 'status', label: 'Status', options: statusOpts }]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport('platform-returns.csv');
          pushToast({ tone: 'success', title: 'Exported returns' });
        }}
      />
      {!rows.length ? (
        <EmptyState title="No returns" description="Return requests appear after pharmacies submit them." />
      ) : (
        <>
          <DataListTable
            columns={columns}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(r) => setSelectedId(r.id)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}

      {selected ? (
        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>
              {selected.returnNo} · <StatusBadge status={selected.status} />
            </strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {selected.pharmacyName} → {selected.stockistName} · order{' '}
            <Link to={`/admin/orders/${encodeURIComponent(selected.orderNo)}`}>{selected.orderNo}</Link>
          </div>
          {selected.rejectReason ? <div style={{ fontSize: 13 }}>Reject: {selected.rejectReason}</div> : null}
          {selected.disposition ? <div style={{ fontSize: 13 }}>Disposition: {selected.disposition}</div> : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Approved</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((l, i) => (
                  <tr key={`${selected.id}-${i}`}>
                    <td>{l.productName}</td>
                    <td>{l.qty}</td>
                    <td>{l.approvedQty ?? '—'}</td>
                    <td>{l.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/orders')}>
            Browse related orders
          </button>
        </div>
      ) : null}
    </div>
  );
}

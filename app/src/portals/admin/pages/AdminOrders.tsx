import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { localDayKey } from '../../../domain/utils/dateKeys';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { OrderDeliveriesPanel } from '../../../ui/components/OrderDeliveriesPanel';
import { EmptyState, Field, Input, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';

function dayKey(iso?: string): string {
  return localDayKey(iso);
}

export function AdminOrders() {
  const { orderNo } = useParams();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { items: orders, loading: ordersLoading } = useLiveArray(() => db.orders.toArray());
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray()) ?? [];
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  const rows = useMemo(() => {
    return orders
      .filter((o) => {
        const d = dayKey(o.placedAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .map((o) => ({
        ...o,
        pharmacyName: nameOf(o.pharmacyId),
        stockistName: nameOf(o.stockistId),
      }));
  }, [orders, businesses, from, to]);

  const columns = useMemo(
    () => [
      {
        key: 'orderNo',
        label: 'Order',
        getValue: (o: (typeof rows)[0]) => o.orderNo,
        render: (o: (typeof rows)[0]) => <Link to={`/admin/orders/${encodeURIComponent(o.orderNo)}`}>{o.orderNo}</Link>,
      },
      { key: 'pharmacyName', label: 'Pharmacy', getValue: (o: (typeof rows)[0]) => o.pharmacyName },
      { key: 'stockistName', label: 'Stockist', getValue: (o: (typeof rows)[0]) => o.stockistName },
      {
        key: 'status',
        label: 'Status',
        getValue: (o: (typeof rows)[0]) => o.status,
        render: (o: (typeof rows)[0]) => <StatusBadge status={o.status} />,
      },
      {
        key: 'grandTotal',
        label: 'Total',
        getValue: (o: (typeof rows)[0]) => o.grandTotal,
        render: (o: (typeof rows)[0]) => <Money value={o.grandTotal} />,
      },
      {
        key: 'placedAt',
        label: 'Placed',
        getValue: (o: (typeof rows)[0]) => o.placedAt,
        render: (o: (typeof rows)[0]) => <span className="muted">{new Date(o.placedAt).toLocaleString()}</span>,
      },
    ],
    [],
  );

  const statusOpts = [
    'Pending',
    'Accepted',
    'PartiallyAccepted',
    'Allocated',
    'Packed',
    'Dispatched',
    'Delivered',
    'PartiallyDelivered',
    'Closed',
    'Cancelled',
    'Rejected',
  ].map((s) => ({ value: s, label: s }));

  const list = useListControls(rows, {
    columns,
    searchKeys: [(o) => `${o.orderNo} ${o.status} ${o.pharmacyName} ${o.stockistName}`],
    filters: [{ key: 'status', label: 'Status', options: statusOpts }],
    defaultSortKey: 'placedAt',
  });

  if (orderNo) {
    const decoded = decodeURIComponent(orderNo);
    const order = orders.find((o) => o.orderNo === decoded);
    if (!order) {
      return (
        <div className="stack">
          <PageHeader title="Order detail" />
          <EmptyState
            title="Order not found"
            description="Return to the platform orders list."
            action={
              <Link className="btn btn-primary" to="/admin/orders">
                Back to orders
              </Link>
            }
          />
        </div>
      );
    }
    const invoice = order.invoiceId ? invoices.find((i) => i.id === order.invoiceId) : invoices.find((i) => i.orderId === order.id);
    return (
      <div className="stack">
        <PageHeader
          title={order.orderNo}
          subtitle={`${nameOf(order.pharmacyId)} → ${nameOf(order.stockistId)} · read-only`}
          actions={
            <Link className="btn btn-secondary btn-sm" to="/admin/orders">
              Back to orders
            </Link>
          }
        />
        <div className="row" style={{ gap: 8 }}>
          <StatusBadge status={order.status} />
          <span className="muted" style={{ fontSize: 13 }}>
            Placed {new Date(order.placedAt).toLocaleString()} · <Money value={order.grandTotal} />
          </span>
        </div>
        <div className="card card-pad stack">
          <strong>Lines</strong>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Accepted</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.productName}</td>
                    <td>{l.qty}</td>
                    <td>{l.acceptedQty ?? '—'}</td>
                    <td>
                      <Money value={l.lineTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {invoice ? (
          <div className="card card-pad stack">
            <strong>Invoice</strong>
            <div style={{ fontSize: 13 }}>
              {invoice.invoiceNo} · <StatusBadge status={invoice.status} /> · <Money value={invoice.grandTotal} /> · outstanding{' '}
              <Money value={invoice.outstanding} />
            </div>
          </div>
        ) : null}
        <div className="card card-pad">
          <OrderDeliveriesPanel orderId={order.id} />
        </div>
        <div className="card card-pad stack">
          <strong>Status history</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {order.statusHistory.map((h, i) => (
              <li key={i} className="muted" style={{ fontSize: 13 }}>
                {h.from} → {h.to} · {new Date(h.at).toLocaleString()}
                {h.reason ? ` · ${h.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Platform orders" subtitle="Read-only investigation — counterparty names + date filter" />
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
        placeholder="Search order / pharmacy / stockist"
        filters={[{ key: 'status', label: 'Status', options: statusOpts }]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport('platform-orders.csv');
          pushToast({ tone: 'success', title: 'Exported (filtered)' });
        }}
      />
      {!rows.length ? (
        <EmptyState title="No orders" description="Orders appear after pharmacies place trade." />
      ) : (
        <>
          <DataListTable
            columns={columns}
            loading={ordersLoading}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(o) => navigate(`/admin/orders/${encodeURIComponent(o.orderNo)}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

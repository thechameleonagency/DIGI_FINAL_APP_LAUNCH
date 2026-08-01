import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { EmptyState, Field, Input, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const STATUS_OPTIONS = [
  'Draft',
  'Pending',
  'Accepted',
  'PartiallyAccepted',
  'Allocated',
  'Packed',
  'Dispatched',
  'PartiallyDelivered',
  'Delivered',
  'Closed',
  'Cancelled',
  'Rejected',
];

const INBOX_RANK: Record<string, number> = {
  Pending: 0,
  PartiallyAccepted: 1,
  Accepted: 2,
  Allocated: 3,
  Packed: 4,
  Dispatched: 5,
  PartiallyDelivered: 6,
  Delivered: 7,
  Closed: 8,
  Cancelled: 9,
  Rejected: 10,
  Draft: 11,
};

export function StockistOrders() {
  const { business } = useBiz();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pushToast } = useUi();
  const orders = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const statusParam = params.get('status') ?? '';

  const pharmacyName = (id: string) => pharmacies.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const paymentStatusFor = (orderId: string) => {
    const inv = invoices.find((i) => i.orderId === orderId);
    return inv?.status ?? '—';
  };

  const scoped = useMemo(() => {
    return orders.filter((o) => {
      if (dateFrom && o.placedAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && o.placedAt.slice(0, 10) > dateTo) return false;
      if (minAmount && o.grandTotal < Number(minAmount)) return false;
      if (maxAmount && o.grandTotal > Number(maxAmount)) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo, minAmount, maxAmount]);

  const columns = useMemo(
    () => [
      {
        key: 'inboxRank',
        label: 'Priority',
        getValue: (o: (typeof orders)[0]) => INBOX_RANK[o.status] ?? 99,
        render: () => null,
        sortable: true,
      },
      {
        key: 'orderNo',
        label: 'Order',
        getValue: (o: (typeof orders)[0]) => o.orderNo,
        render: (o: (typeof orders)[0]) => (
          <span>
            <Link to={`/stockist/orders/${o.orderNo}`}>{o.orderNo}</Link>
            {o.source === 'Manual' ? (
              <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                Manual (recorded by you)
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: 'pharmacy',
        label: 'Pharmacy',
        getValue: (o: (typeof orders)[0]) => pharmacyName(o.pharmacyId),
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (o: (typeof orders)[0]) => o.status,
        render: (o: (typeof orders)[0]) => <StatusBadge status={o.status} />,
      },
      {
        key: 'paymentStatus',
        label: 'Payment',
        getValue: (o: (typeof orders)[0]) => paymentStatusFor(o.id),
        render: (o: (typeof orders)[0]) => {
          const s = paymentStatusFor(o.id);
          return s === '—' ? <span className="muted">—</span> : <StatusBadge status={s} />;
        },
      },
      {
        key: 'grandTotal',
        label: 'Total',
        getValue: (o: (typeof orders)[0]) => o.grandTotal,
        render: (o: (typeof orders)[0]) => <Money value={o.grandTotal} />,
      },
      {
        key: 'placedAt',
        label: 'Placed',
        getValue: (o: (typeof orders)[0]) => o.placedAt,
        render: (o: (typeof orders)[0]) => <span className="muted">{new Date(o.placedAt).toLocaleString()}</span>,
      },
    ],
    [pharmacies, invoices],
  );

  const pharmacyOptions = useMemo(
    () =>
      [...new Set(orders.map((o) => o.pharmacyId))]
        .map((id) => ({ value: pharmacyName(id), label: pharmacyName(id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [orders, pharmacies],
  );

  const list = useListControls(scoped, {
    columns,
    searchKeys: [(o) => `${o.orderNo} ${o.status} ${pharmacyName(o.pharmacyId)}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
      },
      {
        key: 'pharmacy',
        label: 'Pharmacy',
        options: pharmacyOptions,
      },
    ],
    defaultSortKey: 'inboxRank',
    defaultSortDir: 'asc',
    initialFilters: statusParam ? { status: statusParam } : undefined,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Orders inbox"
        subtitle="Pending-first · search / filter / sort / export"
        actions={
          <Link className="btn btn-primary btn-sm" to="/stockist/manual-order">
            Manual order
          </Link>
        }
      />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <Field label="Min amount">
          <Input type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} style={{ width: 110 }} />
        </Field>
        <Field label="Max amount">
          <Input type="number" min={0} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} style={{ width: 110 }} />
        </Field>
      </div>
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search order / pharmacy"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
          },
          {
            key: 'pharmacy',
            label: 'Pharmacy',
            options: pharmacyOptions,
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport(`stockist-orders-${business.id}.csv`);
          pushToast({ tone: 'success', title: 'Exported filtered orders' });
        }}
      />
      {!orders.length ? (
        <EmptyState title="No orders yet" description="Orders from connected pharmacies appear here." />
      ) : (
        <>
          <DataListTable
            columns={columns.filter((c) => c.key !== 'inboxRank')}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(o) => navigate(`/stockist/orders/${o.orderNo}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

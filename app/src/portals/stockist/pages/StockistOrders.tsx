import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { acceptOrder } from '../../../services/orderService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, LoadingState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
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
  const { business, user } = useBiz();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pushToast } = useUi();
  const canAccept = useCan('order.accept');
  const { items: orders, loading: ordersLoading } = useLiveArray(
    () => db.orders.where('stockistId').equals(business.id).toArray(),
    [business.id],
  );
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkAcceptOpen, setBulkAcceptOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
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
        key: 'pick',
        label: '',
        getValue: () => '',
        render: (o: (typeof orders)[0]) =>
          o.status === 'Pending' ? (
            <input
              type="checkbox"
              checked={!!selected[o.id]}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setSelected((s) => ({ ...s, [o.id]: e.target.checked }))}
              aria-label={`Select ${o.orderNo}`}
            />
          ) : null,
        sortable: false,
      },
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
    [pharmacies, invoices, selected],
  );

  const selectedPending = useMemo(
    () => orders.filter((o) => o.status === 'Pending' && selected[o.id]),
    [orders, selected],
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
      <ConfirmDialog
        open={bulkAcceptOpen}
        title={`Accept ${selectedPending.length} order${selectedPending.length === 1 ? '' : 's'}?`}
        body="Full requested quantities will be accepted on each selected Pending order. Partial accepts still need the order detail page."
        confirmLabel={bulkBusy ? 'Accepting…' : 'Accept selected'}
        onClose={() => {
          if (!bulkBusy) setBulkAcceptOpen(false);
        }}
        onConfirm={async () => {
          setBulkBusy(true);
          let okCount = 0;
          const failures: string[] = [];
          for (const o of selectedPending) {
            const res = await acceptOrder({ actor: user, stockist: business, orderId: o.id });
            if (res.ok) okCount += 1;
            else failures.push(`${o.orderNo}: ${res.message}`);
          }
          setBulkBusy(false);
          setBulkAcceptOpen(false);
          setSelected({});
          if (okCount) {
            pushToast({
              tone: failures.length ? 'warning' : 'success',
              title: `Accepted ${okCount} order${okCount === 1 ? '' : 's'}`,
              message: failures.length ? failures.slice(0, 3).join(' · ') : undefined,
            });
          } else {
            pushToast({
              tone: 'error',
              title: 'Bulk accept failed',
              message: failures[0] ?? 'No orders were accepted.',
            });
          }
        }}
      />
      <PageHeader
        title="Orders inbox"
        subtitle="Pending-first · search / filter / sort / export"
        actions={
          <div className="row" style={{ gap: 8 }}>
            {canAccept && selectedPending.length ? (
              <Button size="sm" onClick={() => setBulkAcceptOpen(true)} disabled={bulkBusy}>
                Accept selected ({selectedPending.length})
              </Button>
            ) : null}
            <Link className="btn btn-primary btn-sm" to="/stockist/manual-order">
              Manual order
            </Link>
          </div>
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
      {canAccept ? (
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setSelected(
                Object.fromEntries(list.pageRows.filter((o) => o.status === 'Pending').map((o) => [o.id, true])),
              )
            }
          >
            Select pending on page
          </Button>
          <span className="muted" style={{ fontSize: 12 }}>
            {selectedPending.length} pending selected
          </span>
        </div>
      ) : null}
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
      {ordersLoading ? (
        <LoadingState label="Loading orders…" />
      ) : !orders.length ? (
        <EmptyState title="No orders yet" description="Orders from connected pharmacies appear here." />
      ) : (
        <>
          <DataListTable
            columns={columns.filter((c) => c.key !== 'inboxRank')}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            loading={ordersLoading}
            onRowClick={(o) => navigate(`/stockist/orders/${o.orderNo}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

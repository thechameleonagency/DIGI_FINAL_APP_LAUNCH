import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { reorderFromOrder } from '../../../services/catalogueService';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const ORDER_STATUSES = [
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
] as const;

function paymentStatusFor(invoice: { status: string; outstanding: number } | undefined): string {
  if (!invoice) return 'Unbilled';
  if (invoice.status === 'Paid' || invoice.outstanding <= 0) return 'Paid';
  if (invoice.status === 'Overdue') return 'Overdue';
  if (invoice.status === 'PartiallyPaid') return 'PartiallyPaid';
  if (invoice.status === 'Void') return 'Void';
  return invoice.status;
}

export function PharmacyOrders() {
  const { business, user } = useBiz();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const awaiting = params.get('awaiting') === '1';
  const initialStatus = params.get('status') ?? '';
  const { pushToast } = useUi();
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const stockistName = (id: string) => stockists.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  const rows = useMemo(
    () =>
      orders
        .filter((o) => {
          if (awaiting && !['Packed', 'Dispatched'].includes(o.status)) return false;
          if (dateFrom && o.placedAt.slice(0, 10) < dateFrom) return false;
          if (dateTo && o.placedAt.slice(0, 10) > dateTo) return false;
          return true;
        })
        .map((o) => {
          const inv = o.invoiceId ? invoices.find((i) => i.id === o.invoiceId) : undefined;
          return {
            ...o,
            stockistName: stockistName(o.stockistId),
            paymentStatus: paymentStatusFor(inv),
          };
        }),
    [orders, invoices, stockists, dateFrom, dateTo, awaiting],
  );

  const columns = useMemo(
    () => [
      {
        key: 'orderNo',
        label: 'Order',
        getValue: (o: (typeof rows)[0]) => o.orderNo,
        render: (o: (typeof rows)[0]) => (
          <span>
            <Link to={`/pharmacy/orders/${o.orderNo}`}>{o.orderNo}</Link>
            {o.source === 'Manual' ? (
              <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                Recorded by stockist
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: 'stockistName',
        label: 'Stockist',
        getValue: (o: (typeof rows)[0]) => o.stockistName,
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (o: (typeof rows)[0]) => o.status,
        render: (o: (typeof rows)[0]) => <StatusBadge status={o.status} />,
      },
      {
        key: 'paymentStatus',
        label: 'Payment',
        getValue: (o: (typeof rows)[0]) => o.paymentStatus,
        render: (o: (typeof rows)[0]) => <StatusBadge status={o.paymentStatus} />,
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
      {
        key: 'actions',
        label: '',
        getValue: () => '',
        render: (o: (typeof rows)[0]) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={async (e) => {
              e.stopPropagation();
              const res = await reorderFromOrder({ actor: user, pharmacy: business, orderId: o.id });
              if (!res.ok) {
                pushToast({ tone: 'error', title: res.message });
                return;
              }
              pushToast({
                tone: res.data.skipped.length ? 'info' : 'success',
                title: `Added ${res.data.added} to cart`,
                message: res.data.skipped.length
                  ? `Skipped ${res.data.skipped.length}: ${res.data.skipped.map((s) => s.productName).join(', ')}`
                  : undefined,
              });
              navigate('/pharmacy/cart');
            }}
          >
            Reorder
          </Button>
        ),
      },
    ],
    [business, user, navigate, pushToast],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(o) => `${o.orderNo} ${o.status} ${o.stockistName} ${o.paymentStatus} ${o.notes ?? ''}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
      },
      {
        key: 'stockistName',
        label: 'Stockist',
        options: [...new Set(rows.map((r) => r.stockistName))].map((s) => ({ value: s, label: s })),
      },
      {
        key: 'paymentStatus',
        label: 'Payment',
        options: ['Unbilled', 'Issued', 'PartiallyPaid', 'Paid', 'Overdue', 'Void'].map((s) => ({
          value: s,
          label: s,
        })),
      },
    ],
    defaultSortKey: 'placedAt',
    defaultSortDir: 'desc',
    initialFilters: !awaiting && initialStatus ? { status: initialStatus } : undefined,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Orders"
        subtitle={
          awaiting
            ? 'Packed / Dispatched — awaiting delivery'
            : 'Search, filter by status/stockist/payment, date range, export'
        }
      />
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>
      {!orders.length ? (
        <EmptyState
          title="No orders yet"
          description="Place a purchase order from a connected stockist catalogue."
          action={
            <Link className="btn btn-primary" to="/pharmacy/buy">
              Browse catalogue
            </Link>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search order / stockist / status / payment"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
              },
              {
                key: 'stockistName',
                label: 'Stockist',
                options: [...new Set(rows.map((r) => r.stockistName))].map((s) => ({ value: s, label: s })),
              },
              {
                key: 'paymentStatus',
                label: 'Payment',
                options: ['Unbilled', 'Issued', 'PartiallyPaid', 'Paid', 'Overdue', 'Void'].map((s) => ({
                  value: s,
                  label: s,
                })),
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              const ok = list.doExport(`pharmacy-orders-${business.id}.csv`);
              pushToast(ok ? { tone: 'success', title: 'Exported current filter set' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable
            columns={columns}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            emptyTitle="No orders match"
            emptyDescription="Empty result is not an error — adjust filters or place an order."
            onRowClick={(o) => navigate(`/pharmacy/orders/${o.orderNo}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

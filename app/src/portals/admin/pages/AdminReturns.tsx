import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { db } from '../../../data/db';
import { localDayKey } from '../../../domain/utils/dateKeys';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit'
import { EmptyState, Field, Input, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';

function dayKey(iso?: string): string {
  return localDayKey(iso);
}

/** Platform returns oversight — read-only. */
export function AdminReturns({ embedded = false }: { embedded?: boolean }) {
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('admin-returns');
  const tableRef = useTableSectionRef();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { items: returns, loading: returnsLoading } = useLiveArray(() => db.returns.toArray());
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
        lineQty: r.lines.reduce((s, l) => s + (l.approvedQty ?? l.qty), 0),
        lineValue: r.lines.reduce((s, l) => s + (l.approvedQty ?? l.qty) * l.unitPrice, 0),
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
    pageSize: 7,
  });

  return (
    <div className="stack">
      {!embedded ? (
        <PageHeader title="Platform returns" subtitle="Read-only oversight across pharmacies and stockists" />
      ) : null}
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
            stickyHeader
            scrollBody
            tableSectionRef={tableRef}
            columns={columns}
            loading={returnsLoading}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(r) => navigate(`/admin/returns/${encodeURIComponent(r.returnNo)}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { EmptyState, Field, Input, LoadingState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyInvoices() {
  const { business } = useBiz();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const { items: invoices, loading: invoicesLoading } = useLiveArray(
    () => db.invoices.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const rows = useMemo(
    () =>
      invoices
        .filter((i) => {
          const d = (i.issuedAt ?? i.createdAt).slice(0, 10);
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        })
        .map((i) => ({
          ...i,
          stockistName: stockists.find((s) => s.id === i.stockistId)?.name ?? i.stockistId.slice(0, 6),
        })),
    [invoices, stockists, dateFrom, dateTo],
  );

  const columns = useMemo(
    () => [
      {
        key: 'invoiceNo',
        label: 'Invoice',
        getValue: (i: (typeof rows)[0]) => i.invoiceNo,
        render: (i: (typeof rows)[0]) => <Link to={`/pharmacy/invoices/${i.invoiceNo}`}>{i.invoiceNo}</Link>,
      },
      { key: 'stockistName', label: 'Stockist', getValue: (i: (typeof rows)[0]) => i.stockistName },
      {
        key: 'status',
        label: 'Status',
        getValue: (i: (typeof rows)[0]) => i.status,
        render: (i: (typeof rows)[0]) => <StatusBadge status={i.status} />,
      },
      {
        key: 'grandTotal',
        label: 'Total',
        getValue: (i: (typeof rows)[0]) => i.grandTotal,
        render: (i: (typeof rows)[0]) => <Money value={i.grandTotal} />,
      },
      {
        key: 'outstanding',
        label: 'Outstanding',
        getValue: (i: (typeof rows)[0]) => i.outstanding,
        render: (i: (typeof rows)[0]) => <Money value={i.outstanding} />,
      },
      {
        key: 'issuedAt',
        label: 'Issued',
        getValue: (i: (typeof rows)[0]) => i.issuedAt ?? i.createdAt,
        render: (i: (typeof rows)[0]) => (
          <span className="muted">{new Date(i.issuedAt ?? i.createdAt).toLocaleDateString()}</span>
        ),
      },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(i) => `${i.invoiceNo} ${i.stockistName} ${i.status}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Issued', 'PartiallyPaid', 'Paid', 'Overdue', 'Void'].map((s) => ({ value: s, label: s })),
      },
    ],
    defaultSortKey: 'issuedAt',
    defaultSortDir: 'desc',
  });

  return (
    <div className="stack">
      <PageHeader
        title="Invoices"
        subtitle="All pharmacy invoices including Paid and Void"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/payments">
            Make a payment
          </Link>
        }
      />
      <div className="row">
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>
      {invoicesLoading ? (
        <LoadingState label="Loading invoices…" />
      ) : !invoices.length ? (
        <EmptyState title="No invoices yet" description="Invoices appear after stockist billing." />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search invoice / stockist / status"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: ['Issued', 'PartiallyPaid', 'Paid', 'Overdue', 'Void'].map((s) => ({ value: s, label: s })),
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              const ok = list.doExport(`pharmacy-invoices-${business.id}.csv`);
              pushToast(ok ? { tone: 'success', title: 'Exported invoices' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable
            loading={invoicesLoading}
            columns={columns}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(i) => navigate(`/pharmacy/invoices/${i.invoiceNo}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

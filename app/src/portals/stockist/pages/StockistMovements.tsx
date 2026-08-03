import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { db } from '../../../data/db';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit'
import { EmptyState, PageHeader } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistMovements() {
  const { business } = useBiz();
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('stockist-movements');
  const tableRef = useTableSectionRef();
  const [params] = useSearchParams();
  const productFilter = params.get('productId') ?? '';
  const movements =
    useLiveQuery(() => db.inventoryMovements.where('businessId').equals(business.id).reverse().sortBy('at'), [business.id]) ?? [];
  const { items: products, loading: productsLoading } = useLiveArray(
    () => db.products.where('stockistId').equals(business.id).toArray(),
    [business.id],
  );
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const scoped = useMemo(
    () => (productFilter ? movements.filter((m) => m.productId === productFilter) : movements),
    [movements, productFilter],
  );

  const columns = useMemo(
    () => [
      {
        key: 'at',
        label: 'When',
        getValue: (m: (typeof movements)[0]) => m.at,
        render: (m: (typeof movements)[0]) => <span className="muted">{new Date(m.at).toLocaleString()}</span>,
      },
      { key: 'type', label: 'Type', getValue: (m: (typeof movements)[0]) => m.type },
      { key: 'product', label: 'Product', getValue: (m: (typeof movements)[0]) => nameOf(m.productId) },
      { key: 'qty', label: 'Qty', getValue: (m: (typeof movements)[0]) => m.qty },
      { key: 'prevQty', label: 'Prev', getValue: (m: (typeof movements)[0]) => m.prevQty },
      { key: 'newQty', label: 'New', getValue: (m: (typeof movements)[0]) => m.newQty },
      { key: 'reason', label: 'Reason', getValue: (m: (typeof movements)[0]) => m.reason },
      {
        key: 'source',
        label: 'Source',
        getValue: (m: (typeof movements)[0]) => `${m.sourceDocType ?? ''} ${m.sourceDocId ?? ''}`,
      },
    ],
    [products],
  );

  const list = useListControls(scoped, {
    columns,
    searchKeys: [(m) => `${m.type} ${m.reason} ${nameOf(m.productId)} ${m.sourceDocType ?? ''}`],
    filters: [
      {
        key: 'type',
        label: 'Type',
        options: [...new Set(movements.map((m) => m.type))].map((t) => ({ value: t, label: t })),
      },
    ],
    defaultSortKey: 'at',
    defaultSortDir: 'desc',
    pageSize,
    onPageSizeChange: setPageSize,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Movement history"
        subtitle="Stock in / out / adjustments"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/stockist/products?tab=batches">
            Inventory
          </Link>
        }
      />
      {!movements.length ? (
        <EmptyState title="No movements" description="Stock-in, allocation, and dispatch create movement rows." />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search type / product / reason"
            filters={[
              {
                key: 'type',
                label: 'Type',
                options: [...new Set(movements.map((m) => m.type))].map((t) => ({ value: t, label: t })),
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              list.doExport(`movements-${business.id}.csv`);
              pushToast({ tone: 'success', title: 'Exported movements' });
            }}
          />
          <DataListTable
            stickyHeader
            scrollBody
            tableSectionRef={tableRef}
            loading={productsLoading} columns={columns} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
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

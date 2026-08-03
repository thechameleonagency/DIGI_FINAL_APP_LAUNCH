import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { PaginationBar, usePagedRows, useTableSectionRef } from '../../../ui/components/ListToolkit';
import { EmptyState, Field, Input, PageHeader, Select } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistPriceHistory() {
  const { business } = useBiz();
  const { pageSize, setPageSize } = usePersistedPageSize('stockist-price-history');
  const tableRef = useTableSectionRef();
  const [params] = useSearchParams();
  const productFilter = params.get('product') ?? '';
  const changes =
    useLiveQuery(
      () => db.priceChanges.where('stockistId').equals(business.id).reverse().sortBy('at'),
      [business.id],
    ) ?? [];
  const products =
    useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const users = useLiveQuery(() => db.users.where('businessId').equals(business.id).toArray(), [business.id]) ?? [];
  const [productId, setProductId] = useState(productFilter);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const actorName = (id: string) => users.find((u) => u.id === id)?.name ?? id.slice(0, 6);

  const filtered = useMemo(
    () =>
      changes.filter((c) => {
        if (productId && c.productId !== productId) return false;
        if (dateFrom && c.at.slice(0, 10) < dateFrom) return false;
        if (dateTo && c.at.slice(0, 10) > dateTo) return false;
        return true;
      }),
    [changes, productId, dateFrom, dateTo],
  );
  const list = usePagedRows(filtered, pageSize, `${productId}|${dateFrom}|${dateTo}`);

  return (
    <div className="stack">
      <PageHeader
        title="Price history"
        subtitle="PTR/MRP changes from edits and bulk updates — historical orders are never rewritten"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/stockist/products?tab=products">
            Catalogue
          </Link>
        }
      />
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Field label="Product">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>
      {!filtered.length ? (
        <EmptyState title="No price changes yet" description="Edit a product price or run bulk price update to build this trail." />
      ) : (
        <>
          <section className="table-section" ref={tableRef}>
          <div className="table-wrap queue-responsive table-scroll table-sticky">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>PTR</th>
                  <th>MRP</th>
                  <th>Source</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {list.pageRows.map((c) => (
                  <tr key={c.id}>
                    <td className="muted" data-label="When">
                      {new Date(c.at).toLocaleString()}
                    </td>
                    <td data-label="Product">
                      <Link to={`/stockist/products?tab=products&highlight=${c.productId}`}>{nameOf(c.productId)}</Link>
                    </td>
                    <td data-label="PTR">
                      {formatINR(c.oldPtr)} → {formatINR(c.newPtr)}
                    </td>
                    <td data-label="MRP">
                      {c.oldMrp != null || c.newMrp != null
                        ? `${formatINR(c.oldMrp ?? 0)} → ${formatINR(c.newMrp ?? 0)}`
                        : '—'}
                    </td>
                    <td data-label="Source">{c.source}</td>
                    <td data-label="By">{actorName(c.actorId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </section>
          <PaginationBar
            page={list.page}
            pageCount={list.pageCount}
            total={list.total}
            onPage={list.setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { formatINR } from '../../domain/utils/money';
import { Button, EmptyState, Field, Input, Select } from '../../ui/components/primitives';

const PAGE_SIZE = 25;

/** CF-21: public read-only catalogue — MRP/pack only; never PTR or stock. */
export function CatalogueSharePage() {
  const { stockistId } = useParams<{ stockistId: string }>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(0);
  const stockist = useLiveQuery(() => (stockistId ? db.businesses.get(stockistId) : undefined), [stockistId]);
  const catalogue = useLiveQuery(
    () => (stockistId ? db.catalogues.where('stockistId').equals(stockistId).first() : undefined),
    [stockistId],
  );
  const products =
    useLiveQuery(
      () =>
        stockistId
          ? db.products
              .where('stockistId')
              .equals(stockistId)
              .filter((p) => p.status === 'Active')
              .toArray()
          : [],
      [stockistId],
    ) ?? [];

  const categories = useMemo(
    () => ['All', ...[...new Set(products.map((p) => p.category).filter(Boolean))].sort()],
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (!q) return true;
      return `${p.name} ${p.brand} ${p.sku} ${p.category}`.toLowerCase().includes(q);
    });
  }, [products, query, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  if (!stockist || stockist.type !== 'Stockist') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <EmptyState title="Catalogue not found" description="This share link is not valid on this installation." />
          <Link to="/auth/login">Sign in</Link>
        </div>
      </div>
    );
  }

  const paused = catalogue?.status !== 'Active';

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 720 }}>
        <h1 className="auth-brand">DigiSwasthya</h1>
        <p className="auth-sub">Shared catalogue</p>
        <h2 style={{ margin: '8px 0 4px', fontSize: 20 }}>{stockist.name}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          {stockist.city}, {stockist.state}
          {paused ? ' · Catalogue temporarily unavailable' : ''}
        </p>
        <div className="banner-strip" style={{ fontSize: 13 }}>
          Become a customer — <Link to="/auth/register/pharmacy">register as a pharmacy</Link> and request a connection
          to see trade prices and order.
        </div>
        {paused || !products.length ? (
          <EmptyState
            title={paused ? 'Catalogue paused' : 'No products listed'}
            description="PTR and stock levels are never shown on public shares."
          />
        ) : (
          <>
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Search">
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Name, brand, SKU…"
                />
              </Field>
              <Field label="Category">
                <Select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(0);
                  }}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {!filtered.length ? (
              <EmptyState title="No matches" description="Try a different search or category." />
            ) : (
              <>
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Pack</th>
                        <th>MRP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {p.name}
                            <div className="muted" style={{ fontSize: 11 }}>
                              {p.brand} · {p.sku}
                            </div>
                          </td>
                          <td>{p.packSize}</td>
                          <td>{formatINR(p.mrp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {filtered.length} product{filtered.length === 1 ? '' : 's'} · page {safePage + 1}/{pageCount}
                  </span>
                  <div className="row" style={{ gap: 8 }}>
                    <Button size="sm" variant="secondary" disabled={safePage <= 0} onClick={() => setPage((p) => p - 1)}>
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={safePage >= pageCount - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
        <p className="muted" style={{ fontSize: 11, marginTop: 16 }}>
          Public view — trade PTR and quantities are hidden by design.
        </p>
      </div>
    </div>
  );
}

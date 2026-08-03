import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { productAvailableSellable } from '../../../domain/calc';
import { setCartLine } from '../../../services/catalogueService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { PaginationBar, usePagedRows } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyCompare() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const [params] = useSearchParams();
  const productId = params.get('productId') ?? '';
  const seed = useLiveQuery(() => (productId ? db.products.get(productId) : undefined), [productId]);
  const allProducts = useLiveQuery(() => db.products.filter((p) => p.status === 'Active').toArray()) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const catalogues = useLiveQuery(() => db.catalogues.toArray()) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));

  const matches = useMemo(() => {
    if (!seed) return [];
    const keyName = `${seed.name}|${seed.brand}`.toLowerCase();
    return allProducts.filter(
      (p) =>
        p.sku === seed.sku ||
        `${p.name}|${p.brand}`.toLowerCase() === keyName,
    );
  }, [seed, allProducts]);

  const matchIdsKey = useMemo(() => matches.map((p) => p.id).sort().join(','), [matches]);
  const batches =
    useLiveQuery(() => {
      const ids = matchIdsKey ? matchIdsKey.split(',') : [];
      return ids.length ? db.batches.where('productId').anyOf(ids).toArray() : [];
    }, [matchIdsKey]) ?? [];

  const rows = useMemo(
    () =>
      matches.map((p) => {
        const conn = connections.find((c) => c.stockistId === p.stockistId);
        const active = conn?.status === 'Active';
        const cat = catalogues.find((c) => c.stockistId === p.stockistId);
        const avail = productAvailableSellable(batches.filter((b) => b.productId === p.id));
        const showPrice = active && (!cat || cat.status === 'Active');
        return {
          p,
          stockistName: stockists.find((s) => s.id === p.stockistId)?.name ?? p.stockistId.slice(0, 6),
          connStatus: conn?.status ?? 'Disconnected',
          active,
          showPrice,
          avail,
          ptr: showPrice ? priceForPlatformPharmacy(p, settings).unitPrice : (null as number | null),
        };
      }),
    [matches, connections, catalogues, batches, stockists, settings],
  );

  const priced = rows.filter((r) => r.ptr != null).map((r) => r.ptr as number);
  const lowest = priced.length ? Math.min(...priced) : null;
  const list = usePagedRows(rows);

  if (!productId) {
    return (
      <div className="stack">
        <PageHeader title="Compare prices" backTo="/pharmacy/buy" backLabel="Back to buy" />
        <EmptyState
          title="Pick a product to compare"
          description="Open a product detail and choose Compare prices."
          action={
            <Link className="btn btn-primary" to="/pharmacy/buy">
              Browse
            </Link>
          }
        />
      </div>
    );
  }

  if (!seed) return <EmptyState title="Product not found" description="Cannot build a comparison." />;

  return (
    <div className="stack">
      <PageHeader
        title="Compare prices"
        subtitle={`Matching “${seed.name}” (${seed.brand} / ${seed.sku}) across stockists`}
        backTo={`/pharmacy/product/${seed.id}`}
        backLabel="Back to product"
      />
      {!rows.length ? (
        <EmptyState title="No matches" description="No other Active catalogue listings matched this product." />
      ) : (
        <>
          <div className="table-wrap queue-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>Stockist</th>
                  <th>Connection</th>
                  <th>PTR</th>
                  <th>MOQ</th>
                  <th>Availability</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.pageRows.map((r) => {
                  const isLowest = r.ptr != null && lowest != null && r.ptr === lowest && priced.length > 1;
                  return (
                    <tr
                      key={r.p.id}
                      style={isLowest ? { background: 'color-mix(in srgb, var(--accent) 8%, white)' } : undefined}
                    >
                      <td data-label="Stockist">
                        <Link to={`/pharmacy/product/${r.p.id}`}>{r.stockistName}</Link>
                        {isLowest ? (
                          <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                            Lowest
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Connection">
                        <StatusBadge status={r.connStatus} />
                      </td>
                      <td data-label="PTR">
                        {r.showPrice && r.ptr != null ? <Money value={r.ptr} /> : 'Connect to see price'}
                      </td>
                      <td data-label="MOQ">{r.p.moq}</td>
                      <td data-label="Availability">
                        {r.active ? r.avail : r.avail > 0 ? 'In stock' : 'Out of stock'}
                      </td>
                      <td className="col-actions" data-label="Action">
                        <div className="table-row-actions">
                          <Button
                            size="sm"
                            disabled={!r.active || !r.showPrice}
                            onClick={async () => {
                              const res = await setCartLine({
                                actor: user,
                                pharmacy: business,
                                stockistId: r.p.stockistId,
                                productId: r.p.id,
                                qty: r.p.moq,
                              });
                              pushToast(
                                res.ok
                                  ? { tone: 'success', title: 'Added to cart' }
                                  : { tone: 'error', title: res.message },
                              );
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

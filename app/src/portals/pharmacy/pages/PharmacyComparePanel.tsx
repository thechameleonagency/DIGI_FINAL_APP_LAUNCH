import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { productAvailableSellable } from '../../../domain/calc';
import { setCartLine } from '../../../services/catalogueService';
import { applySchemeToUnitPrice } from '../../../services/deliveryCommerceService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { PaginationBar, usePagedRows, useTableSectionRef } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Money, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyComparePanel({
  productId,
  compact = false,
}: {
  productId: string;
  /** Hide empty “pick a product” chrome when opened from a Sheet with a known id. */
  compact?: boolean;
}) {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('pharmacy-compare');
  const tableRef = useTableSectionRef();
  const seed = useLiveQuery(() => (productId ? db.products.get(productId) : undefined), [productId]);
  const allProducts = useLiveQuery(() => db.products.filter((p) => p.status === 'Active').toArray()) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const catalogues = useLiveQuery(() => db.catalogues.toArray()) ?? [];
  const schemes = useLiveQuery(() => db.schemes.toArray()) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));

  const matches = useMemo(() => {
    if (!seed) return [];
    const keyName = `${seed.name}|${seed.brand}`.toLowerCase();
    return allProducts.filter(
      (p) => p.sku === seed.sku || `${p.name}|${p.brand}`.toLowerCase() === keyName,
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
        const baseUnit = showPrice ? priceForPlatformPharmacy(p, settings).unitPrice : null;
        const stockistSchemes = schemes.filter((s) => s.stockistId === p.stockistId);
        const priced =
          baseUnit != null
            ? applySchemeToUnitPrice({ unitPrice: baseUnit, product: p, schemes: stockistSchemes })
            : null;
        return {
          p,
          stockistName: stockists.find((s) => s.id === p.stockistId)?.name ?? p.stockistId.slice(0, 6),
          connStatus: conn?.status ?? 'Disconnected',
          inCircle: !!conn?.inCircle && active,
          active,
          showPrice,
          avail,
          effectivePrice: priced?.unitPrice ?? (null as number | null),
          scheme: priced?.scheme,
        };
      }),
    [matches, connections, catalogues, batches, stockists, settings, schemes],
  );

  const priced = rows.filter((r) => r.effectivePrice != null).map((r) => r.effectivePrice as number);
  const lowest = priced.length ? Math.min(...priced) : null;
  const list = usePagedRows(rows, pageSize);

  if (!productId) {
    if (compact) return null;
    return (
      <EmptyState
        title="Pick a product to compare"
        description="Open a product detail or Buy and choose Compare."
        action={
          <Link className="btn btn-primary" to="/pharmacy/buy">
            Browse
          </Link>
        }
      />
    );
  }

  if (!seed) return <EmptyState title="Product not found" description="Cannot build a comparison." />;

  if (!rows.length) {
    return <EmptyState title="No matches" description="No other Active catalogue listings matched this product." />;
  }

  return (
    <div className="stack">
      {!compact ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Matching “{seed.name}” ({seed.brand} / {seed.sku}) across stockists
        </p>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {seed.name} · {seed.brand} · {seed.sku}
        </p>
      )}
      <section className="table-section" ref={tableRef}>
      <div className={`table-wrap queue-responsive${compact ? '' : ' table-scroll table-sticky'}`}>
        <table className="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Pack</th>
              <th>Stockist</th>
              <th>Connection</th>
              <th>Unit price</th>
              <th>GST%</th>
              <th>MOQ</th>
              <th>Availability</th>
              <th>Scheme</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {list.pageRows.map((r) => {
              const isLowest =
                r.effectivePrice != null && lowest != null && r.effectivePrice === lowest && priced.length > 1;
              return (
                <tr
                  key={r.p.id}
                  style={isLowest ? { background: 'color-mix(in srgb, var(--accent) 8%, white)' } : undefined}
                >
                  <td data-label="Product">
                    <Link to={`/pharmacy/product/${r.p.id}`}>{r.p.name}</Link>
                    {isLowest ? (
                      <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                        Lowest
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Pack">{r.p.packSize}</td>
                  <td data-label="Stockist">{r.stockistName}</td>
                  <td data-label="Connection">
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <StatusBadge status={r.connStatus} />
                      {r.inCircle ? <StatusBadge status="Circle" /> : null}
                    </div>
                  </td>
                  <td data-label="Unit price">
                    {r.showPrice && r.effectivePrice != null ? (
                      <Money value={r.effectivePrice} />
                    ) : (
                      'Connect to see price'
                    )}
                  </td>
                  <td data-label="GST%">{r.p.gstPercent}%</td>
                  <td data-label="MOQ">{r.p.moq}</td>
                  <td data-label="Availability">
                    {r.active ? r.avail : r.avail > 0 ? 'In stock' : 'Out of stock'}
                  </td>
                  <td data-label="Scheme">
                    {r.scheme ? (
                      <span className="chip" title={r.scheme.title}>
                        {r.scheme.discountType === 'percent'
                          ? `${r.scheme.discountValue}%`
                          : `₹${r.scheme.discountValue}`}
                      </span>
                    ) : (
                      '—'
                    )}
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
      </section>
      <PaginationBar
        page={list.page}
        pageCount={list.pageCount}
        total={list.total}
        onPage={list.setPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        stickyFooter={!compact}
        tableSectionRef={tableRef}
      />
    </div>
  );
}

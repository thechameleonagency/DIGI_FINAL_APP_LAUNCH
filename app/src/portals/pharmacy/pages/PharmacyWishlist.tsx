import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { setCartLine, toggleWishlist } from '../../../services/catalogueService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyWishlist() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const items = useLiveQuery(() => db.wishlists.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));

  const rows = items.map((i) => {
    const product = products.find((p) => p.id === i.productId);
    const conn = connections.find((c) => c.stockistId === i.stockistId);
    const active = conn?.status === 'Active';
    return {
      item: i,
      product,
      stockistName: stockists.find((s) => s.id === i.stockistId)?.name ?? i.stockistId.slice(0, 6),
      active,
      connStatus: conn?.status ?? 'Disconnected',
    };
  });

  const moveAll = async () => {
    let added = 0;
    let skipped = 0;
    for (const r of rows) {
      if (!r.product || !r.active || r.product.status !== 'Active') {
        skipped++;
        continue;
      }
      const res = await setCartLine({
        actor: user,
        pharmacy: business,
        stockistId: r.item.stockistId,
        productId: r.product.id,
        qty: r.product.moq,
      });
      if (res.ok) added++;
      else skipped++;
    }
    pushToast({
      tone: added ? 'success' : 'error',
      title: added ? `Added ${added} to cart` : 'Nothing added',
      message: skipped ? `${skipped} skipped (inactive or disconnected)` : undefined,
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Wishlist"
        subtitle="Saved catalogue items — add to cart requires Active connection"
        actions={
          items.length ? (
            <Button size="sm" variant="secondary" onClick={() => void moveAll()}>
              Move all to cart
            </Button>
          ) : null
        }
      />
      {!items.length ? (
        <EmptyState
          title="Wishlist empty"
          description="Save products while browsing catalogues."
          action={
            <Link className="btn btn-primary" to="/pharmacy/buy">
              Browse
            </Link>
          }
        />
      ) : (
        <div className="stack">
          {rows.map(({ item, product, stockistName, active, connStatus }) => (
            <div key={item.id} className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>
                    {product ? (
                      <Link to={`/pharmacy/product/${product.id}`}>{product.name}</Link>
                    ) : (
                      'Product removed'
                    )}
                  </strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {stockistName}
                    {product ? ` · ${product.brand} · ${product.sku}` : ''}
                  </div>
                </div>
                <StatusBadge status={connStatus} />
              </div>
              {product ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  {active ? (
                    <>
                      Price <Money value={priceForPlatformPharmacy(product, settings).unitPrice} /> · MRP{' '}
                      {formatINR(product.mrp)}
                    </>
                  ) : (
                    'Connect to see price'
                  )}
                  {product.status !== 'Active' ? ' · Inactive — cannot add' : ''}
                </div>
              ) : null}
              <div className="row">
                <Button
                  size="sm"
                  disabled={!active || !product || product.status !== 'Active'}
                  onClick={async () => {
                    if (!product) return;
                    const res = await setCartLine({
                      actor: user,
                      pharmacy: business,
                      stockistId: item.stockistId,
                      productId: product.id,
                      qty: product.moq,
                    });
                    pushToast(
                      res.ok
                        ? { tone: 'success', title: 'Added to cart' }
                        : { tone: 'error', title: res.message },
                    );
                  }}
                >
                  Add to cart
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await toggleWishlist({
                      actor: user,
                      pharmacy: business,
                      productId: item.productId,
                      stockistId: item.stockistId,
                    });
                    pushToast({ tone: 'info', title: 'Removed from wishlist' });
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

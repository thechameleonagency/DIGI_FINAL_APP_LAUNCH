import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { productAvailableSellable } from '../../../domain/calc';
import { setCartLine, toggleWishlist } from '../../../services/catalogueService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyProductDetail() {
  const { productId } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const product = useLiveQuery(() => (productId ? db.products.get(productId) : undefined), [productId]);
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const stockist = useLiveQuery(() => (product ? db.businesses.get(product.stockistId) : undefined), [product?.stockistId]);
  const connection = useLiveQuery(
    () =>
      product
        ? db.connections.where({ pharmacyId: business.id, stockistId: product.stockistId }).first()
        : undefined,
    [business.id, product?.stockistId],
  );
  const batches =
    useLiveQuery(() => (product ? db.batches.where('productId').equals(product.id).toArray() : []), [product?.id]) ?? [];
  const catalogue = useLiveQuery(
    () => (product ? db.catalogues.where('stockistId').equals(product.stockistId).first() : undefined),
    [product?.stockistId],
  );

  if (!product) return <EmptyState title="Product not found" description="It may have been removed from the catalogue." />;

  const active = connection?.status === 'Active';
  const catalogueOk = !catalogue || catalogue.status === 'Active';
  const avail = productAvailableSellable(batches);
  const canBuy = active && catalogueOk && product.status === 'Active';
  const unitPrice = priceForPlatformPharmacy(product, settings).unitPrice;

  return (
    <div className="stack">
      <PageHeader
        title={product.name}
        subtitle={`${product.brand} · ${product.sku} · ${stockist?.name ?? 'Stockist'}`}
        actions={
          <>
            <Link className="btn btn-secondary btn-sm" to={`/pharmacy/compare?productId=${product.id}`}>
              Compare prices
            </Link>
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
              Back
            </Button>
          </>
        }
      />
      <div className="grid-2">
        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <StatusBadge status={product.status} />
            {connection ? <StatusBadge status={connection.status} /> : <StatusBadge status="Disconnected" />}
          </div>
          <div>
            Pack {product.packSize} · Category {product.category}
            {product.pricingClass ? ` · ${product.pricingClass}` : ''}
          </div>
          {product.hsn ? <div className="muted">HSN {product.hsn}</div> : null}
          {product.composition ? <div className="muted">Composition {product.composition}</div> : null}
          {product.description ? <div className="muted">{product.description}</div> : null}
          <div className="row" style={{ gap: 24 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Unit price
              </div>
              <strong>{canBuy ? <Money value={unitPrice} /> : 'Connect to see price'}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                MRP
              </div>
              <strong>{canBuy ? <Money value={product.mrp} /> : '—'}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                GST
              </div>
              <strong>{product.gstPercent}%</strong>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            MOQ {product.moq}
            {product.maxQty != null ? ` · Max ${product.maxQty}` : ''} ·{' '}
            {active ? `Available ${avail}` : avail > 0 ? 'In stock' : 'Out of stock'}
          </div>
          {!catalogueOk ? <div className="banner-strip warning">Catalogue is not Active — browsing/cart blocked.</div> : null}
          <div className="row">
            <Button
              disabled={!canBuy}
              onClick={async () => {
                const res = await setCartLine({
                  actor: user,
                  pharmacy: business,
                  stockistId: product.stockistId,
                  productId: product.id,
                  qty: product.moq,
                });
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Added to cart' }
                    : { tone: 'error', title: res.message, message: res.businessImpact },
                );
                if (res.ok) navigate('/pharmacy/cart');
              }}
            >
              Add to cart
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await toggleWishlist({
                  actor: user,
                  pharmacy: business,
                  productId: product.id,
                  stockistId: product.stockistId,
                });
                pushToast({ tone: 'info', title: 'Wishlist updated' });
              }}
            >
              Wishlist
            </Button>
          </div>
        </div>
        <div className="card card-pad stack">
          <strong>Seller</strong>
          <div>{stockist?.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {stockist?.city}, {stockist?.state}
          </div>
          <Link className="btn btn-secondary btn-sm" to={`/pharmacy/buy/${product.stockistId}`}>
            Browse catalogue
          </Link>
        </div>
      </div>
    </div>
  );
}

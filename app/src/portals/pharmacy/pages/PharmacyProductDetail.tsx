import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { productAvailableSellable } from '../../../domain/calc';
import { addOrIncrementCartLine, toggleWishlist } from '../../../services/catalogueService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Field, Input, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyProductDetail() {
  const { productId } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
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
  const [qty, setQty] = useState<number | ''>('');

  if (!product) return <EmptyState title="Product not found" description="It may have been removed from the catalogue." />;

  const active = connection?.status === 'Active';
  const catalogueOk = !catalogue || catalogue.status === 'Active';
  const avail = productAvailableSellable(batches);
  const canBuy = active && catalogueOk && product.status === 'Active';
  const unitPrice = priceForPlatformPharmacy(product, settings).unitPrice;
  const addQty = qty === '' ? product.moq : qty;

  return (
    <div className="stack">
      <PageHeader
        title={product.name}
        subtitle={`${product.brand} · ${product.sku} · ${stockist?.name ?? 'Stockist'}`}
        backTo={`/pharmacy/buy/${product.stockistId}`}
        backLabel="Back to catalogue"
        actions={
          <Link className="btn btn-secondary btn-sm" to={`/pharmacy/compare?productId=${product.id}`}>
            Compare prices
          </Link>
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
          {product.scheduleType && product.scheduleType !== 'NONE' ? (
            <div className="banner-strip warning">Schedule {product.scheduleType} — prescription controls may apply.</div>
          ) : null}
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <tbody>
              <tr>
                <td className="muted">HSN</td>
                <td>{product.hsn || '—'}</td>
                <td className="muted">Pack</td>
                <td>{product.packSize}</td>
              </tr>
              <tr>
                <td className="muted">Category</td>
                <td>{product.category}</td>
                <td className="muted">Class</td>
                <td>{product.pricingClass}</td>
              </tr>
              <tr>
                <td className="muted">MOQ</td>
                <td>{product.moq}</td>
                <td className="muted">Max</td>
                <td>{product.maxQty ?? '—'}</td>
              </tr>
            </tbody>
          </table>
          <div className="row" style={{ gap: 24 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Unit price (incl. platform fees)
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
            {active ? `Available ${avail}` : avail > 0 ? 'In stock' : 'Out of stock'}
            {product.listedForSale === false ? ' · Not listed for sale' : ''}
          </div>
          {!catalogueOk ? <div className="banner-strip warning">Catalogue is not Active — browsing/cart blocked.</div> : null}
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Qty">
              <Input
                type="number"
                min={product.moq}
                max={product.maxQty}
                style={{ width: 96 }}
                value={qty}
                placeholder={String(product.moq)}
                onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!canBuy}
              />
            </Field>
            <Button
              disabled={!canBuy || !(addQty > 0)}
              onClick={async () => {
                const res = await addOrIncrementCartLine({
                  actor: user,
                  pharmacy: business,
                  stockistId: product.stockistId,
                  productId: product.id,
                  qty: addQty,
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  return;
                }
                pushToast({
                  tone: 'success',
                  title: res.data.incremented ? 'Cart updated' : 'Added to cart',
                  message: `${product.name} · qty ${res.data.newQty}. Stay browsing or open cart from the top bar.`,
                });
              }}
            >
              Add to cart
            </Button>
            <Link className="btn btn-secondary" to="/pharmacy/cart">
              View cart
            </Link>
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
          <Link className="btn btn-secondary btn-sm" to={`/pharmacy/stockists/${product.stockistId}`}>
            Stockist details
          </Link>
        </div>
      </div>
      {batches.length > 0 ? (
        <div className="card card-pad stack">
          <strong>Batches</strong>
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Available</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.batchNumber}</td>
                  <td>{b.expiryDate}</td>
                  <td>{Math.max(0, b.onHand - b.reserved)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <MultiStockistPriceTable
        pharmacyId={business.id}
        productName={product.name}
        brand={product.brand}
        currentProductId={product.id}
        settings={settings}
      />
    </div>
  );
}

function MultiStockistPriceTable(props: {
  pharmacyId: string;
  productName: string;
  brand: string;
  currentProductId: string;
  settings: import('../../../domain/entities/types').PlatformSettings | undefined;
}) {
  const peers =
    useLiveQuery(async () => {
      const conns = await db.connections
        .where('pharmacyId')
        .equals(props.pharmacyId)
        .filter((c) => c.status === 'Active')
        .toArray();
      const rows: {
        productId: string;
        stockistId: string;
        stockistName: string;
        unitPrice: number;
        available: number;
      }[] = [];
      for (const c of conns) {
        const products = await db.products
          .where('stockistId')
          .equals(c.stockistId)
          .filter(
            (p) =>
              p.status === 'Active' &&
              p.listedForSale !== false &&
              (p.name.toLowerCase() === props.productName.toLowerCase() ||
                (p.brand === props.brand && p.name.toLowerCase().includes(props.productName.toLowerCase().split(' ')[0] ?? ''))),
          )
          .toArray();
        const biz = await db.businesses.get(c.stockistId);
        for (const p of products) {
          const batches = await db.batches.where('productId').equals(p.id).toArray();
          const avail = productAvailableSellable(batches);
          rows.push({
            productId: p.id,
            stockistId: p.stockistId,
            stockistName: biz?.name ?? p.stockistId,
            unitPrice: priceForPlatformPharmacy(p, props.settings).unitPrice,
            available: avail,
          });
        }
      }
      return rows.sort((a, b) => a.unitPrice - b.unitPrice);
    }, [props.pharmacyId, props.productName, props.brand, props.settings]) ?? [];

  if (peers.length < 2) return null;
  const lowest = peers[0]?.unitPrice;
  return (
    <div className="card card-pad stack">
      <strong>Prices across your stockists</strong>
      <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th>Stockist</th>
            <th>Unit price</th>
            <th>Available</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {peers.map((r) => (
            <tr key={r.productId} style={r.productId === props.currentProductId ? { fontWeight: 600 } : undefined}>
              <td>
                {r.stockistName}
                {r.unitPrice === lowest ? ' · Lowest' : ''}
              </td>
              <td>
                <Money value={r.unitPrice} />
              </td>
              <td>{r.available}</td>
              <td>
                {r.productId !== props.currentProductId ? (
                  <Link className="btn btn-secondary btn-sm" to={`/pharmacy/product/${r.productId}`}>
                    View
                  </Link>
                ) : (
                  <span className="muted">This offer</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

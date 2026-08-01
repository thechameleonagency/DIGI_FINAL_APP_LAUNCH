import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cartTotals, productAvailableSellable } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { getCart, setCartLine, toggleWishlist } from '../../../services/catalogueService';
import { requestConnection } from '../../../services/connectionService';
import { setFavourite, sortStockistsFavouritesFirst } from '../../../services/favouriteService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { AnnouncementStrip } from '../../../ui/components/AnnouncementStrip';
import { Button, EmptyState, Field, Input, Modal, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { PharmacyCompare } from './PharmacyCompare';
import { PharmacyQuickOrder } from './PharmacyQuickOrder';
import { useBiz } from './useBiz';

export function PharmacyBuy() {
  const { business, user } = useBiz();
  const { stockistId } = useParams();
  const { pushToast } = useUi();
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const favourites =
    useLiveQuery(() => db.favourites.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const favIds = new Set(favourites.map((f) => f.stockistId));
  const [stockistQ, setStockistQ] = useState('');
  const [productQ, setProductQ] = useState('');
  const [category, setCategory] = useState('All');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [sheet, setSheet] = useState<'quick' | 'compare' | null>(null);
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));

  const selected = stockistId ?? connections.find((c) => c.status === 'Active')?.stockistId;
  const catalogue = useLiveQuery(
    () => (selected ? db.catalogues.where('stockistId').equals(selected).first() : undefined),
    [selected],
  );
  const products =
    useLiveQuery(async () => {
      if (!selected) return [];
      return db.products.where('stockistId').equals(selected).toArray();
    }, [selected]) ?? [];
  const batches = useLiveQuery(() => db.batches.toArray()) ?? [];
  const catalogueBlocked = catalogue && catalogue.status !== 'Active';
  const [cart, setCart] = useState<Awaited<ReturnType<typeof getCart>> | null>(null);

  useEffect(() => {
    if (selected) getCart(business.id, selected).then(setCart);
  }, [business.id, selected]);

  const categories = ['All', ...new Set(products.map((p) => p.category))];
  const filtered = products.filter((p) => {
    if (p.status !== 'Active') return false;
    if (category !== 'All' && p.category !== category) return false;
    if (productQ && !`${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(productQ.toLowerCase())) return false;
    return true;
  });

  const connFor = (sid: string) => connections.find((c) => c.stockistId === sid);
  const active = selected ? connFor(selected)?.status === 'Active' : false;
  const cartLines = cart?.lines ?? [];
  const miniTotals = cartTotals(
    cartLines
      .map((l) => {
        const p = products.find((x) => x.id === l.productId);
        if (!p) return null;
        const unitPrice = priceForPlatformPharmacy(p, settings).unitPrice;
        return { qty: l.qty, unitPrice, gstPercent: p.gstPercent };
      })
      .filter(Boolean) as { qty: number; unitPrice: number; gstPercent: number }[],
  );

  return (
    <div className="stack" style={{ paddingBottom: cartLines.length ? 72 : 0 }}>
      <PageHeader
        title="Buy"
        subtitle="Discover stockists and browse catalogues (prices require Active connection)"
        actions={
          <div className="row">
            <Link className="btn btn-primary btn-sm" to="/pharmacy/smart-order">
              Smart Order
            </Link>
            <Button size="sm" variant="secondary" type="button" onClick={() => setSheet('quick')}>
              Quick Order
            </Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setSheet('compare')}>
              Compare
            </Button>
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/marketplace">
              Marketplace
            </Link>
          </div>
        }
      />
      <Modal open={sheet === 'quick'} title="Quick Order" onClose={() => setSheet(null)}>
        <PharmacyQuickOrder />
      </Modal>
      <Modal open={sheet === 'compare'} title="Compare" onClose={() => setSheet(null)}>
        <PharmacyCompare />
      </Modal>
      <AnnouncementStrip audience="Pharmacy" placement="Pharmacy Buy" />
      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Stockists</strong>
          <Field label="Search">
            <Input value={stockistQ} onChange={(e) => setStockistQ(e.target.value)} placeholder="City, name…" />
          </Field>
          {sortStockistsFavouritesFirst(
            stockists
              .filter((s) => s.verificationStatus === 'Approved')
              .filter((s) => !stockistQ || `${s.name} ${s.city}`.toLowerCase().includes(stockistQ.toLowerCase())),
            favIds,
          ).map((s) => {
              const c = connFor(s.id);
              const isFav = favIds.has(s.id);
              return (
                <div
                  key={s.id}
                  className="card card-pad queue-card"
                  style={{ borderColor: selected === s.id ? 'var(--accent)' : undefined }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>
                        {isFav ? '★ ' : ''}
                        {s.name}
                      </strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {s.city} · {s.servicePins?.slice(0, 3).join(', ')}
                      </div>
                    </div>
                    {c ? <StatusBadge status={c.status} /> : <StatusBadge status="Disconnected" />}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const res = await setFavourite({
                          actor: user,
                          pharmacy: business,
                          stockistId: s.id,
                          favourite: !isFav,
                        });
                        pushToast(
                          res.ok
                            ? { tone: 'success', title: isFav ? 'Unpinned' : 'Pinned favourite' }
                            : { tone: 'error', title: res.message },
                        );
                      }}
                    >
                      {isFav ? 'Unpin' : 'Pin'}
                    </Button>
                    <Link className="btn btn-secondary btn-sm" to={`/pharmacy/buy/${s.id}`}>
                      Browse
                    </Link>
                    {!c || c.status === 'Rejected' || c.status === 'Disconnected' || c.status === 'Cancelled' ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          const res = await requestConnection({ actor: user, pharmacy: business, stockistId: s.id });
                          pushToast(
                            res.ok
                              ? { tone: 'success', title: 'Connection requested' }
                              : { tone: 'error', title: res.message },
                          );
                        }}
                      >
                        Request connection
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="card card-pad stack">
          <strong>Catalogue</strong>
          {selected ? (
            <>
              <div className="row">
                <Field label="Search products">
                  <Input value={productQ} onChange={(e) => setProductQ(e.target.value)} />
                </Field>
                <Field label="Category">
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Link className="btn btn-primary btn-sm" to="/pharmacy/cart">
                  Open cart
                </Link>
              </div>
              {!active ? (
                <div className="banner-strip warning">Connect with this stockist to see PTR pricing and place orders.</div>
              ) : null}
              {catalogueBlocked ? (
                <EmptyState
                  title="Catalogue unavailable"
                  description={`This stockist catalogue is in ${catalogue?.status} mode. Browse is blocked until it returns to Active.`}
                />
              ) : !filtered.length ? (
                <EmptyState
                  title="No products yet"
                  description="This stockist hasn't published products yet."
                  action={
                    <Link className="btn btn-primary" to="/pharmacy/connections">
                      Manage connections
                    </Link>
                  }
                />
              ) : (
                <div className="product-grid">
                  {filtered.map((p) => {
                    const avail = productAvailableSellable(batches.filter((b) => b.productId === p.id));
                    const inCart = cartLines.find((l) => l.productId === p.id);
                    const qty = qtys[p.id] ?? inCart?.qty ?? p.moq;
                    const unitPrice = priceForPlatformPharmacy(p, settings).unitPrice;
                    const discount = p.mrp > 0 ? Math.round(((p.mrp - unitPrice) / p.mrp) * 100) : 0;
                    return (
                      <div key={p.id} className="card product-card">
                        <h3>
                          <Link to={`/pharmacy/product/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {p.name}
                          </Link>
                        </h3>
                        <div className="meta">
                          {p.brand} · {p.packSize} · {p.sku}
                          {p.pricingClass ? ` · ${p.pricingClass}` : ''}
                        </div>
                        <div className="price">
                          {active ? (
                            <>
                              {formatINR(unitPrice)}{' '}
                              <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                                MRP {formatINR(p.mrp)}
                                {discount > 0 ? ` · ${discount}% off` : ''}
                              </span>
                            </>
                          ) : (
                            'Price on connect'
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {active ? `Available: ${avail}` : avail > 0 ? 'In stock' : 'Out of stock'} · MOQ {p.moq}
                        </div>
                        <div className="row" style={{ alignItems: 'center' }}>
                          <Input
                            type="number"
                            min={p.moq}
                            max={p.maxQty ?? undefined}
                            style={{ width: 72 }}
                            value={qty}
                            disabled={!active}
                            onChange={(e) => setQtys((q) => ({ ...q, [p.id]: Number(e.target.value) }))}
                          />
                          <Button
                            size="sm"
                            disabled={!active}
                            onClick={async () => {
                              const res = await setCartLine({
                                actor: user,
                                pharmacy: business,
                                stockistId: selected!,
                                productId: p.id,
                                qty,
                              });
                              pushToast(
                                res.ok
                                  ? { tone: 'success', title: inCart ? 'Cart updated' : 'Added to cart' }
                                  : { tone: 'error', title: res.message, message: res.businessImpact },
                              );
                              if (res.ok) setCart(await getCart(business.id, selected!));
                            }}
                          >
                            {inCart ? 'Update' : 'Add'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await toggleWishlist({
                                actor: user,
                                pharmacy: business,
                                productId: p.id,
                                stockistId: selected!,
                              });
                              pushToast({ tone: 'info', title: 'Wishlist updated' });
                            }}
                          >
                            Wishlist
                          </Button>
                          <Link className="btn btn-ghost btn-sm" to={`/pharmacy/compare?productId=${p.id}`}>
                            Compare
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title="Select a stockist"
              description="Choose a connected stockist to browse catalogue."
              action={
                <Link className="btn btn-primary" to="/pharmacy/connections">
                  Find stockists
                </Link>
              }
            />
          )}
        </div>
      </div>

      {cartLines.length && selected ? (
        <div
          className="card card-pad row"
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 40,
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          <div>
            <strong>{cartLines.length} item(s)</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              Mini-cart · <Money value={miniTotals.grandTotal} />
            </div>
          </div>
          <Link className="btn btn-primary btn-sm" to="/pharmacy/cart">
            Checkout
          </Link>
        </div>
      ) : null}
    </div>
  );
}

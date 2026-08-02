import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cartTotals, productAvailableSellable } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { pluralize } from '../../../domain/utils/pluralize';
import { getCart, setCartLine, toggleWishlist } from '../../../services/catalogueService';
import { requestConnection } from '../../../services/connectionService';
import { setFavourite, sortStockistsFavouritesFirst } from '../../../services/favouriteService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { AnnouncementStrip } from '../../../ui/components/AnnouncementStrip';
import { Button, EmptyState, Field, Input, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { PharmacyMarketplace } from './PharmacyMarketplace';
import { useBiz } from './useBiz';

export function PharmacyBuy() {
  const { business, user } = useBiz();
  const { stockistId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'all' ? 'all' : 'stockist';
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
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));

  const setMode = (next: 'stockist' | 'all') => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.set('mode', 'all');
    else p.delete('mode');
    setParams(p, { replace: true });
  };

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
  const batches =
    useLiveQuery(
      () => (selected ? db.batches.where('stockistId').equals(selected).toArray() : []),
      [selected],
    ) ?? [];
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
  const approvedStockists = useMemo(
    () =>
      sortStockistsFavouritesFirst(
        stockists
          .filter((s) => s.verificationStatus === 'Approved')
          .filter((s) => !stockistQ || `${s.name} ${s.city}`.toLowerCase().includes(stockistQ.toLowerCase())),
        new Set(favourites.map((f) => f.stockistId)),
      ),
    [stockists, stockistQ, favourites],
  );
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
    <div className="stack" style={{ paddingBottom: cartLines.length ? 96 : 0 }}>
      <PageHeader
        title="Buy"
        subtitle="One catalogue surface — by stockist or all sellers (prices require Active connection)"
        actions={
          <div className="row">
            <Link className="btn btn-primary btn-sm" to="/pharmacy/smart-order">
              Smart Order
            </Link>
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/quick-order">
              Quick Order
            </Link>
          </div>
        }
      />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant={mode === 'stockist' ? 'primary' : 'secondary'} type="button" onClick={() => setMode('stockist')}>
          By stockist
        </Button>
        <Button size="sm" variant={mode === 'all' ? 'primary' : 'secondary'} type="button" onClick={() => setMode('all')}>
          All sellers
        </Button>
      </div>
      <AnnouncementStrip audience="Pharmacy" placement="Pharmacy Buy" />
      {mode === 'all' ? <PharmacyMarketplace embedded /> : null}
      {mode === 'stockist' ? (
      <div className="grid-2">
        <div className="card card-pad stack buy-stockist-select">
          <Field label="Stockist">
            <Select
              value={selected ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                if (id) navigate(`/pharmacy/buy/${id}`);
                else navigate('/pharmacy/buy');
              }}
            >
              <option value="">Select stockist…</option>
              {approvedStockists.map((s) => (
                <option key={s.id} value={s.id}>
                  {favIds.has(s.id) ? '★ ' : ''}
                  {s.name} · {s.city}
                </option>
              ))}
            </Select>
          </Field>
          {selected ? (
            <Link className="btn btn-secondary btn-sm" to={`/pharmacy/stockists/${selected}`}>
              Stockist details
            </Link>
          ) : null}
        </div>
        <div className="card card-pad stack buy-stockist-pane">
          <strong>Stockists</strong>
          <Field label="Search">
            <Input value={stockistQ} onChange={(e) => setStockistQ(e.target.value)} placeholder="City, name…" />
          </Field>
          {approvedStockists.map((s) => {
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
      ) : null}

      {mode === 'stockist' && cartLines.length && selected ? (
        <div className="card card-pad row mini-cart-bar">
          <div>
            <strong>{pluralize(cartLines.length, 'item')}</strong>
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

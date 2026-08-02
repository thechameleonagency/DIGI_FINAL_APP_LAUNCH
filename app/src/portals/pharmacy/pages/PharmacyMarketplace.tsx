import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { lowStock, productAvailableSellable } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { setCartLine } from '../../../services/catalogueService';
import { requestConnection } from '../../../services/connectionService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

function availBand(n: number): 'In stock' | 'Low' | 'Out of stock' {
  if (n <= 0) return 'Out of stock';
  if (lowStock(n)) return 'Low';
  return 'In stock';
}

export function PharmacyMarketplace({ embedded = false }: { embedded?: boolean }) {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canOrder = useCan('order.place');
  const canConnect = useCan('connection.request');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [brand, setBrand] = useState('All');
  const [city, setCity] = useState('All');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});

  const stockists =
    useLiveQuery(() =>
      db.businesses
        .where('type')
        .equals('Stockist')
        .filter((s) => s.verificationStatus === 'Approved' && s.accountStatus === 'Active')
        .toArray(),
    ) ?? [];
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const favourites =
    useLiveQuery(() => db.favourites.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const favIds = new Set(favourites.map((f) => f.stockistId));
  const catalogues = useLiveQuery(() => db.catalogues.toArray()) ?? [];
  const products = useLiveQuery(() => db.products.filter((p) => p.status === 'Active').toArray()) ?? [];
  const stockistIdsKey = useMemo(
    () => [...new Set(products.map((p) => p.stockistId))].sort().join(','),
    [products],
  );
  const batches =
    useLiveQuery(() => {
      const ids = stockistIdsKey ? stockistIdsKey.split(',') : [];
      return ids.length ? db.batches.where('stockistId').anyOf(ids).toArray() : [];
    }, [stockistIdsKey]) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));

  const stockistById = useMemo(() => new Map(stockists.map((s) => [s.id, s])), [stockists]);
  const activeCat = useMemo(
    () => new Set(catalogues.filter((c) => c.status === 'Active').map((c) => c.stockistId)),
    [catalogues],
  );

  const rows = useMemo(() => {
    return products
      .filter((p) => {
        const s = stockistById.get(p.stockistId);
        if (!s || !activeCat.has(p.stockistId)) return false;
        if (category !== 'All' && p.category !== category) return false;
        if (brand !== 'All' && p.brand !== brand) return false;
        if (city !== 'All' && s.city !== city) return false;
        if (q && !`${p.name} ${p.brand} ${p.sku} ${s.name}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .map((p) => {
        const s = stockistById.get(p.stockistId)!;
        const conn = connections.find((c) => c.stockistId === p.stockistId);
        const active = conn?.status === 'Active';
        const avail = productAvailableSellable(batches.filter((b) => b.productId === p.id));
        return { p, s, conn, active, avail, band: availBand(avail) };
      })
      .sort((a, b) => {
        const af = favIds.has(a.s.id) ? 0 : 1;
        const bf = favIds.has(b.s.id) ? 0 : 1;
        if (af !== bf) return af - bf;
        return a.p.name.localeCompare(b.p.name) || a.s.name.localeCompare(b.s.name);
      });
  }, [products, stockistById, activeCat, category, brand, city, q, connections, batches, favourites]);

  const categories = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const brands = ['All', ...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
  const cities = ['All', ...new Set(stockists.map((s) => s.city).filter(Boolean))].sort();

  return (
    <div className="stack">
      {!embedded ? (
        <PageHeader
          title="Marketplace"
          subtitle="Redirects into Buy — all-sellers discovery"
          actions={
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/buy?mode=all">
              Open in Buy
            </Link>
          }
        />
      ) : null}

      <div className="card card-pad row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Search">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product, brand, seller…" />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Brand">
          <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Seller city">
          <Select value={city} onChange={(e) => setCity(e.target.value)}>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!rows.length ? (
        <EmptyState
          title="No marketplace products"
          description="Approved stockists with Active catalogues will appear here. Prices stay gated until you connect."
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Seller</th>
                <th>Availability</th>
                <th>Price / MOQ</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, s, conn, active, band }) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/pharmacy/product/${p.id}`}>{p.name}</Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {p.brand} · {p.sku} · {p.packSize}
                    </div>
                  </td>
                  <td>
                    <Link to={`/pharmacy/stockists/${s.id}`}>{s.name}</Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {s.city}
                    </div>
                    {conn ? <StatusBadge status={conn.status} /> : <StatusBadge status="Disconnected" />}
                  </td>
                  <td>{band}</td>
                  <td>
                    {active ? (
                      <>
                        <div>{formatINR(priceForPlatformPharmacy(p, settings).unitPrice)}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          MOQ {p.moq}
                        </div>
                      </>
                    ) : (
                      <span className="muted">Connect to see price</span>
                    )}
                  </td>
                  <td>
                    {active ? (
                      canOrder ? (
                        <div className="row" style={{ alignItems: 'center' }}>
                          <Input
                            type="number"
                            style={{ width: 72 }}
                            min={p.moq}
                            value={qtys[p.id] ?? p.moq}
                            onChange={(e) => setQtys((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          />
                          <Button
                            size="sm"
                            disabled={!!pendingIds[p.id]}
                            onClick={() => {
                              setPendingIds((prev) => ({ ...prev, [p.id]: true }));
                              void (async () => {
                                const res = await setCartLine({
                                  actor: user,
                                  pharmacy: business,
                                  stockistId: s.id,
                                  productId: p.id,
                                  qty: qtys[p.id] ?? p.moq,
                                });
                                pushToast(
                                  res.ok
                                    ? { tone: 'success', title: 'Added to cart' }
                                    : { tone: 'error', title: res.message },
                                );
                                setPendingIds((prev) => {
                                  const next = { ...prev };
                                  delete next[p.id];
                                  return next;
                                });
                              })();
                            }}
                          >
                            {pendingIds[p.id] ? '…' : 'Add'}
                          </Button>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          View only
                        </span>
                      )
                    ) : conn?.status === 'Requested' ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        Request pending
                      </span>
                    ) : canConnect ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!pendingIds[`conn-${s.id}`]}
                        onClick={() => {
                          const key = `conn-${s.id}`;
                          setPendingIds((prev) => ({ ...prev, [key]: true }));
                          void (async () => {
                            const res = await requestConnection({
                              actor: user,
                              pharmacy: business,
                              stockistId: s.id,
                            });
                            pushToast(
                              res.ok
                                ? { tone: 'success', title: 'Connection requested' }
                                : { tone: 'error', title: res.message },
                            );
                            setPendingIds((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                          })();
                        }}
                      >
                        Request connection to see price and order
                      </Button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        Connect required
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

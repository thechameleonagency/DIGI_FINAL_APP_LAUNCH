import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cartTotals, pairOutstanding } from '../../../domain/calc';
import type { Address, Cart } from '../../../domain/entities/types';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { formatINR } from '../../../domain/utils/money';
import { setCartLine } from '../../../services/catalogueService';
import { placeOrder } from '../../../services/orderService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Field, Input, Money, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

function storefrontAddress(business: { id: string; address: string; city: string; state: string; pincode: string }): Address {
  return {
    id: 'storefront',
    label: 'Storefront',
    line1: business.address,
    city: business.city,
    state: business.state,
    pincode: business.pincode,
    isDefault: true,
  };
}

export function PharmacyCart() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const liveBiz = useLiveQuery(() => db.businesses.get(business.id), [business.id]);
  const carts =
    useLiveQuery(() => db.carts.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const connections =
    useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const allProducts = useLiveQuery(() => db.products.toArray()) ?? [];
  const invoices =
    useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [paymentModeByStockist, setPaymentModeByStockist] = useState<Record<string, 'PayFirst' | 'Credit'>>({});
  const [notes, setNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [addressId, setAddressId] = useState('');
  const [busy, setBusy] = useState(false);

  const addresses = useMemo(() => {
    const book = liveBiz?.deliveryAddresses ?? business.deliveryAddresses ?? [];
    if (book.length) return book;
    return [storefrontAddress(liveBiz ?? business)];
  }, [liveBiz, business]);

  useEffect(() => {
    if (!addressId && addresses[0]) setAddressId(addresses[0].id);
  }, [addresses, addressId]);

  // Default-select all lines when carts load
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const c of carts) {
      for (const l of c.lines) next[`${c.stockistId}:${l.productId}`] = true;
    }
    setSelected((prev) => ({ ...next, ...prev }));
  }, [carts]);

  const productMap = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id;

  const nonEmptyCarts = carts.filter((c) => c.lines.length > 0);

  const toggleStockist = (cart: Cart, on: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const l of cart.lines) next[`${cart.stockistId}:${l.productId}`] = on;
      return next;
    });
  };

  const placeSelected = async () => {
    const address = addresses.find((a) => a.id === addressId) ?? addresses[0];
    if (!address) {
      pushToast({ tone: 'error', title: 'Add a delivery address' });
      return;
    }
    setBusy(true);
    let placed = 0;
    try {
      for (const cart of nonEmptyCarts) {
        const productIds = cart.lines
          .filter((l) => selected[`${cart.stockistId}:${l.productId}`])
          .map((l) => l.productId);
        if (!productIds.length) continue;
        const conn = connections.find((c) => c.stockistId === cart.stockistId && c.status === 'Active');
        const mode = paymentModeByStockist[cart.stockistId] ?? (conn?.inCircle === false ? 'PayFirst' : 'Credit');
        const res = await placeOrder({
          actor: user,
          pharmacy: business,
          stockistId: cart.stockistId,
          address,
          notes,
          preferredDate: preferredDate || undefined,
          idempotencyKey: makeIdempotencyKey('placeOrder', user.id),
          paymentMode: mode,
          productIds,
        });
        if (!res.ok) {
          pushToast({
            tone: 'error',
            title: `${nameOf(cart.stockistId)}: ${res.message}`,
            message: res.businessImpact,
          });
          continue;
        }
        placed += 1;
      }
      if (placed) {
        pushToast({ tone: 'success', title: `Placed ${placed} order(s)` });
        navigate('/pharmacy/orders');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!nonEmptyCarts.length) {
    return (
      <div className="stack">
        <PageHeader title="Cart" subtitle="Multi-stockist checkout" />
        <EmptyState title="Cart is empty" description="Add items from Buy or Smart Order." />
        <Link className="btn btn-primary" to="/pharmacy/buy">
          Browse catalogue
        </Link>
      </div>
    );
  }

  let grandSelected = 0;

  return (
    <div className="stack">
      <PageHeader
        title="Cart"
        subtitle="Stacked by stockist — select lines, choose Pay First or Circle credit, place separate orders"
      />

      {nonEmptyCarts.map((cart) => {
        const conn = connections.find((c) => c.stockistId === cart.stockistId);
        const inCircle = conn?.inCircle !== false && conn?.status === 'Active';
        const outstanding = pairOutstanding(invoices, business.id, cart.stockistId);
        const creditOk =
          inCircle &&
          (conn?.creditLimit == null ||
            outstanding +
              cart.lines
                .filter((l) => selected[`${cart.stockistId}:${l.productId}`])
                .reduce((s, l) => {
                  const p = productMap.get(l.productId);
                  if (!p) return s;
                  return s + priceForPlatformPharmacy(p, settings).unitPrice * l.qty;
                }, 0) <=
              (conn.creditLimit ?? Infinity));
        const mode = paymentModeByStockist[cart.stockistId] ?? (inCircle && creditOk ? 'Credit' : 'PayFirst');
        const allOn = cart.lines.every((l) => selected[`${cart.stockistId}:${l.productId}`]);
        const isExpanded = !!expanded[cart.stockistId];
        const linesForTotals = cart.lines
          .filter((l) => selected[`${cart.stockistId}:${l.productId}`])
          .map((l) => {
            const p = productMap.get(l.productId);
            const unit = p ? priceForPlatformPharmacy(p, settings).unitPrice : l.unitPriceAtAdd ?? 0;
            return { qty: l.qty, unitPrice: unit, gstPercent: p?.gstPercent ?? 12 };
          });
        const totals = cartTotals(linesForTotals as never);
        grandSelected += totals.grandTotal;

        return (
          <div key={cart.id} className="card card-pad stack" style={{ position: 'relative' }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={allOn} onChange={(e) => toggleStockist(cart, e.target.checked)} />
                <strong>{nameOf(cart.stockistId)}</strong>
                {inCircle ? <span className="chip">Circle</span> : <span className="chip">Pay-first</span>}
              </label>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <Select
                  value={mode}
                  onChange={(e) =>
                    setPaymentModeByStockist((m) => ({
                      ...m,
                      [cart.stockistId]: e.target.value as 'PayFirst' | 'Credit',
                    }))
                  }
                >
                  <option value="PayFirst">Pay First (Razorpay)</option>
                  <option value="Credit" disabled={!inCircle}>
                    Credit (Circle)
                  </option>
                </Select>
                <Money value={totals.grandTotal} />
              </div>
            </div>
            {!creditOk && mode === 'Credit' ? (
              <div className="banner-strip warning">Credit limit exceeded — switch to Pay First or deselect lines.</div>
            ) : null}
            <div
              style={{
                maxHeight: isExpanded ? 'none' : 600,
                overflow: isExpanded ? 'visible' : 'hidden',
                position: 'relative',
              }}
            >
              <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th />
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.lines.map((l) => {
                    const p = productMap.get(l.productId);
                    const unit = p ? priceForPlatformPharmacy(p, settings).unitPrice : l.unitPriceAtAdd ?? 0;
                    const key = `${cart.stockistId}:${l.productId}`;
                    return (
                      <tr key={key}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!selected[key]}
                            onChange={(e) => setSelected((s) => ({ ...s, [key]: e.target.checked }))}
                          />
                        </td>
                        <td>{p?.name ?? l.productId}</td>
                        <td>
                          <Input
                            type="number"
                            style={{ width: 72 }}
                            value={l.qty}
                            onChange={async (e) => {
                              const qty = Number(e.target.value) || 0;
                              await setCartLine({
                                actor: user,
                                pharmacy: business,
                                stockistId: cart.stockistId,
                                productId: l.productId,
                                qty,
                              });
                            }}
                          />
                        </td>
                        <td>
                          <Money value={unit} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!isExpanded && cart.lines.length > 6 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 72,
                    background: 'linear-gradient(transparent, var(--surface, #fff))',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 8,
                  }}
                >
                  <Button variant="secondary" onClick={() => setExpanded((e) => ({ ...e, [cart.stockistId]: true }))}>
                    View more
                  </Button>
                </div>
              ) : null}
            </div>
            {isExpanded ? (
              <Button variant="secondary" onClick={() => setExpanded((e) => ({ ...e, [cart.stockistId]: false }))}>
                Show less
              </Button>
            ) : null}
          </div>
        );
      })}

      <div className="card card-pad stack">
        <Field label="Delivery address">
          <Select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} — {a.line1}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preferred date">
          <Input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Selected total {formatINR(grandSelected)}</strong>
          <Button disabled={busy || grandSelected <= 0} onClick={() => void placeSelected()}>
            {busy ? 'Placing…' : 'Place selected orders'}
          </Button>
        </div>
      </div>
    </div>
  );
}

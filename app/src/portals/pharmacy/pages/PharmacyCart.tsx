import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cartTotals, pairOutstanding } from '../../../domain/calc';
import {
  estimateDeliveryFee,
  isHolidayBlocked,
  listSelectableDeliveryDates,
  normalizeHolidays,
} from '../../../domain/calc/deliveryCommerce';
import { applySchemeToUnitPrice } from '../../../domain/calc/schemePricing';
import type { Address, Cart, Scheme } from '../../../domain/entities/types';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { formatINR } from '../../../domain/utils/money';
import { setCartLine } from '../../../services/catalogueService';
import { getDeliveryRules } from '../../../services/deliveryCommerceService';
import { placeOrder } from '../../../services/orderService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Field, Input, Money, PageHeader, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';
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
  const allDates = useLiveQuery(() => db.deliveryDates.toArray()) ?? [];
  const allPins = useLiveQuery(() => db.pinDeliverySettings.toArray()) ?? [];
  const allSchemes = useLiveQuery(() => db.schemes.toArray()) ?? [];

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [paymentModeByStockist, setPaymentModeByStockist] = useState<Record<string, 'PayFirst' | 'Credit'>>({});
  const [notes, setNotes] = useState('');
  const [preferredDateByStockist, setPreferredDateByStockist] = useState<Record<string, string>>({});
  const [addressId, setAddressId] = useState('');
  const [busy, setBusy] = useState(false);
  const [rulesByStockist, setRulesByStockist] = useState<Record<string, Awaited<ReturnType<typeof getDeliveryRules>>>>({});

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

  const stockistIds = useMemo(() => [...new Set(carts.map((c) => c.stockistId))], [carts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, Awaited<ReturnType<typeof getDeliveryRules>>> = {};
      for (const id of stockistIds) {
        next[id] = await getDeliveryRules(id);
      }
      if (!cancelled) setRulesByStockist(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [stockistIds.join('|')]);

  const productMap = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id;
  const schemesFor = (stockistId: string): Scheme[] => allSchemes.filter((s) => s.stockistId === stockistId);

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
        const preferredDate = preferredDateByStockist[cart.stockistId] || undefined;
        const stockist = businesses.find((b) => b.id === cart.stockistId);
        if (stockist && preferredDate) {
          const gate = isHolidayBlocked({
            holidays: stockist.holidays,
            holidayEntries: stockist.holidayEntries ?? normalizeHolidays(stockist.holidays),
            date: preferredDate,
          });
          if (gate.blocked) {
            pushToast({
              tone: 'error',
              title: `${nameOf(cart.stockistId)}: holiday block`,
              message: gate.reason ?? 'Stockist is not accepting preorders on this date.',
            });
            continue;
          }
        }
        const conn = connections.find((c) => c.stockistId === cart.stockistId && c.status === 'Active');
        const mode = paymentModeByStockist[cart.stockistId] ?? (conn?.inCircle === false ? 'PayFirst' : 'Credit');
        const res = await placeOrder({
          actor: user,
          pharmacy: business,
          stockistId: cart.stockistId,
          address,
          notes,
          preferredDate,
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
        <EmptyState
          title="Cart is empty"
          description="Add items from Buy or Smart Order."
          action={
            <div className="row">
              <Link className="btn btn-primary btn-sm" to="/pharmacy/buy">
                Buy
              </Link>
              <Link className="btn btn-secondary btn-sm" to="/pharmacy/smart-order">
                Smart Order
              </Link>
            </div>
          }
        />
        <Link className="btn btn-primary" to="/pharmacy/buy">
          Browse catalogue
        </Link>
      </div>
    );
  }

  let grandSelected = 0;
  let anyHolidayBlock = false;

  return (
    <div className="stack">
      <PageHeader
        title="Cart"
        subtitle="Stacked by stockist — select lines, choose Pay First or Circle credit, place separate orders"
      />

      {nonEmptyCarts.map((cart) => {
        const stockist = businesses.find((b) => b.id === cart.stockistId);
        const conn = connections.find((c) => c.stockistId === cart.stockistId);
        const inCircle = conn?.inCircle !== false && conn?.status === 'Active';
        const schemes = schemesFor(cart.stockistId);
        const outstanding = pairOutstanding(invoices, business.id, cart.stockistId);
        const selectedLines = cart.lines.filter((l) => selected[`${cart.stockistId}:${l.productId}`]);
        const pricedLines = selectedLines.map((l) => {
          const p = productMap.get(l.productId);
          const base = p ? priceForPlatformPharmacy(p, settings).unitPrice : l.unitPriceAtAdd ?? 0;
          const applied = p
            ? applySchemeToUnitPrice({ unitPrice: base, product: p, schemes })
            : { unitPrice: base, unitPriceBeforeScheme: base, schemeDiscountAmount: 0, scheme: undefined };
          return {
            qty: l.qty,
            unitPrice: applied.unitPrice,
            gstPercent: p?.gstPercent ?? 12,
            scheme: applied.scheme,
            unitPriceBeforeScheme: applied.unitPriceBeforeScheme,
          };
        });
        const creditGoods = pricedLines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
        const creditOk =
          inCircle && (conn?.creditLimit == null || outstanding + creditGoods <= (conn.creditLimit ?? Infinity));
        const mode = paymentModeByStockist[cart.stockistId] ?? (inCircle && creditOk ? 'Credit' : 'PayFirst');
        const allOn = cart.lines.every((l) => selected[`${cart.stockistId}:${l.productId}`]);
        const isExpanded = !!expanded[cart.stockistId];
        const totals = cartTotals(pricedLines as never);
        grandSelected += totals.grandTotal;

        const selectable = listSelectableDeliveryDates(allDates.filter((d) => d.stockistId === cart.stockistId));
        const preferredDate = preferredDateByStockist[cart.stockistId] ?? '';
        const holiday =
          stockist && preferredDate
            ? isHolidayBlocked({
                holidays: stockist.holidays,
                holidayEntries: stockist.holidayEntries ?? normalizeHolidays(stockist.holidays),
                date: preferredDate,
              })
            : { blocked: false, allowPreorder: true as const };
        if (holiday.blocked && selectedLines.length) anyHolidayBlock = true;

        const rules = rulesByStockist[cart.stockistId] ?? [];
        const feeEst = estimateDeliveryFee({
          rules,
          goodsSubtotal: totals.subtotal,
          preferredDate: preferredDate || undefined,
          deliveryDates: allDates.filter((d) => d.stockistId === cart.stockistId),
          pinSettings: allPins.filter((p) => p.stockistId === cart.stockistId),
          pharmacyPin: (liveBiz ?? business).pincode,
        });
        const freeAboveRule = rules.find((r) => r.active && r.ruleType === 'order_amount' && r.minOrderAmount != null);
        const freeAbove = freeAboveRule?.minOrderAmount;
        const onAllowPreorderHoliday =
          !!preferredDate &&
          !holiday.blocked &&
          (stockist?.holidayEntries ?? normalizeHolidays(stockist?.holidays)).some(
            (h) =>
              preferredDate >= h.startDate.slice(0, 10) &&
              preferredDate <= h.endDate.slice(0, 10) &&
              h.allowPreorder,
          );

        return (
          <div key={cart.id} className="card card-pad stack" style={{ position: 'relative' }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={allOn} onChange={(e) => toggleStockist(cart, e.target.checked)} />
                <strong>{nameOf(cart.stockistId)}</strong>
                {inCircle ? <StatusBadge status="Active" /> : <span className="muted">Pay-First</span>}
                {inCircle ? <span className="muted" style={{ fontSize: 12 }}>Circle</span> : null}
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
            <Field label="Preferred delivery date">
              {selectable.length ? (
                <Select
                  value={preferredDate}
                  onChange={(e) =>
                    setPreferredDateByStockist((prev) => ({ ...prev, [cart.stockistId]: e.target.value }))
                  }
                >
                  <option value="">Any / stockist default</option>
                  {selectable.map((d) => (
                    <option key={d.id} value={d.date}>
                      {d.date}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type="date"
                  value={preferredDate}
                  onChange={(e) =>
                    setPreferredDateByStockist((prev) => ({ ...prev, [cart.stockistId]: e.target.value }))
                  }
                />
              )}
            </Field>
            <div className="muted" style={{ fontSize: 13 }}>
              Est. delivery fee: <strong>{formatINR(feeEst.fee)}</strong>
              {freeAbove != null ? (
                <>
                  {' '}
                  · Free above {formatINR(freeAbove)}
                  {totals.subtotal < freeAbove
                    ? ` (need ${formatINR(freeAbove - totals.subtotal)} more)`
                    : ' (qualified)'}
                </>
              ) : null}
            </div>
            {holiday.blocked ? (
              <div className="banner-strip danger">
                Stockist holiday — preorders blocked{holiday.reason ? `: ${holiday.reason}` : ''}.
              </div>
            ) : onAllowPreorderHoliday ? (
              <div className="banner-strip warning">Holiday window — preorders allowed.</div>
            ) : null}
            <div
              style={{
                maxHeight: isExpanded ? 'none' : 600,
                overflow: isExpanded ? 'visible' : 'hidden',
                position: 'relative',
              }}
            >
              <table className="data" style={{ width: '100%', fontSize: 13 }}>
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
                    const base = p ? priceForPlatformPharmacy(p, settings).unitPrice : l.unitPriceAtAdd ?? 0;
                    const applied = p
                      ? applySchemeToUnitPrice({ unitPrice: base, product: p, schemes })
                      : { unitPrice: base, scheme: undefined, unitPriceBeforeScheme: base };
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
                        <td>
                          {p?.name ?? l.productId}
                          {applied.scheme ? (
                            <span className="chip" style={{ marginLeft: 6, fontSize: 11 }}>
                              {applied.scheme.title}
                            </span>
                          ) : null}
                        </td>
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
                          <Money value={applied.unitPrice} />
                          {applied.scheme && applied.unitPriceBeforeScheme != null ? (
                            <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
                              was {formatINR(applied.unitPriceBeforeScheme)}
                            </span>
                          ) : null}
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
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Selected total {formatINR(grandSelected)}</strong>
          <Button disabled={busy || grandSelected <= 0 || anyHolidayBlock} onClick={() => void placeSelected()}>
            {busy ? 'Placing…' : 'Place selected orders'}
          </Button>
        </div>
      </div>
    </div>
  );
}

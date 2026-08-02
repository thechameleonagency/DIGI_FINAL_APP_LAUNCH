import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cartTotals, pairOutstanding } from '../../../domain/calc';
import type { Address } from '../../../domain/entities/types';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { formatINR } from '../../../domain/utils/money';
import { removeDeliveryAddress, upsertDeliveryAddress } from '../../../services/authService';
import { parseNumberInput } from '../../../domain/utils/validation';
import { clearCart, getCart, setCartLine } from '../../../services/catalogueService';
import { placeOrder } from '../../../services/orderService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, Modal, Money, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';
import { StockistNameSelect } from './StockistNameSelect';

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
  const connections =
    useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const activeConnections = connections.filter((c) => c.status === 'Active');
  const [stockistId, setStockistId] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [addressId, setAddressId] = useState('');
  const [busy, setBusy] = useState(false);
  const [priceConfirm, setPriceConfirm] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [addrForm, setAddrForm] = useState({ label: '', line1: '', city: '', state: '', pincode: '' });
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrErrors, setAddrErrors] = useState<{
    label?: string;
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  }>({});
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [qtyErrors, setQtyErrors] = useState<Record<string, string>>({});
  const sid = stockistId || activeConnections[0]?.stockistId || '';
  const [cart, setCart] = useState<Awaited<ReturnType<typeof getCart>> | null>(null);
  const products =
    useLiveQuery(
      () => (sid ? db.products.where('stockistId').equals(sid).toArray() : []),
      [sid],
    ) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const stockistBiz = useLiveQuery(() => (sid ? db.businesses.get(sid) : undefined), [sid]);
  const pairInvoices =
    useLiveQuery(
      () => (sid ? db.invoices.where({ pharmacyId: business.id, stockistId: sid }).toArray() : []),
      [business.id, sid],
    ) ?? [];
  const conn = connections.find((c) => c.stockistId === sid);
  const connected = conn?.status === 'Active';
  const outstanding = sid ? pairOutstanding(pairInvoices, business.id, sid) : 0;
  const creditLimit = conn?.creditLimit;
  const creditDays = conn?.creditDays;
  const holidayHit = useMemo(() => {
    if (!preferredDate || !stockistBiz?.holidays?.length) return null;
    for (const h of stockistBiz.holidays) {
      const [date, label] = h.split('|').map((s) => s.trim());
      if (date === preferredDate) return label || date;
    }
    return null;
  }, [preferredDate, stockistBiz?.holidays]);

  const addresses = useMemo(() => {
    const book = liveBiz?.deliveryAddresses ?? business.deliveryAddresses ?? [];
    if (book.length) return book;
    return [storefrontAddress(liveBiz ?? business)];
  }, [liveBiz, business]);

  useEffect(() => {
    if (sid) getCart(business.id, sid).then(setCart);
    setDraftQty({});
    setQtyErrors({});
  }, [business.id, sid]);

  const commitQty = async (productId: string, product: { moq: number; maxQty?: number } | undefined, raw: string) => {
    if (!product) return;
    const parsed = parseNumberInput(raw);
    if (parsed.status === 'empty') {
      // Empty field — revert; do not treat as remove
      setDraftQty((d) => {
        const next = { ...d };
        delete next[productId];
        return next;
      });
      setQtyErrors((e) => {
        const next = { ...e };
        delete next[productId];
        return next;
      });
      return;
    }
    if (parsed.status === 'invalid' || parsed.value < 0 || !Number.isInteger(parsed.value)) {
      setQtyErrors((e) => ({ ...e, [productId]: 'Enter a whole number' }));
      return;
    }
    const qty = parsed.value;
    if (qty === 0) {
      setQtyErrors((e) => ({ ...e, [productId]: 'Use Remove to delete this line' }));
      setDraftQty((d) => {
        const next = { ...d };
        delete next[productId];
        return next;
      });
      return;
    }
    const res = await setCartLine({
      actor: user,
      pharmacy: business,
      stockistId: sid,
      productId,
      qty,
    });
    if (!res.ok) {
      setQtyErrors((e) => ({ ...e, [productId]: res.message }));
      return;
    }
    setQtyErrors((e) => {
      const next = { ...e };
      delete next[productId];
      return next;
    });
    setDraftQty((d) => {
      const next = { ...d };
      delete next[productId];
      return next;
    });
    setCart(await getCart(business.id, sid));
  };

  useEffect(() => {
    if (!addressId && addresses.length) {
      setAddressId(addresses.find((a) => a.isDefault)?.id ?? addresses[0].id);
    }
  }, [addresses, addressId]);

  const lines = (cart?.lines ?? []).map((l) => {
    const p = products.find((x) => x.id === l.productId);
    const inclusive = p ? priceForPlatformPharmacy(p, settings).unitPrice : 0;
    const flag = !p
      ? 'Deleted'
      : p.status !== 'Active'
        ? 'Inactive'
        : !connected
          ? 'Disconnected'
          : p.maxQty != null && l.qty > p.maxQty
            ? 'Over max'
            : l.unitPriceAtAdd != null && Math.abs(l.unitPriceAtAdd - inclusive) > 0.009
              ? 'Price changed'
              : null;
    return { ...l, product: p, inclusive, flag };
  });
  const totals = cartTotals(
    lines
      .filter((l) => l.product)
      .map((l) => ({ qty: l.qty, unitPrice: l.inclusive, gstPercent: l.product!.gstPercent })),
  );
  const selectedAddress = addresses.find((a) => a.id === addressId) ?? addresses[0];
  const blocking = lines.some((l) => l.flag === 'Deleted' || l.flag === 'Inactive' || l.flag === 'Disconnected' || l.flag === 'Over max');
  const priceDiffs = lines.filter((l) => l.flag === 'Price changed' && l.product);
  const maintenanceOn = !!settings?.maintenanceMode;
  const creditOverLimit =
    creditLimit != null && Number.isFinite(creditLimit) && outstanding + totals.grandTotal > creditLimit;

  const submitOrder = async () => {
    if (!selectedAddress) {
      pushToast({ tone: 'error', title: 'Select a delivery address' });
      return;
    }
    if (blocking) {
      pushToast({ tone: 'error', title: 'Fix flagged cart lines before placing' });
      return;
    }
    setBusy(true);
    let address = selectedAddress;
    if (address.id === 'storefront' && !(liveBiz?.deliveryAddresses ?? []).length) {
      const saved = await upsertDeliveryAddress({
        actor: user,
        business,
        address: { ...address, id: undefined, isDefault: true },
      });
      if (saved.ok) address = saved.data;
    }
    const res = await placeOrder({
      actor: user,
      pharmacy: business,
      stockistId: sid,
      address,
      notes,
      preferredDate: preferredDate || undefined,
      idempotencyKey: makeIdempotencyKey('placeOrder', user.id),
    });
    setBusy(false);
    setPriceConfirm(null);
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
      if (res.existingId) navigate(`/pharmacy/orders`);
      return;
    }
    // Single feedback: destination banner (no toast + modal stack)
    navigate(`/pharmacy/orders/${res.data.orderNo}?placed=1`);
  };

  return (
    <div className="stack">
      <PageHeader
        title="Cart & checkout"
        subtitle="Choose delivery address and review totals before placing"
        actions={
          lines.length ? (
            <Button size="sm" variant="ghost" onClick={() => setClearConfirm(true)}>
              Clear cart
            </Button>
          ) : null
        }
      />
      <StockistNameSelect connections={activeConnections} value={sid} onChange={setStockistId} />
      {!connected && sid ? (
        <div className="banner-strip warning">Connection is not Active — cart lines are blocked until reconnect.</div>
      ) : null}
      <ConfirmDialog
        open={clearConfirm}
        title="Clear cart?"
        tone="danger"
        confirmLabel="Clear cart"
        body={`Remove all ${lines.length} line${lines.length === 1 ? '' : 's'} for this stockist? Smart Order and quick-order work will be lost.`}
        onClose={() => setClearConfirm(false)}
        onConfirm={async () => {
          const res = await clearCart({ actor: user, pharmacy: business, stockistId: sid });
          if (res.ok) {
            setCart(await getCart(business.id, sid));
            pushToast({ tone: 'success', title: 'Cart cleared' });
            setClearConfirm(false);
          } else pushToast({ tone: 'error', title: res.message });
        }}
      />
      <ConfirmDialog
        open={!!priceConfirm}
        title="Prices changed"
        body={priceConfirm ?? ''}
        confirmLabel="Accept new prices & place"
        onClose={() => setPriceConfirm(null)}
        onConfirm={() => void submitOrder()}
      />
      {!lines.length ? (
        <EmptyState
          title="Cart is empty"
          description="Browse a connected catalogue to add products."
          action={
            <Link className="btn btn-primary" to="/pharmacy/buy">
              Browse
            </Link>
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>PTR</th>
                  <th>Line</th>
                  <th>Flag</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.productId}>
                    <td>{l.product?.name ?? 'Deleted product'}</td>
                    <td>
                      <div className="stack" style={{ gap: 2 }}>
                        <Input
                          type="number"
                          style={{ width: 80 }}
                          value={draftQty[l.productId] ?? String(l.qty)}
                          disabled={!l.product || !connected}
                          aria-invalid={!!qtyErrors[l.productId]}
                          onChange={(e) => {
                            setDraftQty((d) => ({ ...d, [l.productId]: e.target.value }));
                            if (qtyErrors[l.productId]) {
                              setQtyErrors((err) => {
                                const next = { ...err };
                                delete next[l.productId];
                                return next;
                              });
                            }
                          }}
                          onBlur={() => {
                            if (!l.product) return;
                            const raw = draftQty[l.productId];
                            if (raw === undefined) return;
                            void commitQty(l.productId, l.product, raw);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' || !l.product) return;
                            e.preventDefault();
                            const raw = draftQty[l.productId] ?? String(l.qty);
                            void commitQty(l.productId, l.product, raw);
                            (e.target as HTMLInputElement).blur();
                          }}
                        />
                        {qtyErrors[l.productId] ? (
                          <span className="error" style={{ fontSize: 11 }}>
                            {qtyErrors[l.productId]}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {l.product ? (
                        <>
                          <Money value={l.inclusive} />
                          {l.unitPriceAtAdd != null && Math.abs(l.unitPriceAtAdd - l.inclusive) > 0.009 ? (
                            <div className="muted" style={{ fontSize: 11 }}>
                              was <Money value={l.unitPriceAtAdd} />
                            </div>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {l.product ? (
                        <Money
                          value={
                            cartTotals([
                              { qty: l.qty, unitPrice: l.inclusive, gstPercent: l.product.gstPercent },
                            ]).grandTotal
                          }
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{l.flag ? <span className="banner-strip warning" style={{ margin: 0, padding: '2px 8px' }}>{l.flag}</span> : '—'}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!l.product) {
                            // strip deleted line by rewriting cart without it
                            const next = (cart?.lines ?? []).filter((x) => x.productId !== l.productId);
                            if (cart) {
                              await db.carts.put({ ...cart, lines: next, updatedAt: new Date().toISOString() });
                              setCart(await getCart(business.id, sid));
                            }
                            return;
                          }
                          await setCartLine({
                            actor: user,
                            pharmacy: business,
                            stockistId: sid,
                            productId: l.productId,
                            qty: 0,
                          });
                          setCart(await getCart(business.id, sid));
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card card-pad stack">
            <strong>Delivery address book</strong>
            <Field label="Deliver to">
              <Select value={selectedAddress?.id ?? ''} onChange={(e) => setAddressId(e.target.value)}>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.line1}, {a.city} {a.pincode}
                    {a.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {selectedAddress ? (
              <div className="muted" style={{ fontSize: 13 }}>
                {selectedAddress.line1}
                {selectedAddress.line2 ? `, ${selectedAddress.line2}` : ''}, {selectedAddress.city},{' '}
                {selectedAddress.state} {selectedAddress.pincode}
              </div>
            ) : null}
            {selectedAddress && selectedAddress.id !== 'storefront' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await removeDeliveryAddress({ actor: user, business, addressId: selectedAddress.id });
                  pushToast(
                    res.ok
                      ? { tone: 'success', title: 'Address removed' }
                      : { tone: 'error', title: res.message },
                  );
                  setAddressId('');
                }}
              >
                Remove selected address
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAddrForm({ label: '', line1: '', city: '', state: '', pincode: '' });
                setAddrErrors({});
                setAddrOpen(true);
              }}
            >
              Add delivery address
            </Button>
          </div>

          <Modal
            open={addrOpen}
            title="Add delivery address"
            onClose={() => setAddrOpen(false)}
            footer={
              <>
                <Button variant="secondary" onClick={() => setAddrOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const next: typeof addrErrors = {};
                    if (!addrForm.label.trim()) next.label = 'Label is required';
                    if (!addrForm.line1.trim()) next.line1 = 'Line 1 is required';
                    if (!addrForm.city.trim()) next.city = 'City is required';
                    if (!addrForm.state.trim()) next.state = 'State is required';
                    if (!addrForm.pincode.trim()) next.pincode = 'Pincode is required';
                    if (Object.keys(next).length) {
                      setAddrErrors(next);
                      return;
                    }
                    const res = await upsertDeliveryAddress({
                      actor: user,
                      business,
                      address: { ...addrForm, isDefault: !(liveBiz?.deliveryAddresses ?? []).length },
                    });
                    if (!res.ok) {
                      if (res.code === 'ADDR_FIELDS') {
                        setAddrErrors({
                          label: !addrForm.label.trim() ? 'Label is required' : undefined,
                          line1: !addrForm.line1.trim() ? 'Line 1 is required' : undefined,
                          city: !addrForm.city.trim() ? 'City is required' : undefined,
                          state: !addrForm.state.trim() ? 'State is required' : undefined,
                          pincode: !addrForm.pincode.trim() ? 'Pincode is required' : undefined,
                        });
                      } else {
                        pushToast({ tone: 'error', title: res.message });
                      }
                      return;
                    }
                    setAddressId(res.data.id);
                    setAddrForm({ label: '', line1: '', city: '', state: '', pincode: '' });
                    setAddrErrors({});
                    setAddrOpen(false);
                    pushToast({ tone: 'success', title: 'Address saved' });
                  }}
                >
                  Save address
                </Button>
              </>
            }
          >
            <div className="grid-2">
              <Field label="New label" error={addrErrors.label}>
                <Input
                  value={addrForm.label}
                  onChange={(e) => {
                    setAddrForm((f) => ({ ...f, label: e.target.value }));
                    setAddrErrors((err) => ({ ...err, label: undefined }));
                  }}
                />
              </Field>
              <Field label="Line 1" error={addrErrors.line1}>
                <Input
                  value={addrForm.line1}
                  onChange={(e) => {
                    setAddrForm((f) => ({ ...f, line1: e.target.value }));
                    setAddrErrors((err) => ({ ...err, line1: undefined }));
                  }}
                />
              </Field>
              <Field label="City" error={addrErrors.city}>
                <Input
                  value={addrForm.city}
                  onChange={(e) => {
                    setAddrForm((f) => ({ ...f, city: e.target.value }));
                    setAddrErrors((err) => ({ ...err, city: undefined }));
                  }}
                />
              </Field>
              <Field label="State" error={addrErrors.state}>
                <Input
                  value={addrForm.state}
                  onChange={(e) => {
                    setAddrForm((f) => ({ ...f, state: e.target.value }));
                    setAddrErrors((err) => ({ ...err, state: undefined }));
                  }}
                />
              </Field>
              <Field label="Pincode" error={addrErrors.pincode}>
                <Input
                  value={addrForm.pincode}
                  onChange={(e) => {
                    setAddrForm((f) => ({ ...f, pincode: e.target.value }));
                    setAddrErrors((err) => ({ ...err, pincode: undefined }));
                  }}
                />
              </Field>
            </div>
          </Modal>

          <div className="card card-pad stack">
            <strong>Checkout review</strong>
            <Field label="Preferred delivery date">
              <Input
                type="date"
                min={localTodayKey()}
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
              />
            </Field>
            {holidayHit ? (
              <div className="banner-strip warning" style={{ fontSize: 13 }}>
                {stockistBiz?.name ?? 'Stockist'} lists a holiday on this date ({holidayHit}). Ordering is still allowed —
                delivery may be delayed.
              </div>
            ) : null}
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {maintenanceOn ? (
              <div className="banner-strip warning" style={{ fontSize: 13 }}>
                Platform maintenance is on — placing orders is paused until the banner clears.
              </div>
            ) : null}
            {creditLimit != null ? (
              <div
                className={
                  creditOverLimit ? 'banner-strip warning' : 'banner-strip info'
                }
                style={{ fontSize: 13 }}
              >
                Credit with {stockistBiz?.name ?? 'stockist'}
                {creditDays != null ? ` · ${creditDays} days` : ''}: outstanding {formatINR(outstanding)} + this order{' '}
                {formatINR(totals.grandTotal)} = {formatINR(outstanding + totals.grandTotal)} / limit{' '}
                {formatINR(creditLimit)}
                {creditOverLimit
                  ? ` · ${formatINR(outstanding + totals.grandTotal - creditLimit)} over limit — place is blocked`
                  : ''}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No credit limit set on this connection
                {creditDays != null ? ` · terms ${creditDays} days` : ''}.
              </div>
            )}
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Subtotal</span>
                <Money value={totals.subtotal} />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>GST</span>
                <Money value={totals.taxTotal} />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Total</strong>
                <strong>
                  <Money value={totals.grandTotal} />
                </strong>
              </div>
            </div>
            <Button
              disabled={busy || !selectedAddress || blocking || creditOverLimit || maintenanceOn}
              onClick={() => {
                if (priceDiffs.length) {
                  setPriceConfirm(
                    priceDiffs
                      .map(
                        (l) =>
                          `${l.product!.name}: ${l.unitPriceAtAdd} → ${l.inclusive}`,
                      )
                      .join('\n'),
                  );
                  return;
                }
                void submitOrder();
              }}
            >
              Place purchase order
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

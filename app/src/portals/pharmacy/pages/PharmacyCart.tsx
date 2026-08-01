import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { cartTotals } from '../../../domain/calc';
import type { Address } from '../../../domain/entities/types';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { removeDeliveryAddress, upsertDeliveryAddress } from '../../../services/authService';
import { clearCart, getCart, setCartLine } from '../../../services/catalogueService';
import { placeOrder } from '../../../services/orderService';
import { priceForPlatformPharmacy } from '../../../services/pricingService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, Money, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
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
  const [addrForm, setAddrForm] = useState({ label: '', line1: '', city: '', state: '', pincode: '' });
  const sid = stockistId || activeConnections[0]?.stockistId || '';
  const [cart, setCart] = useState<Awaited<ReturnType<typeof getCart>> | null>(null);
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const stockistBiz = useLiveQuery(() => (sid ? db.businesses.get(sid) : undefined), [sid]);
  const conn = connections.find((c) => c.stockistId === sid);
  const connected = conn?.status === 'Active';
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
  }, [business.id, sid]);

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
    pushToast({
      tone: 'success',
      title: 'Order placed',
      message: `${res.data.orderNo} is Pending with stockist.`,
    });
    useUi.getState().showSuccessSummary({
      title: 'Order placed',
      documentNo: res.data.orderNo,
      body: 'Your order is Pending with the stockist.',
      next: [
        { label: 'View order', to: `/pharmacy/orders/${res.data.orderNo}` },
        { label: 'Continue shopping', to: '/pharmacy/buy' },
      ],
    });
    navigate(`/pharmacy/orders/${res.data.orderNo}`);
  };

  return (
    <div className="stack">
      <PageHeader
        title="Cart & checkout"
        subtitle="Choose delivery address and review totals before placing"
        actions={
          lines.length ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const res = await clearCart({ actor: user, pharmacy: business, stockistId: sid });
                if (res.ok) {
                  setCart(await getCart(business.id, sid));
                  pushToast({ tone: 'success', title: 'Cart cleared' });
                } else pushToast({ tone: 'error', title: res.message });
              }}
            >
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
                      <Input
                        type="number"
                        style={{ width: 80 }}
                        value={l.qty}
                        disabled={!l.product || !connected}
                        onChange={async (e) => {
                          if (!l.product) return;
                          await setCartLine({
                            actor: user,
                            pharmacy: business,
                            stockistId: sid,
                            productId: l.productId,
                            qty: Number(e.target.value),
                          });
                          setCart(await getCart(business.id, sid));
                        }}
                      />
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
            <div className="grid-2">
              <Field label="New label">
                <Input value={addrForm.label} onChange={(e) => setAddrForm((f) => ({ ...f, label: e.target.value }))} />
              </Field>
              <Field label="Line 1">
                <Input value={addrForm.line1} onChange={(e) => setAddrForm((f) => ({ ...f, line1: e.target.value }))} />
              </Field>
              <Field label="City">
                <Input value={addrForm.city} onChange={(e) => setAddrForm((f) => ({ ...f, city: e.target.value }))} />
              </Field>
              <Field label="State">
                <Input value={addrForm.state} onChange={(e) => setAddrForm((f) => ({ ...f, state: e.target.value }))} />
              </Field>
              <Field label="Pincode">
                <Input
                  value={addrForm.pincode}
                  onChange={(e) => setAddrForm((f) => ({ ...f, pincode: e.target.value }))}
                />
              </Field>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const res = await upsertDeliveryAddress({
                  actor: user,
                  business,
                  address: { ...addrForm, isDefault: !(liveBiz?.deliveryAddresses ?? []).length },
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message });
                  return;
                }
                setAddressId(res.data.id);
                setAddrForm({ label: '', line1: '', city: '', state: '', pincode: '' });
                pushToast({ tone: 'success', title: 'Address saved' });
              }}
            >
              Save address
            </Button>
          </div>

          <div className="card card-pad stack">
            <strong>Checkout review</strong>
            <Field label="Preferred delivery date">
              <Input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
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
              disabled={busy || !selectedAddress || blocking}
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

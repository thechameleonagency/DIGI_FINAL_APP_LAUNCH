import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../../data/db';
import { cartTotals, pharmacyOutstanding, productAvailableSellable } from '../../domain/calc';
import { makeIdempotencyKey } from '../../domain/utils/idempotency';
import { formatINR } from '../../domain/utils/money';
import { getCart, setCartLine, toggleWishlist } from '../../services/catalogueService';
import { cancelConnectionRequest, disconnectConnection, requestConnection } from '../../services/connectionService';
import { cancelOrder, placeOrder } from '../../services/orderService';
import { recordGrn } from '../../services/fulfilmentService';
import { applyCreditNote, submitPayment, submitReturn } from '../../services/paymentService';
import { createTicket, sendMessage } from '../../services/supportService';
import { inviteStaff } from '../../services/authService';
import { pharmacyAnalytics } from '../../services/analyticsService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { AnalyticsDashboard } from '../../ui/components/AnalyticsDashboard';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Kpi, Money, Modal, PageHeader, Select, StatusBadge, Textarea } from '../../ui/components/primitives';

function useBiz() {
  const { user, business } = useSession();
  return { user: user!, business: business! };
}

export function PharmacyHome() {
  const { business } = useBiz();
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const announcements = useLiveQuery(() => db.announcements.filter((a) => a.active).toArray()) ?? [];
  const outstanding = pharmacyOutstanding(invoices, business.id);
  const pending = orders.filter((o) => ['Pending', 'Accepted', 'Allocated', 'Packed', 'Dispatched'].includes(o.status)).length;
  const activeConn = connections.filter((c) => c.status === 'Active').length;
  const chart = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const d = o.placedAt.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + o.grandTotal);
    }
    return [...map.entries()].slice(-8).map(([day, total]) => ({ day: day.slice(5), total }));
  }, [orders]);

  return (
    <div className="stack">
      <PageHeader title="Pharmacy home" subtitle="Purchasing queues, payables, and next actions" />
      {announcements.slice(0, 1).map((a) => (
        <div key={a.id} className="banner-strip">
          <strong>{a.title}</strong> — {a.body}
        </div>
      ))}
      <div className="kpi-grid">
        <Kpi label="Outstanding payables" value={<Money value={outstanding} />} sub="From issued invoices" />
        <Kpi label="Open orders" value={pending} sub="In fulfilment" />
        <Kpi label="Active connections" value={activeConn} />
        <Kpi label="Orders (all)" value={orders.length} />
      </div>
      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Getting started checklist</h3>
          <div className="checklist">
            {[
              { done: business.verificationStatus === 'Approved', label: 'Business verified' },
              { done: activeConn > 0, label: 'Connect to a stockist' },
              { done: orders.length > 0, label: 'Place a purchase order' },
              { done: invoices.some((i) => i.paidAmount > 0), label: 'Submit a payment' },
            ].map((c) => (
              <div key={c.label} className={`check-item${c.done ? ' done' : ''}`}>
                <div className="mark">{c.done ? '✓' : ''}</div>
                {c.label}
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Purchasing trend</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Bar dataKey="total" fill="#4A7399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="row">
        <Link className="btn btn-primary" to="/pharmacy/buy">
          Discover & buy
        </Link>
        <Link className="btn btn-secondary" to="/pharmacy/payments">
          Pay outstanding
        </Link>
        <Link className="btn btn-secondary" to="/pharmacy/orders">
          View orders
        </Link>
      </div>
    </div>
  );
}

export function PharmacyBuy() {
  const { business, user } = useBiz();
  const { stockistId } = useParams();
  const { pushToast } = useUi();
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');

  const selected = stockistId ?? connections.find((c) => c.status === 'Active')?.stockistId;
  const products =
    useLiveQuery(async () => {
      if (!selected) return [];
      return db.products.where('stockistId').equals(selected).toArray();
    }, [selected]) ?? [];
  const batches = useLiveQuery(() => db.batches.toArray()) ?? [];

  const categories = ['All', ...new Set(products.map((p) => p.category))];
  const filtered = products.filter((p) => {
    if (p.status !== 'Active') return false;
    if (category !== 'All' && p.category !== category) return false;
    if (q && !`${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const connFor = (sid: string) => connections.find((c) => c.stockistId === sid);
  const active = selected ? connFor(selected)?.status === 'Active' : false;

  return (
    <div className="stack">
      <PageHeader title="Buy" subtitle="Discover stockists and browse catalogues (prices require Active connection)" />
      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Stockists</strong>
          <Field label="Search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, name…" />
          </Field>
          {stockists
            .filter((s) => s.verificationStatus === 'Approved')
            .filter((s) => !q || `${s.name} ${s.city}`.toLowerCase().includes(q.toLowerCase()))
            .map((s) => {
              const c = connFor(s.id);
              return (
                <div key={s.id} className="card card-pad queue-card" style={{ borderColor: selected === s.id ? 'var(--accent)' : undefined }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{s.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {s.city} · {s.servicePins?.slice(0, 3).join(', ')}
                      </div>
                    </div>
                    {c ? <StatusBadge status={c.status} /> : <StatusBadge status="Disconnected" />}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
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
                              : { tone: 'error', title: res.message, message: res.businessImpact },
                          );
                        }}
                      >
                        Request connection
                      </Button>
                    ) : null}
                    {c?.status === 'Requested' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await cancelConnectionRequest({ actor: user, pharmacy: business, connectionId: c.id });
                          pushToast({ tone: 'info', title: 'Request cancelled' });
                        }}
                      >
                        Cancel request
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="stack">
          {selected ? (
            <>
              <div className="row">
                <Input placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
                <Select value={category} onChange={(e) => setCategory(e.target.value)} style={{ maxWidth: 160 }}>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Link className="btn btn-primary btn-sm" to="/pharmacy/cart">
                  Open cart
                </Link>
              </div>
              {!active ? (
                <div className="banner-strip warning">Connect with this stockist to see PTR pricing and place orders.</div>
              ) : null}
              <div className="product-grid">
                {filtered.map((p) => {
                  const avail = productAvailableSellable(batches.filter((b) => b.productId === p.id));
                  return (
                    <div key={p.id} className="card product-card">
                      <h3>{p.name}</h3>
                      <div className="meta">
                        {p.brand} · {p.packSize} · {p.sku}
                      </div>
                      <div className="price">{active ? formatINR(p.ptr) : 'Price on connect'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Available: {avail} · MOQ {p.moq}
                      </div>
                      <div className="row">
                        <Button
                          size="sm"
                          disabled={!active}
                          onClick={async () => {
                            const res = await setCartLine({ pharmacyId: business.id, stockistId: selected, productId: p.id, qty: p.moq });
                            pushToast(
                              res.ok
                                ? { tone: 'success', title: 'Added to cart' }
                                : { tone: 'error', title: res.message, message: res.businessImpact },
                            );
                          }}
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await toggleWishlist(business.id, p.id, selected);
                            pushToast({ tone: 'info', title: 'Wishlist updated' });
                          }}
                        >
                          Wishlist
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="Select a stockist" description="Choose a connected stockist to browse catalogue." />
          )}
        </div>
      </div>
    </div>
  );
}

export function PharmacyCart() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const connections = useLiveQuery(() => db.connections.where({ pharmacyId: business.id, status: 'Active' }).toArray(), [business.id]) ?? [];
  const [stockistId, setStockistId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const sid = stockistId || connections[0]?.stockistId || '';
  const [cart, setCart] = useState<Awaited<ReturnType<typeof getCart>> | null>(null);
  const products = useLiveQuery(() => db.products.toArray()) ?? [];

  useEffect(() => {
    if (sid) getCart(business.id, sid).then(setCart);
  }, [business.id, sid]);

  const lines = (cart?.lines ?? []).map((l) => {
    const p = products.find((x) => x.id === l.productId)!;
    return { ...l, product: p, calc: cartTotals([{ qty: l.qty, unitPrice: p.ptr, gstPercent: p.gstPercent }]) };
  });
  const totals = cartTotals(
    lines.filter((l) => l.product).map((l) => ({ qty: l.qty, unitPrice: l.product.ptr, gstPercent: l.product.gstPercent })),
  );

  return (
    <div className="stack">
      <PageHeader title="Cart & checkout" subtitle="Price snapshots are taken at place-order" />
      <Field label="Stockist">
        <Select value={sid} onChange={(e) => setStockistId(e.target.value)}>
          {connections.map((c) => {
            const s = undefined;
            void s;
            return (
              <option key={c.id} value={c.stockistId}>
                {c.stockistId}
              </option>
            );
          })}
        </Select>
      </Field>
      <StockistNameSelect connections={connections} value={sid} onChange={setStockistId} />
      {!lines.length ? (
        <EmptyState title="Cart is empty" description="Browse a connected catalogue to add products." action={<Link className="btn btn-primary" to="/pharmacy/buy">Browse</Link>} />
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.productId}>
                    <td>{l.product?.name}</td>
                    <td>
                      <Input
                        type="number"
                        style={{ width: 80 }}
                        value={l.qty}
                        onChange={async (e) => {
                          await setCartLine({ pharmacyId: business.id, stockistId: sid, productId: l.productId, qty: Number(e.target.value) });
                          setCart(await getCart(business.id, sid));
                        }}
                      />
                    </td>
                    <td><Money value={l.product.ptr} /></td>
                    <td><Money value={cartTotals([{ qty: l.qty, unitPrice: l.product.ptr, gstPercent: l.product.gstPercent }]).grandTotal} /></td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await setCartLine({ pharmacyId: business.id, stockistId: sid, productId: l.productId, qty: 0 });
                        setCart(await getCart(business.id, sid));
                      }}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Order total</strong>
              <strong><Money value={totals.grandTotal} /></strong>
            </div>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await placeOrder({
                  actor: user,
                  pharmacy: business,
                  stockistId: sid,
                  address: {
                    id: 'default',
                    label: 'Storefront',
                    line1: business.address,
                    city: business.city,
                    state: business.state,
                    pincode: business.pincode,
                    isDefault: true,
                  },
                  notes,
                  idempotencyKey: makeIdempotencyKey('placeOrder', user.id),
                });
                setBusy(false);
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  if (res.existingId) navigate(`/pharmacy/orders`);
                  return;
                }
                pushToast({ tone: 'success', title: 'Order placed', message: `${res.data.orderNo} is Pending with stockist.` });
                navigate(`/pharmacy/orders/${res.data.orderNo}`);
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

function StockistNameSelect({
  connections,
  value,
  onChange,
}: {
  connections: { id: string; stockistId: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const businesses = useLiveQuery(() => db.businesses.bulkGet(connections.map((c) => c.stockistId)), [connections]) ?? [];
  return (
    <Field label="Connected stockist">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {connections.map((c, i) => (
          <option key={c.id} value={c.stockistId}>
            {businesses[i]?.name ?? c.stockistId}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function PharmacyOrders() {
  const { business } = useBiz();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const columns = useMemo(
    () => [
      { key: 'orderNo', label: 'Order', getValue: (o: (typeof orders)[0]) => o.orderNo, render: (o: (typeof orders)[0]) => <Link to={`/pharmacy/orders/${o.orderNo}`}>{o.orderNo}</Link> },
      { key: 'status', label: 'Status', getValue: (o: (typeof orders)[0]) => o.status, render: (o: (typeof orders)[0]) => <StatusBadge status={o.status} /> },
      { key: 'grandTotal', label: 'Total', getValue: (o: (typeof orders)[0]) => o.grandTotal, render: (o: (typeof orders)[0]) => <Money value={o.grandTotal} /> },
      { key: 'placedAt', label: 'Placed', getValue: (o: (typeof orders)[0]) => o.placedAt, render: (o: (typeof orders)[0]) => <span className="muted">{new Date(o.placedAt).toLocaleString()}</span> },
    ],
    [],
  );
  const list = useListControls(orders, {
    columns,
    searchKeys: [(o) => `${o.orderNo} ${o.status} ${o.notes ?? ''}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Pending', 'Accepted', 'Allocated', 'Packed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'].map((s) => ({
          value: s,
          label: s,
        })),
      },
    ],
    defaultSortKey: 'placedAt',
    defaultSortDir: 'desc',
  });
  return (
    <div className="stack">
      <PageHeader title="Orders" subtitle="Search, filter, sort, export — pharmacy scope only" />
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search order no / status / notes"
        filters={[{ key: 'status', label: 'Status', options: ['Pending', 'Accepted', 'Allocated', 'Packed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'].map((s) => ({ value: s, label: s })) }]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          const ok = list.doExport(`pharmacy-orders-${business.id}.csv`);
          pushToast(ok ? { tone: 'success', title: 'Exported current filter set' } : { tone: 'error', title: 'Export denied' });
        }}
      />
      <DataListTable
        columns={columns}
        rows={list.pageRows}
        sortKey={list.sortKey}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        emptyTitle="No orders match"
        emptyDescription="Empty result is not an error — adjust filters or place an order."
        onRowClick={(o) => navigate(`/pharmacy/orders/${o.orderNo}`)}
      />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
    </div>
  );
}

export function PharmacyOrderDetail() {
  const { orderNo } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const order = useLiveQuery(() => db.orders.where('orderNo').equals(orderNo!).first(), [orderNo]);
  const invoice = useLiveQuery(() => (order?.invoiceId ? db.invoices.get(order.invoiceId) : undefined), [order?.invoiceId]);
  const [grnOpen, setGrnOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('Damaged');

  if (!order) return <EmptyState title="Order not found" description="Check the order number." />;

  return (
    <div className="stack">
      <PageHeader
        title={order.orderNo}
        subtitle={`Status: ${order.status}`}
        actions={
          <>
            {['Pending', 'Accepted'].includes(order.status) ? (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  const res = await cancelOrder({ actor: user, business, orderId: order.id, reason: 'Cancelled by pharmacy' });
                  pushToast(res.ok ? { tone: 'success', title: 'Order cancelled' } : { tone: 'error', title: res.message });
                }}
              >
                Cancel
              </Button>
            ) : null}
            {['Delivered', 'PartiallyDelivered'].includes(order.status) ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setGrnOpen(true)}>
                  Record GRN
                </Button>
                <Button size="sm" onClick={() => setReturnOpen(true)}>
                  Raise return
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="grid-2">
        <div className="card card-pad">
          <strong>Lines</strong>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Delivered</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.productName}</td>
                    <td>{l.qty}</td>
                    <td>{l.deliveredQty ?? '—'}</td>
                    <td><Money value={l.lineTotal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <span>Grand total</span>
            <strong><Money value={order.grandTotal} /></strong>
          </div>
          {invoice ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Invoice <Link to="/pharmacy/payments">{invoice.invoiceNo}</Link> · Outstanding <Money value={invoice.outstanding} />
            </div>
          ) : null}
        </div>
        <div className="card card-pad">
          <strong>Timeline</strong>
          <div className="timeline" style={{ marginTop: 12 }}>
            {order.statusHistory.map((h, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-dot" />
                <div>
                  <div>
                    {h.from} → <strong>{h.to}</strong>
                  </div>
                  <div className="muted">{new Date(h.at).toLocaleString()}{h.reason ? ` · ${h.reason}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={grnOpen}
        onClose={() => setGrnOpen(false)}
        title="Goods receipt (GRN)"
        footer={
          <Button
            onClick={async () => {
              const res = await recordGrn({
                actor: user,
                pharmacy: business,
                orderId: order.id,
                received: order.lines.map((l) => ({
                  lineId: l.id,
                  receivedQty: received[l.id] ?? l.deliveredQty ?? l.qty,
                })),
              });
              pushToast(res.ok ? { tone: 'success', title: 'GRN recorded' } : { tone: 'error', title: res.message });
              setGrnOpen(false);
            }}
          >
            Save GRN
          </Button>
        }
      >
        <div className="stack">
          {order.lines.map((l) => (
            <Field key={l.id} label={`${l.productName} (delivered ${l.deliveredQty ?? l.qty})`}>
              <Input
                type="number"
                value={received[l.id] ?? l.deliveredQty ?? l.qty}
                onChange={(e) => setReceived((r) => ({ ...r, [l.id]: Number(e.target.value) }))}
              />
            </Field>
          ))}
        </div>
      </Modal>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Raise return"
        footer={
          <Button
            onClick={async () => {
              const lines = order.lines
                .filter((l) => (returnQty[l.productId] ?? 0) > 0)
                .map((l) => ({ productId: l.productId, qty: returnQty[l.productId], reason: returnReason }));
              const res = await submitReturn({ actor: user, pharmacy: business, orderId: order.id, lines });
              pushToast(res.ok ? { tone: 'success', title: 'Return submitted', message: res.data.returnNo } : { tone: 'error', title: res.message, message: res.businessImpact });
              setReturnOpen(false);
            }}
          >
            Submit return
          </Button>
        }
      >
        <div className="stack">
          <Field label="Reason">
            <Select value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
              {['Damaged', 'Expired', 'Wrong item', 'Short dated', 'Other'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          {order.lines.map((l) => (
            <Field key={l.id} label={l.productName}>
              <Input
                type="number"
                min={0}
                max={l.deliveredQty ?? l.qty}
                value={returnQty[l.productId] ?? 0}
                onChange={(e) => setReturnQty((q) => ({ ...q, [l.productId]: Number(e.target.value) }))}
              />
            </Field>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export function PharmacyPayments() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const payments = useLiveQuery(() => db.payments.where('pharmacyId').equals(business.id).reverse().sortBy('createdAt'), [business.id]) ?? [];
  const credits = useLiveQuery(() => db.creditNotes.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const [tab, setTab] = useState<'Outstanding' | 'History' | 'Credits'>('Outstanding');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<'UPI' | 'NEFT'>('UPI');
  const [reference, setReference] = useState('');

  const openInvoices = invoices.filter((i) => i.outstanding > 0 && i.status !== 'Void');
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const visibleInvoices = openInvoices.filter((i) => {
    if (statusFilter === 'Overdue' && i.status !== 'Overdue') return false;
    if (statusFilter !== 'All' && statusFilter !== 'Overdue' && i.status !== statusFilter) return false;
    if (invoiceQuery && !`${i.invoiceNo} ${i.status}`.toLowerCase().includes(invoiceQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="stack">
      <PageHeader title="Payments" subtitle={`Outstanding ${formatINR(pharmacyOutstanding(invoices, business.id))}`} />
      <div className="tabs">
        {(['Outstanding', 'History', 'Credits'] as const).map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Outstanding' && (
        <>
          <div className="row">
            <Input
              placeholder="Search invoice number"
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              style={{ maxWidth: 260 }}
              aria-label="Search invoices"
            />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter invoice status" style={{ maxWidth: 180 }}>
              <option value="All">All open</option>
              <option value="Issued">Issued</option>
              <option value="PartiallyPaid">Partially paid</option>
              <option value="Overdue">Overdue</option>
            </Select>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Outstanding</th>
                  <th>Pay now</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.invoiceNo}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td><Money value={i.grandTotal} /></td>
                    <td><Money value={i.outstanding} /></td>
                    <td>
                      <Input
                        type="number"
                        style={{ width: 120 }}
                        value={selected[i.id] ?? ''}
                        placeholder="0"
                        onChange={(e) => setSelected((s) => ({ ...s, [i.id]: Number(e.target.value) }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleInvoices.length ? (
            <EmptyState title="No invoices match" description="Empty filter result is not an error." />
          ) : null}
          <div className="card card-pad stack">
            <div className="grid-2">
              <Field label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value as 'UPI' | 'NEFT')}>
                  <option>UPI</option>
                  <option>NEFT</option>
                </Select>
              </Field>
              <Field label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
            <Button
              onClick={async () => {
                const allocations = Object.entries(selected)
                  .filter(([, amt]) => amt > 0)
                  .map(([invoiceId, amount]) => ({ invoiceId, amount }));
                if (!allocations.length) {
                  pushToast({ tone: 'warning', title: 'Select invoice amounts' });
                  return;
                }
                const amount = allocations.reduce((s, a) => s + a.amount, 0);
                const stockistId = invoices.find((i) => i.id === allocations[0].invoiceId)!.stockistId;
                const res = await submitPayment({
                  actor: user,
                  pharmacy: business,
                  stockistId,
                  amount,
                  method,
                  reference: reference || undefined,
                  allocations,
                  idempotencyKey: makeIdempotencyKey('pay', user.id),
                });
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Payment submitted', message: res.data.paymentNo }
                    : { tone: 'error', title: res.message, message: res.businessImpact },
                );
                if (res.ok) setSelected({});
              }}
            >
              Submit payment
            </Button>
          </div>
        </>
      )}
      {tab === 'History' && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Payment</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.paymentNo}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td><Money value={p.amount} /></td>
                  <td>{p.reference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'Credits' && (
        <div className="stack">
          {credits.map((c) => (
            <div key={c.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{c.creditNoteNo}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  Remaining <Money value={c.remaining} />
                </div>
              </div>
              <Button
                size="sm"
                disabled={c.remaining <= 0}
                onClick={async () => {
                  const inv = openInvoices[0] ?? invoices.find((i) => i.outstanding > 0);
                  if (!inv) {
                    pushToast({ tone: 'info', title: 'No open invoice to apply credit' });
                    return;
                  }
                  const res = await applyCreditNote({
                    actor: user,
                    business,
                    creditNoteId: c.id,
                    invoiceId: inv.id,
                    amount: Math.min(c.remaining, inv.outstanding),
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Credit applied' } : { tone: 'error', title: res.message });
                }}
              >
                Apply to invoice
              </Button>
            </div>
          ))}
          {!credits.length ? <EmptyState title="No credit notes" description="Approved returns create credit notes." /> : null}
        </div>
      )}
    </div>
  );
}

export function PharmacyReturns() {
  const { business } = useBiz();
  const returns = useLiveQuery(() => db.returns.where('pharmacyId').equals(business.id).reverse().sortBy('createdAt'), [business.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Returns" subtitle="Raise returns from delivered order detail" />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Return</th>
              <th>Status</th>
              <th>Lines</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id}>
                <td>{r.returnNo}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.lines.length}</td>
                <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PharmacyInventory() {
  const { business } = useBiz();
  const items = useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Inventory" subtitle="Stock received via GRN" />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>On hand</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.productName}</td>
                <td>{i.batchNumber ?? '—'}</td>
                <td>{i.expiryDate ?? '—'}</td>
                <td>{i.onHand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PharmacyConnections() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const connections = useLiveQuery(() => db.connections.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Connections" subtitle="Active trading relationships" actions={<Link className="btn btn-primary" to="/pharmacy/buy">Discover stockists</Link>} />
      <div className="stack">
        {connections.map((c) => {
          const s = businesses.find((b) => b.id === c.stockistId);
          return (
            <div key={c.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{s?.name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  Credit days: {c.creditDays ?? '—'}
                </div>
              </div>
              <div className="row">
                <StatusBadge status={c.status} />
                {c.status === 'Active' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await disconnectConnection({ actor: user, business, connectionId: c.id, reason: 'Pharmacy disconnect' });
                      pushToast(res.ok ? { tone: 'info', title: 'Disconnected' } : { tone: 'error', title: res.message });
                    }}
                  >
                    Disconnect
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PharmacyAnalytics() {
  const { business } = useBiz();
  return (
    <AnalyticsDashboard
      title="Pharmacy analytics"
      subtitle="KPIs recompute from invoices/orders — drill into source documents"
      load={() => pharmacyAnalytics(business.id)}
    />
  );
}

export function PharmacyStaff() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const staff = useLiveQuery(() => db.users.where('businessId').equals(business.id).toArray(), [business.id]) ?? [];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'Staff' | 'Accountant' | 'Manager'>('Staff');
  return (
    <div className="stack">
      <PageHeader title="Staff" />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.role}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card card-pad stack">
        <strong>Invite staff</strong>
        <div className="grid-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option>Staff</option>
              <option>Accountant</option>
              <option>Manager</option>
            </Select>
          </Field>
        </div>
        <Button
          onClick={async () => {
            const res = await inviteStaff({ actor: user, business, name, email, phone, role });
            if (res.ok) {
              pushToast({ tone: 'success', title: 'Invite created', message: `Token: ${res.data.inviteToken}` });
              setName(''); setEmail(''); setPhone('');
            } else pushToast({ tone: 'error', title: res.message });
          }}
        >
          Send invite
        </Button>
      </div>
    </div>
  );
}

export function PharmacyMessages() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const threads = useLiveQuery(() => db.messageThreads.toArray(), []) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const mine = threads.filter((t) => t.participantBusinessIds.includes(business.id));
  const [body, setBody] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>();
  const messages =
    useLiveQuery(async () => {
      if (!threadId) return [];
      return db.messages.where('threadId').equals(threadId).sortBy('createdAt');
    }, [threadId]) ?? [];
  const conn = useLiveQuery(() => db.connections.where({ pharmacyId: business.id, status: 'Active' }).first(), [business.id]);
  const activeThread = mine.find((t) => t.id === threadId);

  return (
    <div className="stack">
      <PageHeader title="Messages" subtitle="Informational only — chat never approves orders, payments, or returns" />
      <div className="banner-strip">Official actions happen only via workflow buttons. Typing “Approved” here does nothing.</div>
      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Threads</strong>
          {mine.map((t) => {
            const otherId = t.participantBusinessIds.find((id) => id !== business.id);
            const other = businesses.find((b) => b.id === otherId);
            return (
              <button
                key={t.id}
                type="button"
                className={`btn ${threadId === t.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setThreadId(t.id)}
              >
                {other?.name ?? 'Partner'} · {new Date(t.lastMessageAt).toLocaleString()}
              </button>
            );
          })}
          {!mine.length ? <EmptyState title="No threads yet" description="Start a conversation with a connected stockist." /> : null}
        </div>
        <div className="card card-pad stack">
          <strong>{activeThread ? 'Conversation' : 'Select a thread'}</strong>
          <div style={{ maxHeight: 320, overflow: 'auto' }} className="stack">
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  fontSize: 13,
                  alignSelf: m.senderId === user.id ? 'flex-end' : 'flex-start',
                  background: m.senderId === user.id ? 'color-mix(in srgb, var(--accent) 12%, white)' : 'var(--subtle)',
                  padding: '8px 10px',
                  borderRadius: 10,
                  maxWidth: '85%',
                }}
              >
                <strong>{m.senderId === user.id ? 'You' : 'Counterpart'}</strong>: {m.body}
                <div className="muted" style={{ fontSize: 11 }}>{new Date(m.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" />
          <Button
            onClick={async () => {
              if (!conn) {
                pushToast({ tone: 'warning', title: 'No active connection', message: 'Connect to a stockist first.' });
                return;
              }
              const res = await sendMessage({
                actor: user,
                business,
                counterpartBusinessId: conn.stockistId,
                body,
                threadId,
              });
              if (res.ok) {
                setThreadId(res.data.thread.id);
                setBody('');
              } else pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
            }}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PharmacySupport() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const tickets = useLiveQuery(() => db.supportTickets.where('businessId').equals(business.id).toArray(), [business.id]) ?? [];
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  return (
    <div className="stack">
      <PageHeader title="Support" />
      <div className="card card-pad stack">
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Description"><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Button
          onClick={async () => {
            const res = await createTicket({ actor: user, business, subject, category: 'General', body });
            pushToast(res.ok ? { tone: 'success', title: res.data.ticketNo } : { tone: 'error', title: res.message });
            if (res.ok) { setSubject(''); setBody(''); }
          }}
        >
          Create ticket
        </Button>
      </div>
      {tickets.map((t) => (
        <div key={t.id} className="card card-pad">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{t.ticketNo}</strong>
            <StatusBadge status={t.status} />
          </div>
          <div>{t.subject}</div>
        </div>
      ))}
    </div>
  );
}

export function PharmacyNotifications() {
  const { user } = useBiz();
  const notes = useLiveQuery(() => db.notifications.where('userId').equals(user.id).reverse().sortBy('createdAt'), [user.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader
        title="Notifications"
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await Promise.all(notes.filter((n) => n.status === 'Unread').map((n) => db.notifications.update(n.id, { status: 'Read', readAt: new Date().toISOString() })));
            }}
          >
            Mark all read
          </Button>
        }
      />
      {notes.map((n) => (
        <div key={n.id} className="card card-pad" style={{ opacity: n.status === 'Read' ? 0.75 : 1 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{n.title}</strong>
            <span className="muted" style={{ fontSize: 11 }}>{n.code}</span>
          </div>
          <div style={{ fontSize: 13.5 }}>{n.body}</div>
        </div>
      ))}
    </div>
  );
}

export function PharmacyBusiness() {
  const { business } = useBiz();
  return (
    <div className="stack">
      <PageHeader title="Business profile" />
      <div className="card card-pad stack">
        <div><strong>{business.name}</strong></div>
        <div className="muted">GSTIN {business.gstNumber}</div>
        <div className="muted">Drug license {business.drugLicenseNumber}</div>
        <div className="muted">{business.address}, {business.city}, {business.state} {business.pincode}</div>
        <div className="row">
          <StatusBadge status={business.verificationStatus} />
          <StatusBadge status={business.accountStatus} />
        </div>
      </div>
    </div>
  );
}

export function PharmacySettings() {
  return (
    <div className="stack">
      <PageHeader title="Settings & more" />
      <div className="card card-pad stack">
        <Link to="/pharmacy/wishlist">Wishlist</Link>
        <Link to="/pharmacy/business">Business profile</Link>
        <Link to="/pharmacy/staff">Staff</Link>
        <Link to="/pharmacy/notifications">Notifications</Link>
        <Link to="/pharmacy/support">Support</Link>
        <p className="muted" style={{ fontSize: 13 }}>Demo OTP for password reset: 123456. Workspace export is available under Admin settings.</p>
      </div>
    </div>
  );
}

export function PharmacyWishlist() {
  const { business } = useBiz();
  const items = useLiveQuery(() => db.wishlists.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.bulkGet(items.map((i) => i.productId)), [items]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Wishlist" />
      {items.map((i, idx) => (
        <div key={i.id} className="card card-pad">
          {products[idx]?.name ?? i.productId}
        </div>
      ))}
      {!items.length ? <EmptyState title="Wishlist empty" description="Save products while browsing catalogues." /> : null}
    </div>
  );
}

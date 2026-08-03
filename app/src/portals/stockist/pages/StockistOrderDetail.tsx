import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { formatINR } from '../../../domain/utils/money';
import { acceptOrder, cancelOrder, closeOrder, editOrderLines, rejectOrder } from '../../../services/orderService';
import {
  allocateOrder,
  createAndDispatchDelivery,
  issueInvoice,
  packOrder,
} from '../../../services/fulfilmentService';
import { ensureMessageThread } from '../../../services/supportService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { OrderDeliveriesPanel } from '../../../ui/components/OrderDeliveriesPanel';
import { PharmacyDeliveryPrefs } from '../../../ui/components/PharmacyDeliveryPrefs';
import { PrintDocument } from '../../../ui/components/PrintDocument';
import { Button, EmptyState, Field, Input, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { ShortcutHints } from '../../../ui/components/ShortcutHints';
import { useBiz } from './useBiz';

export function StockistOrderDetail() {
  const { orderNo } = useParams();
  const navigate = useNavigate();
  const { business, user } = useBiz();
  const { pushToast, showSuccessSummary } = useUi();
  const canAccept = useCan('order.accept');
  const canReject = useCan('order.reject');
  const canAllocate = useCan('order.allocate');
  const canPack = useCan('order.pack');
  const canInvoice = useCan('invoice.issue');
  const canDispatch = useCan('delivery.assign');
  const canCancel = useCan('order.cancel');
  const order = useLiveQuery(() => db.orders.where('orderNo').equals(orderNo!).first(), [orderNo]);
  const pharmacy = useLiveQuery(
    () => (order ? db.businesses.get(order.pharmacyId) : undefined),
    [order?.pharmacyId],
  );
  const invoice = useLiveQuery(
    () => (order?.invoiceId ? db.invoices.get(order.invoiceId) : undefined),
    [order?.invoiceId],
  );
  const connection = useLiveQuery(
    () => (order ? db.connections.get(order.connectionId) : undefined),
    [order?.connectionId],
  );
  const pairInvoices =
    useLiveQuery(
      () =>
        order
          ? db.invoices.where({ pharmacyId: order.pharmacyId, stockistId: business.id }).toArray()
          : [],
      [order?.pharmacyId, business.id],
    ) ?? [];
  const staff = useLiveQuery(
    () => db.users.where('businessId').equals(business.id).filter((u) => u.role === 'DeliveryStaff').toArray(),
    [business.id],
  ) ?? [];
  const routes =
    useLiveQuery(() => db.stockistRoutes.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const billAhead = !!settings?.billAheadAllowed;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [creditWarn, setCreditWarn] = useState<'accept' | 'invoice' | null>(null);
  const [assignee, setAssignee] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [dispatchRouteId, setDispatchRouteId] = useState('');
  const [acceptedQtys, setAcceptedQtys] = useState<Record<string, number>>({});
  const [editQtys, setEditQtys] = useState<Record<string, number>>({});
  const [editingLines, setEditingLines] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, { batchId: string; qty: number }[]>>({});

  const batches = useLiveQuery(
    () => (order ? db.batches.where('stockistId').equals(business.id).toArray() : []),
    [order?.id, business.id],
  ) ?? [];

  if (!order) return <EmptyState title="Order not found" description="" />;

  const addr = order.deliveryAddress;
  const cancellable = ['Pending', 'Accepted', 'PartiallyAccepted', 'Allocated', 'Packed'].includes(order.status);
  const linesEditable = ['Pending', 'Accepted', 'PartiallyAccepted'].includes(order.status);
  const outstanding = pairOutstanding(pairInvoices, order.pharmacyId, business.id);
  const creditLimit = connection?.creditLimit;
  const wouldExceed =
    creditLimit != null && outstanding + order.grandTotal > creditLimit;

  const act = async (
    fn: () => Promise<{
      ok: boolean;
      message?: string;
      businessImpact?: string;
      data?: { orderNo?: string; invoiceNo?: string; deliveryNo?: string };
    }>,
    okTitle: string,
  ) => {
    const res = await fn();
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message!, message: res.businessImpact });
      return;
    }
    // Milestone actions get SuccessSummary; lighter steps stay toast-only.
    if (okTitle === 'Invoice issued') {
      showSuccessSummary({
        title: 'Invoice issued',
        documentNo: res.data?.invoiceNo,
        body: `Invoice created for ${order.orderNo}.`,
        next: [
          ...(res.data?.invoiceNo
            ? [{ label: 'Open invoice', to: `/stockist/invoices/${res.data.invoiceNo}` }]
            : []),
          { label: 'Back to orders', to: '/stockist/orders' },
        ],
      });
      return;
    }
    if (okTitle === 'Dispatched') {
      showSuccessSummary({
        title: 'Delivery dispatched',
        documentNo: res.data?.deliveryNo,
        body: `${order.orderNo} is out for fulfilment.`,
        next: [
          { label: 'Delivery board', to: '/stockist/delivery' },
          { label: 'Back to orders', to: '/stockist/orders' },
        ],
      });
      return;
    }
    pushToast({
      tone: 'success',
      title: okTitle,
      message: res.data?.orderNo || res.data?.invoiceNo || res.data?.deliveryNo,
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title={order.orderNo}
        subtitle={`${order.status} · ${pharmacy?.name ?? order.pharmacyId}`}
        backTo="/stockist/orders"
        backLabel="Back to orders"
        actions={
          <ShortcutHints
            hints={
              canInvoice &&
              !order.invoiceId &&
              (order.status === 'Packed' ||
                (billAhead && !['Cancelled', 'Rejected', 'Draft', 'Pending'].includes(order.status)))
                ? [{ keys: 'Ctrl+I', label: 'Bulk bill' }]
                : []
            }
            extra={
              <div className="row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const res = await ensureMessageThread({
                      actor: user,
                      business,
                      counterpartBusinessId: order.pharmacyId,
                      relatedEntityType: 'Order',
                      relatedEntityId: order.orderNo,
                    });
                    if (!res.ok) {
                      pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                      return;
                    }
                    const draft = encodeURIComponent(`Regarding order ${order.orderNo}`);
                    navigate(`/stockist/messages?thread=${res.data.id}&draft=${draft}`);
                  }}
                >
                  Message about this order
                </Button>
                <Link
                  className="btn btn-secondary btn-sm"
                  to={`/stockist/support?new=1&entityType=Order&entityId=${encodeURIComponent(order.id)}&entityNo=${encodeURIComponent(order.orderNo)}`}
                >
                  Get help with this order
                </Link>
              </div>
            }
          />
        }
      />
      <div className="row">
        <StatusBadge status={order.status} />
        {order.source === 'Manual' ? <StatusBadge status="Manual" /> : null}
      </div>
      {order.source === 'Manual' ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Recorded by stockist on behalf of pharmacy — creator permanently on audit trail.
        </div>
      ) : null}
      <ConfirmDialog
        open={rejectOpen}
        title="Reject order"
        body={`Reject ${order.orderNo}? Reserved stock will be released.`}
        requireReason
        tone="danger"
        confirmLabel="Reject order"
        onClose={() => setRejectOpen(false)}
        onConfirm={async (reason) => {
          await act(() => rejectOrder({ actor: user, stockist: business, orderId: order.id, reason: reason! }), 'Order rejected');
          setRejectOpen(false);
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        title="Cancel order"
        body={`Cancel ${order.orderNo}? Reservations will be released.`}
        requireReason
        tone="danger"
        confirmLabel="Cancel order"
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          await act(() => cancelOrder({ actor: user, business, orderId: order.id, reason: reason! }), 'Order cancelled');
          setCancelOpen(false);
        }}
      />
      <ConfirmDialog
        open={!!creditWarn}
        title="Credit limit exceeded"
        body={`Outstanding ${formatINR(outstanding)} + order ${formatINR(order.grandTotal)} exceeds limit ${formatINR(creditLimit ?? 0)}. Raise the credit limit or collect payment before continuing.`}
        confirmLabel="OK"
        onClose={() => setCreditWarn(null)}
        onConfirm={async () => {
          setCreditWarn(null);
        }}
      />

      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Pharmacy & delivery</strong>
          <PharmacyDeliveryPrefs pharmacy={pharmacy} />
          <div style={{ fontSize: 13 }}>
            <div>
              <strong>{pharmacy?.name ?? '—'}</strong>
            </div>
            <div className="muted">
              {pharmacy?.phone ?? '—'} · {pharmacy?.email ?? '—'}
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="muted">Delivery address</div>
              {addr ? (
                <div>
                  {addr.label ? <div>{addr.label}</div> : null}
                  <div>{addr.line1}</div>
                  {addr.line2 ? <div>{addr.line2}</div> : null}
                  <div>
                    {addr.city}, {addr.state} {addr.pincode}
                  </div>
                </div>
              ) : (
                <div>—</div>
              )}
            </div>
            {order.notes ? (
              <div style={{ marginTop: 8 }}>
                <div className="muted">Notes</div>
                <div>{order.notes}</div>
              </div>
            ) : null}
            {order.preferredDeliveryDate || order.preferredDate ? (
              <div style={{ marginTop: 8 }} className="muted">
                Preferred date: {order.preferredDeliveryDate ?? order.preferredDate}
              </div>
            ) : null}
          </div>
        </div>
        <div className="card card-pad stack">
          <strong>Totals</strong>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <span>Subtotal</span>
            <Money value={order.subtotal} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <span>Tax</span>
            <Money value={order.taxTotal} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
            <span>Grand total</span>
            <Money value={order.grandTotal} />
          </div>
          {creditLimit != null ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Pair outstanding {formatINR(outstanding)} / limit {formatINR(creditLimit)}
              {wouldExceed ? ' · over limit' : ''}
            </div>
          ) : null}
          {invoice ? (
            <div style={{ marginTop: 8 }}>
              Invoice: <Link to={`/stockist/invoices/${invoice.invoiceNo}`}>{invoice.invoiceNo}</Link>
              <span className="muted"> · </span>
              <StatusBadge status={invoice.status} />
            </div>
          ) : order.invoiceId ? (
            <div className="muted">Invoice linked</div>
          ) : (
            <div className="muted">No invoice yet</div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <OrderDeliveriesPanel orderId={order.id} supportBase="/stockist/support" />
      </div>

      <div className="row">
        {order.status === 'Pending' && canAccept ? (
          <Button
            onClick={() => {
              if (wouldExceed) setCreditWarn('accept');
              else
                void act(
                  () =>
                    acceptOrder({
                      actor: user,
                      stockist: business,
                      orderId: order.id,
                      acceptedQtys: Object.keys(acceptedQtys).length ? acceptedQtys : undefined,
                    }),
                  'Order accepted',
                );
            }}
          >
            Accept
          </Button>
        ) : null}
        {order.status === 'Pending' && canReject ? (
          <Button variant="danger" onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        ) : null}
        {canAllocate && ['Accepted', 'PartiallyAccepted'].includes(order.status) ? (
          <>
            <Button onClick={() => act(() => allocateOrder({ actor: user, stockist: business, orderId: order.id }), 'Allocated (FEFO)')}>
              Allocate (FEFO)
            </Button>
            <Button variant="secondary" onClick={() => setAllocOpen(true)}>
              Manual allocate…
            </Button>
          </>
        ) : null}
        {canPack && order.status === 'Allocated' ? (
          <>
            <Button onClick={() => act(() => packOrder({ actor: user, stockist: business, orderId: order.id }), 'Packed')}>
              Pack
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                document.getElementById('order-pick-list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                window.setTimeout(() => window.print(), 250);
              }}
            >
              Print pick list
            </Button>
          </>
        ) : null}
        {canInvoice &&
        !order.invoiceId &&
        (order.status === 'Packed' ||
          (billAhead &&
            !['Cancelled', 'Rejected', 'Draft', 'Pending'].includes(order.status))) ? (
          <Button
            onClick={() => {
              if (wouldExceed) setCreditWarn('invoice');
              else void act(() => issueInvoice({ actor: user, stockist: business, orderId: order.id }), 'Invoice issued');
            }}
          >
            Issue invoice
          </Button>
        ) : null}
        {canDispatch && order.status === 'Packed' && order.invoiceId ? (
          <>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Assign delivery staff…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              min={localTodayKey()}
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              aria-label="Scheduled delivery date"
              style={{ maxWidth: 180 }}
            />
            <Select value={dispatchRouteId} onChange={(e) => setDispatchRouteId(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="">No route</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Button
              onClick={() =>
                act(
                  () =>
                    createAndDispatchDelivery({
                      actor: user,
                      stockist: business,
                      orderId: order.id,
                      assigneeId: assignee || undefined,
                      scheduledDate: scheduleDate || undefined,
                      routeId: dispatchRouteId || undefined,
                    }),
                  'Dispatched',
                )
              }
            >
              Dispatch
            </Button>
          </>
        ) : null}
        {canCancel && cancellable ? (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        ) : null}
        {canAccept && ['Delivered', 'PartiallyDelivered'].includes(order.status) ? (
          <Button
            variant="secondary"
            onClick={() => act(() => closeOrder({ actor: user, stockist: business, orderId: order.id }), 'Order closed')}
          >
            Close order
          </Button>
        ) : null}
      </div>

      <div className="card card-pad">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Lines</strong>
          {linesEditable ? (
            editingLines ? (
              <div className="row">
                <Button
                  size="sm"
                  onClick={async () => {
                    const res = await editOrderLines({
                      actor: user,
                      business,
                      orderId: order.id,
                      qtys: Object.fromEntries(order.lines.map((l) => [l.id, editQtys[l.id] ?? l.qty])),
                    });
                    pushToast(
                      res.ok
                        ? { tone: 'success', title: 'Lines updated' }
                        : { tone: 'error', title: res.message!, message: res.businessImpact },
                    );
                    if (res.ok) setEditingLines(false);
                  }}
                >
                  Save lines
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditingLines(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditQtys(Object.fromEntries(order.lines.map((l) => [l.id, l.qty])));
                  setEditingLines(true);
                }}
              >
                Edit items
              </Button>
            )
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              Locked after pack — adjust via returns after delivery
            </span>
          )}
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                {order.status === 'Pending' && canAccept ? <th>Accept qty</th> : null}
                <th>Accepted</th>
                <th>Allocated</th>
                <th>Delivered</th>
                <th>Received</th>
                <th>Discrepancy</th>
                <th>Unit</th>
                <th>GST%</th>
                <th>Line total</th>
                <th>Batches</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.productName}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {l.sku} · {l.packSize}
                    </div>
                  </td>
                  <td>
                    {editingLines ? (
                      <Input
                        type="number"
                        min={1}
                        value={editQtys[l.id] ?? l.qty}
                        onChange={(e) => setEditQtys((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))}
                        style={{ width: 80 }}
                      />
                    ) : (
                      l.qty
                    )}
                  </td>
                  {order.status === 'Pending' && canAccept ? (
                    <td>
                      <Input
                        type="number"
                        min={0}
                        max={editingLines ? editQtys[l.id] ?? l.qty : l.qty}
                        value={acceptedQtys[l.id] ?? l.qty}
                        onChange={(e) => setAcceptedQtys((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))}
                        style={{ width: 80 }}
                      />
                    </td>
                  ) : null}
                  <td>{l.acceptedQty ?? '—'}</td>
                  <td>{l.allocatedQty ?? '—'}</td>
                  <td>{l.deliveredQty ?? '—'}</td>
                  <td>{l.receivedQty ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {l.discrepancyReason ? (
                      <span style={{ color: 'var(--danger, #b91c1c)' }}>{l.discrepancyReason}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Money value={l.unitPrice} />
                  </td>
                  <td>{l.gstPercent}%</td>
                  <td>
                    <Money value={l.lineTotal} />
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {l.batchAllocations?.map((b) => `${b.batchNumber}×${b.qty}`).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {['Allocated', 'Packed', 'Dispatched', 'Delivered', 'PartiallyDelivered', 'Closed'].includes(order.status) ? (
        <PrintDocument
          id="order-pick-list"
          title={`Pick list · ${order.orderNo}`}
          subtitle={`${pharmacy?.name ?? 'Pharmacy'} · ${business.name}`}
          printLabel="Print pick list"
        >
          <div className="muted" style={{ fontSize: 13 }}>
            {addr
              ? `${addr.line1}${addr.line2 ? `, ${addr.line2}` : ''}, ${addr.city}, ${addr.state} ${addr.pincode}`
              : 'No delivery address'}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Pick qty</th>
                  <th>Batch × qty</th>
                  <th>✓</th>
                </tr>
              </thead>
              <tbody>
                {order.lines
                  .filter((l) => (l.acceptedQty ?? l.qty) > 0)
                  .map((l) => (
                    <tr key={l.id}>
                      <td>{l.productName}</td>
                      <td className="muted">{l.sku}</td>
                      <td>{l.allocatedQty ?? l.acceptedQty ?? l.qty}</td>
                      <td style={{ fontSize: 12 }}>
                        {l.batchAllocations?.map((b) => `${b.batchNumber}×${b.qty}`).join(', ') || '—'}
                      </td>
                      <td style={{ width: 28 }}>☐</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </PrintDocument>
      ) : null}

      {allocOpen ? (
        <div className="card card-pad stack">
          <strong>Manual batch allocation</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Override FEFO by picking one or more sellable batches per line. Lines with no rows fall back to FEFO.
          </p>
          {order.lines.map((l) => {
            const need = l.acceptedQty ?? l.qty;
            const sellable = batches.filter(
              (b) => b.productId === l.productId && b.status === 'Available' && new Date(b.expiryDate) > new Date(),
            );
            const rows = overrides[l.id] ?? [];
            const allocated = rows.reduce((s, r) => s + (Number.isFinite(r.qty) ? r.qty : 0), 0);
            const remaining = need - allocated;
            const setLineRows = (next: { batchId: string; qty: number }[]) =>
              setOverrides((prev) => {
                const copy = { ...prev };
                if (!next.length) delete copy[l.id];
                else copy[l.id] = next;
                return copy;
              });
            return (
              <div key={l.id} className="stack" style={{ gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 14 }}>
                    {l.productName} · need {need}
                  </strong>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {rows.length === 0
                      ? 'FEFO (no override)'
                      : remaining === 0
                        ? 'Covered'
                        : remaining > 0
                          ? `Remaining ${remaining}`
                          : `Over by ${-remaining}`}
                  </span>
                </div>
                {rows.map((row, idx) => {
                  const usedElsewhere = new Set(rows.filter((_, i) => i !== idx).map((r) => r.batchId).filter(Boolean));
                  const options = sellable.filter((b) => b.id === row.batchId || !usedElsewhere.has(b.id));
                  return (
                    <div key={idx} className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Field label={`Batch ${idx + 1}`}>
                          <Select
                            value={row.batchId}
                            onChange={(e) => {
                              const next = rows.map((r, i) => (i === idx ? { ...r, batchId: e.target.value } : r));
                              setLineRows(next);
                            }}
                          >
                            <option value="">Select batch…</option>
                            {options.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.batchNumber} · exp {b.expiryDate} · avail {b.onHand - b.reserved}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Field label="Qty">
                        <Input
                          type="number"
                          min={1}
                          max={need}
                          value={row.qty || ''}
                          onChange={(e) => {
                            const qty = e.target.value === '' ? 0 : Number(e.target.value);
                            const next = rows.map((r, i) => (i === idx ? { ...r, qty } : r));
                            setLineRows(next);
                          }}
                          style={{ width: 90 }}
                        />
                      </Field>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setLineRows(rows.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
                <div className="row">
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={sellable.length === 0 || remaining <= 0}
                    onClick={() => {
                      const used = new Set(rows.map((r) => r.batchId).filter(Boolean));
                      const nextBatch = sellable.find((b) => !used.has(b.id));
                      setLineRows([...rows, { batchId: nextBatch?.id ?? '', qty: Math.max(remaining, 0) || need }]);
                    }}
                  >
                    Add batch
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="row">
            <Button
              onClick={() => {
                const clean: Record<string, { batchId: string; qty: number }[]> = {};
                for (const line of order.lines) {
                  const need = line.acceptedQty ?? line.qty;
                  const allocs = (overrides[line.id] ?? []).filter((a) => a.batchId && a.qty > 0);
                  if (!allocs.length) continue;
                  const sum = allocs.reduce((s, a) => s + a.qty, 0);
                  if (sum !== need) {
                    pushToast({
                      tone: 'error',
                      title: 'Incomplete allocation',
                      message: `${line.productName}: allocated ${sum} of ${need}. Cover the full qty or clear the line for FEFO.`,
                    });
                    return;
                  }
                  const ids = allocs.map((a) => a.batchId);
                  if (new Set(ids).size !== ids.length) {
                    pushToast({
                      tone: 'error',
                      title: 'Duplicate batch',
                      message: `${line.productName}: each batch can only be used once per line.`,
                    });
                    return;
                  }
                  clean[line.id] = allocs;
                }
                void act(
                  () =>
                    allocateOrder({
                      actor: user,
                      stockist: business,
                      orderId: order.id,
                      overrides: Object.keys(clean).length ? clean : undefined,
                    }),
                  'Allocated (manual)',
                );
                setAllocOpen(false);
                setOverrides({});
              }}
            >
              Apply allocation
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setAllocOpen(false);
                setOverrides({});
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="card card-pad">
        <strong>Timeline</strong>
        <div className="timeline" style={{ marginTop: 12 }}>
          {order.statusHistory.map((h, i) => (
            <div key={i} className="timeline-item">
              <div className="timeline-dot" />
              <div>
                {h.from} → <strong>{h.to}</strong>
                {h.reason ? <div className="muted">{h.reason}</div> : null}
                <div className="muted">{new Date(h.at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

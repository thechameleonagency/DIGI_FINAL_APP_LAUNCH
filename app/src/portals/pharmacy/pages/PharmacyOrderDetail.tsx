import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { reorderFromOrder } from '../../../services/catalogueService';
import { cancelOrder, editOrderLines } from '../../../services/orderService';
import { deliveryPendingGrnQty, recordGrn } from '../../../services/fulfilmentService';
import { submitReturn } from '../../../services/paymentService';
import { ensureMessageThread } from '../../../services/supportService';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { pluralize } from '../../../domain/utils/pluralize';
import { nextNumberFieldValue } from '../../../domain/utils/validation';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { FileUpload } from '../../../ui/components/FileUpload';
import { BarcodeScanField } from '../../../ui/components/BarcodeScanField';
import { OrderDeliveriesPanel } from '../../../ui/components/OrderDeliveriesPanel';
import { alreadyReturnedQty, ReturnLinesForm, validateReturnLines } from '../../../ui/components/ReturnLinesForm';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, Money, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const GRN_DISCREPANCY = ['Short', 'Damaged', 'Wrong', 'Expired', 'Other'] as const;

export function PharmacyOrderDetail() {
  const { orderNo } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canGrn = useCan('inventory.adjust');
  const { busy: returnBusy, run: runReturn } = useBusyAction();
  const [placedBanner, setPlacedBanner] = useState(params.get('placed') === '1');
  const order = useLiveQuery(() => db.orders.where('orderNo').equals(orderNo!).first(), [orderNo]);

  useEffect(() => {
    if (params.get('placed') !== '1') return;
    setPlacedBanner(true);
    const next = new URLSearchParams(params);
    next.delete('placed');
    setParams(next, { replace: true });
  }, [params, setParams]);
  const invoice = useLiveQuery(() => (order?.invoiceId ? db.invoices.get(order.invoiceId) : undefined), [order?.invoiceId]);
  const stockist = useLiveQuery(() => (order ? db.businesses.get(order.stockistId) : undefined), [order?.stockistId]);
  const delivery = useLiveQuery(() => (order?.deliveryId ? db.deliveries.get(order.deliveryId) : undefined), [order?.deliveryId]);
  const deliveries =
    useLiveQuery(() => (order ? db.deliveries.where('orderId').equals(order.id).toArray() : []), [order?.id]) ?? [];
  const priorReturns =
    useLiveQuery(() => (order ? db.returns.where('orderId').equals(order.id).toArray() : []), [order?.id]) ?? [];
  const [grnOpen, setGrnOpen] = useState(false);
  const [grnDeliveryId, setGrnDeliveryId] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [received, setReceived] = useState<Record<string, number | ''>>({});
  const [discrepancyReasons, setDiscrepancyReasons] = useState<Record<string, string>>({});
  const [grnBatch, setGrnBatch] = useState<Record<string, string>>({});
  const [grnExpiry, setGrnExpiry] = useState<Record<string, string>>({});
  const [grnError, setGrnError] = useState<string | null>(null);
  const [grnBusy, setGrnBusy] = useState(false);
  const [grnSuccess, setGrnSuccess] = useState<{ shortProductIds: string[] } | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [returnFieldErrors, setReturnFieldErrors] = useState<
    Record<string, { qty?: string; reason?: string }>
  >({});
  const [returnFormError, setReturnFormError] = useState<string | undefined>();
  const [evidenceFileId, setEvidenceFileId] = useState<string | undefined>();
  const [editingLines, setEditingLines] = useState(false);
  const [editQtys, setEditQtys] = useState<Record<string, number>>({});
  const [cancelOpen, setCancelOpen] = useState(false);

  const alreadyReturned = (productId: string) => alreadyReturnedQty(priorReturns, productId);

  if (!order) return <EmptyState title="Order not found" description="Check the order number." />;
  const linesEditable = ['Pending', 'Accepted', 'PartiallyAccepted'].includes(order.status);
  const addr = order.deliveryAddress;
  const activeDelivery =
    deliveries.find((d) =>
      ['Delivered', 'PartiallyDelivered'].includes(d.status) &&
      d.lines.some((l) => deliveryPendingGrnQty(l) > 0),
    ) ?? delivery;
  const canRecordGrn =
    canGrn &&
    !!activeDelivery &&
    ['Delivered', 'PartiallyDelivered'].includes(activeDelivery.status) &&
    activeDelivery.lines.some((l) => deliveryPendingGrnQty(l) > 0);

  const openGrn = () => {
    if (!activeDelivery) return;
    setGrnDeliveryId(activeDelivery.id);
    const defaults: Record<string, number | ''> = {};
    for (const l of order.lines) {
      const dl = activeDelivery.lines.find((x) => x.productId === l.productId);
      const pending = dl ? deliveryPendingGrnQty(dl) : 0;
      if (pending > 0) defaults[l.id] = pending;
    }
    setReceived(defaults);
    setDiscrepancyReasons({});
    setGrnBatch(
      Object.fromEntries(
        order.lines.map((l) => {
          const dl = activeDelivery.lines.find((x) => x.productId === l.productId);
          return [l.id, dl?.batchNumber ?? l.batchAllocations?.[0]?.batchNumber ?? ''];
        }),
      ),
    );
    setGrnExpiry(
      Object.fromEntries(
        order.lines.map((l) => {
          const dl = activeDelivery.lines.find((x) => x.productId === l.productId);
          return [l.id, dl?.expiryDate ?? l.batchAllocations?.[0]?.expiryDate ?? ''];
        }),
      ),
    );
    setGrnError(null);
    setGrnSuccess(null);
    setGrnOpen(true);
  };

  const openReturnPrefill = (shortProductIds: string[]) => {
    const next: Record<string, number> = {};
    for (const l of order.lines) {
      if (!shortProductIds.includes(l.productId)) continue;
      const delivered = l.deliveredQty ?? l.qty;
      const rawGot = l.receivedQty ?? received[l.id];
      const got = typeof rawGot === 'number' ? rawGot : delivered;
      next[l.productId] = Math.max(0, delivered - got);
    }
    setReturnQty(next);
    setReturnReasons(Object.fromEntries(shortProductIds.map((id) => [id, 'Short'])));
    setEvidenceFileId(undefined);
    setReturnOpen(true);
  };

  return (
    <div className="stack">
      <PageHeader
        title={order.orderNo}
        subtitle={`${stockist?.name ?? 'Stockist'} · ${order.status}${canRecordGrn ? ' · GRN pending' : order.grnRecordedAt ? ' · GRN recorded' : ''}`}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const res = await ensureMessageThread({
                  actor: user,
                  business,
                  counterpartBusinessId: order.stockistId,
                  relatedEntityType: 'Order',
                  relatedEntityId: order.orderNo,
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  return;
                }
                const draft = encodeURIComponent(`Regarding order ${order.orderNo}`);
                navigate(`/pharmacy/messages?thread=${res.data.id}&draft=${draft}`);
              }}
            >
              Message about this order
            </Button>
            <Link
              className="btn btn-secondary btn-sm"
              to={`/pharmacy/support?new=1&entityType=Order&entityId=${encodeURIComponent(order.id)}&entityNo=${encodeURIComponent(order.orderNo)}`}
            >
              Get help with this order
            </Link>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const res = await reorderFromOrder({ actor: user, pharmacy: business, orderId: order.id });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  return;
                }
                const changeMsg = res.data.changes
                  .slice(0, 3)
                  .map((c) =>
                    c.previousQty > 0
                      ? `${c.productName}: ${c.previousQty}→${c.newQty}`
                      : `${c.productName}: ${c.newQty}`,
                  )
                  .join('; ');
                const skipMsg = res.data.skipped.length
                  ? `Skipped: ${res.data.skipped.map((s) => `${s.productName} (${s.reason})`).join('; ')}`
                  : '';
                pushToast({
                  tone: res.data.skipped.length ? 'info' : 'success',
                  title: `Cart updated — ${res.data.added} new, ${res.data.incremented} increased`,
                  message: [changeMsg, skipMsg].filter(Boolean).join(' · ') || 'Review cart to place order.',
                });
                navigate('/pharmacy/cart');
              }}
            >
              Reorder
            </Button>
            {['Pending', 'Accepted'].includes(order.status) ? (
              <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            ) : null}
            {['Delivered', 'PartiallyDelivered', 'Closed'].includes(order.status) ? (
              <>
                {canRecordGrn && ['Delivered', 'PartiallyDelivered'].includes(order.status) ? (
                  <Button size="sm" variant="secondary" onClick={openGrn}>
                    Record GRN
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => setReturnOpen(true)}>
                  Raise return
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {placedBanner ? (
        <div className="banner-strip success">
          Order placed — {order.orderNo} is Pending with the stockist.{' '}
          <Link to="/pharmacy/buy">Continue shopping</Link>
          {' · '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlacedBanner(false)}>
            Dismiss
          </button>
        </div>
      ) : null}
      <ConfirmDialog
        open={cancelOpen}
        title="Cancel order"
        body={`Cancel ${order.orderNo}? This voids a live trade document. Reservations will be released.`}
        requireReason
        reasonLabel="Cancellation reason"
        reasonPlaceholder="Why are you cancelling this order?"
        tone="danger"
        confirmLabel="Cancel order"
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          const res = await cancelOrder({
            actor: user,
            business,
            orderId: order.id,
            reason: reason!,
          });
          pushToast(res.ok ? { tone: 'success', title: 'Order cancelled' } : { tone: 'error', title: res.message });
          if (res.ok) setCancelOpen(false);
        }}
      />

      {order.source === 'Manual' ? (
        <div className="card card-pad" style={{ borderColor: 'var(--accent)' }}>
          <strong>Recorded by stockist</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            This Pending order was entered on your behalf. You may cancel it like any other Pending order.
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Order facts</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            Stockist: <strong>{stockist?.name ?? order.stockistId}</strong>
          </div>
          {addr ? (
            <div style={{ fontSize: 13 }}>
              <div>
                <strong>Delivery address</strong> ({addr.label})
              </div>
              <div className="muted">
                {addr.line1}
                {addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}, {addr.state} {addr.pincode}
              </div>
            </div>
          ) : null}
          {order.notes ? (
            <div style={{ fontSize: 13 }}>
              <strong>Notes</strong>
              <div className="muted">{order.notes}</div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              No order notes
            </div>
          )}
        </div>
        <div className="card card-pad stack">
          <strong>Expected delivery</strong>
          <div style={{ fontSize: 13 }}>
            Preferred date:{' '}
            <strong>{order.preferredDeliveryDate ?? order.preferredDate ?? 'Not specified'}</strong>
          </div>
          {delivery ? (
            <div style={{ fontSize: 13 }}>
              Latest <StatusBadge status={delivery.status} /> · {delivery.deliveryNo}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              No delivery assigned yet
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <OrderDeliveriesPanel orderId={order.id} supportBase="/pharmacy/support" />
      </div>

      <div className="grid-2">
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
                      pushToast(res.ok ? { tone: 'success', title: 'Lines updated' } : { tone: 'error', title: res.message });
                      if (res.ok) setEditingLines(false);
                    }}
                  >
                    Save
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
            ) : order.status !== 'Pending' ? (
              <span className="muted" style={{ fontSize: 12 }}>
                Locked — adjust via returns after delivery
              </span>
            ) : null}
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Delivered</th>
                  <th>Unit</th>
                  <th>GST%</th>
                  <th>Tax</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.productName}</td>
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
                    <td>{l.deliveredQty ?? '—'}</td>
                    <td>
                      <Money value={l.unitPrice} />
                    </td>
                    <td>{l.gstPercent}%</td>
                    <td>
                      <Money value={l.lineTax} />
                    </td>
                    <td>
                      <Money value={l.lineTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stack" style={{ marginTop: 12, gap: 4 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>Subtotal</span>
              <Money value={order.subtotal} />
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>Tax</span>
              <Money value={order.taxTotal} />
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Grand total</strong>
              <strong>
                <Money value={order.grandTotal} />
              </strong>
            </div>
          </div>
          {invoice ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Invoice <Link to={`/pharmacy/invoices/${invoice.invoiceNo}`}>{invoice.invoiceNo}</Link> · Outstanding{' '}
              <Money value={invoice.outstanding} />
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
                  <div className="muted">
                    {new Date(h.at).toLocaleString()}
                    {h.reason ? ` · ${h.reason}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={grnOpen}
        onClose={() => {
          if (grnBusy) return;
          setGrnOpen(false);
          setGrnSuccess(null);
        }}
        title={grnSuccess ? 'GRN saved' : 'Goods receipt (GRN)'}
        footer={
          grnSuccess ? (
            <div className="row">
              {grnSuccess.shortProductIds.length ? (
                <Button
                  onClick={() => {
                    const shorts = grnSuccess.shortProductIds;
                    setGrnOpen(false);
                    setGrnSuccess(null);
                    openReturnPrefill(shorts);
                  }}
                >
                  Raise return for short lines
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => {
                  setGrnOpen(false);
                  setGrnSuccess(null);
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <Button
              disabled={grnBusy || !grnDeliveryId}
              onClick={async () => {
                setGrnError(null);
                const del = deliveries.find((d) => d.id === grnDeliveryId) ?? activeDelivery;
                if (!del) {
                  setGrnError('No delivery available for GRN.');
                  return;
                }
                const payload = [];
                for (const l of order.lines) {
                  const dl = del.lines.find((x) => x.productId === l.productId);
                  const pending = dl ? deliveryPendingGrnQty(dl) : 0;
                  if (pending <= 0) continue;
                  const raw = received[l.id];
                  if (raw === '') {
                    setGrnError(`Enter received qty for ${l.productName}.`);
                    return;
                  }
                  const qty = typeof raw === 'number' ? raw : pending;
                  payload.push({
                    lineId: l.id,
                    productId: l.productId,
                    productName: l.productName,
                    pending,
                    receivedQty: qty,
                    discrepancyReason: qty < pending ? discrepancyReasons[l.id] : undefined,
                    batchNumber: grnBatch[l.id]?.trim() || undefined,
                    expiryDate: grnExpiry[l.id]?.trim() || undefined,
                  });
                }
                const total = payload.reduce((s, r) => s + r.receivedQty, 0);
                if (total < 1) {
                  setGrnError('Receive at least 1 unit to record a GRN.');
                  return;
                }
                for (const r of payload) {
                  if (!Number.isFinite(r.receivedQty) || r.receivedQty < 0 || r.receivedQty > r.pending) {
                    setGrnError(`Received qty for ${r.productName} must be between 0 and ${r.pending}.`);
                    return;
                  }
                  if (r.receivedQty < r.pending && !r.discrepancyReason) {
                    setGrnError(`Select a discrepancy reason for ${r.productName}.`);
                    return;
                  }
                }
                setGrnBusy(true);
                const res = await recordGrn({
                  actor: user,
                  pharmacy: business,
                  orderId: order.id,
                  deliveryId: del.id,
                  received: payload.map(({ lineId, receivedQty, discrepancyReason, batchNumber, expiryDate }) => ({
                    lineId,
                    receivedQty,
                    discrepancyReason,
                    batchNumber,
                    expiryDate,
                  })),
                });
                setGrnBusy(false);
                if (!res.ok) {
                  setGrnError(res.message);
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  return;
                }
                setGrnSuccess({
                  shortProductIds: payload.filter((r) => r.receivedQty < r.pending).map((r) => r.productId),
                });
                pushToast({ tone: 'success', title: 'GRN recorded', message: order.orderNo });
              }}
            >
              {grnBusy ? 'Saving…' : 'Save GRN'}
            </Button>
          )
        }
      >
        {grnSuccess ? (
          <div className="stack">
            <div className="banner-strip success">
              Goods receipt saved for <strong>{order.orderNo}</strong>. Pharmacy stock was updated.
            </div>
            {grnSuccess.shortProductIds.length ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {pluralize(grnSuccess.shortProductIds.length, 'line')} were short. You can raise a return with qty prefilled, or finish
                without a return.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                All delivered quantities were received in full.
              </p>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate('/pharmacy/inventory')}>
              View inventory
            </Button>
          </div>
        ) : (
          <div className="stack">
            {grnError ? <div className="banner-strip danger">{grnError}</div> : null}
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Receipt applies to delivery {(deliveries.find((d) => d.id === grnDeliveryId) ?? activeDelivery)?.deliveryNo ?? '—'}.
              Later delivery top-ups can be receipted again.
            </p>
            <BarcodeScanField
              label="Scan batch into GRN line"
              placeholder="Scan batch number, then Enter"
              onScan={(code) => {
                const del = deliveries.find((d) => d.id === grnDeliveryId) ?? activeDelivery;
                const pendingLine = order.lines.find((l) => {
                  const dl = del?.lines.find((x) => x.productId === l.productId);
                  return dl ? deliveryPendingGrnQty(dl) > 0 : false;
                });
                if (!pendingLine) {
                  pushToast({ tone: 'warning', title: 'No pending GRN lines' });
                  return;
                }
                const matchByBatch = order.lines.find((l) => {
                  const dl = del?.lines.find((x) => x.productId === l.productId);
                  return dl?.batchNumber?.toLowerCase() === code.toLowerCase();
                });
                const target = matchByBatch ?? pendingLine;
                setGrnBatch((b) => ({ ...b, [target.id]: code }));
                pushToast({
                  tone: 'info',
                  title: 'Batch applied',
                  message: target.productName,
                });
              }}
            />
            {order.lines.map((l) => {
              const del = deliveries.find((d) => d.id === grnDeliveryId) ?? activeDelivery;
              const dl = del?.lines.find((x) => x.productId === l.productId);
              const pending = dl ? deliveryPendingGrnQty(dl) : 0;
              if (pending <= 0) return null;
              const qty = received[l.id] ?? pending;
              const mismatch = qty !== '' && qty < pending;
              return (
                <div key={l.id} className="card card-pad stack">
                  <strong>{l.productName}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Pending this delivery {pending}
                    {dl?.batchNumber ? ` · Batch ${dl.batchNumber}` : ''}
                    {(l.receivedQty ?? 0) > 0 ? ` · Already receipted on order ${l.receivedQty}` : ''}
                  </div>
                  <div className="grid-2">
                    <Field label="Received qty">
                      <Input
                        type="number"
                        min={0}
                        max={pending}
                        value={qty}
                        onChange={(e) =>
                          setReceived((r) => ({
                            ...r,
                            [l.id]: nextNumberFieldValue(e.target.value, r[l.id] ?? pending),
                          }))
                        }
                      />
                    </Field>
                    <Field label="Batch number">
                      <Input
                        value={grnBatch[l.id] ?? ''}
                        onChange={(e) => setGrnBatch((b) => ({ ...b, [l.id]: e.target.value }))}
                        placeholder="Optional if already on delivery"
                      />
                    </Field>
                    <Field label="Expiry">
                      <Input
                        type="date"
                        value={grnExpiry[l.id] ?? ''}
                        onChange={(e) => setGrnExpiry((x) => ({ ...x, [l.id]: e.target.value }))}
                      />
                    </Field>
                    {mismatch ? (
                      <Field label="Discrepancy reason">
                        <Select
                          value={discrepancyReasons[l.id] ?? ''}
                          onChange={(e) => setDiscrepancyReasons((d) => ({ ...d, [l.id]: e.target.value }))}
                        >
                          <option value="">Select…</option>
                          {GRN_DISCREPANCY.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Raise return"
        footer={
          <Button
            disabled={returnBusy}
            onClick={() => {
              void runReturn(async () => {
                const check = validateReturnLines(order, priorReturns, returnQty, returnReasons);
                if (!check.ok) {
                  setReturnFieldErrors(check.fieldErrors);
                  setReturnFormError(Object.keys(check.fieldErrors).length ? undefined : check.message);
                  return;
                }
                setReturnFieldErrors({});
                setReturnFormError(undefined);
                const res = await submitReturn({
                  actor: user,
                  pharmacy: business,
                  orderId: order.id,
                  lines: check.lines,
                  evidenceFileIds: evidenceFileId ? [evidenceFileId] : [],
                  idempotencyKey: makeIdempotencyKey(`ret-${order.id}`, user.id),
                });
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Return submitted', message: res.data.returnNo }
                    : { tone: 'error', title: res.message, message: res.businessImpact },
                );
                if (res.ok) setReturnOpen(false);
              });
            }}
          >
            {returnBusy ? 'Submitting…' : 'Submit return'}
          </Button>
        }
      >
        <ReturnLinesForm
          order={order}
          priorReturns={priorReturns}
          returnQty={returnQty}
          returnReasons={returnReasons}
          evidenceFileId={evidenceFileId}
          fieldErrors={returnFieldErrors}
          formError={returnFormError}
          onQty={(productId, qty) => {
            setReturnFieldErrors((e) => {
              if (!e[productId]?.qty) return e;
              const next = { ...e };
              const row = { ...next[productId], qty: undefined };
              if (!row.reason) delete next[productId];
              else next[productId] = row;
              return next;
            });
            setReturnFormError(undefined);
            setReturnQty((q) => ({ ...q, [productId]: qty }));
          }}
          onReason={(productId, reason) => {
            setReturnFieldErrors((e) => {
              if (!e[productId]?.reason) return e;
              const next = { ...e };
              const row = { ...next[productId], reason: undefined };
              if (!row.qty) delete next[productId];
              else next[productId] = row;
              return next;
            });
            setReturnReasons((r) => ({ ...r, [productId]: reason }));
          }}
          onEvidence={setEvidenceFileId}
        />
      </Modal>
    </div>
  );
}

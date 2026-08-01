import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { reorderFromOrder } from '../../../services/catalogueService';
import { cancelOrder, editOrderLines } from '../../../services/orderService';
import { recordGrn } from '../../../services/fulfilmentService';
import { submitReturn } from '../../../services/paymentService';
import { sendMessage } from '../../../services/supportService';
import { useUi } from '../../../store/ui';
import { FileUpload } from '../../../ui/components/FileUpload';
import { Button, EmptyState, Field, Input, Money, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const GRN_DISCREPANCY = ['Short', 'Damaged', 'Wrong', 'Expired', 'Other'] as const;

export function PharmacyOrderDetail() {
  const { orderNo } = useParams();
  const navigate = useNavigate();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const order = useLiveQuery(() => db.orders.where('orderNo').equals(orderNo!).first(), [orderNo]);
  const invoice = useLiveQuery(() => (order?.invoiceId ? db.invoices.get(order.invoiceId) : undefined), [order?.invoiceId]);
  const stockist = useLiveQuery(() => (order ? db.businesses.get(order.stockistId) : undefined), [order?.stockistId]);
  const delivery = useLiveQuery(() => (order?.deliveryId ? db.deliveries.get(order.deliveryId) : undefined), [order?.deliveryId]);
  const priorReturns =
    useLiveQuery(() => (order ? db.returns.where('orderId').equals(order.id).toArray() : []), [order?.id]) ?? [];
  const [grnOpen, setGrnOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [discrepancyReasons, setDiscrepancyReasons] = useState<Record<string, string>>({});
  const [grnBatch, setGrnBatch] = useState<Record<string, string>>({});
  const [grnExpiry, setGrnExpiry] = useState<Record<string, string>>({});
  const [grnError, setGrnError] = useState<string | null>(null);
  const [grnBusy, setGrnBusy] = useState(false);
  const [grnSuccess, setGrnSuccess] = useState<{ shortProductIds: string[] } | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [evidenceFileId, setEvidenceFileId] = useState<string | undefined>();
  const [editingLines, setEditingLines] = useState(false);
  const [editQtys, setEditQtys] = useState<Record<string, number>>({});

  const alreadyReturned = (productId: string) =>
    priorReturns
      .filter((r) => !['Rejected', 'Cancelled'].includes(r.status))
      .flatMap((r) => r.lines)
      .filter((l) => l.productId === productId)
      .reduce((s, l) => s + (l.approvedQty ?? l.qty), 0);

  if (!order) return <EmptyState title="Order not found" description="Check the order number." />;
  const linesEditable = order.status === 'Pending';
  const addr = order.deliveryAddress;

  const openGrn = () => {
    setReceived(Object.fromEntries(order.lines.map((l) => [l.id, l.deliveredQty ?? l.qty])));
    setDiscrepancyReasons({});
    setGrnBatch(Object.fromEntries(order.lines.map((l) => [l.id, l.batchAllocations?.[0]?.batchNumber ?? ''])));
    setGrnExpiry(Object.fromEntries(order.lines.map((l) => [l.id, l.batchAllocations?.[0]?.expiryDate ?? ''])));
    setGrnError(null);
    setGrnSuccess(null);
    setGrnOpen(true);
  };

  const openReturnPrefill = (shortProductIds: string[]) => {
    const next: Record<string, number> = {};
    for (const l of order.lines) {
      if (!shortProductIds.includes(l.productId)) continue;
      const delivered = l.deliveredQty ?? l.qty;
      const got = l.receivedQty ?? received[l.id] ?? delivered;
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
        subtitle={`${stockist?.name ?? 'Stockist'} · ${order.status}${order.grnRecordedAt ? ' · GRN recorded' : ''}`}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const res = await sendMessage({
                  actor: user,
                  business,
                  counterpartBusinessId: order.stockistId,
                  body: `Regarding order ${order.orderNo}`,
                  relatedEntityType: 'Order',
                  relatedEntityId: order.orderNo,
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  return;
                }
                pushToast({ tone: 'success', title: 'Message started' });
                navigate(`/pharmacy/messages?thread=${res.data.thread.id}`);
              }}
            >
              Message about this order
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const res = await reorderFromOrder({ actor: user, pharmacy: business, orderId: order.id });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                  return;
                }
                const skipMsg = res.data.skipped.length
                  ? ` Skipped: ${res.data.skipped.map((s) => `${s.productName} (${s.reason})`).join('; ')}`
                  : '';
                pushToast({
                  tone: res.data.skipped.length ? 'info' : 'success',
                  title: `Added ${res.data.added} line(s) to cart`,
                  message: skipMsg || 'Review cart to place order.',
                });
                navigate('/pharmacy/cart');
              }}
            >
              Reorder
            </Button>
            {['Pending', 'Accepted'].includes(order.status) ? (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  const res = await cancelOrder({
                    actor: user,
                    business,
                    orderId: order.id,
                    reason: 'Cancelled by pharmacy',
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Order cancelled' } : { tone: 'error', title: res.message });
                }}
              >
                Cancel
              </Button>
            ) : null}
            {['Delivered', 'PartiallyDelivered'].includes(order.status) ? (
              <>
                {!order.grnRecordedAt ? (
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
            <>
              <div style={{ fontSize: 13 }}>
                Delivery <StatusBadge status={delivery.status} /> · {delivery.deliveryNo}
              </div>
              {delivery.scheduledDate ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  Scheduled {delivery.scheduledDate}
                </div>
              ) : null}
              {delivery.deliveredAt ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  Delivered {new Date(delivery.deliveredAt).toLocaleString()}
                </div>
              ) : null}
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              No delivery assigned yet
            </div>
          )}
        </div>
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
              Invoice <Link to="/pharmacy/payments">{invoice.invoiceNo}</Link> · Outstanding{' '}
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
              disabled={grnBusy}
              onClick={async () => {
                setGrnError(null);
                const payload = order.lines.map((l) => {
                  const delivered = l.deliveredQty ?? l.qty;
                  const qty = Number(received[l.id] ?? delivered);
                  return {
                    lineId: l.id,
                    productId: l.productId,
                    productName: l.productName,
                    delivered,
                    receivedQty: qty,
                    discrepancyReason: qty < delivered ? discrepancyReasons[l.id] : undefined,
                    batchNumber: grnBatch[l.id]?.trim() || undefined,
                    expiryDate: grnExpiry[l.id]?.trim() || undefined,
                  };
                });
                const total = payload.reduce((s, r) => s + r.receivedQty, 0);
                if (total < 1) {
                  setGrnError('Receive at least 1 unit to record a GRN.');
                  return;
                }
                for (const r of payload) {
                  if (!Number.isFinite(r.receivedQty) || r.receivedQty < 0 || r.receivedQty > r.delivered) {
                    setGrnError(`Received qty for ${r.productName} must be between 0 and ${r.delivered}.`);
                    return;
                  }
                  if (r.receivedQty < r.delivered && !r.discrepancyReason) {
                    setGrnError(`Select a discrepancy reason for ${r.productName}.`);
                    return;
                  }
                }
                setGrnBusy(true);
                const res = await recordGrn({
                  actor: user,
                  pharmacy: business,
                  orderId: order.id,
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
                  shortProductIds: payload.filter((r) => r.receivedQty < r.delivered).map((r) => r.productId),
                });
                pushToast({ tone: 'success', title: 'GRN recorded', message: order.orderNo });
                // In-modal success panel (Done / Raise return) is the CF-32 summary for GRN.
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
                {grnSuccess.shortProductIds.length} line(s) were short. You can raise a return with qty prefilled, or finish
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
            {order.lines.map((l) => {
              const delivered = l.deliveredQty ?? l.qty;
              const qty = received[l.id] ?? delivered;
              const mismatch = qty < delivered;
              return (
                <div key={l.id} className="card card-pad stack">
                  <strong>{l.productName}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Delivered {delivered}
                    {l.batchAllocations?.[0]?.batchNumber
                      ? ` · Allocated batch ${l.batchAllocations[0].batchNumber}`
                      : ''}
                  </div>
                  <div className="grid-2">
                    <Field label="Received qty">
                      <Input
                        type="number"
                        min={0}
                        max={delivered}
                        value={qty}
                        onChange={(e) => setReceived((r) => ({ ...r, [l.id]: Number(e.target.value) }))}
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
            onClick={async () => {
              const lines = order.lines
                .map((l) => {
                  const delivered = l.deliveredQty ?? l.qty;
                  const eligible = Math.max(0, delivered - alreadyReturned(l.productId));
                  const qty = returnQty[l.productId] ?? 0;
                  return {
                    productId: l.productId,
                    productName: l.productName,
                    qty,
                    eligible,
                    reason: returnReasons[l.productId] ?? '',
                  };
                })
                .filter((l) => l.qty > 0);
              if (!lines.length) {
                pushToast({ tone: 'error', title: 'Add at least one return qty' });
                return;
              }
              for (const l of lines) {
                if (l.qty > l.eligible) {
                  pushToast({ tone: 'error', title: `${l.productName}: max eligible is ${l.eligible}` });
                  return;
                }
                if (!l.reason.trim()) {
                  pushToast({ tone: 'error', title: `Select a reason for ${l.productName}` });
                  return;
                }
              }
              const res = await submitReturn({
                actor: user,
                pharmacy: business,
                orderId: order.id,
                lines: lines.map(({ productId, qty, reason }) => ({ productId, qty, reason })),
                evidenceFileIds: evidenceFileId ? [evidenceFileId] : [],
              });
              pushToast(
                res.ok
                  ? { tone: 'success', title: 'Return submitted', message: res.data.returnNo }
                  : { tone: 'error', title: res.message, message: res.businessImpact },
              );
              if (res.ok) setReturnOpen(false);
            }}
          >
            Submit return
          </Button>
        }
      >
        <div className="stack">
          {order.lines.every((l) => Math.max(0, (l.deliveredQty ?? l.qty) - alreadyReturned(l.productId)) <= 0) ? (
            <EmptyState title="Nothing eligible to return" description="All delivered qty is already covered by prior returns." />
          ) : (
            order.lines.map((l) => {
              const delivered = l.deliveredQty ?? l.qty;
              const eligible = Math.max(0, delivered - alreadyReturned(l.productId));
              if (eligible <= 0) return null;
              return (
                <div key={l.id} className="card card-pad stack">
                  <strong>{l.productName}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Eligible {eligible} (delivered {delivered} − already returned {alreadyReturned(l.productId)})
                  </div>
                  <div className="grid-2">
                    <Field label="Qty">
                      <Input
                        type="number"
                        min={0}
                        max={eligible}
                        value={returnQty[l.productId] ?? 0}
                        onChange={(e) => setReturnQty((q) => ({ ...q, [l.productId]: Number(e.target.value) }))}
                      />
                    </Field>
                    <Field label="Reason">
                      <Select
                        value={returnReasons[l.productId] ?? ''}
                        onChange={(e) => setReturnReasons((r) => ({ ...r, [l.productId]: e.target.value }))}
                      >
                        <option value="">Select…</option>
                        {['Short', 'Damaged', 'Expired', 'Wrong item', 'Short dated', 'Other'].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
              );
            })
          )}
          <FileUpload label="Attach evidence (optional)" value={evidenceFileId} onChange={setEvidenceFileId} />
        </div>
      </Modal>
    </div>
  );
}

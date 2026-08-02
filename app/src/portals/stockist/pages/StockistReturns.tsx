import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { issueCreditNote, recordGoodsReceived, reviewReturn } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistReturns() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const returns = useLiveQuery(() => db.returns.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const orders = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>({});
  const [disposition, setDisposition] = useState('Restock');

  const review = reviewId ? returns.find((r) => r.id === reviewId) : undefined;
  const reviewOrder = review ? orders.find((o) => o.id === review.orderId) : undefined;

  return (
    <div className="stack">
      <PageHeader title="Returns review" />
      <ConfirmDialog
        open={!!rejectId}
        title="Reject return"
        body="Provide a policy reason. The pharmacy will be notified."
        requireReason
        tone="danger"
        confirmLabel="Reject return"
        onClose={() => setRejectId(null)}
        onConfirm={async (reason) => {
          const res = await reviewReturn({
            actor: user,
            stockist: business,
            returnId: rejectId!,
            decision: 'Rejected',
            reason: reason!,
          });
          pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
          setRejectId(null);
        }}
      />
      <Modal
        open={!!review}
        title={review ? `Review ${review.returnNo}` : 'Review return'}
        onClose={() => setReviewId(null)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setReviewId(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const partial = review!.lines.some((l) => (approvedQtys[l.productId] ?? l.qty) < l.qty);
                const res = await reviewReturn({
                  actor: user,
                  stockist: business,
                  returnId: review!.id,
                  decision: partial ? 'PartiallyApproved' : 'Approved',
                  approvedQtys,
                  disposition,
                });
                pushToast(res.ok ? { tone: 'success', title: 'Return decided' } : { tone: 'error', title: res.message });
                setReviewId(null);
              }}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const id = review!.id;
                setReviewId(null);
                setRejectId(id);
              }}
            >
              Reject
            </Button>
          </div>
        }
      >
        {review ? (
          <div className="stack">
            <div style={{ fontSize: 13 }}>
              {reviewOrder ? (
                <div>
                  Order <Link to={`/stockist/orders/${reviewOrder.orderNo}`}>{reviewOrder.orderNo}</Link>
                  {reviewOrder.invoiceId ? ' · has invoice' : ''}
                </div>
              ) : null}
            </div>
            {review.lines.map((l) => (
              <Field key={l.productId} label={`${l.productName} (requested ${l.qty}) — ${l.reason}`}>
                <Input
                  type="number"
                  min={0}
                  max={l.qty}
                  value={approvedQtys[l.productId] ?? l.qty}
                  onChange={(e) => setApprovedQtys((prev) => ({ ...prev, [l.productId]: Number(e.target.value) }))}
                />
              </Field>
            ))}
            <Field label="Disposition">
              <Select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                <option value="Restock">Restock</option>
                <option value="Quarantine">Quarantine</option>
                <option value="Destroy">Destroy</option>
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>

      {!returns.length ? (
        <EmptyState title="No returns" description="Pharmacy return requests appear here after delivery." />
      ) : (
        returns.map((r) => {
          const order = orders.find((o) => o.id === r.orderId);
          return (
            <div key={r.id} className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  <Link to={`/stockist/returns/${encodeURIComponent(r.returnNo)}`}>{r.returnNo}</Link>
                </strong>
                <StatusBadge status={r.status} />
              </div>
              {order ? (
                <div style={{ fontSize: 13 }}>
                  Order <Link to={`/stockist/orders/${order.orderNo}`}>{order.orderNo}</Link>
                </div>
              ) : null}
              {r.lines.map((l) => (
                <div key={l.productId} className="muted" style={{ fontSize: 13 }}>
                  {l.productName} × {l.qty}
                  {l.approvedQty != null ? ` (approved ${l.approvedQty})` : ''} — {l.reason}
                </div>
              ))}
              {r.disposition ? <div className="muted">Disposition: {r.disposition}</div> : null}
              {['Submitted', 'UnderReview'].includes(r.status) ? (
                <div className="row">
                  <Button
                    size="sm"
                    onClick={() => {
                      setReviewId(r.id);
                      setApprovedQtys(Object.fromEntries(r.lines.map((l) => [l.productId, l.qty])));
                      setDisposition(r.disposition ?? 'Restock');
                    }}
                  >
                    Review
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setRejectId(r.id)}>
                    Reject
                  </Button>
                </div>
              ) : null}
              {['Approved', 'PartiallyApproved'].includes(r.status) ? (
                <div className="row">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await recordGoodsReceived({
                        actor: user,
                        stockist: business,
                        returnId: r.id,
                        disposition: (r.disposition as 'Restock' | 'Quarantine' | 'Destroy') || 'Restock',
                      });
                      pushToast(
                        res.ok
                          ? { tone: 'success', title: 'Goods received', message: r.disposition ?? 'Restock' }
                          : { tone: 'error', title: res.message },
                      );
                    }}
                  >
                    Record goods received
                  </Button>
                  {!r.creditNoteId ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const res = await issueCreditNote({ actor: user, stockist: business, returnId: r.id });
                        pushToast(
                          res.ok
                            ? { tone: 'success', title: 'Credit note issued', message: res.data.creditNoteNo }
                            : { tone: 'error', title: res.message },
                        );
                      }}
                    >
                      Issue credit note
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {r.status === 'GoodsReceived' && !r.creditNoteId ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    const res = await issueCreditNote({ actor: user, stockist: business, returnId: r.id });
                    pushToast(
                      res.ok
                        ? { tone: 'success', title: 'Credit note issued', message: res.data.creditNoteNo }
                        : { tone: 'error', title: res.message },
                    );
                  }}
                >
                  Issue credit note
                </Button>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

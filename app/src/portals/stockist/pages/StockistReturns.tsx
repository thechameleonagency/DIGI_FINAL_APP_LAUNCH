import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { nextNumberFieldValue } from '../../../domain/utils/validation';
import { issueCreditNote, recordGoodsReceived, reviewReturn } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { PaginationBar, usePagedRows, useTableSectionRef } from '../../../ui/components/ListToolkit';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistReturns() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const { pageSize, setPageSize } = usePersistedPageSize('stockist-returns');
  const tableRef = useTableSectionRef();
  const returns = useLiveQuery(() => db.returns.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const orders = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>({});
  const [disposition, setDisposition] = useState('Restock');
  const [reviewError, setReviewError] = useState<string | undefined>();

  const review = reviewId ? returns.find((r) => r.id === reviewId) : undefined;
  const reviewOrder = review ? orders.find((o) => o.id === review.orderId) : undefined;
  const sortedReturns = [...returns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const list = usePagedRows(sortedReturns, pageSize);

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
          await run(async () => {
            const res = await reviewReturn({
              actor: user,
              stockist: business,
              returnId: rejectId!,
              decision: 'Rejected',
              reason: reason!,
            });
            pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
            setRejectId(null);
          });
        }}
      />
      <Modal
        open={!!review}
        title={review ? `Review ${review.returnNo}` : 'Review return'}
        onClose={() => {
          setReviewId(null);
          setReviewError(undefined);
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setReviewId(null);
                setReviewError(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  const lines = review!.lines;
                  const qtys = Object.fromEntries(
                    lines.map((l) => {
                      const raw = approvedQtys[l.productId] ?? l.qty;
                      const clamped = Math.max(0, Math.min(l.qty, Number.isFinite(raw) ? Math.floor(raw) : 0));
                      return [l.productId, clamped];
                    }),
                  );
                  const sum = Object.values(qtys).reduce((s, n) => s + n, 0);
                  if (sum <= 0) {
                    setReviewError('Approve at least one unit, or reject the return.');
                    return;
                  }
                  setReviewError(undefined);
                  const partial = lines.some((l) => (qtys[l.productId] ?? l.qty) < l.qty);
                  const res = await reviewReturn({
                    actor: user,
                    stockist: business,
                    returnId: review!.id,
                    decision: partial ? 'PartiallyApproved' : 'Approved',
                    approvedQtys: qtys,
                    disposition,
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Return decided' } : { tone: 'error', title: res.message });
                  if (res.ok) {
                    setReviewId(null);
                    setReviewError(undefined);
                  } else {
                    setReviewError(res.message);
                  }
                });
              }}
            >
              {busy ? 'Saving…' : 'Approve'}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const id = review!.id;
                setReviewId(null);
                setReviewError(undefined);
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
            {reviewError ? <div className="banner-strip danger">{reviewError}</div> : null}
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
                  onChange={(e) => {
                    const next = nextNumberFieldValue(e.target.value, approvedQtys[l.productId] ?? l.qty);
                    const n = next === '' ? 0 : Math.min(l.qty, Math.max(0, next));
                    setApprovedQtys((prev) => ({ ...prev, [l.productId]: n }));
                    setReviewError(undefined);
                  }}
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
        <>
          <section className="table-section" ref={tableRef}>
          {list.pageRows.map((r) => {
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
                      disabled={busy}
                      onClick={() => {
                        setReviewId(r.id);
                        setApprovedQtys(Object.fromEntries(r.lines.map((l) => [l.productId, l.qty])));
                        setDisposition(r.disposition ?? 'Restock');
                        setReviewError(undefined);
                      }}
                    >
                      Review
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejectId(r.id)}>
                      Reject
                    </Button>
                  </div>
                ) : null}
                {['Approved', 'PartiallyApproved'].includes(r.status) ? (
                  <div className="row">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        void run(async () => {
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
                        });
                      }}
                    >
                      Record goods received
                    </Button>
                    {!r.creditNoteId ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void run(async () => {
                            const res = await issueCreditNote({
                              actor: user,
                              stockist: business,
                              returnId: r.id,
                              idempotencyKey: makeIdempotencyKey(`cn-${r.id}`, user.id),
                            });
                            pushToast(
                              res.ok
                                ? { tone: 'success', title: 'Credit note issued', message: res.data.creditNoteNo }
                                : { tone: 'error', title: res.message },
                            );
                          });
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
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const res = await issueCreditNote({
                          actor: user,
                          stockist: business,
                          returnId: r.id,
                          idempotencyKey: makeIdempotencyKey(`cn-${r.id}`, user.id),
                        });
                        pushToast(
                          res.ok
                            ? { tone: 'success', title: 'Credit note issued', message: res.data.creditNoteNo }
                            : { tone: 'error', title: res.message },
                        );
                      });
                    }}
                  >
                    Issue credit note
                  </Button>
                ) : null}
              </div>
            );
          })}
          </section>
          <PaginationBar
            page={list.page}
            pageCount={list.pageCount}
            total={list.total}
            onPage={list.setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
        </>
      )}
    </div>
  );
}

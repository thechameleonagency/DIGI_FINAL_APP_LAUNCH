import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { withdrawPayment } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { FileLink } from '../../../ui/components/FileUpload';
import { Button, EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyPaymentDetail() {
  const { paymentNo } = useParams();
  const navigate = useNavigate();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { run } = useBusyAction();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const payment = useLiveQuery(
    () =>
      paymentNo
        ? db.payments
            .where('pharmacyId')
            .equals(business.id)
            .filter((p) => p.paymentNo === decodeURIComponent(paymentNo))
            .first()
        : undefined,
    [paymentNo, business.id],
  );
  const stockist = useLiveQuery(
    () => (payment ? db.businesses.get(payment.stockistId) : undefined),
    [payment?.stockistId],
  );

  if (payment === undefined) {
    return (
      <div className="stack">
        <PageHeader title="Payment detail" />
        <EmptyState title="Loading…" description="" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="stack">
        <PageHeader title="Payment detail" />
        <EmptyState
          title="Payment not found"
          description="Return to payment history."
          action={
            <Link className="btn btn-primary" to="/pharmacy/payments?tab=History">
              Back to payments
            </Link>
          }
        />
      </div>
    );
  }

  const canWithdraw = payment.status === 'Submitted' && payment.recordedBy !== 'Stockist';

  return (
    <div className="stack">
      <PageHeader
        title={payment.paymentNo}
        subtitle={`${stockist?.name ?? 'Stockist'} · ${payment.method}`}
        backTo="/pharmacy/payments"
        backLabel="Back to payments"
        actions={
          <div className="row">
            {canWithdraw ? (
              <Button size="sm" variant="danger" onClick={() => setWithdrawOpen(true)}>
                Withdraw
              </Button>
            ) : null}
            <Link
              className="btn btn-secondary btn-sm"
              to={`/pharmacy/support?new=1&entityType=Payment&entityId=${encodeURIComponent(payment.id)}&entityNo=${encodeURIComponent(payment.paymentNo)}`}
            >
              Get help with this payment
            </Link>
          </div>
        }
      />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusBadge status={payment.status} />
        <span className="muted" style={{ fontSize: 13 }}>
          <Money value={payment.amount} />
          {payment.reference ? ` · ref ${payment.reference}` : ''}
          {payment.submittedAt ? ` · ${new Date(payment.submittedAt).toLocaleString()}` : ''}
        </span>
      </div>
      {payment.recordedBy === 'Stockist' ? (
        <div className="banner-strip">Recorded by the stockist — withdraw is not available on this side.</div>
      ) : null}
      {payment.rejectReason ? (
        <div className="banner-strip danger">Rejected: {payment.rejectReason}</div>
      ) : null}
      {payment.holdReason ? (
        <div className="banner-strip warning">On hold: {payment.holdReason}</div>
      ) : null}

      <div className="card card-pad stack">
        <strong>Invoice allocations</strong>
        {!payment.allocations.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No invoice allocations.
          </p>
        ) : (
          payment.allocations.map((a) => (
            <div key={a.invoiceId} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
              <Link to={`/pharmacy/invoices/${encodeURIComponent(a.invoiceNo)}`}>{a.invoiceNo}</Link>
              <Money value={a.amount} />
            </div>
          ))
        )}
      </div>

      {payment.proofFileId ? (
        <div className="card card-pad stack">
          <strong>Proof</strong>
          <FileLink fileId={payment.proofFileId} />
        </div>
      ) : null}

      {payment.notes ? (
        <div className="card card-pad stack">
          <strong>Notes</strong>
          <div style={{ fontSize: 13 }}>{payment.notes}</div>
        </div>
      ) : null}

      <div className="card card-pad stack">
        <strong>Status history</strong>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {payment.statusHistory.map((h, i) => (
            <li key={i} className="muted" style={{ fontSize: 13 }}>
              {h.from} → {h.to} · {new Date(h.at).toLocaleString()}
              {h.reason ? ` · ${h.reason}` : ''}
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={withdrawOpen}
        title="Withdraw this payment?"
        tone="danger"
        confirmLabel="Withdraw payment"
        body={
          <p>
            Cancel <strong>{payment.paymentNo}</strong> for <Money value={payment.amount} /> to{' '}
            <strong>{stockist?.name ?? 'stockist'}</strong>? Allocations will be released and the stockist will no longer
            see it as awaiting review. You can submit a new payment afterwards.
          </p>
        }
        onClose={() => setWithdrawOpen(false)}
        onConfirm={() =>
          void run(async () => {
            const res = await withdrawPayment({
              actor: user,
              pharmacy: business,
              paymentId: payment.id,
              reason: 'Withdrawn by pharmacy',
            });
            if (!res.ok) {
              pushToast({ tone: 'error', title: res.message });
              return;
            }
            pushToast({ tone: 'success', title: 'Payment withdrawn' });
            setWithdrawOpen(false);
            navigate('/pharmacy/payments?tab=History');
          })
        }
      />
    </div>
  );
}

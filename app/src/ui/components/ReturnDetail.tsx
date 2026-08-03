import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { returnLineValue } from '../../domain/calc';
import { db } from '../../data/db';
import { FileLink } from './FileUpload';
import { EmptyState, Money, PageHeader, StatusBadge } from './primitives';

export function returnRequestedValue(lines: { qty: number; unitPrice: number }[]): number {
  return lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

export function returnApprovedValue(
  lines: { qty: number; approvedQty?: number; unitPrice: number; gstPercent?: number }[],
): number {
  return lines.reduce((s, l) => {
    const qty = l.approvedQty ?? l.qty;
    const gst = l.gstPercent ?? 0;
    if (l.approvedQty != null || l.gstPercent != null) {
      return s + returnLineValue(qty, l.unitPrice, gst).lineTotal;
    }
    return s + qty * l.unitPrice;
  }, 0);
}

export function ReturnDetail({
  returnNo,
  portal,
  listPath,
  actions,
}: {
  returnNo: string;
  portal: 'pharmacy' | 'stockist' | 'admin';
  listPath: string;
  actions?: ReactNode;
}) {
  const decoded = decodeURIComponent(returnNo);
  const ret = useLiveQuery(
    () => db.returns.filter((r) => r.returnNo === decoded || r.id === decoded).first(),
    [decoded],
  );
  const order = useLiveQuery(() => (ret ? db.orders.get(ret.orderId) : undefined), [ret?.orderId]);
  const pharmacy = useLiveQuery(() => (ret ? db.businesses.get(ret.pharmacyId) : undefined), [ret?.pharmacyId]);
  const stockist = useLiveQuery(() => (ret ? db.businesses.get(ret.stockistId) : undefined), [ret?.stockistId]);
  const credit = useLiveQuery(
    () => (ret?.creditNoteId ? db.creditNotes.get(ret.creditNoteId) : undefined),
    [ret?.creditNoteId],
  );
  const invoiceId = ret?.lines.find((l) => l.invoiceId)?.invoiceId ?? order?.invoiceId;
  const deliveryId = ret?.lines.find((l) => l.deliveryId)?.deliveryId ?? order?.deliveryId;
  const invoice = useLiveQuery(() => (invoiceId ? db.invoices.get(invoiceId) : undefined), [invoiceId]);
  const delivery = useLiveQuery(() => (deliveryId ? db.deliveries.get(deliveryId) : undefined), [deliveryId]);

  if (ret === undefined) {
    return (
      <div className="stack">
        <PageHeader title="Return detail" />
        <EmptyState title="Loading…" description="" />
      </div>
    );
  }

  if (!ret) {
    return (
      <div className="stack">
        <PageHeader title="Return detail" />
        <EmptyState
          title="Return not found"
          description="It may have been removed or the number is wrong."
          action={
            <Link className="btn btn-primary" to={listPath}>
              Back to returns
            </Link>
          }
        />
      </div>
    );
  }

  const orderPath =
    portal === 'admin'
      ? order
        ? `/admin/orders/${encodeURIComponent(order.orderNo)}`
        : '/admin/trade?tab=Orders'
      : order
        ? `/${portal}/orders/${encodeURIComponent(order.orderNo)}`
        : `/${portal}/orders`;

  const invoicePath =
    portal === 'pharmacy' && invoice
      ? `/pharmacy/invoices/${encodeURIComponent(invoice.invoiceNo)}`
      : portal === 'stockist' && invoice
        ? `/stockist/invoices/${encodeURIComponent(invoice.invoiceNo)}`
        : undefined;

  const deliveryPath =
    portal === 'pharmacy' && delivery
      ? `/pharmacy/delivery`
      : portal === 'stockist' && delivery
        ? `/stockist/delivery`
        : undefined;

  const hasApproved = ret.lines.some((l) => l.approvedQty != null);
  const requestedValue = returnRequestedValue(ret.lines);
  const approvedEst = returnApprovedValue(ret.lines);

  return (
    <div className="stack">
      <PageHeader
        title={ret.returnNo}
        subtitle={`${pharmacy?.name ?? 'Pharmacy'} → ${stockist?.name ?? 'Stockist'}`}
        backTo={listPath}
        backLabel="Back to returns"
        actions={actions}
      />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusBadge status={ret.status} />
        <span className="muted" style={{ fontSize: 13 }}>
          {new Date(ret.createdAt).toLocaleString()}
          {order ? (
            <>
              {' · order '}
              <Link to={orderPath}>{order.orderNo}</Link>
            </>
          ) : null}
          {invoice && invoicePath ? (
            <>
              {' · invoice '}
              <Link to={invoicePath}>{invoice.invoiceNo}</Link>
            </>
          ) : invoice ? (
            <> · invoice {invoice.invoiceNo}</>
          ) : null}
          {delivery && deliveryPath ? (
            <>
              {' · '}
              <Link to={deliveryPath}>{delivery.deliveryNo ?? 'Delivery'}</Link>
            </>
          ) : delivery ? (
            <> · {delivery.deliveryNo ?? 'Delivery'}</>
          ) : null}
        </span>
      </div>
      {ret.rejectReason ? <div className="banner-strip danger">Reject: {ret.rejectReason}</div> : null}
      {ret.disposition ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Disposition: {ret.disposition}
        </div>
      ) : null}
      {credit ? (
        <div style={{ fontSize: 13 }}>
          Credit note:{' '}
          {portal === 'pharmacy' ? (
            <Link to={`/pharmacy/payments?tab=Credits&credit=${encodeURIComponent(credit.creditNoteNo)}`}>
              {credit.creditNoteNo}
            </Link>
          ) : portal === 'stockist' ? (
            <Link to="/stockist/payments?tab=CreditNotes">{credit.creditNoteNo}</Link>
          ) : (
            credit.creditNoteNo
          )}{' '}
          · <Money value={credit.amount} />
        </div>
      ) : null}
      <div className="muted" style={{ fontSize: 13 }}>
        Requested value (ex-GST): <Money value={requestedValue} />
        {hasApproved || credit ? (
          <>
            {' · '}
            {credit ? (
              <>
                Credit issued: <Money value={credit.amount} />
              </>
            ) : (
              <>
                Approved est. (incl. GST): <Money value={approvedEst} />
              </>
            )}
          </>
        ) : null}
      </div>

      <div className="card card-pad">
        <strong>Lines</strong>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Requested</th>
                <th>Approved</th>
                <th>Reason</th>
                <th>Batch</th>
                <th>Requested value</th>
                <th>Approved value</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((l, i) => {
                const qty = l.approvedQty ?? l.qty;
                const gst = l.gstPercent ?? 0;
                const approvedLine =
                  l.approvedQty != null
                    ? returnLineValue(qty, l.unitPrice, gst).lineTotal
                    : undefined;
                return (
                  <tr key={`${l.productId}-${i}`}>
                    <td>{l.productName}</td>
                    <td>{l.qty}</td>
                    <td>{l.approvedQty ?? '—'}</td>
                    <td>{l.reason}</td>
                    <td className="muted">{l.batchNumber ?? '—'}</td>
                    <td>
                      <Money value={l.qty * l.unitPrice} />
                    </td>
                    <td>{approvedLine != null ? <Money value={approvedLine} /> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad stack">
        <strong>Evidence</strong>
        {!ret.evidenceFileIds.length ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            No files attached.
          </p>
        ) : (
          ret.evidenceFileIds.map((fid) => <FileLink key={fid} fileId={fid} />)
        )}
      </div>

      <div className="card card-pad stack">
        <strong>Status history</strong>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {ret.statusHistory.map((h, i) => (
            <li key={i} className="muted" style={{ fontSize: 13 }}>
              {h.from} → {h.to} · {new Date(h.at).toLocaleString()}
              {h.reason ? ` · ${h.reason}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { FileLink } from './FileUpload';
import { EmptyState, Money, PageHeader, StatusBadge } from './primitives';

export function ReturnDetail({
  returnNo,
  portal,
  listPath,
}: {
  returnNo: string;
  portal: 'pharmacy' | 'stockist' | 'admin';
  listPath: string;
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
        : '/admin/orders'
      : order
        ? `/${portal}/orders/${encodeURIComponent(order.orderNo)}`
        : `/${portal}/orders`;

  return (
    <div className="stack">
      <PageHeader
        title={ret.returnNo}
        subtitle={`${pharmacy?.name ?? 'Pharmacy'} → ${stockist?.name ?? 'Stockist'}`}
        actions={
          <Link className="btn btn-secondary btn-sm" to={listPath}>
            Back to returns
          </Link>
        }
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
            <Link to="/stockist/credit-notes">{credit.creditNoteNo}</Link>
          ) : (
            credit.creditNoteNo
          )}{' '}
          · <Money value={credit.amount} />
        </div>
      ) : null}

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
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((l, i) => (
                <tr key={`${l.productId}-${i}`}>
                  <td>{l.productName}</td>
                  <td>{l.qty}</td>
                  <td>{l.approvedQty ?? '—'}</td>
                  <td>{l.reason}</td>
                  <td className="muted">{l.batchNumber ?? '—'}</td>
                  <td>
                    <Money value={l.qty * l.unitPrice} />
                  </td>
                </tr>
              ))}
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

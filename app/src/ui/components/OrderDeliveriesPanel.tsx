import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { Delivery } from '../../domain/entities/types';
import { FileLink } from './FileUpload';
import { EmptyState, StatusBadge } from './primitives';

function DeliveryCard({ delivery, supportBase }: { delivery: Delivery; supportBase?: string }) {
  const assignee = useLiveQuery(
    () => (delivery.assignedTo ? db.users.get(delivery.assignedTo) : undefined),
    [delivery.assignedTo],
  );

  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <strong>{delivery.deliveryNo}</strong>
          <StatusBadge status={delivery.status} />
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          {supportBase ? (
            <Link
              className="btn btn-ghost btn-sm no-print"
              to={`${supportBase}?new=1&entityType=Delivery&entityId=${encodeURIComponent(delivery.id)}&entityNo=${encodeURIComponent(delivery.deliveryNo)}`}
            >
              Get help
            </Link>
          ) : null}
          <span className="muted" style={{ fontSize: 12 }}>
            Created {new Date(delivery.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {delivery.scheduledDate ? <>Scheduled {delivery.scheduledDate} · </> : null}
        {assignee ? <>Assigned to {assignee.name} · </> : null}
        {delivery.deliveredAt ? <>Delivered {new Date(delivery.deliveredAt).toLocaleString()}</> : null}
      </div>
      {delivery.receivedBy ? (
        <div style={{ fontSize: 13 }}>
          Received by <strong>{delivery.receivedBy}</strong>
        </div>
      ) : null}
      {delivery.podFileId ? (
        <div style={{ fontSize: 13 }}>
          POD: <FileLink fileId={delivery.podFileId} label="View proof of delivery" />
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 13 }}>
          No POD uploaded
        </div>
      )}
      {delivery.failReason ? (
        <div style={{ fontSize: 13, color: 'var(--danger, #b42318)' }}>
          Fail reason: {delivery.failReason}
        </div>
      ) : null}
      {delivery.returnedToStockistAt ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Returned to stockist {new Date(delivery.returnedToStockistAt).toLocaleString()}
        </div>
      ) : null}
      {delivery.lines.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Delivered</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {delivery.lines.map((l, i) => (
                <tr key={`${delivery.id}-${i}`}>
                  <td>{l.productName}</td>
                  <td>{l.qty}</td>
                  <td>{l.deliveredQty}</td>
                  <td>
                    {l.receivedQty ?? '—'}
                    {l.discrepancyReason ? (
                      <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                        ({l.discrepancyReason})
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {delivery.statusHistory.length ? (
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Status history
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {delivery.statusHistory.map((h, i) => (
              <li key={i} className="muted" style={{ fontSize: 12 }}>
                {h.from} → {h.to} · {new Date(h.at).toLocaleString()}
                {h.reason ? ` · ${h.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Shared delivery history with POD / receiver / fail trail for order detail pages. */
export function OrderDeliveriesPanel({
  orderId,
  supportBase,
}: {
  orderId: string;
  /** e.g. /pharmacy/support — adds Get help on each delivery */
  supportBase?: string;
}) {
  const deliveries =
    useLiveQuery(() => db.deliveries.where('orderId').equals(orderId).toArray(), [orderId]) ?? [];

  const sorted = [...deliveries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="stack">
      <strong>Deliveries</strong>
      {!sorted.length ? (
        <EmptyState title="No deliveries yet" description="Dispatch creates a delivery record with POD and status history." />
      ) : (
        sorted.map((d) => <DeliveryCard key={d.id} delivery={d} supportBase={supportBase} />)
      )}
    </div>
  );
}

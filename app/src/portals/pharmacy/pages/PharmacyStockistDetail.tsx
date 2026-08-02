import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { requestConnection } from '../../../services/connectionService';
import { setFavourite, setSupplierRating } from '../../../services/favouriteService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Field, Input, Kpi, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyStockistDetail() {
  const { stockistId } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const stockist = useLiveQuery(() => (stockistId ? db.businesses.get(stockistId) : undefined), [stockistId]);
  const connection = useLiveQuery(
    () => (stockistId ? db.connections.where({ pharmacyId: business.id, stockistId }).first() : undefined),
    [business.id, stockistId],
  );
  const orders =
    useLiveQuery(
      () => (stockistId ? db.orders.where({ pharmacyId: business.id, stockistId }).reverse().sortBy('placedAt') : []),
      [business.id, stockistId],
    ) ?? [];
  const invoices =
    useLiveQuery(
      () => (stockistId ? db.invoices.where({ pharmacyId: business.id, stockistId }).toArray() : []),
      [business.id, stockistId],
    ) ?? [];
  const catalogue = useLiveQuery(
    () => (stockistId ? db.catalogues.where('stockistId').equals(stockistId).first() : undefined),
    [stockistId],
  );
  const favourite = useLiveQuery(
    () =>
      stockistId
        ? db.favourites.where({ pharmacyId: business.id, stockistId }).first()
        : undefined,
    [business.id, stockistId],
  );

  if (!stockist) return <EmptyState title="Stockist not found" description="" />;

  const outstanding = pairOutstanding(invoices, business.id, stockist.id);
  const canRequest =
    !connection || ['Rejected', 'Disconnected', 'Cancelled'].includes(connection.status);

  return (
    <div className="stack">
      <PageHeader
        title={stockist.name}
        subtitle={`${stockist.city}, ${stockist.state} · ${connection?.status ?? 'Not connected'}`}
        actions={
          <div className="row">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const wasFav = !!favourite;
                const res = await setFavourite({
                  actor: user,
                  pharmacy: business,
                  stockistId: stockist.id,
                  favourite: !favourite,
                });
                pushToast(
                  res.ok
                    ? {
                        tone: 'success',
                        title: wasFav ? 'Unpinned' : 'Pinned favourite',
                        actionLabel: 'Undo',
                        onAction: async () => {
                          await setFavourite({
                            actor: user,
                            pharmacy: business,
                            stockistId: stockist.id,
                            favourite: wasFav,
                          });
                        },
                      }
                    : { tone: 'error', title: res.message },
                );
              }}
            >
              {favourite ? 'Unpin' : 'Pin favourite'}
            </Button>
            {connection?.status === 'Active' ? (
              <>
                <Link className="btn btn-primary btn-sm" to={`/pharmacy/buy/${stockist.id}`}>
                  View catalogue
                </Link>
                <Link className="btn btn-secondary btn-sm" to={`/pharmacy/ledger/${stockist.id}`}>
                  Ledger
                </Link>
                <Link className="btn btn-secondary btn-sm" to={`/pharmacy/messages?with=${stockist.id}`}>
                  Message
                </Link>
              </>
            ) : null}
            {canRequest ? (
              <Button
                size="sm"
                onClick={async () => {
                  const res = await requestConnection({ actor: user, pharmacy: business, stockistId: stockist.id });
                  pushToast(
                    res.ok
                      ? { tone: 'success', title: 'Connection requested' }
                      : { tone: 'error', title: res.message },
                  );
                }}
              >
                Request connection
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="kpi-grid">
        <Kpi label="Outstanding" value={<Money value={outstanding} />} />
        <Kpi label="Orders" value={orders.length} />
        <Kpi label="Catalogue" value={catalogue?.status ?? '—'} />
        <Kpi label="Connection" value={connection?.status ?? 'None'} />
      </div>
      <div className="card card-pad stack">
        <strong>Private rating</strong>
        <div className="muted" style={{ fontSize: 12 }}>
          Visible only to your pharmacy — never shown to the stockist or others.
        </div>
        <Field label="Rating (1–5)">
          <Select
            value={String(favourite?.rating ?? '')}
            onChange={async (e) => {
              const rating = Number(e.target.value);
              if (!rating) return;
              const res = await setSupplierRating({
                actor: user,
                pharmacy: business,
                stockistId: stockist.id,
                rating,
                note: favourite?.note,
              });
              pushToast(res.ok ? { tone: 'success', title: 'Rating saved' } : { tone: 'error', title: res.message });
            }}
          >
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Private note">
          <Input
            defaultValue={favourite?.note ?? ''}
            key={favourite?.note ?? 'note'}
            placeholder="Optional note"
            onBlur={async (e) => {
              const note = e.target.value.trim();
              if (!favourite?.rating) return;
              const res = await setSupplierRating({
                actor: user,
                pharmacy: business,
                stockistId: stockist.id,
                note,
              });
              if (!res.ok) pushToast({ tone: 'error', title: res.message });
            }}
          />
        </Field>
      </div>
      <div className="card card-pad stack">
        <strong>Profile</strong>
        <div style={{ fontSize: 13 }}>
          <div>
            GST {stockist.gstNumber ?? '—'} · DL {stockist.drugLicenseNumber ?? '—'}
          </div>
          <div className="muted">
            {stockist.address}, {stockist.city} {stockist.pincode}
          </div>
          <div className="muted">
            {stockist.phone} · {stockist.email}
          </div>
          {stockist.servicePins?.length ? (
            <div className="muted">Service PINs: {stockist.servicePins.join(', ')}</div>
          ) : null}
          {connection ? (
            <div>
              Terms: {connection.creditDays ?? '—'} days
              {connection.creditLimit != null ? (
                <>
                  {' '}
                  · limit <Money value={connection.creditLimit} />
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="card card-pad stack">
        <strong>Holidays</strong>
        {!stockist.holidays?.length ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No holidays published
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {stockist.holidays.map((h) => {
              const [date, label] = h.split('|').map((s) => s.trim());
              return (
                <li key={h}>
                  {date}
                  {label ? ` — ${label}` : ''}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card card-pad">
        <strong>Recent orders</strong>
        {!orders.length ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/pharmacy/orders/${o.orderNo}`}>{o.orderNo}</Link>
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      <Money value={o.grandTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

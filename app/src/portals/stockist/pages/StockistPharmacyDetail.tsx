import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistPharmacyDetail() {
  const { pharmacyId } = useParams();
  const { business } = useBiz();
  const pharmacy = useLiveQuery(() => (pharmacyId ? db.businesses.get(pharmacyId) : undefined), [pharmacyId]);
  const connection = useLiveQuery(
    () =>
      pharmacyId
        ? db.connections.where({ pharmacyId, stockistId: business.id }).first()
        : undefined,
    [pharmacyId, business.id],
  );
  const orders =
    useLiveQuery(
      () => (pharmacyId ? db.orders.where({ pharmacyId, stockistId: business.id }).reverse().sortBy('placedAt') : []),
      [pharmacyId, business.id],
    ) ?? [];
  const invoices =
    useLiveQuery(
      () => (pharmacyId ? db.invoices.where({ pharmacyId, stockistId: business.id }).toArray() : []),
      [pharmacyId, business.id],
    ) ?? [];

  if (!pharmacy) return <EmptyState title="Pharmacy not found" description="" />;

  const outstanding = pairOutstanding(invoices, pharmacy.id, business.id);
  const lastTrade = orders[0];

  return (
    <div className="stack">
      <PageHeader
        title={pharmacy.name}
        subtitle={`${pharmacy.city} · ${connection?.status ?? 'No connection'}`}
        actions={
          <Link className="btn btn-secondary btn-sm" to="/stockist/messages">
            Message
          </Link>
        }
      />
      <div className="kpi-grid">
        <div className="card card-pad">
          <div className="muted" style={{ fontSize: 12 }}>
            Outstanding
          </div>
          <strong>
            <Money value={outstanding} />
          </strong>
          {connection?.creditLimit != null ? (
            <div className="muted" style={{ fontSize: 12 }}>
              Limit <Money value={connection.creditLimit} />
            </div>
          ) : null}
        </div>
        <div className="card card-pad">
          <div className="muted" style={{ fontSize: 12 }}>
            Orders
          </div>
          <strong>{orders.length}</strong>
        </div>
        <div className="card card-pad">
          <div className="muted" style={{ fontSize: 12 }}>
            Last trade
          </div>
          <strong>{lastTrade ? lastTrade.orderNo : '—'}</strong>
          {lastTrade ? <div className="muted" style={{ fontSize: 12 }}>{new Date(lastTrade.placedAt).toLocaleDateString()}</div> : null}
        </div>
      </div>
      <div className="card card-pad stack">
        <strong>Profile</strong>
        <div style={{ fontSize: 13 }}>
          <div>GST {pharmacy.gstNumber ?? '—'} · DL {pharmacy.drugLicenseNumber ?? '—'}</div>
          <div className="muted">
            {pharmacy.address}, {pharmacy.city} {pharmacy.pincode}
          </div>
          <div className="muted">
            {pharmacy.phone} · {pharmacy.email}
          </div>
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
      <div className="card card-pad">
        <strong>Recent orders</strong>
        {!orders.length ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 20).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/stockist/orders/${o.orderNo}`}>{o.orderNo}</Link>
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
      <div className="card card-pad">
        <strong>Invoices</strong>
        {!invoices.length ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/stockist/invoices/${inv.invoiceNo}`}>{inv.invoiceNo}</Link>
                    </td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td>
                      <Money value={inv.outstanding} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Link className="btn btn-secondary" to="/stockist/pharmacies">
        Back to pharmacies
      </Link>
    </div>
  );
}

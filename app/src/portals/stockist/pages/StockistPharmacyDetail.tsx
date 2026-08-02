import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { parseNumberInput } from '../../../domain/utils/validation';
import { updateConnectionCreditTerms } from '../../../services/connectionService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, Modal, Money, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistPharmacyDetail() {
  const { pharmacyId } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
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

  const [editOpen, setEditOpen] = useState(false);
  const [creditDays, setCreditDays] = useState('30');
  const [creditLimit, setCreditLimit] = useState('100000');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ days?: string; limit?: string; reason?: string }>({});

  if (!pharmacy) return <EmptyState title="Pharmacy not found" description="" />;

  const outstanding = pairOutstanding(invoices, pharmacy.id, business.id);
  const lastTrade = orders[0];
  const canEditTerms = connection?.status === 'Active';

  function openEditTerms() {
    if (!connection) return;
    setCreditDays(String(connection.creditDays ?? 30));
    setCreditLimit(String(connection.creditLimit ?? 100000));
    setReason('');
    setErrors({});
    setEditOpen(true);
  }

  return (
    <div className="stack">
      <PageHeader
        title={pharmacy.name}
        subtitle={`${pharmacy.city} · ${connection?.status ?? 'No connection'}`}
        actions={
          <div className="row">
            {canEditTerms ? (
              <Button size="sm" variant="secondary" onClick={openEditTerms}>
                Edit terms
              </Button>
            ) : null}
            <Link className="btn btn-secondary btn-sm" to={`/stockist/messages?with=${pharmacy.id}`}>
              Message
            </Link>
          </div>
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
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Profile</strong>
          {canEditTerms ? (
            <Button size="sm" variant="ghost" onClick={openEditTerms}>
              Edit terms
            </Button>
          ) : null}
        </div>
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

      <Modal
        open={editOpen}
        title="Edit credit terms"
        onClose={() => {
          setEditOpen(false);
          setErrors({});
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!connection) return;
                  const daysParsed = parseNumberInput(creditDays);
                  const limitParsed = parseNumberInput(creditLimit);
                  const next: typeof errors = {};
                  if (daysParsed.status === 'empty') next.days = 'Credit days are required';
                  else if (
                    daysParsed.status === 'invalid' ||
                    !Number.isInteger(daysParsed.value) ||
                    daysParsed.value < 0
                  ) {
                    next.days = 'Enter whole days (0 or more)';
                  }
                  if (limitParsed.status === 'empty') next.limit = 'Credit limit is required';
                  else if (limitParsed.status === 'invalid' || limitParsed.value <= 0) {
                    next.limit = 'Enter a limit greater than zero';
                  }
                  if (!reason.trim()) next.reason = 'A reason is required';
                  setErrors(next);
                  if (Object.keys(next).length || daysParsed.status !== 'ok' || limitParsed.status !== 'ok') return;
                  const res = await updateConnectionCreditTerms({
                    actor: user,
                    stockist: business,
                    connectionId: connection.id,
                    creditDays: daysParsed.value,
                    creditLimit: limitParsed.value,
                    reason: reason.trim(),
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  pushToast({ tone: 'success', title: 'Credit terms updated' });
                  setEditOpen(false);
                })
              }
            >
              Save terms
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Credit days" error={errors.days}>
            <Input value={creditDays} onChange={(e) => setCreditDays(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Credit limit (₹)" error={errors.limit}>
            <Input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Reason" error={errors.reason}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why are terms changing?" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

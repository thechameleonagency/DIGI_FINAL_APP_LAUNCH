import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { requestConnection } from '../../../services/connectionService';
import { isFavouritePinned, setFavourite, setSupplierRating } from '../../../services/favouriteService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Field, Input, Kpi, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Tab = 'Overview' | 'Catalogue' | 'Orders' | 'Invoices' | 'Ledger';

export function PharmacyStockistDetail() {
  const { stockistId } = useParams();
  const [params] = useSearchParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const tabParam = params.get('tab');
  const [tab, setTab] = useState<Tab>(
    tabParam === 'Catalogue' || tabParam === 'Orders' || tabParam === 'Invoices' || tabParam === 'Ledger'
      ? tabParam
      : 'Overview',
  );
  useEffect(() => {
    if (tabParam === 'Catalogue' || tabParam === 'Orders' || tabParam === 'Invoices' || tabParam === 'Ledger' || tabParam === 'Overview') {
      setTab(tabParam);
    }
  }, [tabParam]);
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
  const products =
    useLiveQuery(
      () =>
        stockistId
          ? db.products.where('stockistId').equals(stockistId).filter((p) => p.listedForSale !== false).toArray()
          : [],
      [stockistId],
    ) ?? [];
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
  const pinned = isFavouritePinned(favourite);
  const tradeMode =
    connection?.status === 'Active'
      ? connection.inCircle
        ? 'Circle credit'
        : 'Pay-First'
      : connection?.status ?? 'Not connected';

  return (
    <div className="stack">
      <PageHeader
        title={stockist.name}
        subtitle={`${stockist.city}, ${stockist.state} · ${tradeMode}`}
        backTo="/pharmacy/connections"
        backLabel="Back to Circle"
        actions={
          <div className="row">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const wasFav = pinned;
                const res = await setFavourite({
                  actor: user,
                  pharmacy: business,
                  stockistId: stockist.id,
                  favourite: !pinned,
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
              {pinned ? 'Unpin' : 'Pin favourite'}
            </Button>
            {connection?.status === 'Active' ? (
              <>
                <Link className="btn btn-primary btn-sm" to={`/pharmacy/buy/${stockist.id}`}>
                  View catalogue
                </Link>
                <Link className="btn btn-secondary btn-sm" to={`/pharmacy/stockists/${stockist.id}?tab=Ledger`}>
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
        <Kpi
          label="Circle"
          value={connection?.inCircle ? 'Credit' : connection?.status === 'Active' ? 'Pay-first' : connection?.status ?? 'None'}
        />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {(['Overview', 'Catalogue', 'Orders', 'Invoices', 'Ledger'] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>
      {tab === 'Overview' ? (
        <>
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
      <div className="card card-pad stack">
        <strong>Quick links</strong>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button size="sm" variant="secondary" onClick={() => setTab('Orders')}>
            Orders ({orders.length})
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setTab('Invoices')}>
            Invoices ({invoices.length})
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setTab('Catalogue')}>
            Catalogue ({products.length})
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setTab('Ledger')}>
            Ledger
          </Button>
        </div>
      </div>
        </>
      ) : null}
      {tab === 'Catalogue' ? (
        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Listed products ({products.length})</strong>
            {connection?.status === 'Active' ? (
              <Link className="btn btn-primary btn-sm" to={`/pharmacy/buy/${stockist.id}`}>
                Browse full catalogue
              </Link>
            ) : null}
          </div>
          <table className="data" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 40).map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/pharmacy/product/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.sku}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === 'Orders' ? (
        <div className="card card-pad">
          <table className="data" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
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
      ) : null}
      {tab === 'Invoices' ? (
        <div className="card card-pad">
          <table className="data" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Status</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link to={`/pharmacy/invoices/${i.invoiceNo}`}>{i.invoiceNo}</Link>
                  </td>
                  <td>
                    <StatusBadge status={i.status} />
                  </td>
                  <td>
                    <Money value={i.outstanding} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === 'Ledger' && stockistId ? (
        <div className="card card-pad stack">
          <strong>Ledger</strong>
          <p className="muted">Outstanding <Money value={outstanding} /></p>
          <Link className="btn btn-secondary btn-sm" to={`/pharmacy/stockists/${stockistId}?tab=Ledger`}>
            Open full ledger
          </Link>
        </div>
      ) : null}
    </div>
  );
}

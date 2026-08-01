import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyInvoiceDetail() {
  const { invoiceNo } = useParams();
  const { business } = useBiz();
  const invoice = useLiveQuery(() => db.invoices.where('invoiceNo').equals(invoiceNo!).first(), [invoiceNo]);
  const stockist = useLiveQuery(() => (invoice ? db.businesses.get(invoice.stockistId) : undefined), [invoice?.stockistId]);
  const order = useLiveQuery(() => (invoice?.orderId ? db.orders.get(invoice.orderId) : undefined), [invoice?.orderId]);

  if (!invoice || invoice.pharmacyId !== business.id) {
    return <EmptyState title="Invoice not found" description="Check the invoice number." />;
  }

  return (
    <div className="stack">
      <PageHeader
        title={invoice.invoiceNo}
        subtitle={`${stockist?.name ?? 'Stockist'} · ${invoice.status}`}
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/payments">
            Payments
          </Link>
        }
      />
      <div className="grid-2">
        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <StatusBadge status={invoice.status} />
            <span className="muted" style={{ fontSize: 12 }}>
              Issued {new Date(invoice.issuedAt ?? invoice.createdAt).toLocaleString()}
            </span>
          </div>
          {invoice.dueDate ? <div style={{ fontSize: 13 }}>Due {invoice.dueDate}</div> : null}
          {order ? (
            <div style={{ fontSize: 13 }}>
              Order <Link to={`/pharmacy/orders/${order.orderNo}`}>{order.orderNo}</Link>
            </div>
          ) : null}
          <div className="stack" style={{ gap: 4 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>Subtotal</span>
              <Money value={invoice.subtotal} />
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>Tax</span>
              <Money value={invoice.taxTotal} />
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Grand total</strong>
              <strong>
                <Money value={invoice.grandTotal} />
              </strong>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Outstanding</strong>
              <strong>
                <Money value={invoice.outstanding} />
              </strong>
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <strong>Lines</strong>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Tax</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.productName}</td>
                    <td>{l.qty}</td>
                    <td>
                      <Money value={l.unitPrice} />
                    </td>
                    <td>
                      <Money value={l.lineTax} />
                    </td>
                    <td>
                      <Money value={l.lineTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { InvoiceDocument } from '../../../ui/components/InvoiceDocument';
import { EmptyState, PageHeader } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyInvoiceDetail() {
  const { invoiceNo } = useParams();
  const { business } = useBiz();
  const invoice = useLiveQuery(() => db.invoices.where('invoiceNo').equals(invoiceNo!).first(), [invoiceNo]);
  const stockist = useLiveQuery(() => (invoice ? db.businesses.get(invoice.stockistId) : undefined), [invoice?.stockistId]);
  const order = useLiveQuery(() => (invoice?.orderId ? db.orders.get(invoice.orderId) : undefined), [invoice?.orderId]);
  const payments =
    useLiveQuery(
      () =>
        invoice
          ? db.payments
              .where('pharmacyId')
              .equals(business.id)
              .filter((p) => p.allocations.some((a) => a.invoiceId === invoice.id))
              .toArray()
          : [],
      [invoice?.id, business.id],
    ) ?? [];

  if (!invoice || invoice.pharmacyId !== business.id) {
    return <EmptyState title="Invoice not found" description="Check the invoice number." />;
  }

  return (
    <div className="stack">
      <PageHeader
        title={invoice.invoiceNo}
        subtitle={`${stockist?.name ?? 'Stockist'} · ${invoice.status}`}
        backTo="/pharmacy/invoices"
        backLabel="Back to invoices"
        actions={
          <>
            {order ? (
              <Link className="btn btn-secondary btn-sm" to={`/pharmacy/orders/${order.orderNo}`}>
                Order {order.orderNo}
              </Link>
            ) : null}
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/payments">
              Payments
            </Link>
            <Link
              className="btn btn-secondary btn-sm"
              to={`/pharmacy/support?new=1&entityType=Invoice&entityId=${encodeURIComponent(invoice.id)}&entityNo=${encodeURIComponent(invoice.invoiceNo)}`}
            >
              Get help with this invoice
            </Link>
          </>
        }
      />
      <InvoiceDocument
        invoice={invoice}
        payments={payments}
        stockistName={stockist?.name}
        pharmacyName={business.name}
        intraState={
          !stockist?.state || !business.state
            ? true
            : stockist.state.trim().toLowerCase() === business.state.trim().toLowerCase()
        }
      />
    </div>
  );
}

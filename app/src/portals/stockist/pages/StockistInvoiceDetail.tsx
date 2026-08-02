import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { voidInvoice } from '../../../services/paymentService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { InvoiceDocument } from '../../../ui/components/InvoiceDocument';
import { Button, EmptyState, PageHeader } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistInvoiceDetail() {
  const { invoiceNo } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canVoid = useCan('invoice.void');
  const [voidOpen, setVoidOpen] = useState(false);
  const invoice = useLiveQuery(() => db.invoices.where('invoiceNo').equals(invoiceNo!).first(), [invoiceNo]);
  const pharmacy = useLiveQuery(() => (invoice ? db.businesses.get(invoice.pharmacyId) : undefined), [invoice?.pharmacyId]);
  const payments =
    useLiveQuery(
      () =>
        invoice
          ? db.payments
              .where('stockistId')
              .equals(business.id)
              .filter((p) => p.allocations.some((a) => a.invoiceId === invoice.id))
              .toArray()
          : [],
      [invoice?.id, business.id],
    ) ?? [];
  const order = useLiveQuery(() => (invoice ? db.orders.get(invoice.orderId) : undefined), [invoice?.orderId]);

  if (!invoice || invoice.stockistId !== business.id) {
    return <EmptyState title="Invoice not found" description="" />;
  }

  const voidable =
    canVoid && ['Issued', 'Overdue'].includes(invoice.status) && invoice.paidAmount === 0 && invoice.creditApplied === 0;

  return (
    <div className="stack">
      <PageHeader
        title={invoice.invoiceNo}
        subtitle={pharmacy?.name}
        actions={
          <>
            {order ? (
              <Link className="btn btn-secondary btn-sm" to={`/stockist/orders/${order.orderNo}`}>
                Order {order.orderNo}
              </Link>
            ) : null}
            {voidable ? (
              <Button size="sm" variant="danger" onClick={() => setVoidOpen(true)}>
                Void invoice
              </Button>
            ) : null}
          </>
        }
      />
      <ConfirmDialog
        open={voidOpen}
        title="Void invoice"
        body="Only Issued/Overdue invoices with zero payments/credit can be voided."
        requireReason
        tone="danger"
        confirmLabel="Void invoice"
        onClose={() => setVoidOpen(false)}
        onConfirm={async (reason) => {
          const res = await voidInvoice({ actor: user, stockist: business, invoiceId: invoice.id, reason: reason! });
          pushToast(res.ok ? { tone: 'warning', title: 'Invoice voided' } : { tone: 'error', title: res.message });
          setVoidOpen(false);
        }}
      />
      <InvoiceDocument
        invoice={invoice}
        payments={payments}
        stockistName={business.name}
        pharmacyName={pharmacy?.name}
        intraState={
          !pharmacy?.state || !business.state
            ? true
            : pharmacy.state.trim().toLowerCase() === business.state.trim().toLowerCase()
        }
      />
    </div>
  );
}

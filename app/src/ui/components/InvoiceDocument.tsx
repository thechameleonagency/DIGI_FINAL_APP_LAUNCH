import type { Invoice, Payment } from '../../domain/entities/types';
import { gstSplit, invoiceOutstanding } from '../../domain/calc';
import { buildBillQrPayload, buildBillVerifyUrl } from '../../domain/utils/billIntegrity';
import { formatINR } from '../../domain/utils/money';
import { QrCode } from './QrCode';
import { Button, Money, StatusBadge } from './primitives';

/** Printable invoice view with GST split, settlement ledger, QR payload (CF-15). */
export function InvoiceDocument({
  invoice,
  payments = [],
  stockistName,
  pharmacyName,
  intraState = true,
}: {
  invoice: Invoice;
  payments?: Payment[];
  stockistName?: string;
  pharmacyName?: string;
  intraState?: boolean;
}) {
  const outstanding = invoiceOutstanding(invoice);
  const split = gstSplit(invoice.taxTotal, intraState);
  const overdue = invoice.status === 'Overdue' || (invoice.dueDate && new Date(invoice.dueDate) < new Date() && outstanding > 0);
  const payload = buildBillQrPayload({
    invoice,
    stockistName: stockistName ?? invoice.stockistId,
    pharmacyName: pharmacyName ?? invoice.pharmacyId,
  });
  const verifyUrl = buildBillVerifyUrl(payload);

  return (
    <div className="stack card card-pad invoice-document" id={`invoice-${invoice.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0 }}>{invoice.invoiceNo}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {stockistName ?? invoice.stockistId} → {pharmacyName ?? invoice.pharmacyId}
          </div>
        </div>
        <div className="row">
          <StatusBadge status={invoice.status} />
          {overdue ? <StatusBadge status="Overdue" /> : null}
          <Button size="sm" variant="secondary" className="no-print" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>GST%</th>
              <th>Line</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={`${l.productId}-${i}`}>
                <td>{l.productName}</td>
                <td>{l.qty}</td>
                <td>
                  <Money value={l.unitPrice} />
                </td>
                <td>{l.gstPercent}%</td>
                <td>
                  <Money value={l.lineTotal} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid-2">
        <div className="stack" style={{ fontSize: 13 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Subtotal</span>
            <Money value={invoice.subtotal} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Tax</span>
            <Money value={invoice.taxTotal} />
          </div>
          {intraState ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>CGST</span>
                <Money value={split.cgst} />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>SGST</span>
                <Money value={split.sgst} />
              </div>
            </>
          ) : (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>IGST</span>
              <Money value={split.igst} />
            </div>
          )}
          {invoice.roundOff ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>Round off</span>
              <Money value={invoice.roundOff} />
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Grand total</strong>
            <strong>
              <Money value={invoice.grandTotal} />
            </strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Paid</span>
            <Money value={invoice.paidAmount} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Credit applied</span>
            <Money value={invoice.creditApplied} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Outstanding</strong>
            <strong>{formatINR(outstanding)}</strong>
          </div>
          <div className="muted">Due {invoice.dueDate ?? '—'}</div>
        </div>
        <div className="stack">
          <strong>Settlement ledger</strong>
          {!payments.length ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No payments linked yet.
            </div>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span>
                  {p.paymentNo} · {p.status}
                </span>
                <Money value={p.amount} />
              </div>
            ))
          )}
          <div className="card card-pad" style={{ fontSize: 11 }}>
            <strong>Bill QR</strong>
            <div className="muted" style={{ marginTop: 4 }}>
              Scan to open verify page (same DigiSwasthya install).
            </div>
            <div style={{ marginTop: 8 }}>
              <QrCode value={verifyUrl} size={140} title={`Verify ${invoice.invoiceNo}`} />
            </div>
            <div className="muted no-print" style={{ marginTop: 6, wordBreak: 'break-all', fontSize: 10 }}>
              {verifyUrl}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

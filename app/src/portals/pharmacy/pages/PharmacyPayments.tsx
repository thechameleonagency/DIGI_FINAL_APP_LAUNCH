import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pharmacyOutstanding } from '../../../domain/calc';
import type { Payment } from '../../../domain/entities/types';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { formatINR } from '../../../domain/utils/money';
import { applyCreditNote, submitPayment } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { FileLink, FileUpload } from '../../../ui/components/FileUpload';
import { Button, EmptyState, Field, Input, Modal, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const METHODS: Payment['method'][] = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Other'];

export function PharmacyPayments() {
  const { business, user } = useBiz();
  const [params] = useSearchParams();
  const { pushToast } = useUi();
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const payments = useLiveQuery(() => db.payments.where('pharmacyId').equals(business.id).reverse().sortBy('createdAt'), [business.id]) ?? [];
  const credits = useLiveQuery(() => db.creditNotes.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const returns = useLiveQuery(() => db.returns.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const proofRequired = !!settings?.paymentProofMandatory;
  const initialStatus = params.get('status');
  const [tab, setTab] = useState<'Outstanding' | 'History' | 'Credits'>(
    params.get('tab') === 'Credits' ? 'Credits' : 'Outstanding',
  );
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Payment['method']>('UPI');
  const [reference, setReference] = useState('');
  const [proofFileId, setProofFileId] = useState<string | undefined>();
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus === 'Overdue' ? 'Overdue' : 'All');
  const [applyCnId, setApplyCnId] = useState<string | null>(null);
  const [applyInvoiceId, setApplyInvoiceId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');
  const applyCn = applyCnId ? credits.find((c) => c.id === applyCnId) : undefined;
  const cnInvoices = applyCn
    ? invoices.filter((i) => i.stockistId === applyCn.stockistId && i.outstanding > 0 && i.status !== 'Void')
    : [];

  const isOverdueInvoice = (i: { status: string; dueDate?: string; outstanding: number }) =>
    i.status === 'Overdue' || (!!i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0);

  const openInvoices = invoices.filter((i) => i.outstanding > 0 && i.status !== 'Void');
  const visibleInvoices = openInvoices.filter((i) => {
    if (statusFilter === 'Overdue' && !isOverdueInvoice(i)) return false;
    if (statusFilter !== 'All' && statusFilter !== 'Overdue' && i.status !== statusFilter) return false;
    if (invoiceQuery && !`${i.invoiceNo} ${i.status}`.toLowerCase().includes(invoiceQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="stack">
      <PageHeader title="Payments" subtitle={`Outstanding ${formatINR(pharmacyOutstanding(invoices, business.id))}`} />
      <div className="tabs">
        {(['Outstanding', 'History', 'Credits'] as const).map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Outstanding' && (
        <>
          <div className="row">
            <Input
              placeholder="Search invoice number"
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              style={{ maxWidth: 260 }}
              aria-label="Search invoices"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter invoice status"
              style={{ maxWidth: 180 }}
            >
              <option value="All">All open</option>
              <option value="Issued">Issued</option>
              <option value="PartiallyPaid">Partially paid</option>
              <option value="Overdue">Overdue</option>
            </Select>
          </div>
          {!openInvoices.length ? (
            <EmptyState
              title="No outstanding invoices"
              description="Invoices appear after the stockist issues a bill against a delivered order."
              action={
                <Link className="btn btn-primary" to="/pharmacy/orders">
                  View orders
                </Link>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Outstanding</th>
                    <th>Pay now</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link to={`/pharmacy/invoices/${i.invoiceNo}`}>{i.invoiceNo}</Link>
                      </td>
                      <td>
                        <StatusBadge status={i.status} />
                      </td>
                      <td>
                        <Money value={i.grandTotal} />
                      </td>
                      <td>
                        <Money value={i.outstanding} />
                      </td>
                      <td>
                        <div className="row">
                          <Input
                            type="number"
                            style={{ width: 120 }}
                            value={selected[i.id] ?? ''}
                            placeholder="0"
                            onChange={(e) => setSelected((s) => ({ ...s, [i.id]: Number(e.target.value) }))}
                          />
                          <Button size="sm" variant="ghost" onClick={() => setSelected((s) => ({ ...s, [i.id]: i.outstanding }))}>
                            Pay
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!visibleInvoices.length && openInvoices.length ? (
            <EmptyState title="No invoices match" description="Empty filter result is not an error." />
          ) : null}
          <div className="card card-pad stack">
            {proofRequired ? (
              <div className="banner-strip warning">Platform requires payment proof on every submission.</div>
            ) : null}
            <div className="grid-2">
              <Field label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value as Payment['method'])}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
            <FileUpload label="Upload payment proof" value={proofFileId} onChange={setProofFileId} />
            <Button
              onClick={async () => {
                if (proofRequired && !proofFileId) {
                  pushToast({ tone: 'error', title: 'Payment proof is mandatory' });
                  return;
                }
                const allocations = Object.entries(selected)
                  .filter(([, amt]) => amt > 0)
                  .map(([invoiceId, amount]) => ({ invoiceId, amount }));
                if (!allocations.length) {
                  pushToast({ tone: 'warning', title: 'Select invoice amounts' });
                  return;
                }
                const byStockist = new Map<string, { invoiceId: string; amount: number }[]>();
                for (const a of allocations) {
                  const inv = invoices.find((i) => i.id === a.invoiceId);
                  if (!inv) continue;
                  const list = byStockist.get(inv.stockistId) ?? [];
                  list.push(a);
                  byStockist.set(inv.stockistId, list);
                }
                let okCount = 0;
                let lastError = '';
                let lastPaymentNo = '';
                for (const [stockistId, group] of byStockist) {
                  const amount = group.reduce((s, a) => s + a.amount, 0);
                  const res = await submitPayment({
                    actor: user,
                    pharmacy: business,
                    stockistId,
                    amount,
                    method,
                    reference: reference || undefined,
                    proofFileId,
                    allocations: group,
                    idempotencyKey: makeIdempotencyKey('pay', `${user.id}-${stockistId}`),
                  });
                  if (res.ok) {
                    okCount += 1;
                    lastPaymentNo = res.data.paymentNo;
                  } else {
                    lastError = res.message;
                  }
                }
                if (okCount === byStockist.size) {
                  pushToast({
                    tone: 'success',
                    title: byStockist.size > 1 ? `${okCount} payments submitted` : 'Payment submitted',
                    message: lastPaymentNo,
                  });
                  useUi.getState().showSuccessSummary({
                    title: byStockist.size > 1 ? `${okCount} payments submitted` : 'Payment submitted',
                    documentNo: lastPaymentNo || undefined,
                    body: 'Payment is awaiting stockist review.',
                    next: [
                      { label: 'Payment history', to: '/pharmacy/payments?tab=History' },
                      { label: 'Home', to: '/pharmacy' },
                    ],
                  });
                  setSelected({});
                  setProofFileId(undefined);
                  setReference('');
                } else {
                  pushToast({
                    tone: 'error',
                    title: lastError || 'Payment failed',
                    message: `${okCount}/${byStockist.size} submitted`,
                  });
                }
              }}
            >
              Submit payment
            </Button>
          </div>
        </>
      )}
      {tab === 'History' &&
        (!payments.length ? (
          <EmptyState
            title="No payments yet"
            description="Payments and credit notes appear after your first settlement."
            action={
              <Link className="btn btn-primary" to="/pharmacy/orders">
                View orders
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.paymentNo}
                      {p.recordedBy === 'Stockist' ? (
                        <div className="muted" style={{ fontSize: 11 }}>
                          Recorded by stockist
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>{p.method}</td>
                    <td>
                      <Money value={p.amount} />
                    </td>
                    <td>{p.reference ?? '—'}</td>
                    <td>{p.proofFileId ? <FileLink fileId={p.proofFileId} /> : <span className="muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {tab === 'Credits' && (
        <div className="stack">
          <Modal
            open={!!applyCn}
            onClose={() => setApplyCnId(null)}
            title={applyCn ? `Apply ${applyCn.creditNoteNo}` : 'Apply credit'}
            footer={
              <Button
                disabled={!applyCn || !applyInvoiceId}
                onClick={async () => {
                  if (!applyCn) return;
                  const inv = cnInvoices.find((i) => i.id === applyInvoiceId);
                  if (!inv) {
                    pushToast({ tone: 'error', title: 'Select an open invoice for this stockist' });
                    return;
                  }
                  const amount = Number(applyAmount) || Math.min(applyCn.remaining, inv.outstanding);
                  const res = await applyCreditNote({
                    actor: user,
                    business,
                    creditNoteId: applyCn.id,
                    invoiceId: inv.id,
                    amount,
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Credit applied' } : { tone: 'error', title: res.message });
                  if (res.ok) setApplyCnId(null);
                }}
              >
                Apply credit
              </Button>
            }
          >
            {applyCn ? (
              <div className="stack">
                <div className="muted" style={{ fontSize: 13 }}>
                  Remaining <Money value={applyCn.remaining} /> · only open invoices from this stockist
                </div>
                <Field label="Invoice">
                  <Select value={applyInvoiceId} onChange={(e) => setApplyInvoiceId(e.target.value)}>
                    <option value="">Select…</option>
                    {cnInvoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNo} · outstanding {i.outstanding}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Amount">
                  <Input type="number" value={applyAmount} onChange={(e) => setApplyAmount(e.target.value)} placeholder="Max remaining / outstanding" />
                </Field>
                {!cnInvoices.length ? (
                  <EmptyState title="No open invoices" description="This stockist has no outstanding invoices to apply against." />
                ) : null}
              </div>
            ) : null}
          </Modal>
          {!credits.length ? (
            <EmptyState
              title="No credit notes"
              description="Payments and credit notes appear after your first settlement."
              action={
                <Link className="btn btn-primary" to="/pharmacy/returns">
                  View returns
                </Link>
              }
            />
          ) : (
            credits.map((c) => {
              const srcReturn = returns.find((r) => r.id === c.returnId);
              return (
                <div key={c.id} className="card card-pad stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{c.creditNoteNo}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.source ?? 'Return'}
                        {srcReturn ? ` · ${srcReturn.returnNo}` : ''} · Remaining <Money value={c.remaining} />
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.applications.length ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Applied:{' '}
                      {c.applications.map((a) => `${a.invoiceNo} (${a.amount})`).join(', ')}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12 }}>
                      No applications yet
                    </div>
                  )}
                  <Button
                    size="sm"
                    disabled={c.remaining <= 0}
                    onClick={() => {
                      setApplyCnId(c.id);
                      setApplyInvoiceId('');
                      setApplyAmount(String(c.remaining));
                    }}
                  >
                    Apply to invoice…
                  </Button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

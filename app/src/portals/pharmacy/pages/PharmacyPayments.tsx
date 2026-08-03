import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pharmacyOutstanding } from '../../../domain/calc';
import type { Payment } from '../../../domain/entities/types';
import { localDayKey, localTodayKey } from '../../../domain/utils/dateKeys';
import { stableIdempotencyKey } from '../../../domain/utils/idempotency';
import { formatINR } from '../../../domain/utils/money';
import { parseNumberInput } from '../../../domain/utils/validation';
import { applyCreditNote, submitPayment } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { FileLink, FileUpload } from '../../../ui/components/FileUpload';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { ListToolbar, PaginationBar, usePagedRows } from '../../../ui/components/ListToolkit';
import {
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Modal,
  Money,
  PageHeader,
  Select,
  StatusBadge,
  TabPanel,
  Tabs,
} from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const METHODS: Payment['method'][] = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Other'];

export function PharmacyPayments() {
  const { business, user } = useBiz();
  const [params] = useSearchParams();
  const { pushToast } = useUi();
  const { busy: submitting, run: runSubmit } = useBusyAction();
  const { items: invoices, loading: invoicesLoading } = useLiveArray(
    () => db.invoices.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const { items: payments, loading: paymentsLoading } = useLiveArray(
    () => db.payments.where('pharmacyId').equals(business.id).reverse().sortBy('createdAt'),
    [business.id],
  );
  const { items: credits, loading: creditsLoading } = useLiveArray(
    () => db.creditNotes.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const returns = useLiveQuery(() => db.returns.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const stockistName = (id: string) => stockists.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const proofRequired = !!settings?.paymentProofMandatory;
  const initialStatus = params.get('status');
  const paymentFocus = params.get('payment');
  const [tab, setTab] = useState<'Outstanding' | 'History' | 'Credits'>(() => {
    if (params.get('tab') === 'Credits' || params.get('credit')) return 'Credits';
    if (paymentFocus) return 'History';
    return 'Outstanding';
  });
  const [highlightPayment, setHighlightPayment] = useState<string | null>(paymentFocus);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Payment['method']>('UPI');
  const [reference, setReference] = useState('');
  const [proofFileId, setProofFileId] = useState<string | undefined>();
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus === 'Overdue' ? 'Overdue' : 'All');
  const [applyCnId, setApplyCnId] = useState<string | null>(null);
  const [applyInvoiceId, setApplyInvoiceId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
  const applyCn = applyCnId ? credits.find((c) => c.id === applyCnId) : undefined;
  const cnInvoices = applyCn
    ? invoices.filter((i) => i.stockistId === applyCn.stockistId && i.outstanding > 0 && i.status !== 'Void')
    : [];

  const isOverdueInvoice = (i: { status: string; dueDate?: string; outstanding: number }) =>
    i.status === 'Overdue' || (!!i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0);

  const openInvoices = invoices.filter((i) => i.outstanding > 0 && i.status !== 'Void');
  const visibleInvoices = useMemo(() => {
    const today = localTodayKey();
    return openInvoices
      .filter((i) => {
        if (statusFilter === 'Overdue' && !isOverdueInvoice(i)) return false;
        if (statusFilter !== 'All' && statusFilter !== 'Overdue' && i.status !== statusFilter) return false;
        const stockist = stockistName(i.stockistId);
        if (
          invoiceQuery &&
          !`${i.invoiceNo} ${i.status} ${stockist}`.toLowerCase().includes(invoiceQuery.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        const ad = a.dueDate ?? '9999-12-31';
        const bd = b.dueDate ?? '9999-12-31';
        if (ad !== bd) return ad.localeCompare(bd);
        return (a.invoiceNo ?? '').localeCompare(b.invoiceNo ?? '');
      })
      .map((i) => ({
        ...i,
        stockistLabel: stockistName(i.stockistId),
        dueLabel: i.dueDate ?? '—',
        duePast: !!i.dueDate && localDayKey(i.dueDate) < today,
      }));
  }, [openInvoices, statusFilter, invoiceQuery, stockists]);
  const invoiceList = usePagedRows(visibleInvoices, 7, `${statusFilter}|${invoiceQuery}`);
  const paymentList = usePagedRows(payments);
  const creditList = usePagedRows(credits);
  const selectedEntries = Object.entries(selected).filter(([, amt]) => amt > 0);
  const selectedTotal = selectedEntries.reduce((s, [, amt]) => s + amt, 0);
  const selectedCount = selectedEntries.length;
  const paymentsBusy = invoicesLoading || paymentsLoading || creditsLoading;

  useEffect(() => {
    if (!paymentFocus) return;
    setTab('History');
    setHighlightPayment(paymentFocus);
  }, [paymentFocus]);

  return (
    <div className="stack">
      <PageHeader title="Payments" subtitle={`Outstanding ${formatINR(pharmacyOutstanding(invoices, business.id))}`} />
      {submitBanner ? (
        <div className="banner-strip success">
          {submitBanner}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSubmitBanner(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      <Tabs
        ariaLabel="Payment views"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'Outstanding', label: 'Outstanding' },
          { id: 'History', label: 'History' },
          { id: 'Credits', label: 'Credits' },
        ]}
      />
      <TabPanel id="Outstanding" active={tab === 'Outstanding'}>
          <ListToolbar
            query={invoiceQuery}
            onQuery={setInvoiceQuery}
            placeholder="Search invoice / stockist"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'Issued', label: 'Issued' },
                  { value: 'PartiallyPaid', label: 'Partially paid' },
                  { value: 'Overdue', label: 'Overdue' },
                ],
              },
            ]}
            filterValues={{ status: statusFilter }}
            onFilter={(_key, value) => setStatusFilter(value)}
          />
          {paymentsBusy ? (
            <LoadingState label="Loading payables…" />
          ) : !openInvoices.length ? (
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
            <>
              <div className="table-wrap queue-responsive">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Stockist</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th>Outstanding</th>
                      <th>Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceList.pageRows.map((i) => (
                      <tr key={i.id}>
                        <td data-label="Invoice">
                          <Link to={`/pharmacy/invoices/${i.invoiceNo}`}>{i.invoiceNo}</Link>
                        </td>
                        <td data-label="Stockist">
                          <Link to={`/pharmacy/ledger/${i.stockistId}`}>{i.stockistLabel}</Link>
                        </td>
                        <td data-label="Due">
                          <span
                            style={{
                              fontSize: 13,
                              color: i.duePast ? 'var(--danger, #b42318)' : undefined,
                              fontWeight: i.duePast ? 600 : undefined,
                            }}
                          >
                            {i.dueLabel}
                          </span>
                        </td>
                        <td data-label="Status">
                          <StatusBadge status={i.status} />
                        </td>
                        <td data-label="Total">
                          <Money value={i.grandTotal} />
                        </td>
                        <td data-label="Outstanding">
                          <Money value={i.outstanding} />
                        </td>
                        <td data-label="Allocate">
                          <div className="stack" style={{ gap: 4 }}>
                            <div className="row">
                              <Input
                                type="number"
                                style={{ width: 120 }}
                                min={0}
                                max={i.outstanding}
                                step="0.01"
                                value={selected[i.id] ?? ''}
                                placeholder="0"
                                onChange={(e) => {
                                  const parsed = parseNumberInput(e.target.value);
                                  if (parsed.status === 'empty') {
                                    setSelected((s) => {
                                      const next = { ...s };
                                      delete next[i.id];
                                      return next;
                                    });
                                    return;
                                  }
                                  if (parsed.status === 'invalid') return;
                                  setSelected((s) => ({
                                    ...s,
                                    [i.id]: Math.min(Math.max(0, parsed.value), i.outstanding),
                                  }));
                                }}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                onClick={() => setSelected((s) => ({ ...s, [i.id]: i.outstanding }))}
                              >
                                Fill full amount
                              </Button>
                            </div>
                            <span className="muted" style={{ fontSize: 11 }}>
                              Remaining{' '}
                              <Money value={Math.max(0, i.outstanding - (selected[i.id] ?? 0))} />
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={invoiceList.page}
                pageCount={invoiceList.pageCount}
                total={invoiceList.total}
                onPage={invoiceList.setPage}
              />
            </>
          )}
          {!visibleInvoices.length && openInvoices.length ? (
            <EmptyState title="No invoices match" description="Empty filter result is not an error." />
          ) : null}
          <div className="card card-pad stack" id="payment-submit-panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>Submit payment</strong>
              <span style={{ fontSize: 14 }}>
                Selected total <strong>{formatINR(selectedTotal)}</strong>
                {selectedCount ? ` · ${selectedCount} invoice(s)` : ''}
              </span>
            </div>
            {proofRequired ? (
              <div className="banner-strip warning">Platform requires payment proof on every submission.</div>
            ) : null}
            <div className="grid-2">
              <Field label="Method">                <Select value={method} onChange={(e) => setMethod(e.target.value as Payment['method'])}>
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
              disabled={submitting}
              onClick={() =>
                void runSubmit(async () => {
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
                    const sorted = [...group].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
                    const idempotencyKey = stableIdempotencyKey('pay', [
                      user.id,
                      business.id,
                      stockistId,
                      method,
                      reference.trim(),
                      proofFileId ?? '',
                      ...sorted.flatMap((a) => [a.invoiceId, a.amount]),
                    ]);
                    const res = await submitPayment({
                      actor: user,
                      pharmacy: business,
                      stockistId,
                      amount,
                      method,
                      reference: reference || undefined,
                      proofFileId,
                      allocations: group,
                      idempotencyKey,
                    });
                    if (res.ok) {
                      okCount += 1;
                      lastPaymentNo = res.data.paymentNo;
                    } else {
                      lastError = res.message;
                    }
                  }
                  if (okCount === byStockist.size) {
                    setSubmitBanner(
                      byStockist.size > 1
                        ? `${okCount} payments submitted${lastPaymentNo ? ` (latest ${lastPaymentNo})` : ''} — awaiting stockist review.`
                        : `Payment ${lastPaymentNo} submitted — awaiting stockist review.`,
                    );
                    setSelected({});
                    setProofFileId(undefined);
                    setReference('');
                    setTab('History');
                  } else {
                    pushToast({
                      tone: 'error',
                      title: lastError || 'Payment failed',
                      message: `${okCount}/${byStockist.size} submitted`,
                    });
                  }
                })
              }
            >
              {submitting ? 'Submitting…' : 'Submit payment'}
            </Button>
          </div>
      </TabPanel>
      <TabPanel id="History" active={tab === 'History'}>
        {paymentsLoading ? (
          <LoadingState label="Loading payment history…" />
        ) : !payments.length ? (
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
          <>
            <div className="table-wrap queue-responsive">
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
                  {paymentList.pageRows.map((p) => (
                    <tr
                      key={p.id}
                      id={`payment-${p.paymentNo}`}
                      style={
                        highlightPayment === p.paymentNo
                          ? { outline: '2px solid var(--accent)', outlineOffset: -2 }
                          : undefined
                      }
                      ref={
                        highlightPayment === p.paymentNo
                          ? (el) => {
                              el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            }
                          : undefined
                      }
                    >
                      <td data-label="Payment">
                        <Link to={`/pharmacy/payments/${encodeURIComponent(p.paymentNo)}`}>{p.paymentNo}</Link>
                        {p.recordedBy === 'Stockist' ? (
                          <div className="muted" style={{ fontSize: 11 }}>
                            Recorded by stockist
                          </div>
                        ) : null}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={p.status} />
                      </td>
                      <td data-label="Method">{p.method}</td>
                      <td data-label="Amount">
                        <Money value={p.amount} />
                      </td>
                      <td data-label="Reference">{p.reference ?? '—'}</td>
                      <td data-label="Proof">
                        {p.proofFileId ? <FileLink fileId={p.proofFileId} /> : <span className="muted">None</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={paymentList.page}
              pageCount={paymentList.pageCount}
              total={paymentList.total}
              onPage={paymentList.setPage}
            />
          </>
        )}
      </TabPanel>
      <TabPanel id="Credits" active={tab === 'Credits'}>
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
                  const parsed = parseNumberInput(applyAmount);
                  const fallback = Math.min(applyCn.remaining, inv.outstanding);
                  if (parsed.status === 'invalid') {
                    pushToast({ tone: 'error', title: 'Enter a valid credit amount' });
                    return;
                  }
                  const amount = parsed.status === 'ok' ? parsed.value : fallback;
                  if (!(amount > 0)) {
                    pushToast({ tone: 'error', title: 'Credit amount must be greater than zero' });
                    return;
                  }
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
            <>
              {creditList.pageRows.map((c) => {
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
              })}
              <PaginationBar
                page={creditList.page}
                pageCount={creditList.pageCount}
                total={creditList.total}
                onPage={creditList.setPage}
              />
            </>
          )}
        </div>
      </TabPanel>
    </div>
  );
}

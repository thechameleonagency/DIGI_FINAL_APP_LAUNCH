import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { stockistReceivables } from '../../../domain/calc';
import type { Payment } from '../../../domain/entities/types';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { formatINR } from '../../../domain/utils/money';
import { parseNumberInput } from '../../../domain/utils/validation';
import { can } from '../../../domain/permissions';
import { recordOfflinePayment, reviewPayment } from '../../../services/paymentService';
import { sendPaymentReminder } from '../../../services/reminderService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { FileLink, FileUpload } from '../../../ui/components/FileUpload';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, LoadingState, Money, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const METHODS: Payment['method'][] = ['Cash', 'UPI', 'NEFT', 'Cheque', 'RTGS', 'Other'];

export function StockistPayments() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const [params] = useSearchParams();
  const highlight = params.get('invoice') ?? '';
  const paymentFocus = params.get('payment');
  const { items: payments, loading: paymentsLoading } = useLiveArray(
    () => db.payments.where('stockistId').equals(business.id).reverse().sortBy('createdAt'),
    [business.id],
  );
  const { items: invoices, loading: invoicesLoading } = useLiveArray(
    () => db.invoices.where('stockistId').equals(business.id).toArray(),
    [business.id],
  );
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const connections =
    useLiveQuery(
      () => db.connections.where('stockistId').equals(business.id).filter((c) => c.status === 'Active').toArray(),
      [business.id],
    ) ?? [];
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentFocus || paymentsLoading) return;
    const match = payments.find((p) => p.paymentNo === paymentFocus);
    if (match) setReviewId(match.id);
  }, [paymentFocus, payments, paymentsLoading]);
  const [advancePrompt, setAdvancePrompt] = useState<{
    paymentId: string;
    paymentNo: string;
    amount: number;
    allocated: number;
    surplus: number;
  } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [recPharmacyId, setRecPharmacyId] = useState('');
  const [recMethod, setRecMethod] = useState<Payment['method']>('Cash');
  const [recReference, setRecReference] = useState('');
  const [recDate, setRecDate] = useState(() => localTodayKey());
  const [recProof, setRecProof] = useState<string | undefined>();
  const [recAlloc, setRecAlloc] = useState<Record<string, number>>({});
  const [recDeclaredAmount, setRecDeclaredAmount] = useState('');
  const [recBusy, setRecBusy] = useState(false);

  const permCtx = {
    businessType: business.type,
    role: user.role,
    accountStatus: business.accountStatus,
    verificationStatus: business.verificationStatus,
    overrides: user.permissionOverrides,
    actorBusinessId: business.id,
  };
  const canRecord = can('payment.recordOffline', permCtx).allow;
  const canRemind = can('reminder.send', permCtx).allow;
  const canApprove = can('payment.approve', permCtx).allow;
  const canReject = can('payment.reject', permCtx).allow;

  const connectedPharmacyIds = useMemo(() => new Set(connections.map((c) => c.pharmacyId)), [connections]);
  const recordPharmacies = pharmacies.filter((p) => connectedPharmacyIds.has(p.id));
  const openForPharmacy = invoices.filter(
    (i) => i.pharmacyId === recPharmacyId && i.outstanding > 0 && i.status !== 'Void' && i.status !== 'Paid',
  );
  const recAllocTotal = Object.values(recAlloc).reduce((s, n) => s + (n || 0), 0);
  const recAmount = recDeclaredAmount ? Number(recDeclaredAmount) : recAllocTotal;

  const openRecord = (opts?: { pharmacyId?: string; invoiceId?: string; amount?: number }) => {
    setRecPharmacyId(opts?.pharmacyId ?? '');
    setRecMethod('Cash');
    setRecReference('');
    setRecDate(localTodayKey());
    setRecProof(undefined);
    setRecAlloc(opts?.invoiceId && opts.amount ? { [opts.invoiceId]: opts.amount } : {});
    setRecDeclaredAmount(opts?.amount != null ? String(opts.amount) : '');
    setRecordOpen(true);
  };

  const pharmacyName = (id: string) => pharmacies.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const review = reviewId ? payments.find((p) => p.id === reviewId) : undefined;

  const scopedPayments = useMemo(
    () =>
      payments.filter((p) => {
        if (dateFrom && p.createdAt.slice(0, 10) < dateFrom) return false;
        if (dateTo && p.createdAt.slice(0, 10) > dateTo) return false;
        return true;
      }),
    [payments, dateFrom, dateTo],
  );

  const payColumns = useMemo(
    () => [
      { key: 'paymentNo', label: 'Payment', getValue: (p: (typeof payments)[0]) => p.paymentNo },
      { key: 'pharmacy', label: 'Pharmacy', getValue: (p: (typeof payments)[0]) => pharmacyName(p.pharmacyId) },
      {
        key: 'status',
        label: 'Status',
        getValue: (p: (typeof payments)[0]) => p.status,
        render: (p: (typeof payments)[0]) => <StatusBadge status={p.status} />,
      },
      {
        key: 'amount',
        label: 'Amount',
        getValue: (p: (typeof payments)[0]) => p.amount,
        render: (p: (typeof payments)[0]) => <Money value={p.amount} />,
      },
      { key: 'method', label: 'Method', getValue: (p: (typeof payments)[0]) => p.method },
      {
        key: 'createdAt',
        label: 'Date',
        getValue: (p: (typeof payments)[0]) => p.createdAt,
        render: (p: (typeof payments)[0]) => <span className="muted">{new Date(p.createdAt).toLocaleDateString()}</span>,
      },
    ],
    [pharmacies],
  );

  const payList = useListControls(scopedPayments, {
    columns: payColumns,
    searchKeys: [(p) => `${p.paymentNo} ${p.reference ?? ''} ${pharmacyName(p.pharmacyId)} ${p.method}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Submitted', 'UnderReview', 'OnHold', 'Approved', 'Rejected', 'Cancelled'].map((s) => ({ value: s, label: s })),
      },
    ],
    defaultSortKey: 'createdAt',
    defaultSortDir: 'desc',
  });

  const invColumns = useMemo(
    () => [
      {
        key: 'invoiceNo',
        label: 'Invoice',
        getValue: (i: (typeof invoices)[0]) => i.invoiceNo,
        render: (i: (typeof invoices)[0]) => <Link to={`/stockist/invoices/${i.invoiceNo}`}>{i.invoiceNo}</Link>,
      },
      { key: 'pharmacy', label: 'Pharmacy', getValue: (i: (typeof invoices)[0]) => pharmacyName(i.pharmacyId) },
      {
        key: 'status',
        label: 'Status',
        getValue: (i: (typeof invoices)[0]) => i.status,
        render: (i: (typeof invoices)[0]) => (
          <StatusBadge
            status={
              i.status === 'Overdue' ||
              (!!i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0)
                ? 'Overdue'
                : i.status
            }
          />
        ),
      },
      {
        key: 'grandTotal',
        label: 'Total',
        getValue: (i: (typeof invoices)[0]) => i.grandTotal,
        render: (i: (typeof invoices)[0]) => <Money value={i.grandTotal} />,
      },
      {
        key: 'outstanding',
        label: 'Outstanding',
        getValue: (i: (typeof invoices)[0]) => i.outstanding,
        render: (i: (typeof invoices)[0]) => <Money value={i.outstanding} />,
      },
      {
        key: 'actions',
        label: '',
        getValue: () => '',
        render: (i: (typeof invoices)[0]) =>
          i.outstanding > 0 && i.status !== 'Void' ? (
            <div className="row" style={{ gap: 4 }}>
              {canRemind ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const res = await sendPaymentReminder({ actor: user, stockist: business, invoiceId: i.id });
                    pushToast(
                      res.ok
                        ? { tone: 'success', title: 'Reminder sent', message: i.invoiceNo }
                        : { tone: 'error', title: res.message },
                    );
                  }}
                >
                  Remind
                </Button>
              ) : null}
              {canRecord ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openRecord({ pharmacyId: i.pharmacyId, invoiceId: i.id, amount: i.outstanding })}
                >
                  Mark paid
                </Button>
              ) : null}
            </div>
          ) : null,
      },
    ],
    [pharmacies, canRecord, canRemind, user, business],
  );

  const isOverdueInvoice = (i: { status: string; dueDate?: string; outstanding: number }) =>
    i.status === 'Overdue' || (!!i.dueDate && new Date(i.dueDate) < new Date() && i.outstanding > 0);

  const invScoped = useMemo(
    () =>
      invoices.filter((i) => {
        if (highlight && i.invoiceNo !== highlight) return false;
        if (dateFrom && (i.issuedAt ?? i.createdAt).slice(0, 10) < dateFrom) return false;
        if (dateTo && (i.issuedAt ?? i.createdAt).slice(0, 10) > dateTo) return false;
        return true;
      }),
    [invoices, highlight, dateFrom, dateTo],
  );

  const statusParam = params.get('status') ?? '';
  const invList = useListControls(invScoped, {
    columns: invColumns,
    searchKeys: [(i) => `${i.invoiceNo} ${pharmacyName(i.pharmacyId)}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Issued', 'PartiallyPaid', 'Paid', 'Overdue', 'Void'].map((s) => ({ value: s, label: s })),
        // Match Home KPI: status-Overdue OR date-overdue with outstanding (same as pharmacy portal)
        match: (i, selected) => {
          if (selected === 'Overdue') return isOverdueInvoice(i);
          return i.status === selected;
        },
      },
    ],
    defaultSortKey: 'invoiceNo',
    defaultSortDir: 'desc',
    initialFilters: statusParam ? { status: statusParam } : undefined,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Payments & invoices"
        subtitle={`Receivables ${formatINR(stockistReceivables(invoices, business.id))}`}
        actions={
          canRecord ? (
            <Button size="sm" onClick={() => openRecord()}>
              Record payment
            </Button>
          ) : undefined
        }
      />
      <Modal
        open={recordOpen}
        title="Record offline payment"
        onClose={() => setRecordOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setRecordOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={recBusy || !recPharmacyId || recAmount <= 0}
              onClick={async () => {
                setRecBusy(true);
                const allocations = Object.entries(recAlloc)
                  .filter(([, amt]) => amt > 0)
                  .map(([invoiceId, amount]) => ({ invoiceId, amount }));
                const res = await recordOfflinePayment({
                  actor: user,
                  stockist: business,
                  pharmacyId: recPharmacyId,
                  amount: recAmount,
                  method: recMethod,
                  reference: recReference || undefined,
                  remittanceDate: recDate,
                  proofFileId: recProof,
                  allocations,
                  idempotencyKey: makeIdempotencyKey('offline-pay', user.id),
                });
                setRecBusy(false);
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message });
                  return;
                }
                pushToast({
                  tone: 'success',
                  title: 'Payment recorded',
                  message: `${res.data.paymentNo} — approve when ready (outstanding updates on approval).`,
                });
                setRecordOpen(false);
              }}
            >
              {recBusy ? 'Saving…' : 'Record payment'}
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Pharmacy">
            <Select
              value={recPharmacyId}
              onChange={(e) => {
                setRecPharmacyId(e.target.value);
                setRecAlloc({});
              }}
            >
              <option value="">Select connected pharmacy</option>
              {recordPharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid-2">
            <Field label="Mode">
              <Select value={recMethod} onChange={(e) => setRecMethod(e.target.value as Payment['method'])}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Remittance date">
              <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Reference">
            <Input value={recReference} onChange={(e) => setRecReference(e.target.value)} placeholder="UPI/cheque/ref no." />
          </Field>
          <FileUpload label="Proof (optional)" value={recProof} onChange={setRecProof} />
          {!recPharmacyId ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Choose a pharmacy to allocate open invoices.
            </p>
          ) : !openForPharmacy.length ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No open invoices for this pharmacy.
            </p>
          ) : (
            <div className="stack">
              <strong style={{ fontSize: 13 }}>Allocate to invoices</strong>
              {openForPharmacy.map((inv) => (
                <div key={inv.id} className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 13 }}>
                    <Link to={`/stockist/invoices/${inv.invoiceNo}`}>{inv.invoiceNo}</Link>
                    <div className="muted">
                      Outstanding <Money value={inv.outstanding} />
                    </div>
                  </div>
                  <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                    <Input
                      type="number"
                      min={0}
                      max={inv.outstanding}
                      step="0.01"
                      style={{ maxWidth: 120 }}
                      value={recAlloc[inv.id] ?? ''}
                      onChange={(e) => {
                        const parsed = parseNumberInput(e.target.value);
                        setRecAlloc((prev) => {
                          const next = { ...prev };
                          if (parsed.status !== 'ok' || parsed.value <= 0) delete next[inv.id];
                          else next[inv.id] = Math.min(parsed.value, inv.outstanding);
                          return next;
                        });
                      }}
                      aria-label={`Allocate ${inv.invoiceNo}`}
                    />
                    <span className="muted" style={{ fontSize: 11 }}>
                      Remaining <Money value={Math.max(0, inv.outstanding - (recAlloc[inv.id] ?? 0))} />
                    </span>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 13 }}>
                Allocated <Money value={recAllocTotal} />
              </div>
              <Field
                label="Payment amount"
                hint="If the amount exceeds what you allocate to invoices, the surplus becomes an advance credit note when approved."
              >
                <Input
                  type="number"
                  value={recDeclaredAmount || String(recAllocTotal || '')}
                  onChange={(e) => setRecDeclaredAmount(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!rejectId}
        title="Reject payment"
        body="Provide a reason. The pharmacy will be notified."
        requireReason
        tone="danger"
        confirmLabel="Reject payment"
        onClose={() => setRejectId(null)}
        onConfirm={async (reason) => {
          const res = await reviewPayment({
            actor: user,
            stockist: business,
            paymentId: rejectId!,
            decision: 'Rejected',
            reason: reason!,
          });
          pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
          setRejectId(null);
        }}
      />
      <ConfirmDialog
        open={!!holdId}
        title="Hold payment"
        body="Payment stays pending until resumed or decided."
        requireReason
        reasonLabel="Hold reason"
        confirmLabel="Place on hold"
        onClose={() => setHoldId(null)}
        onConfirm={async (reason) => {
          const res = await reviewPayment({
            actor: user,
            stockist: business,
            paymentId: holdId!,
            decision: 'OnHold',
            reason: reason!,
          });
          pushToast(res.ok ? { tone: 'warning', title: 'Payment on hold' } : { tone: 'error', title: res.message });
          setHoldId(null);
        }}
      />
      <Modal
        open={!!advancePrompt}
        title="Surplus payment — advance credit?"
        onClose={() => setAdvancePrompt(null)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAdvancePrompt(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!advancePrompt) return;
                const res = await reviewPayment({
                  actor: user,
                  stockist: business,
                  paymentId: advancePrompt.paymentId,
                  decision: 'Approved',
                  issueAdvanceCredit: false,
                });
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Payment approved', message: 'Surplus left without credit note' }
                    : { tone: 'error', title: res.message },
                );
                if (res.ok) setAdvancePrompt(null);
              }}
            >
              Approve without CN
            </Button>
            <Button
              onClick={async () => {
                if (!advancePrompt) return;
                const res = await reviewPayment({
                  actor: user,
                  stockist: business,
                  paymentId: advancePrompt.paymentId,
                  decision: 'Approved',
                  issueAdvanceCredit: true,
                });
                pushToast(
                  res.ok
                    ? {
                        tone: 'success',
                        title: 'Payment approved',
                        message: 'Advance credit note issued for surplus',
                      }
                    : { tone: 'error', title: res.message },
                );
                if (res.ok) setAdvancePrompt(null);
              }}
            >
              Approve + issue advance CN
            </Button>
          </div>
        }
      >
        {advancePrompt ? (
          <div className="stack" style={{ gap: 8, fontSize: 13.5 }}>
            <p>
              Payment <strong>{advancePrompt.paymentNo}</strong> exceeds invoice allocations.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Payment amount: <Money value={advancePrompt.amount} />
              </li>
              <li>
                Allocated to invoices: <Money value={advancePrompt.allocated} />
              </li>
              <li>
                Surplus: <strong><Money value={advancePrompt.surplus} /></strong>
              </li>
            </ul>
            <p className="muted" style={{ margin: 0 }}>
              Issuing an Advance credit note keeps the surplus as pharmacy credit. Approving without a CN records the
              full payment without creating that credit.
            </p>
          </div>
        ) : null}
      </Modal>
      <Modal
        open={!!review}
        title={review ? `Review ${review.paymentNo}` : 'Review payment'}
        onClose={() => setReviewId(null)}
        footer={
          review && ['Submitted', 'UnderReview', 'OnHold'].includes(review.status) && (canApprove || canReject) ? (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setReviewId(null)}>
                Close
              </Button>
              {canReject && review.status === 'OnHold' ? (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const res = await reviewPayment({
                      actor: user,
                      stockist: business,
                      paymentId: review.id,
                      decision: 'UnderReview',
                    });
                    pushToast(res.ok ? { tone: 'info', title: 'Resumed review' } : { tone: 'error', title: res.message });
                    setReviewId(null);
                  }}
                >
                  Resume
                </Button>
              ) : canReject ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setHoldId(review.id);
                    setReviewId(null);
                  }}
                >
                  Hold
                </Button>
              ) : null}
              {canApprove ? (
                <Button
                  onClick={async () => {
                    const allocated = review.allocations.reduce((s, a) => s + a.amount, 0);
                    const surplus = review.amount - allocated;
                    if (review.recordedBy === 'Stockist' && surplus > 0.005) {
                      setAdvancePrompt({
                        paymentId: review.id,
                        paymentNo: review.paymentNo,
                        amount: review.amount,
                        allocated,
                        surplus,
                      });
                      setReviewId(null);
                      return;
                    }
                    const res = await reviewPayment({
                      actor: user,
                      stockist: business,
                      paymentId: review.id,
                      decision: 'Approved',
                    });
                    pushToast(
                      res.ok
                        ? { tone: 'success', title: 'Payment approved' }
                        : { tone: 'error', title: res.message },
                    );
                    setReviewId(null);
                  }}
                >
                  Approve
                </Button>
              ) : null}
              {canReject ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    setRejectId(review.id);
                    setReviewId(null);
                  }}
                >
                  Reject
                </Button>
              ) : null}
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setReviewId(null)}>
              Close
            </Button>
          )
        }
      >
        {review ? (
          <div className="stack" style={{ fontSize: 13 }}>
            <div>
              <strong>{pharmacyName(review.pharmacyId)}</strong>
              <div className="muted">
                {new Date(review.createdAt).toLocaleString()} · {review.method}
                {review.reference ? ` · Ref ${review.reference}` : ''}
              </div>
            </div>
            <div>
              Amount <Money value={review.amount} /> · <StatusBadge status={review.status} />
              {review.recordedBy === 'Stockist' ? (
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  Recorded by stockist
                </span>
              ) : null}
            </div>
            <div>
              <strong>Allocations</strong>
              {review.allocations.map((a) => (
                <div key={a.invoiceId}>
                  <Link to={`/stockist/invoices/${a.invoiceNo}`}>{a.invoiceNo}</Link> — <Money value={a.amount} />
                </div>
              ))}
            </div>
            {review.proofFileId ? (
              <div>
                Proof: <FileLink fileId={review.proofFileId} />
              </div>
            ) : (
              <div className="muted">No proof attached</div>
            )}
            {review.holdReason ? <div className="muted">Hold: {review.holdReason}</div> : null}
            {review.rejectReason ? <div className="muted">Reject: {review.rejectReason}</div> : null}
          </div>
        ) : null}
      </Modal>

      <h3 style={{ margin: 0, fontSize: 15 }}>Payments</h3>
      {paymentsLoading ? (
        <LoadingState label="Loading payments…" />
      ) : !payments.length ? (
        <EmptyState
          title="No payments yet"
          description="Pharmacy payment submissions appear here after you invoice fulfilled orders."
          action={
            <Link className="btn btn-primary" to="/stockist/orders">
              Process orders
            </Link>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={payList.query}
            onQuery={payList.setQuery}
            placeholder="Search payment / pharmacy / ref"
            dateRange={{
              from: dateFrom,
              to: dateTo,
              onFrom: setDateFrom,
              onTo: setDateTo,
            }}
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: ['Submitted', 'UnderReview', 'OnHold', 'Approved', 'Rejected'].map((s) => ({ value: s, label: s })),
              },
            ]}
            filterValues={payList.filterValues}
            onFilter={payList.setFilter}
            onExport={() => {
              payList.doExport(`stockist-payments-${business.id}.csv`);
              pushToast({ tone: 'success', title: 'Exported payments' });
            }}
          />
          <DataListTable
            loading={paymentsLoading}
            columns={[
              ...payColumns,
              {
                key: 'actions',
                label: 'Actions',
                getValue: () => '',
                render: (p: (typeof payments)[0]) => (
                  <Button size="sm" variant="secondary" onClick={() => setReviewId(p.id)}>
                    Details
                  </Button>
                ),
              },
            ]}
            rows={payList.pageRows}
            sortKey={payList.sortKey}
            sortDir={payList.sortDir}
            onSort={payList.toggleSort}
          />
          <PaginationBar page={payList.page} pageCount={payList.pageCount} total={payList.total} onPage={payList.setPage} />
        </>
      )}

      <h3 style={{ margin: '8px 0 0', fontSize: 15 }}>Invoices</h3>
      {invoicesLoading ? (
        <LoadingState label="Loading invoices…" />
      ) : !invoices.length ? (
        <EmptyState
          title="No invoices yet"
          description="Issue an invoice after packing a fulfilled order."
          action={
            <Link className="btn btn-primary" to="/stockist/orders">
              Go to orders
            </Link>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={invList.query}
            onQuery={invList.setQuery}
            placeholder="Search invoice / pharmacy"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: ['Issued', 'PartiallyPaid', 'Paid', 'Overdue', 'Void'].map((s) => ({ value: s, label: s })),
              },
            ]}
            filterValues={invList.filterValues}
            onFilter={invList.setFilter}
            onExport={() => {
              invList.doExport(`stockist-invoices-${business.id}.csv`);
              pushToast({ tone: 'success', title: 'Exported invoices' });
            }}
          />
          <DataListTable
            loading={invoicesLoading}
            columns={invColumns}
            rows={invList.pageRows}
            sortKey={invList.sortKey}
            sortDir={invList.sortDir}
            onSort={invList.toggleSort}
          />
          <PaginationBar page={invList.page} pageCount={invList.pageCount} total={invList.total} onPage={invList.setPage} />
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { applyCreditNote, issueGoodwillCreditNote } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, Modal, Money, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

/** Credit notes body — embeddable in Payments hub. */
export function StockistCreditNotesPanel() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const notes = useLiveQuery(() => db.creditNotes.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const connections =
    useLiveQuery(
      () => db.connections.where('stockistId').equals(business.id).filter((c) => c.status === 'Active').toArray(),
      [business.id],
    ) ?? [];
  const invoices =
    useLiveQuery(
      () => db.invoices.where('stockistId').equals(business.id).filter((i) => i.outstanding > 0 && i.status !== 'Void').toArray(),
      [business.id],
    ) ?? [];
  const [applyId, setApplyId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [gwOpen, setGwOpen] = useState(false);
  const [gwConfirm, setGwConfirm] = useState(false);
  const [gwPharmacy, setGwPharmacy] = useState('');
  const [gwAmount, setGwAmount] = useState('');
  const [gwReason, setGwReason] = useState('');

  const applyNote = applyId ? notes.find((n) => n.id === applyId) : undefined;
  const detail = detailId ? notes.find((n) => n.id === detailId) : undefined;
  const applyInvoices = applyNote ? invoices.filter((i) => i.pharmacyId === applyNote.pharmacyId) : [];
  const connectedPharmacies = pharmacies.filter((p) => connections.some((c) => c.pharmacyId === p.id));
  const pharmacyName = (id: string) => pharmacies.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" onClick={() => setGwOpen(true)}>
          Issue goodwill CN
        </Button>
      </div>
      <Modal
        open={gwOpen}
        title="Issue goodwill credit note"
        onClose={() => setGwOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setGwOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!gwPharmacy) {
                  pushToast({ tone: 'error', title: 'Select a pharmacy' });
                  return;
                }
                if (!(Number(gwAmount) > 0)) {
                  pushToast({ tone: 'error', title: 'Enter an amount greater than zero' });
                  return;
                }
                if (!gwReason.trim()) {
                  pushToast({ tone: 'error', title: 'Reason is required' });
                  return;
                }
                setGwConfirm(true);
              }}
            >
              Review & issue
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Pharmacy">
            <Select value={gwPharmacy} onChange={(e) => setGwPharmacy(e.target.value)}>
              <option value="">Select connected…</option>
              {connectedPharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <Input type="number" value={gwAmount} onChange={(e) => setGwAmount(e.target.value)} />
          </Field>
          <Field label="Reason (required)">
            <Input value={gwReason} onChange={(e) => setGwReason(e.target.value)} placeholder="Authorised adjustment" />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={gwConfirm}
        title="Issue goodwill credit?"
        tone="danger"
        confirmLabel="Issue credit note"
        body={
          <p>
            Create spendable goodwill credit of <strong>{formatINR(Number(gwAmount) || 0)}</strong> for{' '}
            <strong>{pharmacyName(gwPharmacy)}</strong>? This can be applied to open invoices immediately.
            {gwReason.trim() ? (
              <>
                {' '}
                Reason: <em>{gwReason.trim()}</em>
              </>
            ) : null}
          </p>
        }
        onClose={() => setGwConfirm(false)}
        onConfirm={async () => {
          const res = await issueGoodwillCreditNote({
            actor: user,
            stockist: business,
            pharmacyId: gwPharmacy,
            amount: Number(gwAmount),
            reason: gwReason,
          });
          pushToast(res.ok ? { tone: 'success', title: res.data.creditNoteNo } : { tone: 'error', title: res.message });
          if (res.ok) {
            setGwAmount('');
            setGwReason('');
            setGwOpen(false);
            setGwConfirm(false);
          }
        }}
      />
      <Modal
        open={!!applyNote}
        title={applyNote ? `Apply ${applyNote.creditNoteNo}` : 'Apply credit'}
        onClose={() => setApplyId(null)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setApplyId(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await applyCreditNote({
                  actor: user,
                  business,
                  creditNoteId: applyNote!.id,
                  invoiceId,
                  amount: Number(amount),
                });
                pushToast(res.ok ? { tone: 'success', title: 'Credit applied' } : { tone: 'error', title: res.message });
                if (res.ok) setApplyId(null);
              }}
            >
              Apply
            </Button>
          </div>
        }
      >
        {applyNote ? (
          <div className="stack">
            <div className="muted" style={{ fontSize: 13 }}>
              Remaining <Money value={applyNote.remaining} />
            </div>
            <Field label="Invoice">
              <Select
                value={invoiceId}
                onChange={(e) => {
                  setInvoiceId(e.target.value);
                  const inv = applyInvoices.find((i) => i.id === e.target.value);
                  if (inv) setAmount(String(Math.min(applyNote.remaining, inv.outstanding)));
                }}
              >
                <option value="">Select invoice…</option>
                {applyInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNo} · outstanding {i.outstanding}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <Modal open={!!detail} title={detail?.creditNoteNo ?? 'Credit note'} onClose={() => setDetailId(null)}>
        {detail ? (
          <div className="stack" style={{ fontSize: 13 }}>
            <div>
              Amount <Money value={detail.amount} /> · Remaining <Money value={detail.remaining} /> ·{' '}
              <StatusBadge status={detail.status} />
            </div>
            <div className="muted">
              Source: {detail.source ?? 'Return'}
              {detail.reason ? ` · ${detail.reason}` : ''}
              {detail.paymentId ? ` · payment ${detail.paymentId.slice(0, 8)}` : ''}
              {detail.expiresAt ? ` · expires ${new Date(detail.expiresAt).toLocaleDateString()}` : ''}
            </div>
            <strong>Application history</strong>
            {!detail.applications.length ? (
              <div className="muted">No applications yet.</div>
            ) : (
              detail.applications.map((a, i) => (
                <div key={i}>
                  <Link to={`/stockist/invoices/${a.invoiceNo}`}>{a.invoiceNo}</Link> — <Money value={a.amount} /> ·{' '}
                  {new Date(a.at).toLocaleString()}
                </div>
              ))
            )}
          </div>
        ) : null}
      </Modal>

      {!notes.length ? (
        <EmptyState
          title="No credit notes"
          description="Issue goodwill here, or approve a return / surplus payment for Advance CN."
          action={
            <Link className="btn btn-primary" to="/stockist/returns">
              Review returns
            </Link>
          }
        />
      ) : (
        notes.map((c) => (
          <div key={c.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{c.creditNoteNo}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {pharmacyName(c.pharmacyId)} · {c.source ?? 'Return'} · Remaining <Money value={c.remaining} /> ·{' '}
                <StatusBadge status={c.status} />
                {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
              </div>
            </div>
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => setDetailId(c.id)}>
                Detail
              </Button>
              <Button
                size="sm"
                disabled={c.remaining <= 0 || !invoices.some((i) => i.pharmacyId === c.pharmacyId)}
                onClick={() => {
                  setApplyId(c.id);
                  const inv = invoices.find((i) => i.pharmacyId === c.pharmacyId);
                  setInvoiceId(inv?.id ?? '');
                  setAmount(inv ? String(Math.min(c.remaining, inv.outstanding)) : '');
                }}
              >
                Apply…
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** Standalone route redirects into Payments hub. */
export function StockistCreditNotes() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('tab', 'CreditNotes');
  const qs = next.toString();
  return <Navigate to={`/stockist/payments${qs ? `?${qs}` : ''}`} replace />;
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import {
  addCounterfeitNote,
  dismissCounterfeitReport,
  issueCounterfeitRecall,
  resolveCounterfeitReport,
  startCounterfeitInvestigation,
} from '../../../services/counterfeitService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { FileLink } from '../../../ui/components/FileUpload';
import { Button, EmptyState, Field, Input, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function AdminCounterfeit() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const reports = useLiveQuery(() => db.counterfeitReports.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const batches = useLiveQuery(() => db.batches.toArray()) ?? [];
  const [note, setNote] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  const nameOf = (id?: string) => (id ? businesses.find((b) => b.id === id)?.name ?? id.slice(0, 8) : '—');
  const productName = (id?: string) => (id ? products.find((p) => p.id === id)?.name ?? id.slice(0, 8) : '—');
  const batchNo = (id?: string) => (id ? batches.find((b) => b.id === id)?.batchNumber ?? id.slice(0, 8) : '—');

  const sorted = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const act = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>, okTitle: string) =>
    void run(async () => {
      const res = await fn();
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      pushToast({ tone: 'success', title: okTitle });
    });

  return (
    <div className="stack">
      <PageHeader title="Counterfeit management" subtitle="Investigate reports → recall batches → resolve" />
      {!sorted.length ? (
        <EmptyState title="No counterfeit reports" description="Reports filed by pharmacies or stockists appear here." />
      ) : (
        sorted.map((r) => (
          <div key={r.id} className="card card-pad stack">
            <div className="row gap" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{r.reportNo ?? r.id.slice(0, 8)}</strong>
                <div className="muted">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div>
              Reporter:{' '}
              <Link to={`/admin/network/${r.reporterBusinessId}`}>{nameOf(r.reporterBusinessId)}</Link>
            </div>
            <div>
              Product: {productName(r.productId)} · Batch: {batchNo(r.batchId)}
              {r.sellerBusinessId ? (
                <>
                  {' '}
                  · Seller: <Link to={`/admin/network/${r.sellerBusinessId}`}>{nameOf(r.sellerBusinessId)}</Link>
                </>
              ) : null}
            </div>
            <p style={{ margin: 0 }}>{r.description}</p>
            {r.linkedReportId ? <p className="muted">Linked to investigation {r.linkedReportId.slice(0, 8)}</p> : null}
            {r.evidenceFileIds?.map((fid) => (
              <FileLink key={fid} fileId={fid} />
            ))}
            {r.internalNotes.length ? (
              <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {r.internalNotes.join('\n')}
              </div>
            ) : null}

            {r.status === 'Reported' ? (
              <div className="row gap">
                <Field label="Investigation note (optional)">
                  <Input value={note[r.id] ?? ''} onChange={(e) => setNote((m) => ({ ...m, [r.id]: e.target.value }))} />
                </Field>
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(
                      async () => startCounterfeitInvestigation({ actor: user, platform: business, id: r.id, note: note[r.id] }),
                      'Investigation started',
                    )
                  }
                >
                  Investigate
                </Button>
              </div>
            ) : null}

            {r.status === 'Investigating' ? (
              <div className="stack">
                <Field label="Internal note">
                  <Textarea
                    rows={2}
                    value={note[r.id] ?? ''}
                    onChange={(e) => setNote((m) => ({ ...m, [r.id]: e.target.value }))}
                  />
                </Field>
                <div className="row gap">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        async () => addCounterfeitNote({ actor: user, platform: business, id: r.id, note: note[r.id] ?? '' }),
                        'Note added',
                      )
                    }
                  >
                    Add note
                  </Button>
                  <Button
                    disabled={busy || !r.batchId}
                    onClick={() =>
                      act(
                        async () => issueCounterfeitRecall({ actor: user, platform: business, id: r.id, note: note[r.id] }),
                        'Recall issued',
                      )
                    }
                  >
                    Issue recall
                  </Button>
                </div>
                <Field label="Dismiss reason">
                  <Input value={reason[r.id] ?? ''} onChange={(e) => setReason((m) => ({ ...m, [r.id]: e.target.value }))} />
                </Field>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    act(
                      async () =>
                        dismissCounterfeitReport({
                          actor: user,
                          platform: business,
                          id: r.id,
                          reason: reason[r.id] ?? '',
                        }),
                      'Dismissed',
                    )
                  }
                >
                  Dismiss
                </Button>
              </div>
            ) : null}

            {r.status === 'RecallIssued' ? (
              <div className="stack">
                <Field label="Resolution note">
                  <Textarea
                    rows={2}
                    value={note[r.id] ?? ''}
                    onChange={(e) => setNote((m) => ({ ...m, [r.id]: e.target.value }))}
                  />
                </Field>
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(
                      async () =>
                        resolveCounterfeitReport({
                          actor: user,
                          platform: business,
                          id: r.id,
                          note: note[r.id] ?? '',
                        }),
                      'Resolved',
                    )
                  }
                >
                  Resolve
                </Button>
              </div>
            ) : null}

            {r.decisionReason ? <p className="muted">Decision: {r.decisionReason}</p> : null}
          </div>
        ))
      )}
    </div>
  );
}

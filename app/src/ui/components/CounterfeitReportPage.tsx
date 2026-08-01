import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { fileCounterfeitReport } from '../../services/counterfeitService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { useBusyAction } from '../hooks/useBusyAction';
import { FileUpload } from './FileUpload';
import { Button, EmptyState, Field, PageHeader, Select, StatusBadge, Textarea } from './primitives';

export function CounterfeitReportPage() {
  const { user, business, can } = useSession();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [description, setDescription] = useState('');
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [sellerBusinessId, setSellerBusinessId] = useState('');
  const [evidenceFileId, setEvidenceFileId] = useState<string | undefined>();

  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const batches = useLiveQuery(() => db.batches.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const mine =
    useLiveQuery(
      () =>
        business
          ? db.counterfeitReports.filter((r) => r.reporterBusinessId === business.id).toArray()
          : [],
      [business?.id],
    ) ?? [];

  const productOptions = useMemo(() => {
    if (!business) return [];
    if (business.type === 'Stockist') return products.filter((p) => p.stockistId === business.id);
    return products;
  }, [products, business]);

  const batchOptions = useMemo(() => {
    if (!productId) return batches.slice(0, 50);
    return batches.filter((b) => b.productId === productId);
  }, [batches, productId]);

  const counterparties = useMemo(() => {
    if (!business) return [];
    if (business.type === 'Pharmacy') return businesses.filter((b) => b.type === 'Stockist');
    return businesses.filter((b) => b.type === 'Pharmacy');
  }, [businesses, business]);

  const canReport = can('counterfeit.report');

  const submit = () =>
    void run(async () => {
      if (!user || !business) return;
      const res = await fileCounterfeitReport({
        actor: user,
        business,
        description,
        productId: productId || undefined,
        batchId: batchId || undefined,
        sellerBusinessId: sellerBusinessId || undefined,
        evidenceFileIds: evidenceFileId ? [evidenceFileId] : [],
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      setDescription('');
      setProductId('');
      setBatchId('');
      setSellerBusinessId('');
      setEvidenceFileId(undefined);
      pushToast({ tone: 'success', title: `Report ${res.data.reportNo} filed` });
    });

  if (!user || !business) return null;

  const history = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="stack">
      <PageHeader
        title="Counterfeit reports"
        subtitle="Report suspicious product or batch — admin investigates and may issue a recall"
      />

      {canReport ? (
        <div className="card card-pad stack">
          <h3 style={{ margin: 0 }}>File a report</h3>
          <Field label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Product (optional)">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">—</option>
                {productOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Batch (optional)">
              <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">—</option>
                {batchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={business.type === 'Pharmacy' ? 'Seller stockist (optional)' : 'Related pharmacy (optional)'}>
            <Select value={sellerBusinessId} onChange={(e) => setSellerBusinessId(e.target.value)}>
              <option value="">—</option>
              {counterparties.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <FileUpload label="Evidence (optional)" value={evidenceFileId} onChange={setEvidenceFileId} />
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            Submit report
          </Button>
        </div>
      ) : (
        <p className="muted">Your role cannot file counterfeit reports.</p>
      )}

      {!history.length ? (
        <EmptyState title="No reports yet" description="Your filed reports and their status appear here." />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Report</th>
                <th>When</th>
                <th>Status</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{r.reportNo ?? r.id.slice(0, 8)}</td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.decisionReason ?? r.outcome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

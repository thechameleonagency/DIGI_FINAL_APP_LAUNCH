import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { fileCounterfeitReport } from '../../services/counterfeitService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { useBusyAction } from '../hooks/useBusyAction';
import { FileUpload } from './FileUpload';
import { Button, EmptyState, Field, Modal, PageHeader, Select, StatusBadge, Textarea } from './primitives';

const MAX_EVIDENCE = 3;

export function CounterfeitReportPage() {
  const { user, business, can } = useSession();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [description, setDescription] = useState('');
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [sellerBusinessId, setSellerBusinessId] = useState('');
  const [evidenceFileIds, setEvidenceFileIds] = useState<(string | undefined)[]>([undefined]);
  const [reportOpen, setReportOpen] = useState(false);

  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const batches = useLiveQuery(() => db.batches.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const connections =
    useLiveQuery(
      () => (business ? db.connections.filter((c) => c.status === 'Active').toArray() : []),
      [business?.id],
    ) ?? [];
  const mine =
    useLiveQuery(
      () =>
        business
          ? db.counterfeitReports.filter((r) => r.reporterBusinessId === business.id).toArray()
          : [],
      [business?.id],
    ) ?? [];

  const connectedStockistIds = useMemo(() => {
    if (!business || business.type !== 'Pharmacy') return new Set<string>();
    return new Set(
      connections.filter((c) => c.pharmacyId === business.id).map((c) => c.stockistId),
    );
  }, [connections, business]);

  const productOptions = useMemo(() => {
    if (!business) return [];
    if (business.type === 'Stockist') return products.filter((p) => p.stockistId === business.id);
    return products.filter((p) => connectedStockistIds.has(p.stockistId));
  }, [products, business, connectedStockistIds]);

  const batchOptions = useMemo(() => {
    if (!productId) return [];
    return batches.filter((b) => b.productId === productId);
  }, [batches, productId]);

  const counterparties = useMemo(() => {
    if (!business) return [];
    if (business.type === 'Pharmacy') {
      return businesses.filter((b) => b.type === 'Stockist' && connectedStockistIds.has(b.id));
    }
    const pharmacyIds = new Set(
      connections.filter((c) => c.stockistId === business.id).map((c) => c.pharmacyId),
    );
    return businesses.filter((b) => b.type === 'Pharmacy' && pharmacyIds.has(b.id));
  }, [businesses, business, connections, connectedStockistIds]);

  const canReport = can('counterfeit.report');

  const resetForm = () => {
    setDescription('');
    setProductId('');
    setBatchId('');
    setSellerBusinessId('');
    setEvidenceFileIds([undefined]);
  };

  const onProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
    setBatchId('');
    if (nextProductId && business?.type === 'Pharmacy') {
      const product = products.find((p) => p.id === nextProductId);
      if (product && !sellerBusinessId) setSellerBusinessId(product.stockistId);
    }
  };

  const onBatchChange = (nextBatchId: string) => {
    setBatchId(nextBatchId);
    if (!nextBatchId) return;
    const batch = batches.find((b) => b.id === nextBatchId);
    if (!batch) return;
    if (!productId) setProductId(batch.productId);
    if (!sellerBusinessId && business?.type === 'Pharmacy') setSellerBusinessId(batch.stockistId);
  };

  const setEvidenceAt = (index: number, fileId: string | undefined) => {
    setEvidenceFileIds((prev) => {
      const next = [...prev];
      next[index] = fileId;
      return next;
    });
  };

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
        evidenceFileIds: evidenceFileIds.filter((id): id is string => Boolean(id)),
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      resetForm();
      setReportOpen(false);
      pushToast({ tone: 'success', title: `Report ${res.data.reportNo} filed` });
    });

  if (!user || !business) return null;

  const history = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="stack">
      <PageHeader
        title="Counterfeit reports"
        subtitle="Report suspicious product or batch — admin investigates and may issue a recall"
        actions={
          canReport ? (
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setReportOpen(true);
              }}
            >
              File report
            </Button>
          ) : null
        }
      />

      {!canReport ? <p className="muted">Your role cannot file counterfeit reports.</p> : null}

      {!history.length ? (
        <EmptyState title="No reports yet" description="Your filed reports and their status appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data">
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

      <Modal
        open={reportOpen}
        title="File a report"
        onClose={() => setReportOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              Submit report
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Product (optional)">
              <Select value={productId} onChange={(e) => onProductChange(e.target.value)}>
                <option value="">—</option>
                {productOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Batch (optional)">
              <Select
                value={batchId}
                onChange={(e) => onBatchChange(e.target.value)}
                disabled={!productId}
              >
                <option value="">{productId ? '—' : 'Select a product first'}</option>
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
          <div className="stack">
            {evidenceFileIds.map((fid, i) => (
              <FileUpload
                key={i}
                label={i === 0 ? 'Evidence (optional)' : `Evidence ${i + 1}`}
                value={fid}
                onChange={(id) => setEvidenceAt(i, id)}
              />
            ))}
            {evidenceFileIds.length < MAX_EVIDENCE && evidenceFileIds.some(Boolean) ? (
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setEvidenceFileIds((prev) => [...prev, undefined])}
              >
                Add another file
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

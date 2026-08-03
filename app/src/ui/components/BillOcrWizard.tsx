import { useMemo, useState } from 'react';
import type { OcrParsedLine } from '../../services/ocrService';
import {
  confirmPharmacySupplierBillOcr,
  confirmStockistBillOcr,
  matchOcrLinesToCatalogue,
  mockParseBillImage,
} from '../../services/ocrService';
import type { Business, User } from '../../domain/entities/types';
import { formatINR } from '../../domain/utils/money';
import { useUi } from '../../store/ui';
import { Button, Field, Input, PageHeader } from './primitives';

type Step = 'upload' | 'review' | 'done';

export function BillOcrWizard(props: {
  mode: 'stockist' | 'pharmacy-supplier';
  actor: User;
  business: Business;
  /** Required for pharmacy-supplier mode */
  supplierId?: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const { pushToast } = useUi();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lines, setLines] = useState<OcrParsedLine[]>([]);
  const [billTotal, setBillTotal] = useState(0);
  const [margin, setMargin] = useState('12');
  const [keepExisting, setKeepExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [doneStats, setDoneStats] = useState<{ created?: number; updated?: number; stockValue?: number; lines?: number }>(
    {},
  );

  const runScan = async () => {
    if (!fileName) {
      pushToast({ tone: 'error', title: 'Choose a bill photo first' });
      return;
    }
    setScanning(true);
    await new Promise((r) => setTimeout(r, 700));
    const parsed = mockParseBillImage({ fileName });
    let matched = parsed.lines;
    if (props.mode === 'stockist') {
      matched = await matchOcrLinesToCatalogue(props.business.id, parsed.lines);
    }
    setLines(matched);
    setBillTotal(parsed.billTotal);
    setScanning(false);
    setStep('review');
  };

  const confirm = async () => {
    setBusy(true);
    try {
      if (props.mode === 'stockist') {
        const res = await confirmStockistBillOcr({
          actor: props.actor,
          stockist: props.business,
          lines,
          marginPercent: Number(margin) || 12,
          keepExistingRates: keepExisting,
          fileName,
        });
        if (!res.ok) {
          pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
          return;
        }
        setDoneStats(res.data);
      } else {
        if (!props.supplierId) {
          pushToast({ tone: 'error', title: 'Select a supplier first' });
          return;
        }
        const res = await confirmPharmacySupplierBillOcr({
          actor: props.actor,
          pharmacy: props.business,
          supplierId: props.supplierId,
          lines,
          fileName,
          billTotal,
        });
        if (!res.ok) {
          pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
          return;
        }
        setDoneStats({ lines: res.data.lines });
      }
      setStep('done');
      props.onDone?.();
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (key: string, patch: Partial<OcrParsedLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  return (
    <div className="stack">
      <PageHeader
        title="Upload bill photo"
        subtitle={
          props.mode === 'stockist'
            ? 'OCR scan → review → update catalogue & stock'
            : 'OCR scan → review → add to pharmacy shelf'
        }
        actions={
          props.onCancel ? (
            <Button variant="secondary" onClick={props.onCancel}>
              Close
            </Button>
          ) : null
        }
      />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {(['upload', 'review', 'done'] as Step[]).map((s, i) => (
          <span
            key={s}
            className="chip"
            style={{
              opacity: step === s ? 1 : 0.5,
              fontWeight: step === s ? 600 : 400,
            }}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {step === 'upload' ? (
        <div className="card card-pad stack">
          <Field label="Bill image file name (demo OCR uses filename as seed)">
            <Input
              value={fileName}
              placeholder="cipla-invoice-jul2026.jpg"
              onChange={(e) => setFileName(e.target.value)}
            />
          </Field>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFileName(f.name);
            }}
          />
          <Button disabled={scanning || !fileName} onClick={() => void runScan()}>
            {scanning ? 'Scanning…' : 'Run OCR scan'}
          </Button>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="muted">Bill total (OCR): {formatINR(billTotal)}</span>
            {props.mode === 'stockist' ? (
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <Field label="Margin %">
                  <Input style={{ width: 80 }} value={margin} onChange={(e) => setMargin(e.target.value)} />
                </Field>
                <label className="row" style={{ gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={keepExisting} onChange={(e) => setKeepExisting(e.target.checked)} />
                  Keep existing rates
                </label>
              </div>
            ) : null}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Cost</th>
                  <th>MRP</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      <Input
                        value={l.productName}
                        onChange={(e) => updateLine(l.key, { productName: e.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        style={{ width: 72 }}
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        style={{ width: 88 }}
                        value={l.unitCost}
                        onChange={(e) => updateLine(l.key, { unitCost: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        style={{ width: 88 }}
                        value={l.mrp ?? ''}
                        onChange={(e) => updateLine(l.key, { mrp: Number(e.target.value) || undefined })}
                      />
                    </td>
                    <td>{l.isNew ? 'New' : 'Matched'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button disabled={busy || !lines.length} onClick={() => void confirm()}>
              {busy ? 'Saving…' : 'Confirm import'}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="card card-pad stack">
          <h2 style={{ margin: 0 }}>Bill imported</h2>
          {props.mode === 'stockist' ? (
            <p className="muted">
              New {doneStats.created ?? 0} · Updated {doneStats.updated ?? 0} · Stock value{' '}
              {formatINR(doneStats.stockValue ?? 0)}
            </p>
          ) : (
            <p className="muted">{doneStats.lines ?? 0} lines added to pharmacy inventory.</p>
          )}
          <div className="row" style={{ gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => {
                setStep('upload');
                setFileName('');
                setLines([]);
              }}
            >
              Import another
            </Button>
            {props.onCancel ? <Button onClick={props.onCancel}>Done</Button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Tiny live hook helper unused — kept for potential parent checks */
export function useOcrDemoSeed() {
  return useMemo(() => mockParseBillImage({ fileName: 'demo.jpg' }), []);
}

import { useMemo, useState } from 'react';
import { marginFromSale, saleFromMargin } from '../../domain/calc/pricingMargin';
import type { Business, User } from '../../domain/entities/types';
import { formatINR } from '../../domain/utils/money';
import type { OcrParsedLine } from '../../services/ocrService';
import {
  confirmPharmacySupplierBillOcr,
  confirmStockistBillOcr,
  matchOcrLinesToCatalogue,
  mockParseBillImage,
} from '../../services/ocrService';
import { upsertProduct } from '../../services/catalogueService';
import { db } from '../../data/db';
import { useUi } from '../../store/ui';
import { Button, Field, Input, Modal, PageHeader } from './primitives';

type Step = 'upload' | 'review' | 'done';

type ReviewLine = OcrParsedLine & {
  /** When false, cost/margin drive sale; flipping true after user edits Sale. */
  marginLocked: boolean;
  marginPct: number;
};

function toReviewLines(lines: OcrParsedLine[], defaultMargin: number): ReviewLine[] {
  return lines.map((l) => {
    const sale =
      l.saleRate != null && l.saleRate > 0 ? l.saleRate : saleFromMargin(l.unitCost, defaultMargin);
    return {
      ...l,
      saleRate: sale,
      marginLocked: true,
      marginPct: marginFromSale(l.unitCost, sale),
    };
  });
}

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
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [billTotal, setBillTotal] = useState(0);
  const [margin, setMargin] = useState('12');
  const [keepExisting, setKeepExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [doneStats, setDoneStats] = useState<{ created?: number; updated?: number; stockValue?: number; lines?: number }>(
    {},
  );
  const [saleRateModal, setSaleRateModal] = useState<{ id: string; name: string; ptr: number; mrp: number }[]>([]);
  const [pendingCloseAfterRates, setPendingCloseAfterRates] = useState(false);

  const defaultMargin = Number(margin) || 12;

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
    setLines(toReviewLines(matched, defaultMargin));
    setBillTotal(parsed.billTotal);
    setScanning(false);
    setStep('review');
  };

  const applyGlobalMargin = () => {
    const m = defaultMargin;
    setLines((prev) =>
      prev.map((l) => {
        const sale = saleFromMargin(l.unitCost, m);
        return { ...l, marginPct: m, saleRate: sale, marginLocked: true };
      }),
    );
  };

  const updateLine = (key: string, patch: Partial<ReviewLine>, drive?: 'sale' | 'margin' | 'cost') => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (drive === 'sale') {
          const sale = Number(next.saleRate) || 0;
          return {
            ...next,
            saleRate: sale,
            marginLocked: false,
            marginPct: marginFromSale(next.unitCost, sale),
          };
        }
        if (drive === 'margin') {
          const m = Number(next.marginPct) || 0;
          const sale = saleFromMargin(next.unitCost, m);
          return { ...next, marginPct: m, saleRate: sale, marginLocked: true };
        }
        if (drive === 'cost') {
          const cost = Number(next.unitCost) || 0;
          if (next.marginLocked) {
            const sale = saleFromMargin(cost, next.marginPct);
            return { ...next, unitCost: cost, saleRate: sale };
          }
          return {
            ...next,
            unitCost: cost,
            marginPct: marginFromSale(cost, Number(next.saleRate) || 0),
          };
        }
        return next;
      }),
    );
  };

  const finishDone = () => {
    setStep('done');
    props.onDone?.();
  };

  const openSaleRatesIfNeeded = async (productIds: string[]) => {
    if (props.mode !== 'stockist') {
      finishDone();
      return;
    }
    const needs: { id: string; name: string; ptr: number; mrp: number }[] = [];
    for (const id of productIds) {
      const p = await db.products.get(id);
      if (!p || p.ptr > 0) continue;
      needs.push({ id: p.id, name: p.name, ptr: p.ptr, mrp: p.mrp });
    }
    if (needs.length) {
      setSaleRateModal(needs);
      setPendingCloseAfterRates(true);
      return;
    }
    finishDone();
  };

  const confirm = async () => {
    setBusy(true);
    try {
      if (props.mode === 'stockist') {
        const payload: OcrParsedLine[] = lines.map(({ marginLocked: _m, marginPct: _p, ...rest }) => rest);
        const res = await confirmStockistBillOcr({
          actor: props.actor,
          stockist: props.business,
          lines: payload,
          marginPercent: defaultMargin,
          keepExistingRates: keepExisting,
          fileName,
        });
        if (!res.ok) {
          pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
          return;
        }
        setDoneStats(res.data);
        await openSaleRatesIfNeeded(res.data.productIds);
      } else {
        if (!props.supplierId) {
          pushToast({ tone: 'error', title: 'Select a supplier first' });
          return;
        }
        const payload: OcrParsedLine[] = lines.map(({ marginLocked: _m, marginPct: _p, ...rest }) => rest);
        const res = await confirmPharmacySupplierBillOcr({
          actor: props.actor,
          pharmacy: props.business,
          supplierId: props.supplierId,
          lines: payload,
          fileName,
          billTotal,
        });
        if (!res.ok) {
          pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
          return;
        }
        setDoneStats({ lines: res.data.lines });
        finishDone();
      }
    } finally {
      setBusy(false);
    }
  };

  const saveSaleRates = async () => {
    setBusy(true);
    try {
      for (const row of saleRateModal) {
        const product = await db.products.get(row.id);
        if (!product) continue;
        const ptr = Number(row.ptr) || 0;
        if (!(ptr > 0)) {
          pushToast({ tone: 'error', title: 'Sale rate required', message: `${row.name} needs PTR > 0` });
          return;
        }
        const mrp = Number(row.mrp) > 0 ? Number(row.mrp) : product.mrp;
        if (ptr > mrp) {
          pushToast({ tone: 'error', title: 'PTR exceeds MRP', message: row.name });
          return;
        }
        const res = await upsertProduct({
          actor: props.actor,
          stockist: props.business,
          productId: product.id,
          product: { ...product, ptr, mrp },
        });
        if (!res.ok) {
          pushToast({ tone: 'error', title: res.message });
          return;
        }
      }
      setSaleRateModal([]);
      if (pendingCloseAfterRates) {
        setPendingCloseAfterRates(false);
        finishDone();
      }
    } finally {
      setBusy(false);
    }
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
              <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="Margin %">
                  <Input style={{ width: 80 }} value={margin} onChange={(e) => setMargin(e.target.value)} />
                </Field>
                <Button size="sm" variant="secondary" type="button" onClick={applyGlobalMargin}>
                  Apply global margin
                </Button>
                <label className="row" style={{ gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={keepExisting} onChange={(e) => setKeepExisting(e.target.checked)} />
                  Keep existing rates
                </label>
              </div>
            ) : null}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Cost</th>
                  {props.mode === 'stockist' ? (
                    <>
                      <th>Sale (PTR)</th>
                      <th>Margin %</th>
                    </>
                  ) : null}
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
                        onChange={(e) =>
                          updateLine(l.key, { unitCost: Number(e.target.value) || 0 }, 'cost')
                        }
                      />
                    </td>
                    {props.mode === 'stockist' ? (
                      <>
                        <td>
                          <Input
                            type="number"
                            style={{ width: 88 }}
                            value={l.saleRate ?? ''}
                            onChange={(e) =>
                              updateLine(l.key, { saleRate: Number(e.target.value) || 0 }, 'sale')
                            }
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            style={{ width: 72 }}
                            value={l.marginPct}
                            onChange={(e) =>
                              updateLine(l.key, { marginPct: Number(e.target.value) || 0 }, 'margin')
                            }
                          />
                        </td>
                      </>
                    ) : null}
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

      <Modal
        open={saleRateModal.length > 0}
        title="Set sale rates"
        onClose={() => {
          /* Must set rates before closing after confirm */
        }}
        footer={
          <Button disabled={busy} onClick={() => void saveSaleRates()}>
            {busy ? 'Saving…' : 'Save sale rates'}
          </Button>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          Some products have PTR ≤ 0. Set sale rates before finishing.
        </p>
        <div className="stack" style={{ gap: 8 }}>
          {saleRateModal.map((row) => (
            <div key={row.id} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Product">
                <Input value={row.name} disabled />
              </Field>
              <Field label="Sale (PTR)">
                <Input
                  type="number"
                  style={{ width: 100 }}
                  value={row.ptr || ''}
                  onChange={(e) => {
                    const ptr = Number(e.target.value) || 0;
                    setSaleRateModal((prev) => prev.map((r) => (r.id === row.id ? { ...r, ptr } : r)));
                  }}
                />
              </Field>
              <Field label="MRP">
                <Input
                  type="number"
                  style={{ width: 100 }}
                  value={row.mrp || ''}
                  onChange={(e) => {
                    const mrp = Number(e.target.value) || 0;
                    setSaleRateModal((prev) => prev.map((r) => (r.id === row.id ? { ...r, mrp } : r)));
                  }}
                />
              </Field>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** Tiny live hook helper unused — kept for potential parent checks */
export function useOcrDemoSeed() {
  return useMemo(() => mockParseBillImage({ fileName: 'demo.jpg' }), []);
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatINR } from '../../../domain/utils/money';
import { mockParseBillImage } from '../../../services/ocrService';
import { parseQuickOrderText } from '../../../services/quickOrderService';
import {
  acceptRecommendationToCarts,
  recommendSmartOrder,
  type SmartRecommendResult,
} from '../../../services/smartOrderRecommendService';
import {
  generateSmartOrderSuggestions,
  type SmartOrderScopeFlag,
} from '../../../services/smartOrderService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Mode = 'text' | 'bill' | 'inventory';

export function PharmacySmartOrder() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('10 Dolo 650\n5 Augmentin 625\n8 Pantop 40');
  const [fileName, setFileName] = useState('');
  const [scopes, setScopes] = useState<SmartOrderScopeFlag[]>(['lowStock', 'frequent']);
  const [result, setResult] = useState<SmartRecommendResult | null>(null);
  const [picked, setPicked] = useState<'bestSingle' | 'cheapestSplit' | 'fastest'>('cheapestSplit');

  const runOptimizer = (demand: { key: string; name: string; qty: number; offlineUnitCost?: number }[], billTotal?: number) =>
    void run(async () => {
      const rec = await recommendSmartOrder({ pharmacyId: business.id, demand, billTotal });
      setResult(rec);
      if (!rec.bestSingle && !rec.cheapestSplit.items.length) {
        pushToast({ tone: 'warning', title: 'No matches', message: rec.notFound.join(', ') || 'Try different names' });
      }
    });

  const fromText = () => {
    const parsed = parseQuickOrderText(text);
    if (!parsed.length) {
      pushToast({ tone: 'error', title: 'Could not parse list' });
      return;
    }
    void runOptimizer(
      parsed.map((p, i) => ({
        key: `t-${i}`,
        name: p.phrase,
        qty: p.qty && p.qty > 0 ? p.qty : 1,
      })),
    );
  };

  const fromBill = () => {
    if (!fileName) {
      pushToast({ tone: 'error', title: 'Choose a bill photo' });
      return;
    }
    const ocr = mockParseBillImage({ fileName });
    void runOptimizer(
      ocr.lines.map((l) => ({
        key: l.key,
        name: l.productName,
        qty: l.qty,
        offlineUnitCost: l.unitCost,
      })),
      ocr.billTotal,
    );
  };

  const fromInventory = () =>
    void run(async () => {
      const res = await generateSmartOrderSuggestions({ actor: user, pharmacy: business, scopes });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      const demand = res.data
        .filter((s) => !s.unavailableReason && s.sellers[0])
        .map((s) => ({
          key: s.key,
          name: s.productName,
          qty: s.suggestedQty,
        }));
      await runOptimizer(demand);
    });

  const accept = () =>
    void run(async () => {
      if (!result) return;
      const items =
        picked === 'bestSingle'
          ? result.bestSingle?.items ?? []
          : picked === 'fastest'
            ? result.fastest.items
            : result.cheapestSplit.items;
      if (!items.length) {
        pushToast({ tone: 'error', title: 'Nothing to add' });
        return;
      }
      await acceptRecommendationToCarts({ actor: user, pharmacy: business, items });
      pushToast({ tone: 'success', title: 'Added to cart', message: `${items.length} lines across stockists` });
      navigate('/pharmacy/cart');
    });

  return (
    <div className="stack">
      <PageHeader
        title="Smart Order"
        subtitle="Paste WhatsApp list, upload last bill, or use inventory signals — we pick best stockist(s)"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/smart-order/history">
            History
          </Link>
        }
      />

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {(
          [
            ['text', 'Paste list'],
            ['bill', 'Bill photo'],
            ['inventory', 'Inventory signals'],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} variant={mode === id ? 'primary' : 'secondary'} onClick={() => setMode(id)}>
            {label}
          </Button>
        ))}
      </div>

      {mode === 'text' ? (
        <div className="card card-pad stack">
          <Field label="WhatsApp / order text">
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button disabled={busy} onClick={fromText}>
            Find best stockists
          </Button>
        </div>
      ) : null}

      {mode === 'bill' ? (
        <div className="card card-pad stack">
          <Field label="Last purchase bill photo">
            <Input value={fileName} placeholder="offline-bill.jpg" onChange={(e) => setFileName(e.target.value)} />
          </Field>
          <input type="file" accept="image/*" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
          <Button disabled={busy} onClick={fromBill}>
            OCR + compare Digi prices
          </Button>
        </div>
      ) : null}

      {mode === 'inventory' ? (
        <div className="card card-pad stack">
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {(['lowStock', 'frequent', 'nearExpiry'] as SmartOrderScopeFlag[]).map((s) => (
              <label key={s} className="row" style={{ gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() =>
                    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
                  }
                />
                {s}
              </label>
            ))}
          </div>
          <Button disabled={busy || !scopes.length} onClick={fromInventory}>
            Generate from inventory
          </Button>
        </div>
      ) : null}

      {result?.billCompare ? (
        <div className={`banner-strip ${result.billCompare.digiIsCheaper ? 'success' : 'info'}`}>
          {result.billCompare.digiIsCheaper ? (
            <>
              Buying on Digi Swasthya would have saved{' '}
              <strong>{formatINR(result.billCompare.savedAmount)}</strong> vs this bill (
              {formatINR(result.billCompare.billTotal)} → {formatINR(result.billCompare.digiBestTotal)}).
            </>
          ) : (
            <>
              Today&apos;s Digi prices ({formatINR(result.billCompare.digiBestTotal)}) are higher than this bill (
              {formatINR(result.billCompare.billTotal)}). Showing best Digi combination below.
            </>
          )}
        </div>
      ) : null}

      {result ? (
        <div className="stack">
          {result.notFound.length ? (
            <p className="muted">Not found: {result.notFound.join(', ')}</p>
          ) : null}
          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <button
              type="button"
              className="card card-pad stack"
              style={{ textAlign: 'left', border: picked === 'bestSingle' ? '2px solid var(--accent,#4A7399)' : undefined }}
              onClick={() => setPicked('bestSingle')}
            >
              <strong>Best single stockist</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                {result.bestSingle
                  ? `${result.bestSingle.stockistName} · ${result.bestSingle.coverage} items · ${formatINR(result.bestSingle.total)}`
                  : 'None'}
              </span>
            </button>
            <button
              type="button"
              className="card card-pad stack"
              style={{ textAlign: 'left', border: picked === 'cheapestSplit' ? '2px solid var(--accent,#4A7399)' : undefined }}
              onClick={() => setPicked('cheapestSplit')}
            >
              <strong>Best split</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                {result.cheapestSplit.byStockist.length} stockist(s) · {formatINR(result.cheapestSplit.total)}
                {result.cheapestSplit.savingsVsSingle > 0
                  ? ` · save ${formatINR(result.cheapestSplit.savingsVsSingle)} vs single`
                  : ''}
              </span>
            </button>
            <button
              type="button"
              className="card card-pad stack"
              style={{ textAlign: 'left', border: picked === 'fastest' ? '2px solid var(--accent,#4A7399)' : undefined }}
              onClick={() => setPicked('fastest')}
            >
              <strong>Fastest</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                {result.fastest.byStockist.length} stockist(s) · {formatINR(result.fastest.total)}
              </span>
            </button>
          </div>
          {!result.bestSingle && !result.cheapestSplit.items.length ? (
            <EmptyState title="No recommendations" description="Connect to stockists with matching catalogue." />
          ) : (
            <Button disabled={busy} onClick={accept}>
              Add selection to cart
            </Button>
          )}
        </div>
      ) : null}

      <p className="muted" style={{ fontSize: 13 }}>
        Prefer classic paste-only flow? <Link to="/pharmacy/quick-order">Quick Order</Link>
      </p>
    </div>
  );
}

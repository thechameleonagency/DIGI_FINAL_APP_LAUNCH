import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { pluralize } from '../../../domain/utils/pluralize';
import type { SmartOrderSuggestionLine } from '../../../domain/entities/types';
import {
  completeSmartOrderRun,
  generateSmartOrderSuggestions,
  type SmartOrderScopeFlag,
} from '../../../services/smartOrderService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader, Select } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const SCOPE_OPTIONS: { id: SmartOrderScopeFlag; label: string; hint: string }[] = [
  { id: 'lowStock', label: 'Low stock', hint: 'At or below reorder threshold' },
  { id: 'frequent', label: 'Frequently purchased', hint: 'Ordered in 2+ past orders' },
  { id: 'nearExpiry', label: 'Near-expiry replacements', hint: 'Replace batches nearing expiry' },
];

type EditLine = SmartOrderSuggestionLine & { include: boolean; qty: number };

export function PharmacySmartOrder() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [scopes, setScopes] = useState<SmartOrderScopeFlag[]>(['lowStock', 'frequent', 'nearExpiry']);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [manualProductId, setManualProductId] = useState('');
  const products = useLiveQuery(() => db.products.filter((p) => p.status === 'Active').toArray()) ?? [];
  const connections =
    useLiveQuery(() => db.connections.where({ pharmacyId: business.id, status: 'Active' }).toArray(), [business.id]) ??
    [];
  const catalogues = useLiveQuery(() => db.catalogues.toArray()) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];

  const manualOptions = useMemo(() => {
    const activeCat = new Set(catalogues.filter((c) => c.status === 'Active').map((c) => c.stockistId));
    const connected = new Set(connections.map((c) => c.stockistId));
    return products
      .filter((p) => connected.has(p.stockistId) && activeCat.has(p.stockistId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, connections, catalogues]);

  const stepLabels = ['Choose scope', 'Review suggestions', 'Add to cart'];

  const toggleScope = (id: SmartOrderScopeFlag) => {
    setScopes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const generate = () =>
    void run(async () => {
      const res = await generateSmartOrderSuggestions({ actor: user, pharmacy: business, scopes });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      setLines(
        res.data.map((s) => ({
          ...s,
          include: !s.unavailableReason,
          qty: s.suggestedQty,
        })),
      );
      setStep(1);
    });

  const addManual = () => {
    const p = manualOptions.find((x) => x.id === manualProductId);
    if (!p) return;
    const key = `${p.name}|${p.brand}`.toLowerCase();
    if (lines.some((l) => l.key === key)) {
      pushToast({ tone: 'info', title: 'Already on the list' });
      return;
    }
    const stockistName = stockists.find((s) => s.id === p.stockistId)?.name ?? 'Stockist';
    const seller = {
      stockistId: p.stockistId,
      stockistName,
      productId: p.id,
      ptr: p.ptr,
      available: 0,
      moq: p.moq,
      maxQty: p.maxQty,
    };
    setLines((prev) => [
      ...prev,
      {
        key,
        productName: p.name,
        brand: p.brand,
        rules: [],
        suggestedQty: p.moq,
        sellers: [seller],
        selectedStockistId: p.stockistId,
        selectedProductId: p.id,
        include: true,
        qty: p.moq,
      },
    ]);
    setManualProductId('');
  };

  const confirm = () =>
    void run(async () => {
      const suggestions: SmartOrderSuggestionLine[] = lines.map(({ include: _include, qty, ...rest }) => ({
        ...rest,
        suggestedQty: qty,
      }));
      const accept = lines
        .filter((l) => l.include && l.selectedProductId && l.selectedStockistId && !l.unavailableReason)
        .map((l) => ({
          key: l.key,
          qty: l.qty,
          stockistId: l.selectedStockistId!,
          productId: l.selectedProductId!,
        }));
      const res = await completeSmartOrderRun({
        actor: user,
        pharmacy: business,
        scopes,
        suggestions,
        accept,
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      pushToast({
        tone: 'success',
        title: 'Added to cart',
        message: `${pluralize(res.data.acceptedLines.length, 'line')}. Nothing was ordered automatically.`,
      });
      setStep(2);
    });

  return (
    <div className="stack">
      <PageHeader
        title="Smart Order"
        subtitle="Suggestions — review before ordering. Nothing is ordered automatically."
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/smart-order/history">
            History
          </Link>
        }
      />

      <ol className="wizard-steps">
        {stepLabels.map((label, i) => (
          <li key={label} className={i === step ? 'current' : i < step ? 'done' : undefined}>
            <span className="wizard-step-index">{i + 1}</span>
            <span className="wizard-step-label">{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="card card-pad stack">
          <strong>What should we suggest?</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Built from your inventory and purchase history with connected stockists only.
          </p>
          {SCOPE_OPTIONS.map((opt) => (
            <label key={opt.id} style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={scopes.includes(opt.id)} onChange={() => toggleScope(opt.id)} />
              <span>
                <strong>{opt.label}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {opt.hint}
                </div>
              </span>
            </label>
          ))}
          <div className="row">
            <Button disabled={busy || !scopes.length} onClick={() => void generate()}>
              {busy ? 'Working…' : 'Generate suggestions'}
            </Button>
            <Link className="btn btn-secondary" to="/pharmacy/buy">
              Cancel
            </Link>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="stack">
          <div className="card card-pad" style={{ borderColor: 'var(--accent)' }}>
            <strong>Suggestions — review before ordering. Nothing is ordered automatically.</strong>
          </div>

          {!lines.length ? (
            <EmptyState
              title="No suggestions this time"
              description="Inventory and purchase history did not match the selected scopes. You can add a line manually or try again later."
            />
          ) : (
            lines.map((line) => {
              const seller = line.sellers.find((s) => s.productId === line.selectedProductId) ?? line.sellers[0];
              return (
                <div key={line.key} className="card card-pad stack">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={line.include && !line.unavailableReason}
                          disabled={!!line.unavailableReason}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x) => (x.key === line.key ? { ...x, include: e.target.checked } : x)),
                            )
                          }
                        />
                        <strong>{line.productName}</strong>
                      </label>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {line.brand}
                        {line.rules.length ? ` · ${line.rules.join(' + ')}` : ' · Manual'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== line.key))}
                    >
                      Remove
                    </Button>
                  </div>
                  {line.unavailableReason ? (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {line.unavailableReason}
                    </div>
                  ) : (
                    <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <Field label="Qty">
                        <Input
                          type="number"
                          min={seller?.moq ?? 1}
                          value={line.qty}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x) => (x.key === line.key ? { ...x, qty: Number(e.target.value) } : x)),
                            )
                          }
                        />
                      </Field>
                      <Field label="Stockist">
                        <Select
                          value={line.selectedProductId ?? ''}
                          onChange={(e) => {
                            const next = line.sellers.find((s) => s.productId === e.target.value);
                            if (!next) return;
                            setLines((prev) =>
                              prev.map((x) =>
                                x.key === line.key
                                  ? {
                                      ...x,
                                      selectedProductId: next.productId,
                                      selectedStockistId: next.stockistId,
                                      qty: Math.max(x.qty, next.moq),
                                    }
                                  : x,
                              ),
                            );
                          }}
                        >
                          {line.sellers.map((s) => (
                            <option key={s.productId} value={s.productId}>
                              {s.stockistName} · {formatINR(s.ptr)} · avail {s.available}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="card card-pad stack">
            <strong>Add line manually</strong>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Connected product">
                <Select value={manualProductId} onChange={(e) => setManualProductId(e.target.value)}>
                  <option value="">Select…</option>
                  {manualOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {stockists.find((s) => s.id === p.stockistId)?.name ?? '—'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="secondary" disabled={!manualProductId} onClick={addManual}>
                Add
              </Button>
            </div>
          </div>

          <div className="row">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Working…' : 'Add accepted lines to cart'}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card card-pad stack">
          <strong>Run saved</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Suggestions were added to cart only. Continue to checkout when ready — nothing was ordered automatically.
          </p>
          <div className="row">
            <Button onClick={() => navigate('/pharmacy/cart')}>Open cart</Button>
            <Button variant="secondary" onClick={() => navigate('/pharmacy/smart-order/history')}>
              View history
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep(0);
                setLines([]);
              }}
            >
              New run
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

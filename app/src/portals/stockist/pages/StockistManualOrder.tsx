import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { pluralize } from '../../../domain/utils/pluralize';
import { recordManualOrder } from '../../../services/orderService';
import {
  matchQuickOrderLines,
  parseQuickOrderText,
  type QuickOrderSeller,
  type UnmatchedQuickLine,
} from '../../../services/quickOrderService';
import { productAvailableSellable } from '../../../domain/calc';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { SearchableSelect } from '../../../ui/components/SearchableSelect';
import { ShortcutHints } from '../../../ui/components/ShortcutHints';
import { Button, EmptyState, Field, Input, PageHeader, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type DraftLine = { productId: string; productName: string; qty: number; ptr: number; moq: number };

export function StockistManualOrder({ embedded = false }: { embedded?: boolean }) {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const managedParam = params.get('managed') ?? '';

  const connections =
    useLiveQuery(
      () => db.connections.where({ stockistId: business.id, status: 'Active' }).toArray(),
      [business.id],
    ) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const managedList =
    useLiveQuery(
      () =>
        db.managedPharmacies
          .where('stockistId')
          .equals(business.id)
          .filter((m) => m.status === 'OfflineOnly' || m.status === 'Invited' || m.status === 'Linked')
          .toArray(),
      [business.id],
    ) ?? [];
  const products =
    useLiveQuery(
      () => db.products.where('stockistId').equals(business.id).filter((p) => p.status === 'Active').toArray(),
      [business.id],
    ) ?? [];
  const batches = useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const catalogue = useLiveQuery(
    () => db.catalogues.where('stockistId').equals(business.id).first(),
    [business.id],
  );
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));

  const [target, setTarget] = useState(managedParam ? `m:${managedParam}` : '');
  const [pickProductId, setPickProductId] = useState('');
  const [pickQty, setPickQty] = useState(1);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [paste, setPaste] = useState('');
  const [unmatched, setUnmatched] = useState<UnmatchedQuickLine[]>([]);
  const [notes, setNotes] = useState('');
  const [pharmacyReady, setPharmacyReady] = useState(!!managedParam);
  const [openProduct, setOpenProduct] = useState(!!managedParam);

  const qtyRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const firstQtyRef = useRef<HTMLInputElement>(null);
  const firstUnmatchedRef = useRef<HTMLInputElement>(null);

  const activePharmacies = useMemo(
    () =>
      connections
        .map((c) => pharmacies.find((p) => p.id === c.pharmacyId))
        .filter((p): p is NonNullable<typeof p> => !!p && p.accountStatus === 'Active'),
    [connections, pharmacies],
  );

  const hasTargets = activePharmacies.length > 0 || managedList.length > 0;
  const catalogueBlocked = !catalogue || catalogue.status !== 'Active';
  const maintenanceOn = !!settings?.maintenanceMode;

  const pharmacyOptions = useMemo(
    () => [
      ...managedList.map((m) => ({
        value: `m:${m.id}`,
        label: `${m.name} · ${m.status}`,
        group: 'Managed / offline',
        keywords: m.name,
      })),
      ...activePharmacies.map((p) => ({
        value: `p:${p.id}`,
        label: `${p.name} · ${p.city}`,
        group: 'Platform connected',
        keywords: `${p.name} ${p.city}`,
      })),
    ],
    [managedList, activePharmacies],
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `${p.name} · MOQ ${p.moq} · ${formatINR(p.ptr)}`,
        keywords: `${p.name} ${p.sku} ${p.brand}`,
      })),
    [products],
  );

  const sellable: QuickOrderSeller[] = useMemo(
    () =>
      products.map((p) => ({
        stockistId: business.id,
        stockistName: business.name,
        productId: p.id,
        productName: p.name,
        brand: p.brand,
        sku: p.sku,
        ptr: p.ptr,
        moq: p.moq,
        maxQty: p.maxQty,
        available: productAvailableSellable(batches.filter((b) => b.productId === p.id)),
      })),
    [products, batches, business.id, business.name],
  );

  const addPickerLine = () => {
    const p = products.find((x) => x.id === pickProductId);
    if (!p) return;
    const qty = Math.max(pickQty, p.moq);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { productId: p.id, productName: p.name, qty, ptr: p.ptr, moq: p.moq }];
    });
    setPickProductId('');
    setPickQty(1);
    setOpenProduct(true);
  };

  const applyPaste = () => {
    const parsed = parseQuickOrderText(paste);
    const { matched, unmatched: nextUnmatched } = matchQuickOrderLines({ parsed, sellable });
    setUnmatched(nextUnmatched);
    if (nextUnmatched.length) {
      pushToast({
        tone: 'warning',
        title: `${pluralize(nextUnmatched.length, 'unmatched line')}`,
        message: 'Resolve them in the unmatched panel below — nothing was dropped silently.',
      });
    } else if (matched.length) {
      pushToast({ tone: 'success', title: `${pluralize(matched.length, 'line')} matched` });
    }
    setLines((prev) => {
      const next = [...prev];
      for (const m of matched) {
        const i = next.findIndex((l) => l.productId === m.productId);
        if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + m.qty };
        else
          next.push({
            productId: m.productId,
            productName: m.productName,
            qty: m.qty,
            ptr: m.unitPrice,
            moq: m.sellers[0]?.moq ?? 1,
          });
      }
      return next;
    });
    window.setTimeout(() => {
      if (nextUnmatched.length) firstUnmatchedRef.current?.focus();
      else firstQtyRef.current?.focus();
    }, 0);
  };

  const promoteUnmatched = (idx: number, productId: string) => {
    const u = unmatched[idx];
    const p = products.find((x) => x.id === productId);
    if (!u || !p) return;
    const qty = Math.max(u.qty || 1, p.moq);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { productId: p.id, productName: p.name, qty, ptr: p.ptr, moq: p.moq }];
    });
    setUnmatched((prev) => prev.filter((_, i) => i !== idx));
  };

  const total = lines.reduce((s, l) => s + l.qty * l.ptr, 0);

  useEffect(() => {
    if (!hasTargets || catalogueBlocked) return;
    if (!target) setPharmacyReady(true);
  }, [hasTargets, catalogueBlocked, target]);

  return (
    <div className="stack">
      {!embedded ? (
        <PageHeader
          title="Manual order"
          subtitle="Record a phone/WhatsApp order for a connected pharmacy — they can cancel while Pending"
          actions={
            <ShortcutHints
              hints={[
                { keys: 'Ctrl+O', label: 'Create order' },
                { keys: 'Enter', label: 'Pick / add line' },
                { keys: 'Ctrl+Enter', label: 'Parse paste' },
              ]}
              extra={
                <Link className="btn btn-secondary btn-sm" to="/stockist/orders">
                  Orders
                </Link>
              }
            />
          }
        />
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Record a phone/WhatsApp order for a connected pharmacy — they can cancel while Pending.
        </p>
      )}

      {!hasTargets ? (
        <EmptyState
          title="No pharmacy targets"
          description="Connect a platform pharmacy or add an offline managed pharmacy first."
          action={
            <Link className="btn btn-primary" to="/stockist/pharmacies">
              Pharmacies
            </Link>
          }
        />
      ) : catalogueBlocked ? (
        <EmptyState
          title="Catalogue not Active"
          description="Activate your catalogue before recording manual orders. Maintenance or Inactive catalogues cannot accept new lines."
          action={
            <Link className="btn btn-primary" to="/stockist/products?tab=products">
              Open catalogue
            </Link>
          }
        />
      ) : (
        <div className="card card-pad stack">
          {maintenanceOn ? (
            <div className="banner-strip warning" style={{ fontSize: 13 }}>
              Platform maintenance is on — new orders are paused until the banner clears.
            </div>
          ) : null}
          <Field label="Pharmacy">
            <SearchableSelect
              aria-label="Pharmacy"
              options={pharmacyOptions}
              value={target}
              autoOpen={pharmacyReady && !target}
              placeholder="Search pharmacy…"
              onChange={(v) => {
                setTarget(v);
                setPharmacyReady(false);
                setOpenProduct(true);
              }}
              onSelected={() => setOpenProduct(true)}
            />
          </Field>

          <strong>Product picker</strong>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Product">
              <SearchableSelect
                key={openProduct ? 'product-open' : 'product-idle'}
                aria-label="Product"
                options={productOptions}
                value={pickProductId}
                autoOpen={!!target && openProduct}
                placeholder="Search product…"
                onChange={(v) => {
                  setPickProductId(v);
                  setOpenProduct(false);
                  const p = products.find((x) => x.id === v);
                  if (p) setPickQty(p.moq);
                  window.setTimeout(() => qtyRef.current?.focus(), 0);
                }}
              />
            </Field>
            <Field label="Qty">
              <Input
                ref={qtyRef}
                type="number"
                min={1}
                value={pickQty}
                onChange={(e) => setPickQty(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pickProductId) {
                    e.preventDefault();
                    addPickerLine();
                  }
                }}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!pickProductId}
              onClick={() => {
                addPickerLine();
              }}
            >
              Add line
            </Button>
          </div>

          <strong>Or paste order text</strong>
          <Field label="Lines">
            <Textarea
              ref={pasteRef}
              rows={4}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Dolo 650 x 20\nCrocin Advance, 10'}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && paste.trim()) {
                  e.preventDefault();
                  applyPaste();
                }
              }}
            />
          </Field>
          <Button variant="secondary" disabled={!paste.trim()} onClick={applyPaste}>
            Parse into lines
          </Button>

          {unmatched.length ? (
            <div className="card card-pad stack">
              <strong>Unmatched ({unmatched.length})</strong>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                These lines did not match catalogue products. Pick a product or discard — they stay here until resolved.
              </p>
              {unmatched.map((u, idx) => (
                <div key={`${u.raw}-${idx}`} className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13 }}>{u.raw}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {u.reason}
                      {u.qty != null ? ` · qty ${u.qty}` : ''}
                    </div>
                  </div>
                  <Field label="Pick product">
                    <SearchableSelect
                      inputRef={idx === 0 ? firstUnmatchedRef : undefined}
                      aria-label={`Match ${u.raw}`}
                      options={productOptions}
                      value=""
                      placeholder="Search product…"
                      onChange={(v) => {
                        if (v) promoteUnmatched(idx, v);
                      }}
                    />
                  </Field>
                  <Button size="sm" variant="secondary" onClick={() => setUnmatched((prev) => prev.filter((_, i) => i !== idx))}>
                    Discard
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {!lines.length ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No lines yet.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>PTR</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={l.productId}>
                      <td>{l.productName}</td>
                      <td>
                        <Input
                          ref={idx === 0 ? firstQtyRef : undefined}
                          type="number"
                          min={l.moq}
                          value={l.qty}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.productId === l.productId ? { ...x, qty: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>{formatINR(l.ptr)}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Field label="Notes (optional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Phone order ref…" />
          </Field>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Est. subtotal {formatINR(total)}</strong>
            <Button
              disabled={busy || !target || !lines.length || maintenanceOn}
              onClick={() =>
                void run(async () => {
                  const managedPharmacyId = target.startsWith('m:') ? target.slice(2) : undefined;
                  const pharmacyId = target.startsWith('p:') ? target.slice(2) : undefined;
                  const res = await recordManualOrder({
                    actor: user,
                    stockist: business,
                    pharmacyId,
                    managedPharmacyId,
                    lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
                    notes: notes.trim() || undefined,
                    idempotencyKey: makeIdempotencyKey('manual-order', user.id),
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  pushToast({
                    tone: 'success',
                    title: 'Manual order recorded',
                    message: `${res.data.orderNo}${pharmacyId ? ' — pharmacy notified' : ''}`,
                  });
                  navigate(`/stockist/orders/${res.data.orderNo}`);
                })
              }
            >
              {busy ? 'Saving…' : 'Save as Pending order'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

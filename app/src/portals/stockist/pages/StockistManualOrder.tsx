import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { recordManualOrder } from '../../../services/orderService';
import {
  matchQuickOrderLines,
  parseQuickOrderText,
  type QuickOrderSeller,
} from '../../../services/quickOrderService';
import { productAvailableSellable } from '../../../domain/calc';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type DraftLine = { productId: string; productName: string; qty: number; ptr: number; moq: number };

export function StockistManualOrder() {
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

  const [target, setTarget] = useState(managedParam ? `m:${managedParam}` : '');
  const [pickProductId, setPickProductId] = useState('');
  const [pickQty, setPickQty] = useState(1);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [paste, setPaste] = useState('');
  const [notes, setNotes] = useState('');

  const activePharmacies = useMemo(
    () =>
      connections
        .map((c) => pharmacies.find((p) => p.id === c.pharmacyId))
        .filter((p): p is NonNullable<typeof p> => !!p && p.accountStatus === 'Active'),
    [connections, pharmacies],
  );

  const hasTargets = activePharmacies.length > 0 || managedList.length > 0;

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
  };

  const applyPaste = () => {
    const parsed = parseQuickOrderText(paste);
    const { matched, unmatched } = matchQuickOrderLines({ parsed, sellable });
    if (unmatched.length) {
      pushToast({
        tone: 'warning',
        title: `${unmatched.length} unmatched line(s)`,
        message: unmatched.map((u) => u.raw).slice(0, 3).join('; '),
      });
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
  };

  const total = lines.reduce((s, l) => s + l.qty * l.ptr, 0);

  return (
    <div className="stack">
      <PageHeader
        title="Manual order"
        subtitle="Record a phone/WhatsApp order for a connected pharmacy — they can cancel while Pending"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/stockist/orders">
            Orders
          </Link>
        }
      />

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
      ) : (
        <div className="card card-pad stack">
          <Field label="Pharmacy">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Select…</option>
              {managedList.length ? (
                <optgroup label="Managed / offline">
                  {managedList.map((m) => (
                    <option key={m.id} value={`m:${m.id}`}>
                      {m.name} · {m.status}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {activePharmacies.length ? (
                <optgroup label="Platform connected">
                  {activePharmacies.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.name} · {p.city}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          </Field>

          <strong>Product picker</strong>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Product">
              <Select value={pickProductId} onChange={(e) => setPickProductId(e.target.value)}>
                <option value="">Select…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · MOQ {p.moq} · {formatINR(p.ptr)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qty">
              <Input type="number" min={1} value={pickQty} onChange={(e) => setPickQty(Number(e.target.value))} />
            </Field>
            <Button variant="secondary" disabled={!pickProductId} onClick={addPickerLine}>
              Add line
            </Button>
          </div>

          <strong>Or paste text (CF-02 parser)</strong>
          <Field label="Lines">
            <Textarea
              rows={4}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Dolo 650 x 20\nCrocin Advance, 10'}
            />
          </Field>
          <Button variant="secondary" disabled={!paste.trim()} onClick={applyPaste}>
            Parse into lines
          </Button>

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
                  {lines.map((l) => (
                    <tr key={l.productId}>
                      <td>{l.productName}</td>
                      <td>
                        <Input
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
              disabled={busy || !target || !lines.length}
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

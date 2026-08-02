import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { pluralize } from '../../../domain/utils/pluralize';
import {
  confirmQuickOrder,
  resolveQuickOrder,
  type MatchedQuickLine,
  type UnmatchedQuickLine,
} from '../../../services/quickOrderService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type EditMatched = MatchedQuickLine & { include: boolean };

export function PharmacyQuickOrder() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [matched, setMatched] = useState<EditMatched[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedQuickLine[]>([]);
  const [parsed, setParsed] = useState(false);
  const products = useLiveQuery(() => db.products.filter((p) => p.status === 'Active').toArray()) ?? [];
  const connections =
    useLiveQuery(() => db.connections.where({ pharmacyId: business.id, status: 'Active' }).toArray(), [business.id]) ??
    [];
  const catalogues = useLiveQuery(() => db.catalogues.toArray()) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];

  const connectedProducts = products.filter((p) => {
    const conn = connections.some((c) => c.stockistId === p.stockistId);
    const catOk = catalogues.some((c) => c.stockistId === p.stockistId && c.status === 'Active');
    return conn && catOk;
  });

  const parse = () =>
    void run(async () => {
      const res = await resolveQuickOrder({ actor: user, pharmacy: business, text });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      setMatched(res.data.matched.map((m) => ({ ...m, include: true })));
      setUnmatched(res.data.unmatched);
      setParsed(true);
    });

  const promoteUnmatched = (idx: number, productId: string) => {
    const u = unmatched[idx];
    const p = connectedProducts.find((x) => x.id === productId);
    if (!u || !p) return;
    const stockistName = stockists.find((s) => s.id === p.stockistId)?.name ?? 'Stockist';
    const seller = {
      stockistId: p.stockistId,
      stockistName,
      productId: p.id,
      productName: p.name,
      brand: p.brand,
      sku: p.sku,
      ptr: p.ptr,
      moq: p.moq,
      maxQty: p.maxQty,
      available: 0,
    };
    setMatched((prev) => {
      const existing = prev.find((m) => m.productId === p.id);
      const qty = Math.max(u.qty ?? p.moq, p.moq);
      if (existing) {
        return prev.map((m) =>
          m.productId === p.id ? { ...m, qty: m.qty + qty, raw: `${m.raw} + ${u.raw}`, include: true } : m,
        );
      }
      return [
        ...prev,
        {
          raw: u.raw,
          phrase: u.phrase,
          qty,
          productId: p.id,
          stockistId: p.stockistId,
          productName: p.name,
          unitPrice: p.ptr,
          sellers: [seller],
          include: true,
        },
      ];
    });
    setUnmatched((prev) => prev.filter((_, i) => i !== idx));
  };

  const confirm = () =>
    void run(async () => {
      const lines = matched
        .filter((m) => m.include)
        .map((m) => ({
          productId: m.productId,
          stockistId: m.stockistId,
          qty: m.qty,
          productName: m.productName,
        }));
      const res = await confirmQuickOrder({ actor: user, pharmacy: business, lines });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      pushToast({
        tone: 'success',
        title: 'Added to cart',
        message: `${pluralize(res.data.added, 'line')}. Nothing was ordered automatically.`,
      });
      navigate('/pharmacy/cart');
    });

  return (
    <div className="stack">
      <PageHeader
        title="Quick Order"
        subtitle="Paste a product list — matched lines go to cart only. Unmatched lines are never dropped silently."
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/smart-order">
            Smart Order
          </Link>
        }
      />

      <div className="card card-pad stack">
        <Field label="Paste lines (one product per line)">
          <Textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Dolo 650 x 20\n20 Crocin\nAugmentin 625, 10'}
          />
        </Field>
        <div className="row">
          <Button disabled={busy || !text.trim()} onClick={() => void parse()}>
            {busy ? 'Working…' : 'Parse & match'}
          </Button>
          <Button variant="secondary" type="button" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </div>

      {parsed ? (
        <>
          <div className="card card-pad stack">
            <strong>Matched ({matched.length})</strong>
            {!matched.length ? (
              <EmptyState title="No matched lines" description="Use the unmatched table to pick products manually." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th />
                      <th>Product</th>
                      <th>Stockist</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((m, idx) => (
                      <tr key={`${m.productId}-${idx}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={m.include}
                            onChange={(e) =>
                              setMatched((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, include: e.target.checked } : x)),
                              )
                            }
                          />
                        </td>
                        <td>
                          <div>{m.productName}</div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {m.raw}
                          </div>
                        </td>
                        <td>
                          <Select
                            value={m.productId}
                            onChange={(e) => {
                              const next = m.sellers.find((s) => s.productId === e.target.value);
                              if (!next) return;
                              setMatched((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        productId: next.productId,
                                        stockistId: next.stockistId,
                                        productName: next.productName,
                                        unitPrice: next.ptr,
                                        qty: Math.max(x.qty, next.moq),
                                      }
                                    : x,
                                ),
                              );
                            }}
                          >
                            {m.sellers.map((s) => (
                              <option key={s.productId} value={s.productId}>
                                {s.stockistName} · {formatINR(s.ptr)}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td>
                          <Input
                            type="number"
                            min={1}
                            value={m.qty}
                            onChange={(e) =>
                              setMatched((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)),
                              )
                            }
                          />
                        </td>
                        <td>{formatINR(m.unitPrice)}</td>
                        <td>{formatINR(m.unitPrice * m.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card card-pad stack">
            <strong>Unmatched ({unmatched.length})</strong>
            {!unmatched.length ? (
              <div className="muted" style={{ fontSize: 13 }}>
                All lines matched.
              </div>
            ) : (
              unmatched.map((u, idx) => (
                <div key={`${u.raw}-${idx}`} className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13 }}>{u.raw}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {u.reason}
                    </div>
                  </div>
                  <Field label="Pick product">
                    <Select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) promoteUnmatched(idx, e.target.value);
                      }}
                    >
                      <option value="">Select…</option>
                      {connectedProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {stockists.find((s) => s.id === p.stockistId)?.name ?? '—'}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button size="sm" variant="secondary" onClick={() => setUnmatched((prev) => prev.filter((_, i) => i !== idx))}>
                    Discard
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="row">
            <Button disabled={busy || !matched.some((m) => m.include)} onClick={() => void confirm()}>
              {busy ? 'Working…' : 'Add matched to cart'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import type { RecurringOrder } from '../../../domain/entities/types';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { newId } from '../../../domain/utils/ids';
import { nowIso } from '../../../domain/utils/clock';
import { setCartLine } from '../../../services/catalogueService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatusBadge,
} from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Cadence = RecurringOrder['cadence'];

export function RecurringOrdersPanel() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const { busy, run } = useBusyAction();
  const recurring =
    useLiveQuery(() => db.recurringOrders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const connections =
    useLiveQuery(
      () => db.connections.where({ pharmacyId: business.id, status: 'Active' }).toArray(),
      [business.id],
    ) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [stockistId, setStockistId] = useState('');
  const [cadence, setCadence] = useState<Cadence>('Weekly');
  const [nextRunDate, setNextRunDate] = useState(() => localTodayKey());
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('10');
  const [lines, setLines] = useState<{ productId: string; qty: number }[]>([]);

  const connectedStockists = useMemo(
    () => stockists.filter((s) => connections.some((c) => c.stockistId === s.id)),
    [stockists, connections],
  );
  const stockistProducts = useMemo(
    () => products.filter((p) => p.stockistId === stockistId && p.status === 'Active'),
    [products, stockistId],
  );
  const stockistName = (id: string) => stockists.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  const resetForm = () => {
    setStockistId('');
    setCadence('Weekly');
    setNextRunDate(localTodayKey());
    setProductId('');
    setQty('10');
    setLines([]);
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Standing lists that fill your cart on demand — place the order when ready.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          New recurring
        </Button>
      </div>

      <Modal
        open={createOpen}
        title="New recurring order"
        onClose={() => {
          setCreateOpen(false);
          resetForm();
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !stockistId || !lines.length}
              onClick={() =>
                void run(async () => {
                  const row: RecurringOrder = {
                    id: newId(),
                    pharmacyId: business.id,
                    stockistId,
                    cadence,
                    nextRunDate,
                    lines,
                    active: true,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                  };
                  await db.recurringOrders.put(row);
                  pushToast({ tone: 'success', title: 'Recurring order saved' });
                  setCreateOpen(false);
                  resetForm();
                })
              }
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Stockist">
            <Select
              value={stockistId}
              onChange={(e) => {
                setStockistId(e.target.value);
                setLines([]);
                setProductId('');
              }}
            >
              <option value="">Select connected…</option>
              {connectedStockists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid-2">
            <Field label="Cadence">
              <Select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
                <option value="Weekly">Weekly</option>
                <option value="BiWeekly">Bi-weekly</option>
                <option value="Monthly">Monthly</option>
              </Select>
            </Field>
            <Field label="Next run">
              <Input type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Add line">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                style={{ minWidth: 180, flex: 1 }}
                disabled={!stockistId}
              >
                <option value="">Product…</option>
                {stockistProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={{ width: 88 }}
                aria-label="Qty"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!productId || !(Number(qty) > 0)}
                onClick={() => {
                  const q = Math.floor(Number(qty));
                  if (!productId || !(q > 0)) return;
                  setLines((prev) => {
                    const existing = prev.find((l) => l.productId === productId);
                    if (existing) {
                      return prev.map((l) => (l.productId === productId ? { ...l, qty: l.qty + q } : l));
                    }
                    return [...prev, { productId, qty: q }];
                  });
                  setProductId('');
                }}
              >
                Add
              </Button>
            </div>
          </Field>
          {lines.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {lines.map((l) => (
                <li key={l.productId}>
                  {productName(l.productId)} × {l.qty}{' '}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Add at least one product line.
            </p>
          )}
        </div>
      </Modal>

      {!recurring.length ? (
        <EmptyState
          title="No recurring orders"
          description="Save a standing list for a connected stockist, then fill the cart when you need it."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Create one
            </Button>
          }
        />
      ) : (
        recurring.map((r) => (
          <div key={r.id} className="card card-pad row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{stockistName(r.stockistId)}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {r.cadence} · next {r.nextRunDate} · {r.lines.length} line{r.lines.length === 1 ? '' : 's'} ·{' '}
                <StatusBadge status={r.active ? 'Active' : 'Paused'} />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {r.lines
                  .slice(0, 4)
                  .map((l) => `${productName(l.productId)}×${l.qty}`)
                  .join(', ')}
                {r.lines.length > 4 ? '…' : ''}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !r.active}
                onClick={() =>
                  void run(async () => {
                    let okCount = 0;
                    for (const line of r.lines) {
                      const res = await setCartLine({
                        actor: user,
                        pharmacy: business,
                        stockistId: r.stockistId,
                        productId: line.productId,
                        qty: line.qty,
                      });
                      if (res.ok) okCount += 1;
                    }
                    pushToast({
                      tone: okCount === r.lines.length ? 'success' : 'warning',
                      title: `Cart filled (${okCount}/${r.lines.length})`,
                    });
                    if (okCount) navigate('/pharmacy/cart');
                  })
                }
              >
                Fill cart
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await db.recurringOrders.update(r.id, { active: !r.active, updatedAt: nowIso() });
                    pushToast({ tone: 'info', title: r.active ? 'Paused' : 'Resumed' });
                  })
                }
              >
                {r.active ? 'Pause' : 'Resume'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await db.recurringOrders.delete(r.id);
                    pushToast({ tone: 'info', title: 'Recurring order removed' });
                  })
                }
              >
                Delete
              </Button>
              <Link className="btn btn-ghost btn-sm" to={`/pharmacy/buy/${r.stockistId}`}>
                Catalogue
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

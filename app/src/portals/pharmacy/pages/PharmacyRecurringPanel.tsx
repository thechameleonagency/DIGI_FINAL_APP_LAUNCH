import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import type { RecurringOrder } from '../../../domain/entities/types';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { parseNumberInput } from '../../../domain/utils/validation';
import {
  buildRecurringOrder,
  deleteRecurringOrder,
  fillCartFromRecurring,
  isRecurringDue,
  upsertRecurringOrder,
} from '../../../services/recurringOrderService';
import { useUi } from '../../../store/ui';
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

type DraftLine = { productId: string; qty: string };

export function PharmacyRecurringPanel() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const today = localTodayKey();

  const recurring =
    useLiveQuery(() => db.recurringOrders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ??
    [];
  const connections =
    useLiveQuery(
      () => db.connections.where('pharmacyId').equals(business.id).filter((c) => c.status === 'Active').toArray(),
      [business.id],
    ) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];

  const stockistName = (id: string) => stockists.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const connectedStockistIds = useMemo(() => new Set(connections.map((c) => c.stockistId)), [connections]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringOrder | null>(null);
  const [stockistId, setStockistId] = useState('');
  const [cadence, setCadence] = useState<RecurringOrder['cadence']>('Weekly');
  const [nextRunDate, setNextRunDate] = useState(today);
  const [note, setNote] = useState('');
  const [active, setActive] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', qty: '10' }]);

  const stockistProducts = useMemo(
    () => products.filter((p) => p.stockistId === stockistId && p.status === 'Active' && p.listedForSale !== false),
    [products, stockistId],
  );

  function openCreate() {
    setEditing(null);
    const first = connections[0]?.stockistId ?? '';
    setStockistId(first);
    setCadence('Weekly');
    setNextRunDate(today);
    setNote('');
    setActive(true);
    setLines([{ productId: '', qty: '10' }]);
    setOpen(true);
  }

  function openEdit(row: RecurringOrder) {
    setEditing(row);
    setStockistId(row.stockistId);
    setCadence(row.cadence);
    setNextRunDate(row.nextRunDate.slice(0, 10));
    setNote(row.note ?? '');
    setActive(row.active);
    setLines(row.lines.map((l) => ({ productId: l.productId, qty: String(l.qty) })));
    setOpen(true);
  }

  async function save() {
    const parsedLines: { productId: string; qty: number }[] = [];
    for (const line of lines) {
      if (!line.productId) continue;
      const qtyParsed = parseNumberInput(line.qty);
      if (qtyParsed.status !== 'ok' || qtyParsed.value <= 0) {
        pushToast({ tone: 'error', title: 'Enter a valid quantity for each line' });
        return;
      }
      parsedLines.push({ productId: line.productId, qty: qtyParsed.value });
    }
    if (!stockistId) {
      pushToast({ tone: 'error', title: 'Pick a stockist' });
      return;
    }
    if (!parsedLines.length) {
      pushToast({ tone: 'error', title: 'Add at least one product line' });
      return;
    }
    if (!nextRunDate) {
      pushToast({ tone: 'error', title: 'Next run date is required' });
      return;
    }
    const row = buildRecurringOrder({
      pharmacyId: business.id,
      stockistId,
      cadence,
      nextRunDate,
      lines: parsedLines,
      active,
      note: note.trim() || undefined,
      existing: editing ?? undefined,
    });
    await upsertRecurringOrder(row);
    pushToast({ tone: 'success', title: editing ? 'Recurring order updated' : 'Recurring order created' });
    setOpen(false);
  }

  async function runFill(row: RecurringOrder, requireDue: boolean) {
    const res = await fillCartFromRecurring({
      actor: user,
      pharmacy: business,
      recurringId: row.id,
      requireDue,
    });
    if (!res.ok) {
      pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
      return;
    }
    pushToast({
      tone: res.data.failed.length ? 'info' : 'success',
      title: `Cart filled — ${res.data.filled} line${res.data.filled === 1 ? '' : 's'}`,
      message: res.data.failed.length
        ? `Skipped: ${res.data.failed.join(', ')}. Review cart to place.`
        : 'Review cart to place — no order was submitted.',
    });
    navigate('/pharmacy/cart');
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Due runs fill the cart only — you still review and place the order.
        </p>
        <Button size="sm" onClick={openCreate} disabled={!connections.length}>
          New recurring
        </Button>
      </div>

      {!recurring.length ? (
        <EmptyState
          title="No recurring orders"
          description="Schedule weekly, bi-weekly, or monthly carts from a connected stockist."
          action={
            connections.length ? (
              <Button onClick={openCreate}>Create recurring</Button>
            ) : (
              <Link className="btn btn-primary" to="/pharmacy/connections">
                Open Circle
              </Link>
            )
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Stockist</th>
                <th>Cadence</th>
                <th>Next run</th>
                <th>Lines</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => {
                const due = isRecurringDue(r, today);
                return (
                  <tr key={r.id}>
                    <td>{stockistName(r.stockistId)}</td>
                    <td>{r.cadence}</td>
                    <td>
                      {r.nextRunDate.slice(0, 10)}
                      {due ? (
                        <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                          Due
                        </span>
                      ) : null}
                    </td>
                    <td>{r.lines.length}</td>
                    <td>
                      <StatusBadge status={r.active ? 'Active' : 'Inactive'} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {due ? (
                          <Button size="sm" onClick={() => void runFill(r, true)}>
                            Run due
                          </Button>
                        ) : null}
                        <Button size="sm" variant="secondary" onClick={() => void runFill(r, false)}>
                          Fill cart
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await deleteRecurringOrder(r.id);
                            pushToast({ tone: 'success', title: 'Recurring order deleted' });
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? 'Edit recurring order' : 'New recurring order'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Stockist">
            <Select
              value={stockistId}
              onChange={(e) => {
                setStockistId(e.target.value);
                setLines([{ productId: '', qty: '10' }]);
              }}
            >
              <option value="">Select…</option>
              {stockists
                .filter((s) => connectedStockistIds.has(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid-2">
            <Field label="Cadence">
              <Select value={cadence} onChange={(e) => setCadence(e.target.value as RecurringOrder['cadence'])}>
                <option value="Weekly">Weekly</option>
                <option value="BiWeekly">Bi-weekly</option>
                <option value="Monthly">Monthly</option>
              </Select>
            </Field>
            <Field label="Next run">
              <Input type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Standing reorder" />
          </Field>
          <Field label="Active">
            <Select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </Select>
          </Field>
          <strong style={{ fontSize: 13 }}>Lines</strong>
          {lines.map((line, idx) => (
            <div key={idx} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <Field label={idx === 0 ? 'Product' : `Product ${idx + 1}`}>
                  <Select
                    value={line.productId}
                    onChange={(e) =>
                      setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, productId: e.target.value } : l)))
                    }
                  >
                    <option value="">Select…</option>
                    {stockistProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div style={{ width: 88 }}>
                <Field label={idx === 0 ? 'Qty' : 'Qty'}>
                  <Input
                    value={line.qty}
                    onChange={(e) =>
                      setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))
                    }
                    inputMode="numeric"
                  />
                </Field>
              </div>
              {lines.length > 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setLines((prev) => [...prev, { productId: '', qty: '10' }])}>
            Add line
          </Button>
        </div>
      </Modal>
    </div>
  );
}

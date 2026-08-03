import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { expiryRiskBand, lowStock } from '../../../domain/calc';
import { newId } from '../../../domain/utils/ids';
import { nextNumberFieldValue, parseNumberInput } from '../../../domain/utils/validation';
import { stockAdd, stockAdjust } from '../../../services/inventoryService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { ShortcutHints } from '../../../ui/components/ShortcutHints';
import { Button, EmptyState, Field, Input, Kpi, LoadingState, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyInventory() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canAdjust = useCan('inventory.adjust');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const productSelectRef = useRef<HTMLSelectElement>(null);
  const { items, loading: itemsLoading } = useLiveArray(
    () => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const products =
    useLiveQuery(async () => {
      const conns = await db.connections.where({ pharmacyId: business.id, status: 'Active' }).toArray();
      const allowed = new Set(conns.map((c) => c.stockistId));
      if (!allowed.size) return [];
      const all = await db.products.toArray();
      return all.filter((p) => p.status === 'Active' && allowed.has(p.stockistId));
    }, [business.id]) ?? [];
  const movements =
    useLiveQuery(() => db.inventoryMovements.where('businessId').equals(business.id).reverse().sortBy('at'), [business.id]) ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [showMovements, setShowMovements] = useState(false);
  const [form, setForm] = useState<{
    productId: string;
    productName: string;
    qty: number | '';
    batchNumber: string;
    expiryDate: string;
    mrp: string;
    reason: string;
  }>({
    productId: '',
    productName: '',
    qty: 10,
    batchNumber: '',
    expiryDate: '',
    mrp: '',
    reason: 'Manual stock-in',
  });
  const [adjDelta, setAdjDelta] = useState('-1');
  const [adjReason, setAdjReason] = useState('');
  const [addErrors, setAddErrors] = useState<{
    productName?: string;
    batchNumber?: string;
    expiryDate?: string;
    mrp?: string;
    qty?: string;
    reason?: string;
  }>({});
  const [adjErrors, setAdjErrors] = useState<{ delta?: string; reason?: string }>({});

  useEffect(() => {
    if (params.get('new') !== '1' || !canAdjust) return;
    setAddOpen(true);
    navigate('/pharmacy/inventory', { replace: true });
  }, [params, canAdjust, navigate]);

  const rows = useMemo(
    () =>
      items.map((i) => {
        const band = i.expiryDate ? expiryRiskBand(i.expiryDate) : 'Healthy';
        const flag =
          i.onHand <= 0
            ? 'zero'
            : band === 'Expired'
              ? 'expired'
              : band === 'Critical' || band === 'Near'
                ? 'near-expiry'
                : lowStock(i.onHand)
                  ? 'low'
                  : 'ok';
        return { ...i, band, flag };
      }),
    [items],
  );

  const initialFlag = params.get('filter') ?? '';
  const columns = useMemo(
    () => [
      { key: 'productName', label: 'Product', getValue: (r: (typeof rows)[0]) => r.productName },
      { key: 'batchNumber', label: 'Batch', getValue: (r: (typeof rows)[0]) => r.batchNumber ?? '—' },
      { key: 'expiryDate', label: 'Expiry', getValue: (r: (typeof rows)[0]) => r.expiryDate ?? '—' },
      { key: 'onHand', label: 'On hand', getValue: (r: (typeof rows)[0]) => r.onHand },
      {
        key: 'mrp',
        label: 'MRP',
        getValue: (r: (typeof rows)[0]) => r.mrp ?? '',
        render: (r: (typeof rows)[0]) => (r.mrp != null ? String(r.mrp) : '—'),
      },
      {
        key: 'band',
        label: 'Band',
        getValue: (r: (typeof rows)[0]) => r.band,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.band} />,
      },
      {
        key: 'flag',
        label: 'Flag',
        getValue: (r: (typeof rows)[0]) => r.flag,
        render: (r: (typeof rows)[0]) => (r.flag !== 'ok' ? <StatusBadge status={r.flag} /> : '—'),
      },
      ...(canAdjust
        ? [
            {
              key: 'actions',
              label: '',
              getValue: () => '',
              render: (r: (typeof rows)[0]) => (
                <div className="row">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAdjustId(r.id);
                      setAdjDelta('-1');
                      setAdjReason('');
                    }}
                  >
                    Adjust
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={r.onHand <= 0}
                    onClick={() => {
                      setAdjustId(r.id);
                      setAdjDelta(String(-r.onHand));
                      setAdjReason('Write-off');
                    }}
                  >
                    Write off
                  </Button>
                </div>
              ),
            },
          ]
        : []),
    ],
    [canAdjust],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.productName} ${r.batchNumber ?? ''} ${r.expiryDate ?? ''} ${r.flag}`],
    filters: [
      {
        key: 'flag',
        label: 'Filter',
        options: [
          { value: 'low', label: 'Low stock' },
          { value: 'expired', label: 'Expired' },
          { value: 'near-expiry', label: 'Near expiry' },
          { value: 'zero', label: 'Zero' },
        ],
      },
    ],
    defaultSortKey: 'expiryDate',
    defaultSortDir: 'asc',
    initialFilters: initialFlag ? { flag: initialFlag } : undefined,
  });

  const kpis = {
    skus: items.length,
    low: rows.filter((r) => r.flag === 'low').length,
    near: rows.filter((r) => r.flag === 'near-expiry' || r.flag === 'expired').length,
    units: items.reduce((s, i) => s + i.onHand, 0),
  };

  const adjustItem = adjustId ? items.find((i) => i.id === adjustId) : undefined;

  return (
    <div className="stack">
      <PageHeader
        title="Inventory"
        subtitle="GRN stock-in plus manual add / adjust / write-off"
        actions={
          <div className="row">
            {canAdjust ? <ShortcutHints hints={[{ keys: 'Ctrl+Shift+A', label: 'Add medicine' }]} /> : null}
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/expiry">
              Expiry
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setShowMovements((v) => !v)}>
              {showMovements ? 'Hide movements' : 'Movements'}
            </Button>
            {canAdjust ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                Add medicine
              </Button>
            ) : null}
          </div>
        }
      />

      {!itemsLoading && items.length ? (
        <div className="kpi-grid">
          <Kpi label="SKUs" value={kpis.skus} />
          <Kpi label="Low stock" value={kpis.low} />
          <Kpi label="Expiring / expired" value={kpis.near} />
          <Kpi label="Units on hand" value={kpis.units} />
        </div>
      ) : null}

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddErrors({});
        }}
        title="Add medicine"
        initialFocusRef={productSelectRef}
        footer={
          <Button
            onClick={async () => {
              const name = form.productName.trim() || products.find((p) => p.id === form.productId)?.name;
              const productId = form.productId || `manual-${newId()}`;
              const next: typeof addErrors = {};
              if (!name) next.productName = 'Product name required';
              if (!form.batchNumber.trim()) next.batchNumber = 'Batch is required';
              if (!form.expiryDate) next.expiryDate = 'Expiry is required';
              if (form.qty === '' || !(form.qty > 0)) next.qty = 'Quantity must be greater than zero';
              if (!form.reason.trim()) next.reason = 'Reason is required';
              const mrpParsed = parseNumberInput(form.mrp);
              if (mrpParsed.status === 'invalid' || (mrpParsed.status === 'ok' && mrpParsed.value < 0)) {
                next.mrp = 'MRP must be a non-negative number';
              }
              if (Object.keys(next).length) {
                setAddErrors(next);
                return;
              }
              const res = await stockAdd({
                actor: user,
                pharmacy: business,
                productId,
                productName: name!,
                qty: form.qty as number,
                batchNumber: form.batchNumber.trim(),
                expiryDate: form.expiryDate,
                mrp: mrpParsed.status === 'ok' ? mrpParsed.value : undefined,
                reason: form.reason,
              });
              if (res.ok) {
                pushToast({ tone: 'success', title: 'Stock added' });
                setAddOpen(false);
                setAddErrors({});
                setForm({ productId: '', productName: '', qty: 10, batchNumber: '', expiryDate: '', mrp: '', reason: 'Manual stock-in' });
              } else {
                pushToast({ tone: 'error', title: res.message });
              }
            }}
          >
            Save stock
          </Button>
        }
      >
        <div className="stack">
          <Field label="Catalogue product (optional)">
            <Select
              ref={productSelectRef}
              value={form.productId}
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  productId: e.target.value,
                  productName: p?.name ?? f.productName,
                  mrp: p ? String(p.mrp) : f.mrp,
                }));
                setAddErrors((err) => ({ ...err, productName: undefined }));
              }}
            >
              <option value="">Manual entry…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Product name" error={addErrors.productName}>
            <Input
              value={form.productName}
              onChange={(e) => {
                setForm((f) => ({ ...f, productName: e.target.value }));
                setAddErrors((err) => ({ ...err, productName: undefined }));
              }}
            />
          </Field>
          <div className="grid-2">
            <Field label="Qty" error={addErrors.qty}>
              <Input
                type="number"
                value={form.qty}
                onChange={(e) => {
                  setForm((f) => ({ ...f, qty: nextNumberFieldValue(e.target.value, f.qty) }));
                  setAddErrors((err) => ({ ...err, qty: undefined }));
                }}
              />
            </Field>
            <Field label="MRP" error={addErrors.mrp}>
              <Input
                value={form.mrp}
                onChange={(e) => {
                  setForm((f) => ({ ...f, mrp: e.target.value }));
                  setAddErrors((err) => ({ ...err, mrp: undefined }));
                }}
              />
            </Field>
            <Field label="Batch" error={addErrors.batchNumber}>
              <Input
                value={form.batchNumber}
                onChange={(e) => {
                  setForm((f) => ({ ...f, batchNumber: e.target.value }));
                  setAddErrors((err) => ({ ...err, batchNumber: undefined }));
                }}
              />
            </Field>
            <Field label="Expiry" error={addErrors.expiryDate}>
              <Input
                type="date"
                value={form.expiryDate}
                onChange={(e) => {
                  setForm((f) => ({ ...f, expiryDate: e.target.value }));
                  setAddErrors((err) => ({ ...err, expiryDate: undefined }));
                }}
              />
            </Field>
          </div>
          <Field label="Reason" error={addErrors.reason}>
            <Input
              value={form.reason}
              onChange={(e) => {
                setForm((f) => ({ ...f, reason: e.target.value }));
                setAddErrors((err) => ({ ...err, reason: undefined }));
              }}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!adjustItem}
        onClose={() => {
          setAdjustId(null);
          setAdjErrors({});
        }}
        title={adjustItem ? `Adjust ${adjustItem.productName}` : 'Adjust'}
        footer={
          <Button
            onClick={async () => {
              if (!adjustItem) return;
              const deltaParsed = parseNumberInput(adjDelta);
              const next: typeof adjErrors = {};
              if (deltaParsed.status === 'empty') next.delta = 'Delta is required';
              else if (deltaParsed.status === 'invalid' || deltaParsed.value === 0) {
                next.delta = 'Enter a non-zero adjustment';
              }
              if (!adjReason.trim()) next.reason = 'Reason is required';
              if (Object.keys(next).length || deltaParsed.status !== 'ok') {
                setAdjErrors(next);
                return;
              }
              const res = await stockAdjust({
                actor: user,
                pharmacy: business,
                inventoryId: adjustItem.id,
                delta: deltaParsed.value,
                reason: adjReason,
              });
              if (res.ok) {
                pushToast({ tone: 'success', title: 'Stock updated' });
                setAdjustId(null);
                setAdjErrors({});
              } else if (res.code === 'STOCK_REASON') {
                setAdjErrors({ reason: res.message });
              } else if (res.code === 'STOCK_NEG') {
                setAdjErrors({ delta: res.message });
              } else {
                pushToast({ tone: 'error', title: res.message });
              }
            }}
          >
            Save adjustment
          </Button>
        }
      >
        <div className="stack">
          <div className="muted" style={{ fontSize: 13 }}>
            On hand {adjustItem?.onHand}. Use negative delta to remove / write off.
          </div>
          <Field label="Delta (+/−)" error={adjErrors.delta}>
            <Input
              type="number"
              value={adjDelta}
              onChange={(e) => {
                setAdjDelta(e.target.value);
                setAdjErrors((err) => ({ ...err, delta: undefined }));
              }}
            />
          </Field>
          <Field label="Reason *" error={adjErrors.reason}>
            <Input
              value={adjReason}
              onChange={(e) => {
                setAdjReason(e.target.value);
                setAdjErrors((err) => ({ ...err, reason: undefined }));
              }}
              placeholder="e.g. Damaged, expired, count correction"
            />
          </Field>
        </div>
      </Modal>

      {itemsLoading ? (
        <LoadingState label="Loading inventory…" />
      ) : !items.length ? (
        <EmptyState
          title="Inventory empty"
          description="Receive an order (GRN) or add stock to start tracking."
          action={
            <div className="row">
              {canAdjust ? <Button onClick={() => setAddOpen(true)}>Add medicine</Button> : null}
              <Link className="btn btn-secondary" to="/pharmacy/orders">
                View orders
              </Link>
              <Link className="btn btn-secondary" to="/pharmacy/connections">
                Connect stockist
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search product / batch"
            filters={[
              {
                key: 'flag',
                label: 'Filter',
                options: [
                  { value: 'low', label: 'Low stock' },
                  { value: 'expired', label: 'Expired' },
                  { value: 'near-expiry', label: 'Near expiry' },
                  { value: 'zero', label: 'Zero' },
                ],
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              const ok = list.doExport(`pharmacy-inventory-${business.id}.csv`);
              pushToast(ok ? { tone: 'success', title: 'Exported inventory' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable loading={itemsLoading} columns={columns.filter((c) => c.key !== 'flag')} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}

      {showMovements ? (
        !movements.length ? (
          <EmptyState title="No movements" description="GRN, add medicine, and adjustments create movement rows." />
        ) : (
          <div className="card card-pad">
            <strong>Movement history</strong>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Prev → New</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 100).map((m) => (
                    <tr key={m.id}>
                      <td className="muted">{new Date(m.at).toLocaleString()}</td>
                      <td>{m.type}</td>
                      <td>{items.find((i) => i.productId === m.productId)?.productName ?? m.productId.slice(0, 8)}</td>
                      <td>{m.qty}</td>
                      <td>
                        {m.prevQty} → {m.newQty}
                      </td>
                      <td>{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

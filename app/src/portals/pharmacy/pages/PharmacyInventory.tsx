import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { expiryRiskBand, lowStock } from '../../../domain/calc';
import { newId } from '../../../domain/utils/ids';
import { stockAdd, stockAdjust } from '../../../services/inventoryService';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Kpi, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyInventory() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const [params] = useSearchParams();
  const items = useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const movements =
    useLiveQuery(() => db.inventoryMovements.where('businessId').equals(business.id).reverse().sortBy('at'), [business.id]) ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [showMovements, setShowMovements] = useState(false);
  const [form, setForm] = useState({
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
      {
        key: 'actions',
        label: '',
        getValue: () => '',
        render: (r: (typeof rows)[0]) => (
          <div className="row">
            <Button size="sm" variant="ghost" onClick={() => { setAdjustId(r.id); setAdjDelta('-1'); setAdjReason(''); }}>
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
    ],
    [],
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
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/expiry">
              Expiry
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setShowMovements((v) => !v)}>
              {showMovements ? 'Hide movements' : 'Movements'}
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              Add medicine
            </Button>
          </div>
        }
      />

      <div className="kpi-grid">
        <Kpi label="SKUs" value={kpis.skus} />
        <Kpi label="Low stock" value={kpis.low} />
        <Kpi label="Expiring / expired" value={kpis.near} />
        <Kpi label="Units on hand" value={kpis.units} />
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add medicine"
        footer={
          <Button
            onClick={async () => {
              const name = form.productName.trim() || products.find((p) => p.id === form.productId)?.name;
              const productId = form.productId || `manual-${newId()}`;
              if (!name) {
                pushToast({ tone: 'error', title: 'Product name required' });
                return;
              }
              if (!form.expiryDate || !form.batchNumber.trim()) {
                pushToast({ tone: 'error', title: 'Batch and expiry are required' });
                return;
              }
              const res = await stockAdd({
                actor: user,
                pharmacy: business,
                productId,
                productName: name,
                qty: form.qty,
                batchNumber: form.batchNumber.trim(),
                expiryDate: form.expiryDate,
                reason: form.mrp ? `${form.reason} (MRP ${form.mrp})` : form.reason,
              });
              pushToast(res.ok ? { tone: 'success', title: 'Stock added' } : { tone: 'error', title: res.message });
              if (res.ok) {
                setAddOpen(false);
                setForm({ productId: '', productName: '', qty: 10, batchNumber: '', expiryDate: '', mrp: '', reason: 'Manual stock-in' });
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
              value={form.productId}
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  productId: e.target.value,
                  productName: p?.name ?? f.productName,
                  mrp: p ? String(p.mrp) : f.mrp,
                }));
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
          <Field label="Product name">
            <Input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} />
          </Field>
          <div className="grid-2">
            <Field label="Qty">
              <Input type="number" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} />
            </Field>
            <Field label="MRP">
              <Input value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} />
            </Field>
            <Field label="Batch">
              <Input value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} />
            </Field>
            <Field label="Expiry">
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </Field>
          </div>
          <Field label="Reason">
            <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!adjustItem}
        onClose={() => setAdjustId(null)}
        title={adjustItem ? `Adjust ${adjustItem.productName}` : 'Adjust'}
        footer={
          <Button
            onClick={async () => {
              if (!adjustItem) return;
              const res = await stockAdjust({
                actor: user,
                pharmacy: business,
                inventoryId: adjustItem.id,
                delta: Number(adjDelta),
                reason: adjReason,
              });
              pushToast(res.ok ? { tone: 'success', title: 'Stock updated' } : { tone: 'error', title: res.message });
              if (res.ok) setAdjustId(null);
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
          <Field label="Delta (+/−)">
            <Input type="number" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} />
          </Field>
          <Field label="Reason">
            <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Required" />
          </Field>
        </div>
      </Modal>

      {!items.length ? (
        <EmptyState
          title="Inventory empty"
          description="Receive an order (GRN) or add stock to start tracking."
          action={
            <div className="row">
              <Button onClick={() => setAddOpen(true)}>Add medicine</Button>
              <Link className="btn btn-secondary" to="/pharmacy/orders">
                View orders
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
          <DataListTable columns={columns.filter((c) => c.key !== 'flag')} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
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

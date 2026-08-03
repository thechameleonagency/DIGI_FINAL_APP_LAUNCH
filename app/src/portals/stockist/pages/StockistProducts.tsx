import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import type { ScheduleType } from '../../../domain/entities/types';
import { formatINR } from '../../../domain/utils/money';
import { parseNumberInput } from '../../../domain/utils/validation';
import { bulkUpdatePrices, upsertProduct } from '../../../services/catalogueService';
import { matchCounterfeitAlerts } from '../../../services/counterfeitService';
import { stockIn } from '../../../services/inventoryService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { BillOcrWizard } from '../../../ui/components/BillOcrWizard';
import { Button, EmptyState, Field, Input, Modal, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { StockistCatalogue } from './StockistCatalogue';
import { useBiz } from './useBiz';

type Tab = 'products' | 'batches' | 'price' | 'import';

export function StockistProducts() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canManage = useCan('catalogue.manage');
  const canStock = useCan('inventory.adjust');
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'products';
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  const products =
    useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const batches =
    useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMode, setBulkMode] = useState<'percent' | 'absolute'>('percent');
  const [bulkField, setBulkField] = useState<'ptr' | 'mrp'>('ptr');
  const [bulkValue, setBulkValue] = useState('5');
  const [bulkDirection, setBulkDirection] = useState<'increase' | 'decrease'>('increase');
  const [showOcr, setShowOcr] = useState(false);
  const [stockForm, setStockForm] = useState({ productId: '', batchNumber: '', expiryDate: '', qty: '10', cost: '' });

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const previewRows = useMemo(() => {
    const v = Number(bulkValue) || 0;
    const sign = bulkDirection === 'increase' ? 1 : -1;
    return products
      .filter((p) => selectedIds.includes(p.id))
      .map((p) => {
        const current = bulkField === 'ptr' ? p.ptr : p.mrp;
        const next =
          bulkMode === 'percent'
            ? Math.round((current * (1 + (sign * v) / 100)) * 100) / 100
            : Math.round((current + sign * v) * 100) / 100;
        return { id: p.id, name: p.name, current, next, delta: next - current };
      });
  }, [products, selectedIds, bulkMode, bulkField, bulkValue, bulkDirection]);

  useEffect(() => {
    if (params.get('new') === '1') setTab('products');
  }, [params]);

  const toggleListed = async (productId: string, listed: boolean) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const res = await upsertProduct({
      actor: user,
      stockist: business,
      productId,
      product: { ...p, listedForSale: listed },
    });
    if (!res.ok) pushToast({ tone: 'error', title: res.message });
  };

  const setSchedule = async (productId: string, scheduleType: ScheduleType) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const alerts = await matchCounterfeitAlerts(p.name);
    if (alerts.length) {
      pushToast({
        tone: 'warning',
        title: 'Counterfeit alert match',
        message: alerts.map((a) => a.productName).join(', '),
      });
    }
    const res = await upsertProduct({
      actor: user,
      stockist: business,
      productId,
      product: { ...p, scheduleType, narcotic: scheduleType === 'NDPS' },
    });
    if (!res.ok) pushToast({ tone: 'error', title: res.message });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Products"
        subtitle="Catalogue + inventory — listed for sale toggle, batches, price tools, OCR import"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn btn-secondary btn-sm" to="/stockist/price-history">
              Price history
            </Link>
            <Link className="btn btn-secondary btn-sm" to="/stockist/movements">
              Movements
            </Link>
          </div>
        }
      />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {(
          [
            ['products', 'Products'],
            ['batches', 'Batches'],
            ['price', 'Price tools'],
            ['import', 'Import / OCR'],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} variant={tab === id ? 'primary' : 'secondary'} onClick={() => setTab(id)}>
            {label}
          </Button>
        ))}
      </div>

      {tab === 'products' ? (
        <div className="stack">
          <p className="muted" style={{ fontSize: 13 }}>
            Quick sellable + schedule controls. Full add/edit/CSV form follows below.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th />
                  <th>Product</th>
                  <th>PTR</th>
                  <th>For sale</th>
                  <th>Schedule</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 50).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selected[p.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                      />
                    </td>
                    <td>
                      <div>{p.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.sku} · {p.brand}
                      </div>
                    </td>
                    <td>
                      <Money value={p.ptr} />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={p.listedForSale !== false}
                        onChange={(e) => void toggleListed(p.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <Select
                        value={p.scheduleType ?? (p.narcotic ? 'NDPS' : 'NONE')}
                        disabled={!canManage}
                        onChange={(e) => void setSchedule(p.id, e.target.value as ScheduleType)}
                      >
                        {['NONE', 'H', 'H1', 'X', 'NDPS'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StockistCatalogue />
        </div>
      ) : null}

      {tab === 'batches' ? (
        <div className="stack">
          {canStock ? (
            <div className="card card-pad stack">
              <strong>Stock in</strong>
              <div className="grid-2">
                <Field label="Product">
                  <Select
                    value={stockForm.productId}
                    onChange={(e) => setStockForm((f) => ({ ...f, productId: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Batch">
                  <Input
                    value={stockForm.batchNumber}
                    onChange={(e) => setStockForm((f) => ({ ...f, batchNumber: e.target.value }))}
                  />
                </Field>
                <Field label="Expiry">
                  <Input
                    type="date"
                    value={stockForm.expiryDate}
                    onChange={(e) => setStockForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  />
                </Field>
                <Field label="Qty">
                  <Input
                    value={stockForm.qty}
                    onChange={(e) => setStockForm((f) => ({ ...f, qty: e.target.value }))}
                  />
                </Field>
              </div>
              <Button
                onClick={async () => {
                  const qtyParsed = parseNumberInput(stockForm.qty);
                  const costParsed = parseNumberInput(stockForm.cost);
                  const qty = qtyParsed.status === 'ok' ? qtyParsed.value : 0;
                  const res = await stockIn({
                    actor: user,
                    stockist: business,
                    productId: stockForm.productId,
                    batchNumber: stockForm.batchNumber,
                    expiryDate: stockForm.expiryDate,
                    qty,
                    cost: costParsed.status === 'ok' ? costParsed.value : undefined,
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  pushToast({ tone: 'success', title: 'Stock added' });
                  setStockForm({ productId: '', batchNumber: '', expiryDate: '', qty: '10', cost: '' });
                }}
              >
                Add stock
              </Button>
            </div>
          ) : null}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>On hand</th>
                  <th>Reserved</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{products.find((p) => p.id === b.productId)?.name ?? b.productId}</td>
                    <td>{b.batchNumber}</td>
                    <td>{b.expiryDate}</td>
                    <td>{b.onHand}</td>
                    <td>{b.reserved}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link className="btn btn-secondary btn-sm" to="/stockist/inventory">
            Open classic inventory page
          </Link>
        </div>
      ) : null}

      {tab === 'price' ? (
        <div className="card card-pad stack">
          <strong>Bulk price update with preview</strong>
          <p className="muted" style={{ fontSize: 13 }}>Select products on the Products tab, then preview and apply.</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Select value={bulkField} onChange={(e) => setBulkField(e.target.value as 'ptr' | 'mrp')}>
              <option value="ptr">PTR</option>
              <option value="mrp">MRP</option>
            </Select>
            <Select value={bulkDirection} onChange={(e) => setBulkDirection(e.target.value as 'increase' | 'decrease')}>
              <option value="increase">Increase</option>
              <option value="decrease">Decrease</option>
            </Select>
            <Select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as 'percent' | 'absolute')}>
              <option value="percent">Percent</option>
              <option value="absolute">Flat ₹</option>
            </Select>
            <Input style={{ width: 96 }} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
            <Button
              variant="secondary"
              onClick={() => {
                const all: Record<string, boolean> = {};
                for (const p of products) all[p.id] = true;
                setSelected(all);
              }}
            >
              Select all
            </Button>
          </div>
          {previewRows.length === 0 ? (
            <EmptyState title="No selection" description="Tick products on the Products tab." />
          ) : (
            <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current</th>
                  <th>New</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{formatINR(r.current)}</td>
                    <td>{formatINR(r.next)}</td>
                    <td style={{ color: r.delta >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                      {formatINR(r.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Button
            disabled={!canManage || !previewRows.length}
            onClick={async () => {
              const v = Number(bulkValue) || 0;
              const signed = bulkDirection === 'increase' ? v : -v;
              const res = await bulkUpdatePrices({
                actor: user,
                stockist: business,
                productIds: selectedIds,
                mode: bulkMode,
                value: signed,
                field: bulkField,
              });
              if (!res.ok) {
                pushToast({ tone: 'error', title: res.message });
                return;
              }
              pushToast({ tone: 'success', title: `Updated ${res.data.updated} products` });
            }}
          >
            Apply to {previewRows.length} products
          </Button>
        </div>
      ) : null}

      {tab === 'import' ? (
        <div className="stack">
          <div className="card card-pad stack">
            <strong>Bill OCR import</strong>
            <p className="muted" style={{ fontSize: 13 }}>
              Upload → review → confirm creates/updates products and stock-in batches.
            </p>
            <Button onClick={() => setShowOcr(true)}>Open OCR wizard</Button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            CSV import remains in the Products tab editor (Catalogue form).
          </p>
        </div>
      ) : null}

      <Modal open={showOcr} onClose={() => setShowOcr(false)} title="Bill OCR">
        <BillOcrWizard
          mode="stockist"
          actor={user}
          business={business}
          onCancel={() => setShowOcr(false)}
          onDone={() => pushToast({ tone: 'success', title: 'Bill imported' })}
        />
      </Modal>
    </div>
  );
}

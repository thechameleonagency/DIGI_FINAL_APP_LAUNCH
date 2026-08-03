import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import type { Scheme } from '../../../domain/entities/types';
import { formatINR } from '../../../domain/utils/money';
import { parseNumberInput } from '../../../domain/utils/validation';
import { newId } from '../../../domain/utils/ids';
import { localTodayKey } from '../../../domain/utils/dateKeys';
import { parseCsvTable } from '../../../domain/utils/csv';
import { bulkUpdatePrices, importProductsCsv } from '../../../services/catalogueService';
import { deleteScheme, upsertScheme } from '../../../services/deliveryCommerceService';
import { stockIn } from '../../../services/inventoryService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { BillOcrWizard } from '../../../ui/components/BillOcrWizard';
import { ListPageChrome } from '../../../ui/components/ListPageChrome';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Select,
  StatusBadge,
  TabPanel,
} from '../../../ui/components/primitives';
import { StockistProductList } from './StockistProductList';
import { useBiz } from './useBiz';

type Tab = 'products' | 'batches' | 'price' | 'import' | 'schemes';

export function StockistProducts() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canManage = useCan('catalogue.manage');
  const canStock = useCan('inventory.adjust');
  const [params, setParams] = useSearchParams();
  const tab = ((params.get('tab') as Tab) || 'products') as Tab;
  const filter = params.get('filter') ?? '';

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    if (t !== 'batches') next.delete('filter');
    setParams(next, { replace: true });
  };

  const products =
    useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const batches =
    useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const schemes =
    useLiveQuery(() => db.schemes.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMode, setBulkMode] = useState<'percent' | 'absolute'>('percent');
  const [bulkField, setBulkField] = useState<'ptr' | 'mrp'>('ptr');
  const [bulkValue, setBulkValue] = useState('5');
  const [bulkDirection, setBulkDirection] = useState<'increase' | 'decrease'>('increase');
  const [showOcr, setShowOcr] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [stockForm, setStockForm] = useState({
    productId: '',
    batchNumber: '',
    expiryDate: '',
    qty: '10',
    cost: '',
  });
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [schemeEditing, setSchemeEditing] = useState<Scheme | null>(null);
  const [schemeForm, setSchemeForm] = useState({
    title: '',
    scope: 'product' as Scheme['scope'],
    productId: '',
    sku: '',
    category: '',
    discountType: 'percent' as Scheme['discountType'],
    discountValue: '5',
    startsOn: localTodayKey(),
    endsOn: localTodayKey(),
    active: true,
  });

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

  const filteredBatches = useMemo(() => {
    const today = new Date();
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    return batches.filter((b) => {
      if (filter === 'low') {
        const p = products.find((x) => x.id === b.productId);
        const reorder = p?.reorderLevel ?? 0;
        return b.onHand - b.reserved <= reorder;
      }
      if (filter === 'near-expiry') {
        const exp = new Date(b.expiryDate);
        return exp <= in30 && exp >= today;
      }
      return true;
    });
  }, [batches, filter, products]);

  useEffect(() => {
    if (params.get('new') === '1') setTab('products');
  }, [params]);

  return (
    <ListPageChrome
      title="Products"
      subtitle="Sellable catalogue, batches, price tools, schemes, and bill import"
      actions={
        <div className="row">
          <Link className="btn btn-secondary btn-sm" to="/stockist/price-history">
            Price history
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/stockist/movements">
            Movements
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/stockist/products?tab=batches&filter=near-expiry">
            Near expiry
          </Link>
        </div>
      }
      tabs={[
        { id: 'products', label: 'Products' },
        { id: 'batches', label: 'Batches' },
        { id: 'price', label: 'Price' },
        { id: 'import', label: 'Import' },
        { id: 'schemes', label: 'Schemes' },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as Tab)}
    >
      <TabPanel id="products" active={tab === 'products'}>
        <StockistProductList embedded />
      </TabPanel>

      <TabPanel id="batches" active={tab === 'batches'}>
        <div className="stack">
          <div className="row">
            <Button size="sm" variant={!filter ? 'primary' : 'secondary'} onClick={() => {
              const next = new URLSearchParams(params);
              next.set('tab', 'batches');
              next.delete('filter');
              setParams(next, { replace: true });
            }}>
              All
            </Button>
            <Button size="sm" variant={filter === 'low' ? 'primary' : 'secondary'} onClick={() => {
              const next = new URLSearchParams(params);
              next.set('tab', 'batches');
              next.set('filter', 'low');
              setParams(next, { replace: true });
            }}>
              Low stock
            </Button>
            <Button size="sm" variant={filter === 'near-expiry' ? 'primary' : 'secondary'} onClick={() => {
              const next = new URLSearchParams(params);
              next.set('tab', 'batches');
              next.set('filter', 'near-expiry');
              setParams(next, { replace: true });
            }}>
              Near expiry
            </Button>
          </div>

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
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
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

          {!filteredBatches.length ? (
            <EmptyState title="No batches" description={filter ? 'No batches match this filter.' : 'Stock in to create batches.'} />
          ) : (
            <div className="table-wrap queue-responsive">
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="cell-num">On hand</th>
                    <th className="cell-num">Reserved</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.map((b) => (
                    <tr key={b.id}>
                      <td>{products.find((p) => p.id === b.productId)?.name ?? b.productId}</td>
                      <td>{b.batchNumber}</td>
                      <td>{b.expiryDate}</td>
                      <td className="cell-num">{b.onHand}</td>
                      <td className="cell-num">{b.reserved}</td>
                      <td>
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TabPanel>

      <TabPanel id="price" active={tab === 'price'}>
        <div className="card card-pad stack">
          <strong>Bulk price update</strong>
          <p className="muted">Select products below, preview, then apply. Writes PriceChange audit.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Select value={bulkField} onChange={(e) => setBulkField(e.target.value as 'ptr' | 'mrp')}>
              <option value="ptr">PTR</option>
              <option value="mrp">MRP</option>
            </Select>
            <Select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as 'percent' | 'absolute')}>
              <option value="percent">Percent</option>
              <option value="absolute">Flat ₹</option>
            </Select>
            <Select
              value={bulkDirection}
              onChange={(e) => setBulkDirection(e.target.value as 'increase' | 'decrease')}
            >
              <option value="increase">Increase</option>
              <option value="decrease">Decrease</option>
            </Select>
            <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={{ width: 88 }} />
          </div>
          <div className="table-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>Product</th>
                  <th className="cell-num">PTR</th>
                  <th className="cell-num">MRP</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selected[p.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                      />
                    </td>
                    <td>{p.name}</td>
                    <td className="cell-num">
                      <Money value={p.ptr} />
                    </td>
                    <td className="cell-num">
                      <Money value={p.mrp} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previewRows.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="cell-num">Current</th>
                    <th className="cell-num">New</th>
                    <th className="cell-num">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td className="cell-num">{formatINR(r.current)}</td>
                      <td className="cell-num">{formatINR(r.next)}</td>
                      <td className="cell-num">{formatINR(r.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No selection" description="Tick products to preview price changes." />
          )}
          <Button
            disabled={!canManage || !previewRows.length}
            onClick={async () => {
              if (bulkMode === 'percent') {
                const v = Number(bulkValue) || 0;
                const signed = bulkDirection === 'increase' ? v : -v;
                const res = await bulkUpdatePrices({
                  actor: user,
                  stockist: business,
                  productIds: previewRows.map((r) => r.id),
                  mode: 'percent',
                  value: signed,
                  field: bulkField,
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message });
                  return;
                }
                pushToast({ tone: 'success', title: `Updated ${res.data.updated} products` });
              } else {
                let updated = 0;
                for (const r of previewRows) {
                  const p = products.find((x) => x.id === r.id);
                  if (!p) continue;
                  const res = await bulkUpdatePrices({
                    actor: user,
                    stockist: business,
                    productIds: [r.id],
                    mode: 'absolute',
                    value: r.next,
                    field: bulkField,
                  });
                  if (res.ok) updated += res.data.updated;
                }
                pushToast({ tone: 'success', title: `Updated ${updated} products` });
              }
              setSelected({});
            }}
          >
            Apply prices
          </Button>
        </div>
      </TabPanel>

      <TabPanel id="import" active={tab === 'import'}>
        <div className="stack">
          <div className="card card-pad stack">
            <strong>CSV import</strong>
            <p className="muted">Paste CSV (name,sku,brand,category,packSize,mrp,ptr,gstPercent,moq,pricingClass).</p>
            <Field label="CSV">
              <textarea
                className="input"
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="name,sku,..."
              />
            </Field>
            <Button
              disabled={!canManage || !csvText.trim()}
              onClick={async () => {
                const table = parseCsvTable(csvText);
                if (!table.header.length || !table.rows.length) {
                  pushToast({ tone: 'error', title: 'CSV empty or invalid' });
                  return;
                }
                const idx = (name: string) => table.header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
                const rows = table.rows.map((cells) => ({
                  name: cells[idx('name')] ?? '',
                  sku: cells[idx('sku')] ?? '',
                  brand: cells[idx('brand')] ?? '',
                  category: cells[idx('category')] ?? 'General',
                  packSize: cells[idx('packSize')] ?? cells[idx('pack')] ?? '1',
                  mrp: Number(cells[idx('mrp')] ?? 0),
                  ptr: Number(cells[idx('ptr')] ?? 0),
                  gstPercent: Number(cells[idx('gstPercent')] ?? 12),
                  moq: Number(cells[idx('moq')] ?? 1),
                  pricingClass: (cells[idx('pricingClass')] === 'Ethical' ? 'Ethical' : 'Generic') as
                    | 'Generic'
                    | 'Ethical',
                }));
                const res = await importProductsCsv({
                  actor: user,
                  stockist: business,
                  rows,
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message });
                  return;
                }
                pushToast({
                  tone: 'success',
                  title: `Imported ${res.data.succeeded.length}`,
                  message: res.data.failed.length ? `${res.data.failed.length} failed` : undefined,
                });
                setCsvText('');
              }}
            >
              Import CSV
            </Button>
          </div>
          <div className="card card-pad stack">
            <strong>Purchase bill OCR</strong>
            <p className="muted">Upload → review → confirm stock-in and optional list-for-sale.</p>
            <Button onClick={() => setShowOcr(true)}>Upload bill</Button>
          </div>
        </div>
      </TabPanel>

      <TabPanel id="schemes" active={tab === 'schemes'}>
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Non-stackable discounts applied at cart and order place. Inactive or expired schemes are ignored.
            </p>
            <Button
              size="sm"
              disabled={!canManage}
              onClick={() => {
                setSchemeEditing(null);
                setSchemeForm({
                  title: '',
                  scope: 'product',
                  productId: products[0]?.id ?? '',
                  sku: products[0]?.sku ?? '',
                  category: products[0]?.category ?? '',
                  discountType: 'percent',
                  discountValue: '5',
                  startsOn: localTodayKey(),
                  endsOn: localTodayKey(),
                  active: true,
                });
                setSchemeOpen(true);
              }}
            >
              New scheme
            </Button>
          </div>
          {!schemes.length ? (
            <EmptyState
              title="No schemes yet"
              description="Create percent or flat discounts by product, SKU, or category."
              action={
                canManage ? (
                  <Button
                    onClick={() => {
                      setSchemeEditing(null);
                      setSchemeForm({
                        title: '',
                        scope: 'product',
                        productId: products[0]?.id ?? '',
                        sku: products[0]?.sku ?? '',
                        category: products[0]?.category ?? '',
                        discountType: 'percent',
                        discountValue: '5',
                        startsOn: localTodayKey(),
                        endsOn: localTodayKey(),
                        active: true,
                      });
                      setSchemeOpen(true);
                    }}
                  >
                    Create scheme
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Scope</th>
                    <th>Discount</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {schemes.map((s) => {
                    const scopeLabel =
                      s.scope === 'product'
                        ? products.find((p) => p.id === s.productId)?.name ?? s.productId?.slice(0, 8) ?? 'Product'
                        : s.scope === 'sku'
                          ? s.sku ?? 'SKU'
                          : s.category ?? 'Category';
                    return (
                      <tr key={s.id}>
                        <td>{s.title}</td>
                        <td>
                          {s.scope}: {scopeLabel}
                        </td>
                        <td>
                          {s.discountType === 'percent' ? `${s.discountValue}%` : formatINR(s.discountValue)}
                        </td>
                        <td>
                          {s.startsOn.slice(0, 10)} → {s.endsOn.slice(0, 10)}
                        </td>
                        <td>
                          <StatusBadge status={s.active ? 'Active' : 'Inactive'} />
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!canManage}
                              onClick={() => {
                                setSchemeEditing(s);
                                setSchemeForm({
                                  title: s.title,
                                  scope: s.scope,
                                  productId: s.productId ?? '',
                                  sku: s.sku ?? '',
                                  category: s.category ?? '',
                                  discountType: s.discountType,
                                  discountValue: String(s.discountValue),
                                  startsOn: s.startsOn.slice(0, 10),
                                  endsOn: s.endsOn.slice(0, 10),
                                  active: s.active,
                                });
                                setSchemeOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!canManage}
                              onClick={async () => {
                                await deleteScheme(s.id);
                                pushToast({ tone: 'success', title: 'Scheme deleted' });
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
        </div>
      </TabPanel>

      <Modal open={showOcr} onClose={() => setShowOcr(false)} title="Bill OCR import">
        <BillOcrWizard
          mode="stockist"
          actor={user}
          business={business}
          onDone={() => {
            setShowOcr(false);
            pushToast({ tone: 'success', title: 'Bill import complete' });
          }}
        />
      </Modal>

      <Modal
        open={schemeOpen}
        title={schemeEditing ? 'Edit scheme' : 'New scheme'}
        onClose={() => setSchemeOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSchemeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canManage}
              onClick={async () => {
                const disc = parseNumberInput(schemeForm.discountValue);
                if (!schemeForm.title.trim()) {
                  pushToast({ tone: 'error', title: 'Title is required' });
                  return;
                }
                if (disc.status !== 'ok' || disc.value <= 0) {
                  pushToast({ tone: 'error', title: 'Enter a positive discount' });
                  return;
                }
                if (schemeForm.discountType === 'percent' && disc.value > 100) {
                  pushToast({ tone: 'error', title: 'Percent discount cannot exceed 100' });
                  return;
                }
                if (!schemeForm.startsOn || !schemeForm.endsOn) {
                  pushToast({ tone: 'error', title: 'Start and end dates are required' });
                  return;
                }
                if (schemeForm.scope === 'product' && !schemeForm.productId) {
                  pushToast({ tone: 'error', title: 'Pick a product' });
                  return;
                }
                if (schemeForm.scope === 'sku' && !schemeForm.sku.trim()) {
                  pushToast({ tone: 'error', title: 'SKU is required' });
                  return;
                }
                if (schemeForm.scope === 'category' && !schemeForm.category.trim()) {
                  pushToast({ tone: 'error', title: 'Category is required' });
                  return;
                }
                const row: Scheme = {
                  id: schemeEditing?.id ?? newId(),
                  stockistId: business.id,
                  title: schemeForm.title.trim(),
                  scope: schemeForm.scope,
                  productId: schemeForm.scope === 'product' ? schemeForm.productId : undefined,
                  sku: schemeForm.scope === 'sku' ? schemeForm.sku.trim() : undefined,
                  category: schemeForm.scope === 'category' ? schemeForm.category.trim() : undefined,
                  discountType: schemeForm.discountType,
                  discountValue: disc.value,
                  startsOn: schemeForm.startsOn.slice(0, 10),
                  endsOn: schemeForm.endsOn.slice(0, 10),
                  active: schemeForm.active,
                  stackable: false,
                };
                await upsertScheme(row);
                pushToast({ tone: 'success', title: schemeEditing ? 'Scheme updated' : 'Scheme created' });
                setSchemeOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Title">
            <Input
              value={schemeForm.title}
              onChange={(e) => setSchemeForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Launch 5% off"
            />
          </Field>
          <div className="grid-2">
            <Field label="Scope">
              <Select
                value={schemeForm.scope}
                onChange={(e) => setSchemeForm((f) => ({ ...f, scope: e.target.value as Scheme['scope'] }))}
              >
                <option value="product">Product</option>
                <option value="sku">SKU</option>
                <option value="category">Category</option>
              </Select>
            </Field>
            <Field label="Active">
              <Select
                value={schemeForm.active ? '1' : '0'}
                onChange={(e) => setSchemeForm((f) => ({ ...f, active: e.target.value === '1' }))}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </Select>
            </Field>
          </div>
          {schemeForm.scope === 'product' ? (
            <Field label="Product">
              <Select
                value={schemeForm.productId}
                onChange={(e) => setSchemeForm((f) => ({ ...f, productId: e.target.value }))}
              >
                <option value="">Select…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {schemeForm.scope === 'sku' ? (
            <Field label="SKU">
              <Input
                value={schemeForm.sku}
                onChange={(e) => setSchemeForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </Field>
          ) : null}
          {schemeForm.scope === 'category' ? (
            <Field label="Category">
              <Input
                value={schemeForm.category}
                onChange={(e) => setSchemeForm((f) => ({ ...f, category: e.target.value }))}
                list="scheme-categories"
              />
              <datalist id="scheme-categories">
                {[...new Set(products.map((p) => p.category).filter(Boolean))].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          ) : null}
          <div className="grid-2">
            <Field label="Discount type">
              <Select
                value={schemeForm.discountType}
                onChange={(e) =>
                  setSchemeForm((f) => ({ ...f, discountType: e.target.value as Scheme['discountType'] }))
                }
              >
                <option value="percent">Percent</option>
                <option value="flat">Flat (₹)</option>
              </Select>
            </Field>
            <Field label="Discount value">
              <Input
                value={schemeForm.discountValue}
                onChange={(e) => setSchemeForm((f) => ({ ...f, discountValue: e.target.value }))}
                inputMode="decimal"
              />
            </Field>
            <Field label="Starts">
              <Input
                type="date"
                value={schemeForm.startsOn}
                onChange={(e) => setSchemeForm((f) => ({ ...f, startsOn: e.target.value }))}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="date"
                value={schemeForm.endsOn}
                onChange={(e) => setSchemeForm((f) => ({ ...f, endsOn: e.target.value }))}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </ListPageChrome>
  );
}

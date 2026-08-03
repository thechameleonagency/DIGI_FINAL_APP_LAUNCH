import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { applyReferenceFill, matchMedicineReference } from '../../../content/medicineReference';
import { parseCsvTable } from '../../../domain/utils/csv';
import { catalogueFieldLabel } from '../../../domain/utils/humanLabels';
import { parseNumberInput } from '../../../domain/utils/validation';
import {
  bulkUpdatePrices,
  importProductsCsv,
  setCatalogueStatus,
  setProductStatus,
  upsertProduct,
} from '../../../services/catalogueService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { ShortcutHints } from '../../../ui/components/ShortcutHints';
import { Button, DeleteButton, EmptyState, Field, Input, Modal, Money, PageHeader, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const emptyForm = {
  name: '',
  sku: '',
  brand: '',
  category: '',
  packSize: '',
  mrp: '' as number | '',
  ptr: '' as number | '',
  gstPercent: '' as number | '',
  moq: 5,
  maxQty: undefined as number | undefined,
  hsn: '',
  reorderLevel: undefined as number | undefined,
  purchaseRate: undefined as number | undefined,
  manufacturer: '',
  genericName: '',
  composition: '',
  description: '',
  pricingClass: 'Generic' as 'Generic' | 'Ethical',
  rxRequired: false,
  narcotic: false,
};

const CSV_TEMPLATE =
  'name,sku,brand,category,packSize,mrp,ptr,gstPercent,moq,pricingClass\nExample Cap,EX-CAP-001,ExampleBrand,Capsules,10 Cap,80,55,12,5,Generic\n';

export function StockistCatalogue() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const canManage = useCan('catalogue.manage');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const highlightId = params.get('highlight');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { items: products, loading: productsLoading } = useLiveArray(
    () => db.products.where('stockistId').equals(business.id).toArray(),
    [business.id],
  );
  const catalogue = useLiveQuery(() => db.catalogues.where('stockistId').equals(business.id).first(), [business.id]);
  const [csv, setCsv] = useState(CSV_TEMPLATE);
  const [importReport, setImportReport] = useState<{
    succeeded: string[];
    failed: { sku: string; reason: string }[];
    skipped: number;
    skippedDetails: string[];
    headerError?: string;
  } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | undefined>();
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMode, setBulkMode] = useState<'percent' | 'absolute'>('percent');
  const [bulkField, setBulkField] = useState<'ptr' | 'mrp'>('ptr');
  const [bulkValue, setBulkValue] = useState('5');
  const [discontinueId, setDiscontinueId] = useState<string | null>(null);
  const discontinueTarget = discontinueId ? products.find((p) => p.id === discontinueId) : undefined;
  const [pendingCatalogueStatus, setPendingCatalogueStatus] = useState<'Active' | 'Maintenance' | 'Inactive' | null>(
    null,
  );

  const closeProductModal = () => {
    setProductModalOpen(false);
    setEditId(undefined);
    setForm(emptyForm);
  };

  useEffect(() => {
    if (params.get('new') !== '1' || !canManage) return;
    setEditId(undefined);
    setForm(emptyForm);
    setProductModalOpen(true);
    navigate('/stockist/catalogue', { replace: true });
  }, [params, canManage, navigate]);

  const carts =
    useLiveQuery(() => db.carts.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmaciesWithCartLines = carts.filter((c) => (c.lines?.length ?? 0) > 0).length;
  const activePharmacyConnections =
    useLiveQuery(
      () => db.connections.where({ stockistId: business.id, status: 'Active' }).count(),
      [business.id],
    ) ?? 0;

  const columns = useMemo(
    () => [
      ...(canManage
        ? [
            {
              key: 'pick',
              label: '',
              getValue: () => '',
              render: (p: (typeof products)[0]) => (
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                />
              ),
            },
          ]
        : []),
      { key: 'name', label: 'Name', getValue: (p: (typeof products)[0]) => p.name },
      { key: 'sku', label: 'SKU', getValue: (p: (typeof products)[0]) => p.sku },
      { key: 'category', label: 'Category', getValue: (p: (typeof products)[0]) => p.category },
      { key: 'ptr', label: 'PTR', getValue: (p: (typeof products)[0]) => p.ptr, render: (p: (typeof products)[0]) => <span className="cell-num"><Money value={p.ptr} /></span> },
      {
        key: 'pricingClass',
        label: 'Class',
        getValue: (p: (typeof products)[0]) => p.pricingClass ?? 'Generic',
      },
      {
        key: 'gstPercent',
        label: 'GST',
        getValue: (p: (typeof products)[0]) => p.gstPercent,
        render: (p: (typeof products)[0]) => `${p.gstPercent}%`,
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (p: (typeof products)[0]) => p.status,
        render: (p: (typeof products)[0]) => <StatusBadge status={p.status} />,
      },
      ...(canManage
        ? [
            {
              key: 'actions',
              label: 'Actions',
              getValue: () => '',
              render: (p: (typeof products)[0]) => (
                <div className="table-row-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditId(p.id);
                      setForm({
                        name: p.name,
                        sku: p.sku,
                        brand: p.brand,
                        category: p.category,
                        packSize: p.packSize,
                        mrp: p.mrp,
                        ptr: p.ptr,
                        gstPercent: p.gstPercent,
                        moq: p.moq,
                        maxQty: p.maxQty,
                        hsn: p.hsn ?? '',
                        reorderLevel: p.reorderLevel,
                        purchaseRate: p.purchaseRate,
                        manufacturer: p.manufacturer ?? '',
                        genericName: p.genericName ?? '',
                        composition: p.composition ?? '',
                        description: p.description ?? '',
                        pricingClass: p.pricingClass ?? 'Generic',
                        rxRequired: !!p.rxRequired,
                        narcotic: !!p.narcotic,
                      });
                      setProductModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  {p.status === 'Active' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const res = await setProductStatus({
                          actor: user,
                          stockist: business,
                          productId: p.id,
                          status: 'Inactive',
                        });
                        pushToast(res.ok ? { tone: 'info', title: 'Deactivated' } : { tone: 'error', title: res.message });
                      }}
                    >
                      Deactivate
                    </Button>
                  ) : null}
                  {p.status === 'Inactive' || p.status === 'Discontinued' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const res = await setProductStatus({
                          actor: user,
                          stockist: business,
                          productId: p.id,
                          status: 'Active',
                        });
                        pushToast(res.ok ? { tone: 'success', title: 'Reactivated' } : { tone: 'error', title: res.message });
                      }}
                    >
                      Reactivate
                    </Button>
                  ) : null}
                  {p.status !== 'Discontinued' ? (
                    <DeleteButton size="sm" showIcon={false} onClick={() => setDiscontinueId(p.id)}>
                      Discontinue
                    </DeleteButton>
                  ) : null}
                </div>
              ),
            },
          ]
        : []),
    ],
    [selected, user, business, pushToast, canManage],
  );

  const list = useListControls(products, {
    columns,
    searchKeys: [(p) => `${p.name} ${p.sku} ${p.brand} ${p.category} ${p.id}`],
    filters: [
      {
        key: 'category',
        label: 'Category',
        options: [...new Set(products.map((p) => p.category))].map((c) => ({ value: c, label: c })),
      },
      {
        key: 'status',
        label: 'Status',
        options: ['Active', 'Inactive', 'Discontinued'].map((s) => ({ value: s, label: s })),
      },
    ],
    defaultSortKey: 'name',
    defaultSortDir: 'asc',
  });

  useEffect(() => {
    if (!highlightId || !products.length) return;
    const hit = products.find((p) => p.id === highlightId);
    if (!hit) return;
    list.setQuery(hit.name);
  }, [highlightId, products]);

  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => {
      document.querySelector(`[data-row-id="${highlightId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [highlightId, list.pageRows]);

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([id]) => id);

  const bulkPreview = useMemo(() => {
    const n = Number(bulkValue);
    if (!Number.isFinite(n) || !selectedIds.length) return [];
    return products
      .filter((p) => selected[p.id])
      .slice(0, 40)
      .map((p) => {
        const before = bulkField === 'ptr' ? p.ptr : p.mrp;
        const after =
          bulkMode === 'percent' ? Math.round(before * (1 + n / 100) * 100) / 100 : n;
        return { id: p.id, name: p.name, before, after };
      });
  }, [products, selected, selectedIds.length, bulkField, bulkMode, bulkValue]);

  return (
    <div className="stack">
      <ConfirmDialog
        open={!!discontinueTarget}
        title="Discontinue product?"
        tone="danger"
        confirmLabel="Discontinue"
        body={
          discontinueTarget ? (
            <p>
              <strong>{discontinueTarget.name}</strong> ({discontinueTarget.sku}) will be discontinued and hidden from
              buyers. You can Reactivate later from the catalogue if needed.
            </p>
          ) : null
        }
        onClose={() => setDiscontinueId(null)}
        onConfirm={async () => {
          if (!discontinueTarget) return;
          const res = await setProductStatus({
            actor: user,
            stockist: business,
            productId: discontinueTarget.id,
            status: 'Discontinued',
          });
          pushToast(res.ok ? { tone: 'warning', title: 'Discontinued' } : { tone: 'error', title: res.message });
          if (res.ok) setDiscontinueId(null);
        }}
      />
      <ConfirmDialog
        open={!!pendingCatalogueStatus}
        title="Change catalogue status?"
        tone={pendingCatalogueStatus && pendingCatalogueStatus !== 'Active' ? 'danger' : 'primary'}
        confirmLabel={`Set catalogue to ${pendingCatalogueStatus ?? ''}`}
        body={
          pendingCatalogueStatus ? (
            <div className="stack" style={{ gap: 8 }}>
              <p>
                Catalogue will change from <strong>{catalogue?.status}</strong> to{' '}
                <strong>{pendingCatalogueStatus}</strong>.
              </p>
              {pendingCatalogueStatus !== 'Active' ? (
                <p>
                  This blocks browsing and carting for connected pharmacies (
                  {activePharmacyConnections} active connection
                  {activePharmacyConnections === 1 ? '' : 's'}).{' '}
                  {pharmaciesWithCartLines > 0
                    ? `${pharmaciesWithCartLines} pharmac${pharmaciesWithCartLines === 1 ? 'y has' : 'ies have'} carts with you right now.`
                    : 'No pharmacies currently have cart lines with you.'}
                </p>
              ) : (
                <p>Catalogue will become available for browsing and ordering again.</p>
              )}
            </div>
          ) : null
        }
        onClose={() => setPendingCatalogueStatus(null)}
        onConfirm={async () => {
          if (!pendingCatalogueStatus) return;
          const res = await setCatalogueStatus({
            actor: user,
            stockist: business,
            status: pendingCatalogueStatus,
          });
          pushToast(
            res.ok
              ? { tone: 'success', title: `Catalogue ${pendingCatalogueStatus}` }
              : { tone: 'error', title: res.message },
          );
          if (res.ok) setPendingCatalogueStatus(null);
        }}
      />
      <PageHeader
        title="Catalogue"
        subtitle={`${products.length} products`}
        actions={
          <div className="row">
            {canManage ? (
              <>
                <ShortcutHints hints={[{ keys: 'Ctrl+Shift+A', label: 'Add product' }]} />
                <Button
                  size="sm"
                  onClick={() => {
                    setEditId(undefined);
                    setForm(emptyForm);
                    setProductModalOpen(true);
                  }}
                >
                  Add product
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setBulkModalOpen(true)}>
                  Bulk price
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setCsvModalOpen(true)}>
                  Import CSV
                </Button>
              </>
            ) : null}
            <Link className="btn btn-secondary btn-sm" to="/stockist/price-history">
              Price history
            </Link>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const url = `${window.location.origin}/catalogue-share/${business.id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  pushToast({ tone: 'success', title: 'Share link copied', message: 'Public view shows MRP only — never PTR.' });
                } catch {
                  pushToast({ tone: 'info', title: 'Share link', message: url });
                }
              }}
            >
              Copy share link
            </Button>
            <a className="btn btn-secondary btn-sm" href={`/catalogue-share/${business.id}`} target="_blank" rel="noreferrer">
              Open share
            </a>
          </div>
        }
      />
      {!products.length ? (
        <EmptyState
          title="No products"
          description="Add your first SKU or import a CSV template."
          action={
            canManage ? (
              <div className="row">
                <Button
                  onClick={() => {
                    setEditId(undefined);
                    setForm(emptyForm);
                    setProductModalOpen(true);
                  }}
                >
                  Add product
                </Button>
                <Button variant="secondary" onClick={() => setCsvModalOpen(true)}>
                  Import CSV
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search name / SKU / brand"
        filters={[
          {
            key: 'category',
            label: 'Category',
            options: [...new Set(products.map((p) => p.category))].map((c) => ({ value: c, label: c })),
          },
          {
            key: 'status',
            label: 'Status',
            options: ['Active', 'Inactive', 'Discontinued'].map((s) => ({ value: s, label: s })),
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport(`catalogue-${business.id}.csv`);
          pushToast({ tone: 'success', title: 'Catalogue exported' });
        }}
        right={
          canManage && catalogue ? (
            <div className="list-toolbar-filter">
              <label className="list-toolbar-label">Catalogue</label>
              <Select
                value={catalogue.status}
                onChange={(e) => {
                  const next = e.target.value as 'Active' | 'Maintenance' | 'Inactive';
                  if (next === catalogue.status) return;
                  setPendingCatalogueStatus(next);
                }}
                style={{ minWidth: 140 }}
              >
                <option value="Active">Active</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Inactive">Inactive</option>
              </Select>
            </div>
          ) : null
        }
      />
      <DataListTable
        columns={columns}
        loading={productsLoading}
        rows={list.pageRows}
        sortKey={list.sortKey}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        activeRowId={highlightId}
      />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}

      <Modal
        open={productModalOpen}
        title={editId ? 'Edit product' : 'Add product'}
        onClose={closeProductModal}
        initialFocusRef={nameInputRef}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={closeProductModal}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const ref = matchMedicineReference(form.name);
                if (!ref) {
                  pushToast({ tone: 'warning', title: 'No reference match', message: 'Try a name like Dolo 650' });
                  return;
                }
                const { next, filled } = applyReferenceFill(form, ref, { fillPrices: !editId });
                setForm(next as typeof form);
                pushToast({
                  tone: 'info',
                  title: `Auto-fill: ${ref.name}`,
                  message: filled.length ? `Filled: ${filled.join(', ')}` : 'No empty fields to fill',
                });
              }}
            >
              Auto-fill
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                let touched = 0;
                const report: string[] = [];
                for (const p of products) {
                  const ref = matchMedicineReference(p.name);
                  if (!ref) continue;
                  const draft = {
                    brand: p.brand,
                    category: p.category,
                    packSize: p.packSize,
                    hsn: p.hsn ?? '',
                    manufacturer: p.manufacturer ?? '',
                    genericName: p.genericName ?? '',
                    gstPercent: p.gstPercent,
                    name: p.name,
                  };
                  const { next, filled } = applyReferenceFill(draft, ref, { fillPrices: false });
                  if (!filled.length) continue;
                  const res = await upsertProduct({
                    actor: user,
                    stockist: business,
                    productId: p.id,
                    product: {
                      name: p.name,
                      sku: p.sku,
                      brand: String(next.brand),
                      category: String(next.category),
                      packSize: String(next.packSize),
                      mrp: p.mrp,
                      ptr: p.ptr,
                      gstPercent: Number(next.gstPercent) || p.gstPercent,
                      moq: p.moq,
                      maxQty: p.maxQty,
                      hsn: String(next.hsn) || undefined,
                      reorderLevel: p.reorderLevel,
                      manufacturer: String(next.manufacturer) || undefined,
                      genericName: String(next.genericName) || undefined,
                    },
                  });
                  if (res.ok) {
                    touched += 1;
                    report.push(`${p.sku}: ${filled.join(', ')}`);
                  }
                }
                pushToast({
                  tone: touched ? 'success' : 'info',
                  title: `Enhance all: ${touched} updated`,
                  message: report.slice(0, 5).join(' · ') || 'Nothing to fill',
                });
              }}
            >
              Enhance all
            </Button>
            <Button
              onClick={async () => {
                const mrp = form.mrp === '' ? NaN : Number(form.mrp);
                const ptr = form.ptr === '' ? NaN : Number(form.ptr);
                const gstPercent = form.gstPercent === '' ? NaN : Number(form.gstPercent);
                if (!(mrp > 0) || !(ptr > 0) || !(gstPercent > 0)) {
                  pushToast({
                    tone: 'error',
                    title: 'Pricing required',
                    message: 'MRP, PTR, and GST % must be greater than zero.',
                  });
                  return;
                }
                if (ptr > mrp) {
                  pushToast({ tone: 'error', title: 'PTR exceeds MRP', message: 'PTR must be less than or equal to MRP.' });
                  return;
                }
                const res = await upsertProduct({
                  actor: user,
                  stockist: business,
                  productId: editId,
                  product: {
                    ...form,
                    mrp,
                    ptr,
                    gstPercent,
                    hsn: form.hsn || undefined,
                    manufacturer: form.manufacturer || undefined,
                    genericName: form.genericName || undefined,
                    composition: form.composition || undefined,
                    description: form.description || undefined,
                    purchaseRate: form.purchaseRate,
                    pricingClass: form.pricingClass,
                    rxRequired: form.rxRequired,
                    narcotic: form.narcotic,
                  },
                });
                pushToast(res.ok ? { tone: 'success', title: editId ? 'Product updated' : 'Product added' } : { tone: 'error', title: res.message });
                if (res.ok) closeProductModal();
              }}
            >
              {editId ? 'Save changes' : 'Save product'}
            </Button>
          </div>
        }
      >
        <div className="stack">
          {editId ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Editing selected row — save or cancel when finished.
            </p>
          ) : null}
          <div className="grid-3">
          {(['name', 'sku', 'brand', 'category', 'packSize', 'hsn', 'manufacturer', 'genericName', 'composition'] as const).map((k) => (
            <Field key={k} label={catalogueFieldLabel(k)}>
              <Input
                ref={k === 'name' ? nameInputRef : undefined}
                value={String(form[k] ?? '')}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              />
            </Field>
          ))}
          <Field label="MRP *">
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={form.mrp}
              onChange={(e) =>
                setForm((f) => ({ ...f, mrp: e.target.value === '' ? '' : Number(e.target.value) }))
              }
            />
          </Field>
          <Field label="PTR *">
            <Input
              type="number"
              min={0.01}
              step="0.01"
              placeholder="Must be ≤ MRP"
              value={form.ptr}
              onChange={(e) =>
                setForm((f) => ({ ...f, ptr: e.target.value === '' ? '' : Number(e.target.value) }))
              }
            />
          </Field>
          <Field label="Purchase rate">
            <Input
              type="number"
              value={form.purchaseRate ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, purchaseRate: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </Field>
          <Field label="Pricing class">
            <Select
              value={form.pricingClass}
              onChange={(e) => setForm((f) => ({ ...f, pricingClass: e.target.value as 'Generic' | 'Ethical' }))}
            >
              <option value="Generic">Generic (% commission)</option>
              <option value="Ethical">Ethical (flat / line)</option>
            </Select>
          </Field>
          <Field label="GST % *">
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={form.gstPercent}
              onChange={(e) =>
                setForm((f) => ({ ...f, gstPercent: e.target.value === '' ? '' : Number(e.target.value) }))
              }
            />
          </Field>
          <Field label="MOQ">
            <Input type="number" value={form.moq} onChange={(e) => setForm((f) => ({ ...f, moq: Number(e.target.value) }))} />
          </Field>
          <Field label="Max qty">
            <Input
              type="number"
              value={form.maxQty ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, maxQty: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </Field>
          <Field label="Reorder level">
            <Input
              type="number"
              value={form.reorderLevel ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={form.rxRequired}
              onChange={(e) => setForm((f) => ({ ...f, rxRequired: e.target.checked }))}
            />
            Rx required
          </label>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={form.narcotic}
              onChange={(e) => setForm((f) => ({ ...f, narcotic: e.target.checked }))}
            />
            Narcotic
          </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkModalOpen}
        title="Bulk price update"
        onClose={() => setBulkModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setBulkModalOpen(false)}>
              Close
            </Button>
            <Button
              disabled={!bulkPreview.length}
              onClick={async () => {
                const res = await bulkUpdatePrices({
                  actor: user,
                  stockist: business,
                  productIds: selectedIds,
                  mode: bulkMode,
                  value: Number(bulkValue),
                  field: bulkField,
                });
                pushToast(
                  res.ok ? { tone: 'success', title: `Updated ${res.data.updated} products` } : { tone: 'error', title: res.message },
                );
                if (res.ok) setBulkModalOpen(false);
              }}
            >
              Confirm apply
            </Button>
          </div>
        }
      >
        <div className="stack">
          <div className="row">
            <Button size="sm" variant="secondary" onClick={() => setSelected(Object.fromEntries(list.pageRows.map((p) => [p.id, true])))}>
              Select page
            </Button>
            <span className="muted" style={{ fontSize: 12 }}>
              {selectedIds.length} selected
            </span>
          </div>
          <div className="row">
            <Select value={bulkField} onChange={(e) => setBulkField(e.target.value as 'ptr' | 'mrp')}>
              <option value="ptr">PTR</option>
              <option value="mrp">MRP</option>
            </Select>
            <Select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as 'percent' | 'absolute')}>
              <option value="percent">Percent ±</option>
              <option value="absolute">Absolute</option>
            </Select>
            <Input type="number" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={{ width: 100 }} />
          </div>
          {bulkPreview.length ? (
            <div className="table-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Before ({bulkField.toUpperCase()})</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkPreview.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>
                        <Money value={r.before} />
                      </td>
                      <td>
                        <Money value={r.after} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedIds.length > bulkPreview.length ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Showing first {bulkPreview.length} of {selectedIds.length} selected
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title="No preview" description="Select products and enter a value to preview before→after." />
          )}
        </div>
      </Modal>

      <Modal
        open={csvModalOpen}
        title="Import CSV"
        onClose={() => setCsvModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setCsvModalOpen(false)}>
              Close
            </Button>
            <Button
              onClick={async () => {
                const expected = [
                  'name',
                  'sku',
                  'brand',
                  'category',
                  'packsize',
                  'mrp',
                  'ptr',
                  'gstpercent',
                  'moq',
                ];
                const { header, rows: rawRows } = parseCsvTable(csv);
                if (!header.length) {
                  setImportReport({
                    succeeded: [],
                    failed: [],
                    skipped: 0,
                    skippedDetails: [],
                    headerError: 'CSV is empty',
                  });
                  pushToast({ tone: 'error', title: 'CSV is empty' });
                  return;
                }
                const normalizedHeader = header.map((h) => h.toLowerCase().replace(/\s+/g, ''));
                const missing = expected.filter((h) => !normalizedHeader.includes(h));
                if (missing.length) {
                  const msg = `Header missing: ${missing.join(', ')}. Expected name,sku,brand,category,packSize,mrp,ptr,gstPercent,moq[,pricingClass]`;
                  setImportReport({ succeeded: [], failed: [], skipped: 0, skippedDetails: [], headerError: msg });
                  pushToast({ tone: 'error', title: 'Invalid CSV header', message: msg });
                  return;
                }
                let skipped = 0;
                const skippedDetails: string[] = [];
                const col = (name: string) => normalizedHeader.indexOf(name);
                const iName = col('name');
                const iSku = col('sku');
                const iBrand = col('brand');
                const iCategory = col('category');
                const iPack = col('packsize');
                const iMrp = col('mrp');
                const iPtr = col('ptr');
                const iGst = col('gstpercent');
                const iMoq = col('moq');
                const iClass = col('pricingclass');
                const rows: {
                  name: string;
                  sku: string;
                  brand: string;
                  category: string;
                  packSize: string;
                  mrp: number;
                  ptr: number;
                  gstPercent: number;
                  moq: number;
                  pricingClass: 'Generic' | 'Ethical';
                }[] = [];
                rawRows.forEach((cols, idx) => {
                  const rowNo = idx + 2;
                  if (cols.every((c) => !c)) {
                    skipped += 1;
                    skippedDetails.push(`Row ${rowNo}: empty`);
                    return;
                  }
                  const mrp = parseNumberInput(cols[iMrp] ?? '');
                  const ptr = parseNumberInput(cols[iPtr] ?? '');
                  const gst = parseNumberInput(cols[iGst] ?? '');
                  const moq = parseNumberInput(cols[iMoq] ?? '');
                  const name = (cols[iName] ?? '').trim();
                  const sku = (cols[iSku] ?? '').trim();
                  const brand = (cols[iBrand] ?? '').trim();
                  const category = (cols[iCategory] ?? '').trim();
                  const packSize = (cols[iPack] ?? '').trim();
                  if (!name || !sku) {
                    skipped += 1;
                    skippedDetails.push(`Row ${rowNo}: name and SKU required`);
                    return;
                  }
                  if (!brand || !category || !packSize) {
                    skipped += 1;
                    skippedDetails.push(`Row ${rowNo}: brand, category, and packSize required`);
                    return;
                  }
                  if (mrp.status !== 'ok' || ptr.status !== 'ok' || gst.status !== 'ok' || moq.status !== 'ok') {
                    skipped += 1;
                    skippedDetails.push(`Row ${rowNo}: invalid mrp/ptr/gst/moq`);
                    return;
                  }
                  if (!Number.isInteger(moq.value) || moq.value < 1) {
                    skipped += 1;
                    skippedDetails.push(`Row ${rowNo}: MOQ must be a whole number ≥ 1`);
                    return;
                  }
                  if (ptr.value > mrp.value) {
                    skipped += 1;
                    skippedDetails.push(`Row ${rowNo}: PTR cannot exceed MRP`);
                    return;
                  }
                  const classRaw = (cols[iClass] ?? '').trim();
                  const pricingClass =
                    classRaw === 'Ethical' ? 'Ethical' : classRaw === '' || classRaw === 'Generic' ? 'Generic' : null;
                  if (pricingClass === null) {
                    skipped += 1;
                    skippedDetails.push(`Row ${rowNo}: pricingClass must be Generic or Ethical`);
                    return;
                  }
                  rows.push({
                    name,
                    sku,
                    brand,
                    category,
                    packSize,
                    mrp: mrp.value,
                    ptr: ptr.value,
                    gstPercent: gst.value,
                    moq: moq.value,
                    pricingClass,
                  });
                });
                const res = await importProductsCsv({ actor: user, stockist: business, rows });
                if (res.ok) {
                  setImportReport({ ...res.data, skipped, skippedDetails });
                  pushToast({
                    tone: res.data.failed.length || skipped ? 'warning' : 'success',
                    title: `Import: ${res.data.succeeded.length} ok, ${res.data.failed.length} failed, ${skipped} skipped`,
                  });
                } else pushToast({ tone: 'error', title: res.message });
              }}
            >
              Run import
            </Button>
          </div>
        }
      >
        <div className="stack">
          <div className="row">
            <a
              className="btn btn-secondary btn-sm"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
              download="catalogue-template.csv"
            >
              Download template
            </a>
            <label className="btn btn-secondary btn-sm">
              Upload file
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setCsv(await file.text());
                }}
              />
            </label>
          </div>
          <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} />
          {importReport ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {importReport.headerError ? (
                <>
                  {importReport.headerError}
                  <br />
                </>
              ) : null}
              Succeeded: {importReport.succeeded.join(', ') || '—'}
              <br />
              Failed: {importReport.failed.map((f) => `${f.sku} (${f.reason})`).join('; ') || '—'}
              <br />
              Skipped rows: {importReport.skipped}
              {importReport.skippedDetails.length ? (
                <>
                  <br />
                  {importReport.skippedDetails.slice(0, 8).join('; ')}
                  {importReport.skippedDetails.length > 8 ? '…' : ''}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

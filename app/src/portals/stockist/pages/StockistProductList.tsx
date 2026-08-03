import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { db } from '../../../data/db';
import { applyReferenceFill, matchMedicineReference } from '../../../content/medicineReference';
import { catalogueFieldLabel } from '../../../domain/utils/humanLabels';
import {
  setCatalogueStatus,
  setProductStatus,
  upsertProduct,
} from '../../../services/catalogueService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { DataListTable, ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit'
import { ShortcutHints } from '../../../ui/components/ShortcutHints';
import { Button, DeleteButton, EmptyState, Field, Input, Modal, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
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

/** Catalogue list + add/edit + share. Bulk price / CSV live on Products Price & Import tabs. */
export function StockistProductList({ embedded = false }: { embedded?: boolean }) {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('stockist-products');
  const tableRef = useTableSectionRef();
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
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | undefined>();
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
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
    const next = new URLSearchParams(params);
    next.delete('new');
    if (!next.get('tab')) next.set('tab', 'products');
    navigate({ pathname: '/stockist/products', search: `?${next.toString()}` }, { replace: true });
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
      {
        key: 'ptr',
        label: 'PTR',
        getValue: (p: (typeof products)[0]) => p.ptr,
        render: (p: (typeof products)[0]) => (
          <span className="cell-num">
            <Money value={p.ptr} />
          </span>
        ),
      },
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
        key: 'listedForSale',
        label: 'For sale',
        getValue: (p: (typeof products)[0]) => (p.listedForSale === false ? 'No' : 'Yes'),
        render: (p: (typeof products)[0]) =>
          canManage ? (
            <input
              type="checkbox"
              checked={p.listedForSale !== false}
              onChange={async (e) => {
                const res = await upsertProduct({
                  actor: user,
                  stockist: business,
                  productId: p.id,
                  product: { ...p, listedForSale: e.target.checked },
                });
                if (!res.ok) pushToast({ tone: 'error', title: res.message });
              }}
            />
          ) : (
            <span>{p.listedForSale === false ? 'No' : 'Yes'}</span>
          ),
      },
      {
        key: 'scheduleType',
        label: 'Schedule',
        getValue: (p: (typeof products)[0]) => p.scheduleType ?? (p.narcotic ? 'NDPS' : 'NONE'),
        render: (p: (typeof products)[0]) =>
          canManage ? (
            <Select
              value={p.scheduleType ?? (p.narcotic ? 'NDPS' : 'NONE')}
              onChange={async (e) => {
                const scheduleType = e.target.value as 'NONE' | 'H' | 'H1' | 'X' | 'NDPS';
                const res = await upsertProduct({
                  actor: user,
                  stockist: business,
                  productId: p.id,
                  product: { ...p, scheduleType, narcotic: scheduleType === 'NDPS' },
                });
                if (!res.ok) pushToast({ tone: 'error', title: res.message });
              }}
            >
              {['NONE', 'H', 'H1', 'X', 'NDPS'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <span>{p.scheduleType ?? (p.narcotic ? 'NDPS' : 'NONE')}</span>
          ),
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
    pageSize,
    onPageSizeChange: setPageSize,
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

  const shareActions = (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          const url = `${window.location.origin}/catalogue-share/${business.id}`;
          try {
            await navigator.clipboard.writeText(url);
            pushToast({
              tone: 'success',
              title: 'Share link copied',
              message: embedded ? undefined : 'Public view shows MRP only — never PTR.',
            });
          } catch {
            pushToast({ tone: 'info', title: 'Share link', message: url });
          }
        }}
      >
        {embedded ? 'Share link' : 'Copy share link'}
      </Button>
      {!embedded ? (
        <a className="btn btn-secondary btn-sm" href={`/catalogue-share/${business.id}`} target="_blank" rel="noreferrer">
          Open share
        </a>
      ) : null}
    </>
  );

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
      {!embedded ? (
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
                </>
              ) : null}
              <Link className="btn btn-secondary btn-sm" to="/stockist/price-history">
                Price history
              </Link>
              {shareActions}
            </div>
          }
        />
      ) : (
        <div className="row row-between">
          <p className="muted" style={{ margin: 0 }}>
            {products.length} products · toggle listed for sale in edit · use Price / Import tabs for bulk tools
          </p>
          <div className="row">
            {canManage ? (
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
            ) : null}
            {shareActions}
          </div>
        </div>
      )}
      {!products.length ? (
        <EmptyState
          title="No products"
          description={
            embedded
              ? 'Add your first SKU, or use the Import tab for CSV / bill OCR.'
              : 'Add your first SKU to start selling.'
          }
          action={
            canManage ? (
              <Button
                onClick={() => {
                  setEditId(undefined);
                  setForm(emptyForm);
                  setProductModalOpen(true);
                }}
              >
                Add product
              </Button>
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
            stickyHeader
            scrollBody
            tableSectionRef={tableRef}
            columns={columns}
            loading={productsLoading}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            activeRowId={highlightId}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
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
                pushToast(
                  res.ok
                    ? { tone: 'success', title: editId ? 'Product updated' : 'Product added' }
                    : { tone: 'error', title: res.message },
                );
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
            {(['name', 'sku', 'brand', 'category', 'packSize', 'hsn', 'manufacturer', 'genericName', 'composition'] as const).map(
              (k) => (
                <Field key={k} label={catalogueFieldLabel(k)}>
                  <Input
                    ref={k === 'name' ? nameInputRef : undefined}
                    value={String(form[k] ?? '')}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </Field>
              ),
            )}
            <Field label="MRP *">
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={form.mrp}
                onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value === '' ? '' : Number(e.target.value) }))}
              />
            </Field>
            <Field label="PTR *">
              <Input
                type="number"
                min={0.01}
                step="0.01"
                placeholder="Must be ≤ MRP"
                value={form.ptr}
                onChange={(e) => setForm((f) => ({ ...f, ptr: e.target.value === '' ? '' : Number(e.target.value) }))}
              />
            </Field>
            <Field label="Purchase rate">
              <Input
                type="number"
                value={form.purchaseRate ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, purchaseRate: e.target.value ? Number(e.target.value) : undefined }))
                }
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
              <Input
                type="number"
                value={form.moq}
                onChange={(e) => setForm((f) => ({ ...f, moq: Number(e.target.value) }))}
              />
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, reorderLevel: e.target.value ? Number(e.target.value) : undefined }))
                }
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
    </div>
  );
}

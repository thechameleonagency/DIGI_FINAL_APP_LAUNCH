import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { applyReferenceFill, matchMedicineReference } from '../../../content/medicineReference';
import {
  bulkUpdatePrices,
  importProductsCsv,
  setCatalogueStatus,
  setProductStatus,
  upsertProduct,
} from '../../../services/catalogueService';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Money, PageHeader, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const emptyForm = {
  name: '',
  sku: '',
  brand: '',
  category: '',
  packSize: '',
  mrp: 0,
  ptr: 0,
  gstPercent: 0,
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
  'name,sku,brand,category,packSize,mrp,ptr,gstPercent,moq,pricingClass\nDemo Cap,DEMO-CAP,Demo,Capsules,10 Cap,80,55,12,5,Generic\n';

export function StockistCatalogue() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const catalogue = useLiveQuery(() => db.catalogues.where('stockistId').equals(business.id).first(), [business.id]);
  const [csv, setCsv] = useState(CSV_TEMPLATE);
  const [importReport, setImportReport] = useState<{ succeeded: string[]; failed: { sku: string; reason: string }[] } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | undefined>();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMode, setBulkMode] = useState<'percent' | 'absolute'>('percent');
  const [bulkField, setBulkField] = useState<'ptr' | 'mrp'>('ptr');
  const [bulkValue, setBulkValue] = useState('5');

  const columns = useMemo(
    () => [
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
      { key: 'name', label: 'Name', getValue: (p: (typeof products)[0]) => p.name },
      { key: 'sku', label: 'SKU', getValue: (p: (typeof products)[0]) => p.sku },
      { key: 'category', label: 'Category', getValue: (p: (typeof products)[0]) => p.category },
      { key: 'ptr', label: 'PTR', getValue: (p: (typeof products)[0]) => p.ptr, render: (p: (typeof products)[0]) => <Money value={p.ptr} /> },
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
      {
        key: 'actions',
        label: 'Actions',
        getValue: () => '',
        render: (p: (typeof products)[0]) => (
          <div className="row">
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
              }}
            >
              Edit
            </Button>
            {p.status === 'Active' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await setProductStatus({ actor: user, stockist: business, productId: p.id, status: 'Inactive' });
                  pushToast(res.ok ? { tone: 'info', title: 'Deactivated' } : { tone: 'error', title: res.message });
                }}
              >
                Deactivate
              </Button>
            ) : null}
            {p.status === 'Inactive' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await setProductStatus({ actor: user, stockist: business, productId: p.id, status: 'Active' });
                  pushToast(res.ok ? { tone: 'success', title: 'Reactivated' } : { tone: 'error', title: res.message });
                }}
              >
                Reactivate
              </Button>
            ) : null}
            {p.status !== 'Discontinued' ? (
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const res = await setProductStatus({ actor: user, stockist: business, productId: p.id, status: 'Discontinued' });
                  pushToast(res.ok ? { tone: 'warning', title: 'Discontinued' } : { tone: 'error', title: res.message });
                }}
              >
                Discontinue
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [selected, user, business, pushToast],
  );

  const list = useListControls(products, {
    columns,
    searchKeys: [(p) => `${p.name} ${p.sku} ${p.brand} ${p.category}`],
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

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([id]) => id);

  return (
    <div className="stack">
      <PageHeader
        title="Catalogue"
        subtitle={`${products.length} products`}
        actions={
          <div className="row">
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
            {catalogue ? (
              <Select
                value={catalogue.status}
                onChange={async (e) => {
                  const res = await setCatalogueStatus({
                    actor: user,
                    stockist: business,
                    status: e.target.value as 'Active' | 'Maintenance' | 'Inactive',
                  });
                  pushToast(res.ok ? { tone: 'success', title: `Catalogue ${e.target.value}` } : { tone: 'error', title: res.message });
                }}
                style={{ maxWidth: 160 }}
              >
                <option value="Active">Active</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Inactive">Inactive</option>
              </Select>
            ) : null}
          </div>
        }
      />
      {!products.length ? (
        <EmptyState title="No products" description="Add your first SKU or import a CSV template." />
      ) : null}
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
      />
      <DataListTable columns={columns} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />

      <div className="card card-pad stack">
        <strong>{editId ? 'Edit product' : 'Add product'}</strong>
        <div className="grid-3">
          {(['name', 'sku', 'brand', 'category', 'packSize', 'hsn', 'manufacturer', 'genericName', 'composition'] as const).map((k) => (
            <Field key={k} label={k}>
              <Input value={String(form[k] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </Field>
          ))}
          <Field label="MRP">
            <Input type="number" value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: Number(e.target.value) }))} />
          </Field>
          <Field label="PTR">
            <Input type="number" value={form.ptr} onChange={(e) => setForm((f) => ({ ...f, ptr: Number(e.target.value) }))} />
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
          <Field label="GST %">
            <Input type="number" value={form.gstPercent} onChange={(e) => setForm((f) => ({ ...f, gstPercent: Number(e.target.value) }))} />
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
        <div className="row">
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
              const res = await upsertProduct({
                actor: user,
                stockist: business,
                productId: editId,
                product: {
                  ...form,
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
              if (res.ok) {
                setForm(emptyForm);
                setEditId(undefined);
              }
            }}
          >
            {editId ? 'Save changes' : 'Save product'}
          </Button>
          {editId ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditId(undefined);
                setForm(emptyForm);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="card card-pad stack">
        <strong>Bulk price update</strong>
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
          <Button
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
            }}
          >
            Apply to selected
          </Button>
        </div>
      </div>

      <div className="card card-pad stack">
        <strong>Import CSV</strong>
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
        <Button
          variant="secondary"
          onClick={async () => {
            const lines = csv.trim().split(/\r?\n/).slice(1);
            const rows = lines
              .map((line) => line.split(',').map((x) => x.trim()))
              .filter((cols) => cols.length >= 9)
              .map((cols) => ({
                name: cols[0],
                sku: cols[1],
                brand: cols[2],
                category: cols[3],
                packSize: cols[4],
                mrp: Number(cols[5]),
                ptr: Number(cols[6]),
                gstPercent: Number(cols[7]),
                moq: Number(cols[8]),
                pricingClass: (cols[9] === 'Ethical' ? 'Ethical' : 'Generic') as 'Generic' | 'Ethical',
              }));
            const res = await importProductsCsv({ actor: user, stockist: business, rows });
            if (res.ok) {
              setImportReport(res.data);
              pushToast({
                tone: res.data.failed.length ? 'warning' : 'success',
                title: `Import: ${res.data.succeeded.length} ok, ${res.data.failed.length} failed`,
              });
            } else pushToast({ tone: 'error', title: res.message });
          }}
        >
          Run import
        </Button>
        {importReport ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Succeeded: {importReport.succeeded.join(', ') || '—'}
            <br />
            Failed: {importReport.failed.map((f) => `${f.sku} (${f.reason})`).join('; ') || '—'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

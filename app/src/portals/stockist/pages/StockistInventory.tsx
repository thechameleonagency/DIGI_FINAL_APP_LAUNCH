import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { availableQty, expiryRiskBand, lowStock } from '../../../domain/calc';
import { nextNumberFieldValue } from '../../../domain/utils/validation';
import { stockIn, transferStock } from '../../../services/inventoryService';
import { useUi } from '../../../store/ui';
import { BarcodeScanField } from '../../../ui/components/BarcodeScanField';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistInventory() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const [params] = useSearchParams();
  const { items: batches, loading: batchesLoading } = useLiveArray(
    () => db.batches.where('stockistId').equals(business.id).toArray(),
    [business.id],
  );
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState<number | ''>('');
  const [stockInLocation, setStockInLocation] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [stockInErrors, setStockInErrors] = useState<{
    productId?: string;
    qty?: string;
    batchNumber?: string;
    expiryDate?: string;
  }>({});
  const [xferBatchId, setXferBatchId] = useState('');
  const [xferFrom, setXferFrom] = useState('');
  const [xferTo, setXferTo] = useState('');
  const [xferQty, setXferQty] = useState('1');
  const [stockInModalOpen, setStockInModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const locationNames = (business.locations ?? []).map((l) => l.name).filter(Boolean);
  /** Only profile-configured locations (plus current batch location when transferring). */
  const locOptions = locationNames;

  const rows = useMemo(
    () =>
      batches.map((b) => {
        const p = products.find((x) => x.id === b.productId);
        const avail = availableQty(b);
        const band = expiryRiskBand(b.expiryDate);
        const flag =
          b.status === 'Quarantined'
            ? 'quarantined'
            : b.status === 'Recalled'
              ? 'recalled'
              : avail <= 0
                ? 'zero'
                : band === 'Expired'
                  ? 'expired'
                  : band === 'Critical' || band === 'Near'
                    ? 'near-expiry'
                    : lowStock(avail) || (p?.reorderLevel != null && avail <= p.reorderLevel)
                      ? 'low'
                      : 'ok';
        return { id: b.id, b, p, avail, band, flag };
      }),
    [batches, products],
  );

  const initialFlag = params.get('filter') ?? 'All';

  const columns = useMemo(
    () => [
      { key: 'product', label: 'Product', getValue: (r: (typeof rows)[0]) => r.p?.name ?? r.b.productId },
      { key: 'batch', label: 'Batch', getValue: (r: (typeof rows)[0]) => r.b.batchNumber },
      { key: 'expiry', label: 'Expiry', getValue: (r: (typeof rows)[0]) => r.b.expiryDate },
      { key: 'onHand', label: 'On hand', getValue: (r: (typeof rows)[0]) => r.b.onHand },
      { key: 'reserved', label: 'Reserved', getValue: (r: (typeof rows)[0]) => r.b.reserved },
      { key: 'avail', label: 'Available', getValue: (r: (typeof rows)[0]) => r.avail },
      {
        key: 'location',
        label: 'Location',
        getValue: (r: (typeof rows)[0]) => r.b.location ?? 'Unassigned',
      },
      {
        key: 'band',
        label: 'Band',
        getValue: (r: (typeof rows)[0]) => r.band,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.band} />,
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (r: (typeof rows)[0]) => r.b.status,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.b.status} />,
      },
      {
        key: 'flag',
        label: 'Flag',
        getValue: (r: (typeof rows)[0]) => r.flag,
      },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.p?.name ?? ''} ${r.b.batchNumber} ${r.b.status}`],
    filters: [
      {
        key: 'flag',
        label: 'Filter',
        options: [
          { value: 'low', label: 'Low stock' },
          { value: 'expired', label: 'Expired' },
          { value: 'near-expiry', label: 'Near expiry' },
          { value: 'zero', label: 'Zero' },
          { value: 'quarantined', label: 'Quarantined' },
          { value: 'recalled', label: 'Recalled' },
        ],
      },
    ],
    defaultSortKey: 'expiry',
    defaultSortDir: 'asc',
    initialFilters: initialFlag !== 'All' ? { flag: initialFlag } : undefined,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Inventory & batches"
        actions={
          <div className="row">
            <Button size="sm" onClick={() => setStockInModalOpen(true)}>
              Stock in
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setTransferModalOpen(true)}>
              Transfer between locations
            </Button>
            <Link className="btn btn-secondary btn-sm" to="/stockist/movements">
              Movements
            </Link>
            <Link className="btn btn-secondary btn-sm" to="/stockist/expiry">
              Expiry
            </Link>
          </div>
        }
      />
      {!batches.length ? (
        <EmptyState
          title="No stock yet"
          description="Add products to your catalogue, then stock in batches here."
          action={
            <Link className="btn btn-primary" to="/stockist/catalogue">
              Add products
            </Link>
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
                  { value: 'quarantined', label: 'Quarantined' },
                  { value: 'recalled', label: 'Recalled' },
                ],
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              list.doExport(`inventory-${business.id}.csv`);
              pushToast({ tone: 'success', title: 'Exported inventory' });
            }}
          />
          <DataListTable loading={batchesLoading} columns={columns.filter((c) => c.key !== 'flag')} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}

      <Modal
        open={transferModalOpen}
        title="Transfer between locations"
        onClose={() => setTransferModalOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await transferStock({
                  actor: user,
                  stockist: business,
                  batchId: xferBatchId,
                  fromLocation: xferFrom,
                  toLocation: xferTo,
                  qty: Number(xferQty),
                });
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Transfer recorded', message: 'Paired movements written' }
                    : { tone: 'error', title: res.message },
                );
                if (res.ok) setTransferModalOpen(false);
              }}
            >
              Record transfer
            </Button>
          </div>
        }
      >
        <div className="stack">
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Updates batch location label; sellable qty unchanged. Paired TransferOut/TransferIn movements are written.
          </p>
          <Field label="Batch">
            <Select
              value={xferBatchId}
              onChange={(e) => {
                setXferBatchId(e.target.value);
                const b = batches.find((x) => x.id === e.target.value);
                setXferFrom(b?.location || 'Unassigned');
              }}
            >
              <option value="">Select…</option>
              {batches
                .filter((b) => b.onHand - b.reserved > 0)
                .map((b) => {
                  const p = products.find((x) => x.id === b.productId);
                  return (
                    <option key={b.id} value={b.id}>
                      {p?.name ?? b.productId} · {b.batchNumber} ({b.location || 'Unassigned'})
                    </option>
                  );
                })}
            </Select>
          </Field>
          {!locOptions.length ? (
            <EmptyState
              title="No storage locations configured"
              description="Add locations on your business profile before transferring stock."
              action={
                <Link className="btn btn-primary" to="/stockist/profile">
                  Open profile
                </Link>
              }
            />
          ) : (
            <>
              <div className="grid-2">
                <Field label="From">
                  <Select value={xferFrom} onChange={(e) => setXferFrom(e.target.value)}>
                    {xferFrom && !locOptions.includes(xferFrom) ? (
                      <option value={xferFrom}>{xferFrom}</option>
                    ) : null}
                    {locOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To">
                  <Select value={xferTo} onChange={(e) => setXferTo(e.target.value)}>
                    <option value="">Select…</option>
                    {locOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Qty (≤ un-reserved)">
                <Input type="number" value={xferQty} onChange={(e) => setXferQty(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={stockInModalOpen}
        title="Stock in"
        onClose={() => {
          setStockInModalOpen(false);
          setStockInErrors({});
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setStockInModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const next: typeof stockInErrors = {};
                if (!productId) next.productId = 'Select a product';
                if (qty === '' || !(qty > 0)) next.qty = 'Quantity must be greater than zero';
                if (!batchNumber.trim()) next.batchNumber = 'Batch number is required';
                if (!expiryDate) next.expiryDate = 'Expiry is required';
                if (Object.keys(next).length) {
                  setStockInErrors(next);
                  return;
                }
                const res = await stockIn({
                  actor: user,
                  stockist: business,
                  productId,
                  qty: qty as number,
                  batchNumber,
                  expiryDate,
                  location: stockInLocation || undefined,
                });
                if (res.ok) {
                  pushToast({ tone: 'success', title: 'Stock added' });
                  setStockInErrors({});
                  setQty('');
                  setStockInLocation('');
                  setStockInModalOpen(false);
                } else if (res.code === 'BATCH_DUP') {
                  setStockInErrors({ batchNumber: res.message });
                } else if (res.code === 'STOCK_QTY') {
                  setStockInErrors({ qty: res.message });
                } else if (res.code === 'PROD_MISSING') {
                  setStockInErrors({ productId: res.message });
                } else {
                  pushToast({ tone: 'error', title: res.message });
                }
              }}
            >
              Add stock
            </Button>
          </div>
        }
      >
        <div className="stack">
          <BarcodeScanField
            label="Scan SKU / product"
            onScan={(code) => {
              const c = code.toLowerCase();
              const hit = products.find(
                (p) => p.sku.toLowerCase() === c || p.name.toLowerCase().includes(c) || p.id === code,
              );
              if (!hit) {
                pushToast({ tone: 'warning', title: 'No product match', message: code });
                return;
              }
              setProductId(hit.id);
              setStockInErrors((err) => ({ ...err, productId: undefined }));
              pushToast({ tone: 'info', title: 'Product selected', message: hit.name });
            }}
          />
          <div className="grid-2">
          <Field label="Product" error={stockInErrors.productId}>
            <Select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setStockInErrors((err) => ({ ...err, productId: undefined }));
              }}
            >
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qty" error={stockInErrors.qty}>
            <Input
              type="number"
              value={qty}
              onChange={(e) => {
                setQty(nextNumberFieldValue(e.target.value, qty));
                setStockInErrors((err) => ({ ...err, qty: undefined }));
              }}
            />
          </Field>
          <Field label="Batch number" error={stockInErrors.batchNumber}>
            <Input
              value={batchNumber}
              onChange={(e) => {
                setBatchNumber(e.target.value);
                setStockInErrors((err) => ({ ...err, batchNumber: undefined }));
              }}
            />
          </Field>
          <Field label="Expiry" error={stockInErrors.expiryDate}>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => {
                setExpiryDate(e.target.value);
                setStockInErrors((err) => ({ ...err, expiryDate: undefined }));
              }}
            />
          </Field>
          <Field
            label="Location (optional)"
            hint={locOptions.length ? undefined : 'Add locations on your business profile to assign at stock-in.'}
          >
            <Select value={stockInLocation} onChange={(e) => setStockInLocation(e.target.value)}>
              <option value="">Unassigned</option>
              {locOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        </div>
      </Modal>
    </div>
  );
}

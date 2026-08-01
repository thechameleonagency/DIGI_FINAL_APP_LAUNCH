import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { availableQty, expiryRiskBand, lowStock } from '../../../domain/calc';
import { stockIn, transferStock } from '../../../services/inventoryService';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistInventory() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const [params] = useSearchParams();
  const batches = useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(50);
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [xferBatchId, setXferBatchId] = useState('');
  const [xferFrom, setXferFrom] = useState('');
  const [xferTo, setXferTo] = useState('');
  const [xferQty, setXferQty] = useState('1');
  const locationNames = (business.locations ?? []).map((l) => l.name);
  const locOptions = Array.from(
    new Set([...locationNames, ...batches.map((b) => b.location).filter(Boolean) as string[], 'Main Warehouse', 'Branch Depot']),
  );

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
          <DataListTable columns={columns.filter((c) => c.key !== 'flag')} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
      <div className="card card-pad stack">
        <strong>Transfer between locations</strong>
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
        <div className="grid-2">
          <Field label="From">
            <Select value={xferFrom} onChange={(e) => setXferFrom(e.target.value)}>
              <option value="Unassigned">Unassigned</option>
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
          }}
        >
          Record transfer
        </Button>
      </div>
      <div className="card card-pad stack">
        <strong>Stock in</strong>
        <div className="grid-2">
          <Field label="Product">
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qty">
            <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </Field>
          <Field label="Batch number">
            <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          </Field>
          <Field label="Expiry">
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
        </div>
        <Button
          onClick={async () => {
            const res = await stockIn({
              actor: user,
              stockist: business,
              productId,
              qty,
              batchNumber,
              expiryDate,
            });
            pushToast(res.ok ? { tone: 'success', title: 'Stock added' } : { tone: 'error', title: res.message });
          }}
        >
          Add stock
        </Button>
      </div>
    </div>
  );
}

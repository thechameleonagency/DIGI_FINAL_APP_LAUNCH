import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { daysToExpiry } from '../../../domain/calc';
import type { CustomerSalePaymentMode } from '../../../domain/entities/types';
import { localDayKey, localTodayKey } from '../../../domain/utils/dateKeys';
import { formatINR } from '../../../domain/utils/money';
import { nextNumberFieldValue } from '../../../domain/utils/validation';
import {
  collectCustomerSalePayment,
  createCustomerSale,
  returnCustomerSaleLines,
  saleCreditOutstanding,
  saleTotals,
  voidCustomerSale,
} from '../../../services/salesService';
import { useCan } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { BarcodeScanField } from '../../../ui/components/BarcodeScanField';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { DataListTable, ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit'
import { PrintDocument } from '../../../ui/components/PrintDocument';
import {
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
} from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type DraftLine = { inventoryId: string; qty: number | ''; unitPrice: number | '' };

export function PharmacySales() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('pharmacy-sales');
  const tableRef = useTableSectionRef();
  const { busy, run } = useBusyAction();
  const canRecord = useCan('sale.record');
  const { items: sales, loading: salesLoading } = useLiveArray(
    () => db.customerSales.where('pharmacyId').equals(business.id).reverse().sortBy('createdAt'),
    [business.id],
  );
  const inventory =
    useLiveQuery(() => db.pharmacyInventory.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<CustomerSalePaymentMode>('Cash');
  const [homeDelivery, setHomeDelivery] = useState(false);
  const [address, setAddress] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickInv, setPickInv] = useState('');
  const [voidId, setVoidId] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectNote, setCollectNote] = useState('');

  const detail = id ? sales.find((s) => s.id === id || s.saleNo === id) : undefined;

  const sellableInv = useMemo(
    () =>
      inventory.filter((i) => i.onHand > 0 && (!i.expiryDate || daysToExpiry(i.expiryDate) > 0)),
    [inventory],
  );

  const daySales = useMemo(() => {
    const day = localTodayKey();
    return sales.filter((s) => localDayKey(s.createdAt) === day && s.status !== 'Voided');
  }, [sales]);
  const dayRevenue = daySales.reduce((sum, s) => sum + saleTotals(s).revenue, 0);
  const modeSplit = daySales.reduce(
    (acc, s) => {
      acc[s.paymentMode] = (acc[s.paymentMode] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const creditDueSales = useMemo(
    () => sales.filter((s) => saleCreditOutstanding(s) > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sales],
  );
  const creditDueTotal = creditDueSales.reduce((sum, s) => sum + saleCreditOutstanding(s), 0);

  const saleRows = useMemo(
    () =>
      sales
        .filter((s) => {
          const d = s.createdAt.slice(0, 10);
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        })
        .map((s) => ({
          ...s,
          revenue: saleTotals(s).revenue,
          due: saleCreditOutstanding(s),
          dateLabel: s.createdAt,
        })),
    [sales, dateFrom, dateTo],
  );

  const saleColumns = useMemo(
    () => [
      {
        key: 'saleNo',
        label: 'Sale',
        getValue: (s: (typeof saleRows)[0]) => s.saleNo,
        render: (s: (typeof saleRows)[0]) => <Link to={`/pharmacy/sales/${s.saleNo}`}>{s.saleNo}</Link>,
      },
      {
        key: 'customerName',
        label: 'Customer',
        getValue: (s: (typeof saleRows)[0]) => s.customerName,
        render: (s: (typeof saleRows)[0]) => (
          <span>
            {s.customerName}
            {s.phone ? <div className="muted" style={{ fontSize: 11 }}>{s.phone}</div> : null}
          </span>
        ),
      },
      { key: 'paymentMode', label: 'Mode', getValue: (s: (typeof saleRows)[0]) => s.paymentMode },
      {
        key: 'status',
        label: 'Status',
        getValue: (s: (typeof saleRows)[0]) => s.status,
        render: (s: (typeof saleRows)[0]) => <StatusBadge status={s.status} />,
      },
      {
        key: 'revenue',
        label: 'Total',
        getValue: (s: (typeof saleRows)[0]) => s.revenue,
        render: (s: (typeof saleRows)[0]) => formatINR(s.revenue),
      },
      {
        key: 'dateLabel',
        label: 'Date',
        getValue: (s: (typeof saleRows)[0]) => s.createdAt,
        render: (s: (typeof saleRows)[0]) => (
          <span className="muted">{new Date(s.createdAt).toLocaleString()}</span>
        ),
      },
    ],
    [],
  );

  const saleList = useListControls(saleRows, {
    columns: saleColumns,
    searchKeys: [(s) => `${s.saleNo} ${s.customerName} ${s.phone ?? ''} ${s.paymentMode} ${s.status}`],
    filters: [
      {
        key: 'paymentMode',
        label: 'Mode',
        options: ['Cash', 'UPI', 'Credit'].map((m) => ({ value: m, label: m })),
      },
      {
        key: 'status',
        label: 'Status',
        options: ['Completed', 'PartiallyReturned', 'Returned', 'Voided'].map((s) => ({ value: s, label: s })),
      },
    ],
    defaultSortKey: 'dateLabel',
    defaultSortDir: 'desc',
    pageSize,
    onPageSizeChange: setPageSize,
  });

  const resetForm = () => {
    setCustomerName('');
    setPhone('');
    setPaymentMode('Cash');
    setHomeDelivery(false);
    setAddress('');
    setDraftLines([]);
    setPickInv('');
  };

  const addDraftLine = () => {
    const item = sellableInv.find((i) => i.id === pickInv);
    if (!item) return;
    const mrp = products.find((p) => p.id === item.productId)?.mrp ?? 0;
    setDraftLines((prev) => [...prev, { inventoryId: item.id, qty: 1, unitPrice: mrp }]);
    setPickInv('');
  };

  if (detail) {
    const { revenue, activeLines } = saleTotals(detail);
    const due = saleCreditOutstanding(detail);
    return (
      <div className="stack">
        <PageHeader
          title={detail.saleNo}
          subtitle={`${detail.customerName}${detail.phone ? ` · ${detail.phone}` : ''}`}
          actions={
            <Link className="btn btn-secondary btn-sm" to="/pharmacy/sales">
              All sales
            </Link>
          }
        />
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <StatusBadge status={detail.status} />
          {detail.homeDelivery && detail.deliveryStatus ? <StatusBadge status={detail.deliveryStatus} /> : null}
          <span className="muted" style={{ fontSize: 13 }}>
            {detail.paymentMode} · {new Date(detail.createdAt).toLocaleString()}
            {detail.homeDelivery ? ' · Home delivery' : ''}
          </span>
        </div>
        {detail.paymentMode === 'Credit' && detail.status !== 'Voided' ? (
          <div className="card card-pad row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Credit receivable
              </div>
              <strong>
                Due {formatINR(due)}
                <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                  · collected {formatINR(detail.amountCollected ?? 0)} of {formatINR(revenue)}
                </span>
              </strong>
            </div>
            {canRecord && due > 0 ? (
              <Button
                size="sm"
                onClick={() => {
                  setCollectAmount(String(due));
                  setCollectNote('');
                  setCollectOpen(true);
                }}
              >
                Collect payment
              </Button>
            ) : null}
          </div>
        ) : null}
        {detail.address ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Deliver to: {detail.address}
            {detail.homeDelivery ? (
              <>
                {' · '}
                <Link to="/pharmacy/delivery">Delivery board</Link>
              </>
            ) : null}
          </div>
        ) : null}
        <PrintDocument
          title={`Sale receipt · ${detail.saleNo}`}
          subtitle={`${business.name} · ${detail.customerName}${detail.phone ? ` · ${detail.phone}` : ''}`}
          printLabel="Print receipt"
        >
          <div className="muted" style={{ fontSize: 13 }}>
            {detail.paymentMode} · {new Date(detail.createdAt).toLocaleString()}
            {detail.status === 'Voided' ? ' · VOIDED' : ''}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Qty</th>
                  <th>Returned</th>
                  <th>Price</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {activeLines.map((l) => (
                  <tr key={l.productRef}>
                    <td>{l.productName}</td>
                    <td className="muted">{l.batchAllocations.map((a) => a.batchNumber ?? '—').join(', ')}</td>
                    <td>{l.qty}</td>
                    <td>{l.returnedQty}</td>
                    <td>{formatINR(l.unitPrice)}</td>
                    <td>{formatINR(l.netQty * l.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, fontWeight: 600 }}>Net total {formatINR(revenue)}</div>
          {detail.paymentMode === 'Credit' ? (
            <div className="muted" style={{ fontSize: 13 }}>
              Collected {formatINR(detail.amountCollected ?? 0)} · due {formatINR(due)}
            </div>
          ) : null}
        </PrintDocument>
        {canRecord && detail.status !== 'Voided' && detail.status !== 'Returned' ? (
          <div className="row">
            {!detail.returnedLines.length ? (
              <Button variant="danger" onClick={() => setVoidId(detail.id)}>
                Void sale
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setReturnOpen(true)}>
              Return lines
            </Button>
          </div>
        ) : null}
        {detail.voidReason ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Void reason: {detail.voidReason}
          </div>
        ) : null}

        <ConfirmDialog
          open={!!voidId}
          title="Void sale"
          body="Stock will be restored to the original batches."
          requireReason
          tone="danger"
          confirmLabel="Void sale"
          onClose={() => setVoidId(null)}
          onConfirm={async (reason) => {
            const res = await voidCustomerSale({
              actor: user,
              pharmacy: business,
              saleId: voidId!,
              reason: reason!,
            });
            pushToast(res.ok ? { tone: 'info', title: 'Sale voided' } : { tone: 'error', title: res.message });
            setVoidId(null);
          }}
        />

        <Modal
          open={returnOpen}
          title="Return sale lines"
          onClose={() => setReturnOpen(false)}
          footer={
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setReturnOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const returns = detail.lines
                      .map((l) => ({ productRef: l.productRef, qty: returnQtys[l.productRef] ?? 0 }))
                      .filter((r) => r.qty > 0);
                    const res = await returnCustomerSaleLines({
                      actor: user,
                      pharmacy: business,
                      saleId: detail.id,
                      returns,
                      reason: returnReason,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Return recorded' } : { tone: 'error', title: res.message });
                    if (res.ok) {
                      setReturnOpen(false);
                      setReturnQtys({});
                      setReturnReason('');
                    }
                  })
                }
              >
                Confirm return
              </Button>
            </div>
          }
        >
          <div className="stack">
            {detail.lines.map((l) => {
              const max = l.qty - l.returnedQty;
              if (max <= 0) return null;
              return (
                <Field key={l.productRef} label={`${l.productName} (max ${max})`}>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    value={returnQtys[l.productRef] ?? 0}
                    onChange={(e) => setReturnQtys((prev) => ({ ...prev, [l.productRef]: Number(e.target.value) }))}
                  />
                </Field>
              );
            })}
            <Field label="Reason">
              <Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
            </Field>
          </div>
        </Modal>

        <Modal
          open={collectOpen}
          title={`Collect — ${detail.saleNo}`}
          onClose={() => setCollectOpen(false)}
          footer={
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setCollectOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const res = await collectCustomerSalePayment({
                      actor: user,
                      pharmacy: business,
                      saleId: detail.id,
                      amount: Number(collectAmount),
                      note: collectNote,
                    });
                    pushToast(
                      res.ok
                        ? { tone: 'success', title: 'Payment collected', message: `Remaining due ${formatINR(saleCreditOutstanding(res.data))}` }
                        : { tone: 'error', title: res.message },
                    );
                    if (res.ok) {
                      setCollectOpen(false);
                      setCollectAmount('');
                      setCollectNote('');
                    }
                  })
                }
              >
                Record collection
              </Button>
            </div>
          }
        >
          <div className="stack">
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {detail.customerName}
              {detail.phone ? ` · ${detail.phone}` : ''} · outstanding {formatINR(due)}
            </p>
            <Field label="Amount">
              <Input
                type="number"
                min={0.01}
                max={due}
                step="0.01"
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
              />
            </Field>
            <Field label="Note (optional)">
              <Input value={collectNote} onChange={(e) => setCollectNote(e.target.value)} placeholder="Cash / UPI ref" />
            </Field>
            {(detail.collections ?? []).length ? (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Prior collections
                </div>
                {(detail.collections ?? []).map((c) => (
                  <div key={c.id} style={{ fontSize: 13 }}>
                    {formatINR(c.amount)} · {new Date(c.at).toLocaleString()}
                    {c.note ? ` · ${c.note}` : ''}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Customer sales"
        subtitle="Retail POS from pharmacy inventory — not B2B trade"
        actions={
          canRecord ? (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              New sale
            </Button>
          ) : null
        }
      />

      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="card card-pad" style={{ minWidth: 140 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Today count
          </div>
          <strong>{daySales.length}</strong>
        </div>
        <div className="card card-pad" style={{ minWidth: 140 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Today revenue
          </div>
          <strong>{formatINR(dayRevenue)}</strong>
        </div>
        <div className="card card-pad" style={{ minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Mode split
          </div>
          <strong style={{ fontSize: 13 }}>
            {Object.keys(modeSplit).length
              ? Object.entries(modeSplit)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(' · ')
              : '—'}
          </strong>
        </div>
        <div className="card card-pad" style={{ minWidth: 160 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Credit outstanding
          </div>
          <strong>{formatINR(creditDueTotal)}</strong>
          <div className="muted" style={{ fontSize: 11 }}>
            {creditDueSales.length} open
          </div>
        </div>
      </div>

      {creditDueSales.length ? (
        <div className="card card-pad stack">
          <strong>Credit receivables</strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Walk-in credit sales awaiting collection (name + phone on the sale).
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Sale</th>
                  <th>Customer</th>
                  <th>Due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {creditDueSales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/pharmacy/sales/${s.saleNo}`}>{s.saleNo}</Link>
                    </td>
                    <td>
                      {s.customerName}
                      {s.phone ? <div className="muted" style={{ fontSize: 11 }}>{s.phone}</div> : null}
                    </td>
                    <td>{formatINR(saleCreditOutstanding(s))}</td>
                    <td>
                      <Link className="btn btn-secondary btn-sm" to={`/pharmacy/sales/${s.saleNo}`}>
                        Collect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="row">
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>

      {salesLoading ? (
        <LoadingState label="Loading sales…" />
      ) : !sales.length ? (
        <EmptyState
          title="No customer sales yet"
          description="Record walk-in or phone sales from received pharmacy stock."
          action={
            canRecord ? (
              <Button onClick={() => setNewOpen(true)}>New sale</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ListToolbar
            query={saleList.query}
            onQuery={saleList.setQuery}
            placeholder="Search sale / customer / mode / status"
            filters={[
              {
                key: 'paymentMode',
                label: 'Mode',
                options: ['Cash', 'UPI', 'Credit'].map((m) => ({ value: m, label: m })),
              },
              {
                key: 'status',
                label: 'Status',
                options: ['Completed', 'PartiallyReturned', 'Returned', 'Voided'].map((s) => ({ value: s, label: s })),
              },
            ]}
            filterValues={saleList.filterValues}
            onFilter={saleList.setFilter}
            onExport={() => {
              const ok = saleList.doExport(`pharmacy-sales-${business.id}.csv`);
              pushToast(ok ? { tone: 'success', title: 'Exported sales' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable
            stickyHeader
            scrollBody
            tableSectionRef={tableRef}
            loading={salesLoading}
            columns={saleColumns}
            rows={saleList.pageRows}
            sortKey={saleList.sortKey}
            sortDir={saleList.sortDir}
            onSort={saleList.toggleSort}
            onRowClick={(s) => navigate(`/pharmacy/sales/${s.saleNo}`)}
          />
          <PaginationBar
            page={saleList.page}
            pageCount={saleList.pageCount}
            total={saleList.total}
            onPage={saleList.setPage}
            pageSize={saleList.pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
        </>
      )}

      <Modal
        open={newOpen}
        title="New sale"
        onClose={() => {
          setNewOpen(false);
          resetForm();
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setNewOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const lines: { inventoryId: string; qty: number; unitPrice: number }[] = [];
                  for (const l of draftLines) {
                    if (l.qty === '' || l.unitPrice === '') {
                      pushToast({ tone: 'error', title: 'Fill quantity and unit price on every line' });
                      return;
                    }
                    if (!(l.qty > 0)) {
                      pushToast({ tone: 'error', title: 'Quantity must be greater than zero' });
                      return;
                    }
                    lines.push({ inventoryId: l.inventoryId, qty: l.qty, unitPrice: l.unitPrice });
                  }
                  const res = await createCustomerSale({
                    actor: user,
                    pharmacy: business,
                    customerName,
                    phone,
                    paymentMode,
                    homeDelivery,
                    address,
                    lines,
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  pushToast({ tone: 'success', title: 'Sale recorded', message: res.data.saleNo });
                  setNewOpen(false);
                  resetForm();
                })
              }
            >
              Save sale
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Customer name">
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label={paymentMode === 'Credit' ? 'Phone (required for credit)' : 'Phone (optional)'}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Payment mode">
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as CustomerSalePaymentMode)}>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Credit">Credit (track receivable)</option>
            </Select>
          </Field>
          {paymentMode === 'Credit' ? (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Sale is recorded unpaid. Collect later from the receivables list or sale detail.
            </p>
          ) : null}
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={homeDelivery} onChange={(e) => setHomeDelivery(e.target.checked)} /> Home
            delivery
          </label>
          {homeDelivery ? (
            <Field label="Delivery address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          ) : null}

          <strong>Lines</strong>
          <BarcodeScanField
            label="Scan product / batch"
            onScan={(code) => {
              const c = code.toLowerCase();
              const hit = sellableInv.find(
                (i) =>
                  (i.batchNumber && i.batchNumber.toLowerCase() === c) ||
                  i.productName.toLowerCase().includes(c) ||
                  i.productId === code,
              );
              if (!hit) {
                pushToast({ tone: 'warning', title: 'No inventory match', message: code });
                return;
              }
              setPickInv(hit.id);
              setDraftLines((prev) => {
                const existing = prev.find((l) => l.inventoryId === hit.id);
                if (existing) {
                  return prev.map((l) =>
                    l.inventoryId === hit.id
                      ? { ...l, qty: (typeof l.qty === 'number' ? l.qty : 0) + 1 }
                      : l,
                  );
                }
                const mrp = hit.mrp ?? products.find((p) => p.id === hit.productId)?.mrp ?? 0;
                return [...prev, { inventoryId: hit.id, qty: 1, unitPrice: mrp }];
              });
            }}
          />
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="From inventory">
              <Select value={pickInv} onChange={(e) => setPickInv(e.target.value)}>
                <option value="">Select…</option>
                {sellableInv.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.productName} · on hand {i.onHand}
                    {i.batchNumber ? ` · ${i.batchNumber}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" disabled={!pickInv} onClick={addDraftLine}>
              Add line
            </Button>
          </div>
          {draftLines.map((l, idx) => {
            const item = inventory.find((i) => i.id === l.inventoryId);
            const lineTotal = (typeof l.qty === 'number' ? l.qty : 0) * (typeof l.unitPrice === 'number' ? l.unitPrice : 0);
            return (
              <div key={`${l.inventoryId}-${idx}`} className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1, fontSize: 13 }}>
                  {item?.productName ?? l.inventoryId}
                  <div className="muted" style={{ fontSize: 11 }}>
                    Line {formatINR(lineTotal)}
                  </div>
                </div>
                <Field label="Qty">
                  <Input
                    type="number"
                    min={1}
                    max={item?.onHand ?? 1}
                    value={l.qty}
                    onChange={(e) =>
                      setDraftLines((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, qty: nextNumberFieldValue(e.target.value, x.qty) } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Unit price">
                  <Input
                    type="number"
                    min={0}
                    value={l.unitPrice}
                    onChange={(e) =>
                      setDraftLines((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, unitPrice: nextNumberFieldValue(e.target.value, x.unitPrice) } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Button size="sm" variant="secondary" onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </Button>
              </div>
            );
          })}
          {draftLines.length ? (
            <div className="row" style={{ justifyContent: 'space-between', fontWeight: 600 }}>
              <span>Running total</span>
              <span>
                {formatINR(
                  draftLines.reduce(
                    (s, l) =>
                      s + (typeof l.qty === 'number' ? l.qty : 0) * (typeof l.unitPrice === 'number' ? l.unitPrice : 0),
                    0,
                  ),
                )}
              </span>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

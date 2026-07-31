import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../data/db';
import { availableQty, expiryRiskBand, stockistReceivables } from '../../domain/calc';
import { formatINR } from '../../domain/utils/money';
import { newId } from '../../domain/utils/ids';
import { importProductsCsv, upsertProduct } from '../../services/catalogueService';
import { respondConnection } from '../../services/connectionService';
import { acceptOrder, rejectOrder } from '../../services/orderService';
import {
  allocateOrder,
  createAndDispatchDelivery,
  issueInvoice,
  packOrder,
  updateDeliveryStatus,
} from '../../services/fulfilmentService';
import { applyCreditNote, issueCreditNote, reviewPayment, reviewReturn } from '../../services/paymentService';
import { createTicket, sendMessage } from '../../services/supportService';
import { inviteStaff } from '../../services/authService';
import { stockistAnalytics } from '../../services/analyticsService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { AnalyticsDashboard } from '../../ui/components/AnalyticsDashboard';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Kpi, Money, PageHeader, Select, StatusBadge, Textarea } from '../../ui/components/primitives';

function useBiz() {
  const { user, business } = useSession();
  return { user: user!, business: business! };
}

export function StockistHome() {
  const { business } = useBiz();
  const orders = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const payments = useLiveQuery(() => db.payments.where({ stockistId: business.id, status: 'Submitted' }).toArray(), [business.id]) ?? [];
  const requests = useLiveQuery(() => db.connections.where({ stockistId: business.id, status: 'Requested' }).toArray(), [business.id]) ?? [];
  const pending = orders.filter((o) => o.status === 'Pending').length;
  const toFulfil = orders.filter((o) => ['Accepted', 'Allocated', 'Packed'].includes(o.status)).length;
  const chart = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const d = o.placedAt.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + o.grandTotal);
    }
    return [...map.entries()].slice(-8).map(([day, total]) => ({ day: day.slice(5), total }));
  }, [orders]);

  return (
    <div className="stack">
      <PageHeader title="Stockist home" subtitle="Fulfilment queues and receivables" />
      <div className="kpi-grid">
        <Kpi label="Pending orders" value={pending} sub="Accept / reject" />
        <Kpi label="In fulfilment" value={toFulfil} />
        <Kpi label="Receivables" value={<Money value={stockistReceivables(invoices, business.id)} />} />
        <Kpi label="Payments to review" value={payments.length} />
      </div>
      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Queues</strong>
          <Link className="card card-pad queue-card" to="/stockist/orders">
            {pending} orders awaiting accept
          </Link>
          <Link className="card card-pad queue-card" to="/stockist/pharmacies">
            {requests.length} connection requests
          </Link>
          <Link className="card card-pad queue-card" to="/stockist/payments">
            {payments.length} payments to approve
          </Link>
          <div className="row">
            <Link className="btn btn-primary" to="/stockist/orders">
              Fulfil orders
            </Link>
            <Link className="btn btn-secondary" to="/stockist/payments">
              Approve payments
            </Link>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Sales</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Bar dataKey="total" fill="#4A7399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockistOrders() {
  const { business } = useBiz();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const orders = useLiveQuery(() => db.orders.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const columns = useMemo(
    () => [
      {
        key: 'orderNo',
        label: 'Order',
        getValue: (o: (typeof orders)[0]) => o.orderNo,
        render: (o: (typeof orders)[0]) => <Link to={`/stockist/orders/${o.orderNo}`}>{o.orderNo}</Link>,
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (o: (typeof orders)[0]) => o.status,
        render: (o: (typeof orders)[0]) => <StatusBadge status={o.status} />,
      },
      {
        key: 'grandTotal',
        label: 'Total',
        getValue: (o: (typeof orders)[0]) => o.grandTotal,
        render: (o: (typeof orders)[0]) => <Money value={o.grandTotal} />,
      },
      {
        key: 'placedAt',
        label: 'Placed',
        getValue: (o: (typeof orders)[0]) => o.placedAt,
        render: (o: (typeof orders)[0]) => <span className="muted">{new Date(o.placedAt).toLocaleString()}</span>,
      },
    ],
    [],
  );
  const list = useListControls(orders, {
    columns,
    searchKeys: [(o) => `${o.orderNo} ${o.status} ${o.pharmacyId}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Pending', 'Accepted', 'Allocated', 'Packed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'].map((s) => ({
          value: s,
          label: s,
        })),
      },
    ],
    defaultSortKey: 'placedAt',
    defaultSortDir: 'desc',
  });
  return (
    <div className="stack">
      <PageHeader title="Orders inbox" subtitle="Search / filter / sort / export — stockist scope only" />
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search order number"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['Pending', 'Accepted', 'Allocated', 'Packed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'].map((s) => ({
              value: s,
              label: s,
            })),
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport(`stockist-orders-${business.id}.csv`);
          pushToast({ tone: 'success', title: 'Exported filtered orders' });
        }}
      />
      <DataListTable
        columns={columns}
        rows={list.pageRows}
        sortKey={list.sortKey}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        onRowClick={(o) => navigate(`/stockist/orders/${o.orderNo}`)}
      />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
    </div>
  );
}

export function StockistOrderDetail() {
  const { orderNo } = useParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const order = useLiveQuery(() => db.orders.where('orderNo').equals(orderNo!).first(), [orderNo]);
  const staff = useLiveQuery(() => db.users.where('businessId').equals(business.id).filter((u) => u.role === 'DeliveryBoy').toArray(), [business.id]) ?? [];
  const [rejectReason, setRejectReason] = useState('');
  const [assignee, setAssignee] = useState('');

  if (!order) return <EmptyState title="Order not found" description="" />;

  const act = async (fn: () => Promise<{ ok: boolean; message?: string; businessImpact?: string; data?: { orderNo?: string; invoiceNo?: string; deliveryNo?: string } }>, okTitle: string) => {
    const res = await fn();
    pushToast(
      res.ok
        ? { tone: 'success', title: okTitle, message: res.data?.orderNo || res.data?.invoiceNo || res.data?.deliveryNo }
        : { tone: 'error', title: res.message!, message: res.businessImpact },
    );
  };

  return (
    <div className="stack">
      <PageHeader title={order.orderNo} subtitle={order.status} />
      <div className="row">
        {order.status === 'Pending' ? (
          <>
            <Button onClick={() => act(() => acceptOrder({ actor: user, stockist: business, orderId: order.id }), 'Order accepted')}>Accept</Button>
            <Input placeholder="Reject reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ maxWidth: 220 }} />
            <Button variant="danger" onClick={() => act(() => rejectOrder({ actor: user, stockist: business, orderId: order.id, reason: rejectReason }), 'Order rejected')}>
              Reject
            </Button>
          </>
        ) : null}
        {['Accepted', 'PartiallyAccepted'].includes(order.status) ? (
          <Button onClick={() => act(() => allocateOrder({ actor: user, stockist: business, orderId: order.id }), 'Allocated (FEFO)')}>
            Allocate (FEFO)
          </Button>
        ) : null}
        {order.status === 'Allocated' ? (
          <Button onClick={() => act(() => packOrder({ actor: user, stockist: business, orderId: order.id }), 'Packed')}>Pack</Button>
        ) : null}
        {order.status === 'Packed' && !order.invoiceId ? (
          <Button onClick={() => act(() => issueInvoice({ actor: user, stockist: business, orderId: order.id }), 'Invoice issued')}>
            Issue invoice
          </Button>
        ) : null}
        {order.status === 'Packed' && order.invoiceId ? (
          <>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Assign delivery boy…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button
              onClick={() =>
                act(
                  () => createAndDispatchDelivery({ actor: user, stockist: business, orderId: order.id, assigneeId: assignee || undefined }),
                  'Dispatched',
                )
              }
            >
              Dispatch
            </Button>
          </>
        ) : null}
      </div>
      <div className="grid-2">
        <div className="card card-pad">
          <strong>Lines</strong>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Allocated</th>
                  <th>Batches</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.productName}</td>
                    <td>{l.qty}</td>
                    <td>{l.allocatedQty ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.batchAllocations?.map((b) => `${b.batchNumber}×${b.qty}`).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card card-pad">
          <strong>Timeline</strong>
          <div className="timeline" style={{ marginTop: 12 }}>
            {order.statusHistory.map((h, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-dot" />
                <div>
                  {h.from} → <strong>{h.to}</strong>
                  <div className="muted">{new Date(h.at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockistConnections() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const connections = useLiveQuery(() => db.connections.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const [tab, setTab] = useState('Requested');
  const filtered = connections.filter((c) => (tab === 'All' ? true : c.status === tab));
  return (
    <div className="stack">
      <PageHeader title="Pharmacies" subtitle="Connection relationship management" />
      <div className="tabs">
        {['Requested', 'Active', 'Rejected', 'Disconnected', 'Blocked', 'All'].map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {filtered.map((c) => {
        const p = pharmacies.find((x) => x.id === c.pharmacyId);
        return (
          <div key={c.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{p?.name}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {p?.city} · GST {p?.gstNumber}
              </div>
            </div>
            <div className="row">
              <StatusBadge status={c.status} />
              {c.status === 'Requested' ? (
                <>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const res = await respondConnection({ actor: user, stockist: business, connectionId: c.id, decision: 'Active', creditDays: 30 });
                      pushToast(res.ok ? { tone: 'success', title: 'Connection approved' } : { tone: 'error', title: res.message });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      const res = await respondConnection({
                        actor: user,
                        stockist: business,
                        connectionId: c.id,
                        decision: 'Rejected',
                        reason: 'Incomplete documents / commercial fit',
                      });
                      pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
                    }}
                  >
                    Reject
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StockistCatalogue() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [csv, setCsv] = useState('name,sku,brand,category,packSize,mrp,ptr,gstPercent,moq\nDemo Cap,DEMO-CAP,Demo,Capsules,10 Cap,80,55,12,5');
  const [importReport, setImportReport] = useState<{ succeeded: string[]; failed: { sku: string; reason: string }[] } | null>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    brand: '',
    category: 'Tablets',
    packSize: '10 Tab',
    mrp: 100,
    ptr: 70,
    gstPercent: 12,
    moq: 5,
  });
  const columns = useMemo(
    () => [
      { key: 'name', label: 'Name', getValue: (p: (typeof products)[0]) => p.name },
      { key: 'sku', label: 'SKU', getValue: (p: (typeof products)[0]) => p.sku },
      { key: 'category', label: 'Category', getValue: (p: (typeof products)[0]) => p.category },
      { key: 'ptr', label: 'PTR', getValue: (p: (typeof products)[0]) => p.ptr, render: (p: (typeof products)[0]) => <Money value={p.ptr} /> },
      { key: 'gstPercent', label: 'GST', getValue: (p: (typeof products)[0]) => p.gstPercent, render: (p: (typeof products)[0]) => `${p.gstPercent}%` },
      { key: 'status', label: 'Status', getValue: (p: (typeof products)[0]) => p.status, render: (p: (typeof products)[0]) => <StatusBadge status={p.status} /> },
    ],
    [],
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
  return (
    <div className="stack">
      <PageHeader title="Catalogue" subtitle={`${products.length} products · import supports partial success`} />
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
          pushToast({ tone: 'success', title: 'Catalogue exported (current filters)' });
        }}
      />
      <DataListTable columns={columns} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
      <div className="card card-pad stack">
        <strong>Add product</strong>
        <div className="grid-3">
          {(['name', 'sku', 'brand', 'category', 'packSize'] as const).map((k) => (
            <Field key={k} label={k}>
              <Input value={String(form[k])} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </Field>
          ))}
          <Field label="MRP">
            <Input type="number" value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: Number(e.target.value) }))} />
          </Field>
          <Field label="PTR">
            <Input type="number" value={form.ptr} onChange={(e) => setForm((f) => ({ ...f, ptr: Number(e.target.value) }))} />
          </Field>
          <Field label="MOQ">
            <Input type="number" value={form.moq} onChange={(e) => setForm((f) => ({ ...f, moq: Number(e.target.value) }))} />
          </Field>
        </div>
        <Button
          onClick={async () => {
            const res = await upsertProduct({ actor: user, stockist: business, product: form });
            pushToast(res.ok ? { tone: 'success', title: 'Product added' } : { tone: 'error', title: res.message });
          }}
        >
          Save product
        </Button>
      </div>
      <div className="card card-pad stack">
        <strong>Import CSV</strong>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Header: name,sku,brand,category,packSize,mrp,ptr,gstPercent,moq — partial success reports succeeded + failed rows.
        </p>
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
              }));
            const res = await importProductsCsv({ actor: user, stockist: business, rows });
            if (res.ok) {
              setImportReport(res.data);
              pushToast({
                tone: res.data.failed.length ? 'warning' : 'success',
                title: `Import finished: ${res.data.succeeded.length} ok, ${res.data.failed.length} failed`,
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

export function StockistInventory() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const batches = useLiveQuery(() => db.batches.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const products = useLiveQuery(() => db.products.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(50);
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  return (
    <div className="stack">
      <PageHeader title="Inventory & batches" />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>On hand</th>
              <th>Reserved</th>
              <th>Available</th>
              <th>Band</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const p = products.find((x) => x.id === b.productId);
              return (
                <tr key={b.id}>
                  <td>{p?.name ?? b.productId}</td>
                  <td>{b.batchNumber}</td>
                  <td>{b.expiryDate}</td>
                  <td>{b.onHand}</td>
                  <td>{b.reserved}</td>
                  <td>{availableQty(b)}</td>
                  <td><StatusBadge status={expiryRiskBand(b.expiryDate)} /></td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          <Field label="Batch number">
            <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          </Field>
          <Field label="Expiry">
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
          <Field label="Qty">
            <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </Field>
        </div>
        <Button
          onClick={async () => {
            if (!productId || !batchNumber || !expiryDate) {
              pushToast({ tone: 'warning', title: 'Fill all stock-in fields' });
              return;
            }
            const ts = new Date().toISOString();
            const id = newId();
            await db.batches.add({
              id,
              productId,
              stockistId: business.id,
              batchNumber,
              expiryDate,
              onHand: qty,
              reserved: 0,
              status: 'Available',
              createdAt: ts,
              updatedAt: ts,
            });
            await db.inventoryMovements.add({
              id: newId(),
              businessId: business.id,
              productId,
              batchId: id,
              type: 'StockIn',
              qty,
              reason: 'Manual stock in',
              actorId: user.id,
              prevQty: 0,
              newQty: qty,
              at: ts,
            });
            pushToast({ tone: 'success', title: 'Stock added' });
          }}
        >
          Add stock
        </Button>
      </div>
    </div>
  );
}

export function StockistDelivery() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const deliveries = useLiveQuery(() => db.deliveries.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const isBoy = user.role === 'DeliveryBoy';
  const visible = isBoy ? deliveries.filter((d) => d.assignedTo === user.id) : deliveries;

  return (
    <div className="stack">
      <PageHeader title={isBoy ? 'My delivery board' : 'Delivery'} subtitle="Assign, out for delivery, POD" />
      {visible.map((d) => (
        <div key={d.id} className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{d.deliveryNo}</strong>
            <StatusBadge status={d.status} />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Order {d.orderId.slice(0, 8)}… · {d.lines.length} lines
          </div>
          <div className="row">
            {d.status === 'Assigned' || d.status === 'Created' ? (
              <Button
                size="sm"
                onClick={async () => {
                  const res = await updateDeliveryStatus({ actor: user, stockist: business, deliveryId: d.id, status: 'OutForDelivery' });
                  pushToast(res.ok ? { tone: 'success', title: 'Out for delivery' } : { tone: 'error', title: res.message });
                }}
              >
                Out for delivery
              </Button>
            ) : null}
            {d.status === 'OutForDelivery' ? (
              <>
                <Button
                  size="sm"
                  onClick={async () => {
                    const res = await updateDeliveryStatus({ actor: user, stockist: business, deliveryId: d.id, status: 'Delivered' });
                    pushToast(res.ok ? { tone: 'success', title: 'Delivered' } : { tone: 'error', title: res.message });
                  }}
                >
                  Mark delivered
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    const res = await updateDeliveryStatus({
                      actor: user,
                      stockist: business,
                      deliveryId: d.id,
                      status: 'Failed',
                      failReason: 'Customer closed',
                    });
                    pushToast(res.ok ? { tone: 'warning', title: 'Delivery failed' } : { tone: 'error', title: res.message });
                  }}
                >
                  Failed
                </Button>
              </>
            ) : null}
            {d.status === 'Failed' ? (
              <Button
                size="sm"
                onClick={async () => {
                  const res = await updateDeliveryStatus({ actor: user, stockist: business, deliveryId: d.id, status: 'OutForDelivery' });
                  pushToast(res.ok ? { tone: 'info', title: 'Retry started' } : { tone: 'error', title: res.message });
                }}
              >
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {!visible.length ? <EmptyState title="No deliveries" description="Dispatch a packed & invoiced order to create one." /> : null}
    </div>
  );
}

export function StockistPayments() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const payments = useLiveQuery(() => db.payments.where('stockistId').equals(business.id).reverse().sortBy('createdAt'), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Payments & invoices" subtitle={`Receivables ${formatINR(stockistReceivables(invoices, business.id))}`} />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Payment</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Reference</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.paymentNo}</td>
                <td><StatusBadge status={p.status} /></td>
                <td><Money value={p.amount} /></td>
                <td>{p.reference ?? '—'}</td>
                <td>
                  {['Submitted', 'UnderReview', 'OnHold'].includes(p.status) ? (
                    <div className="row">
                      <Button
                        size="sm"
                        onClick={async () => {
                          const res = await reviewPayment({ actor: user, stockist: business, paymentId: p.id, decision: 'Approved' });
                          pushToast(res.ok ? { tone: 'success', title: 'Payment approved' } : { tone: 'error', title: res.message });
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          const res = await reviewPayment({
                            actor: user,
                            stockist: business,
                            paymentId: p.id,
                            decision: 'Rejected',
                            reason: 'Proof mismatch',
                          });
                          pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ margin: '8px 0 0', fontSize: 15 }}>Invoices</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Status</th>
              <th>Total</th>
              <th>Outstanding</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.invoiceNo}</td>
                <td><StatusBadge status={i.status} /></td>
                <td><Money value={i.grandTotal} /></td>
                <td><Money value={i.outstanding} /></td>
                <td>{i.dueDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StockistReturns() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const returns = useLiveQuery(() => db.returns.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Returns review" />
      {returns.map((r) => (
        <div key={r.id} className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{r.returnNo}</strong>
            <StatusBadge status={r.status} />
          </div>
          {r.lines.map((l) => (
            <div key={l.productId} className="muted" style={{ fontSize: 13 }}>
              {l.productName} × {l.qty} — {l.reason}
            </div>
          ))}
          {['Submitted', 'UnderReview'].includes(r.status) ? (
            <div className="row">
              <Button
                size="sm"
                onClick={async () => {
                  const res = await reviewReturn({ actor: user, stockist: business, returnId: r.id, decision: 'Approved', disposition: 'Quarantine' });
                  pushToast(res.ok ? { tone: 'success', title: 'Return approved' } : { tone: 'error', title: res.message });
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const res = await reviewReturn({
                    actor: user,
                    stockist: business,
                    returnId: r.id,
                    decision: 'Rejected',
                    reason: 'Outside policy',
                  });
                  pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
                }}
              >
                Reject
              </Button>
            </div>
          ) : null}
          {['Approved', 'PartiallyApproved'].includes(r.status) && !r.creditNoteId ? (
            <Button
              size="sm"
              onClick={async () => {
                const res = await issueCreditNote({ actor: user, stockist: business, returnId: r.id });
                pushToast(res.ok ? { tone: 'success', title: 'Credit note issued', message: res.data.creditNoteNo } : { tone: 'error', title: res.message });
              }}
            >
              Issue credit note
            </Button>
          ) : null}
        </div>
      ))}
      {!returns.length ? <EmptyState title="No returns" description="Pharmacy-raised returns appear here." /> : null}
    </div>
  );
}

export function StockistCreditNotes() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const notes = useLiveQuery(() => db.creditNotes.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).filter((i) => i.outstanding > 0).toArray(), [business.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Credit notes" />
      {notes.map((c) => (
        <div key={c.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>{c.creditNoteNo}</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              Remaining <Money value={c.remaining} /> · <StatusBadge status={c.status} />
            </div>
          </div>
          <Button
            size="sm"
            disabled={c.remaining <= 0 || !invoices.length}
            onClick={async () => {
              const inv = invoices.find((i) => i.pharmacyId === c.pharmacyId) ?? invoices[0];
              const res = await applyCreditNote({
                actor: user,
                business,
                creditNoteId: c.id,
                invoiceId: inv.id,
                amount: Math.min(c.remaining, inv.outstanding),
              });
              pushToast(res.ok ? { tone: 'success', title: 'Credit applied' } : { tone: 'error', title: res.message });
            }}
          >
            Apply
          </Button>
        </div>
      ))}
    </div>
  );
}

export function StockistAnalytics() {
  const { business } = useBiz();
  return (
    <AnalyticsDashboard
      title="Stockist analytics"
      subtitle="Receivables must match invoice outstanding sum"
      load={() => stockistAnalytics(business.id)}
    />
  );
}

export function StockistStaff() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const staff = useLiveQuery(() => db.users.where('businessId').equals(business.id).toArray(), [business.id]) ?? [];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'Staff' | 'Accountant' | 'Manager' | 'DeliveryBoy'>('Staff');
  return (
    <div className="stack">
      <PageHeader title="Staff" />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.role}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card card-pad stack">
        <strong>Invite</strong>
        <div className="grid-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option>Staff</option>
              <option>Accountant</option>
              <option>Manager</option>
              <option>DeliveryBoy</option>
            </Select>
          </Field>
        </div>
        <Button
          onClick={async () => {
            const res = await inviteStaff({ actor: user, business, name, email, phone, role });
            pushToast(res.ok ? { tone: 'success', title: 'Invited', message: res.data.inviteToken } : { tone: 'error', title: res.message });
          }}
        >
          Invite
        </Button>
      </div>
    </div>
  );
}

export function StockistMessages() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const threads = useLiveQuery(() => db.messageThreads.toArray(), []) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const mine = threads.filter((t) => t.participantBusinessIds.includes(business.id));
  const [threadId, setThreadId] = useState(mine[0]?.id);
  const [body, setBody] = useState('');
  const messages =
    useLiveQuery(async () => {
      if (!threadId) return [];
      return db.messages.where('threadId').equals(threadId).sortBy('createdAt');
    }, [threadId]) ?? [];
  const conn = useLiveQuery(() => db.connections.where({ stockistId: business.id, status: 'Active' }).first(), [business.id]);

  return (
    <div className="stack">
      <PageHeader title="Messages" subtitle="Shared threads with connected pharmacies — never workflow authority" />
      <div className="banner-strip warning">Messages cannot accept orders or approve payments.</div>
      <div className="grid-2">
        <div className="card card-pad stack">
          {mine.map((t) => {
            const otherId = t.participantBusinessIds.find((id) => id !== business.id);
            const other = businesses.find((b) => b.id === otherId);
            return (
              <button key={t.id} type="button" className={`btn ${threadId === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setThreadId(t.id)}>
                {other?.name ?? 'Pharmacy'} · {new Date(t.lastMessageAt).toLocaleString()}
              </button>
            );
          })}
          {!mine.length ? <EmptyState title="No threads" description="Pharmacy can start a thread; you can reply here." /> : null}
        </div>
        <div className="card card-pad stack">
          {messages.map((m) => (
            <div key={m.id} style={{ fontSize: 13 }}>
              <strong>{m.senderId === user.id ? 'You' : 'Pharmacy'}</strong>: {m.body}
            </div>
          ))}
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
          <Button
            onClick={async () => {
              if (!conn) {
                pushToast({ tone: 'warning', title: 'No active pharmacy connection' });
                return;
              }
              const res = await sendMessage({
                actor: user,
                business,
                counterpartBusinessId: conn.pharmacyId,
                body,
                threadId,
              });
              if (res.ok) {
                setThreadId(res.data.thread.id);
                setBody('');
              } else pushToast({ tone: 'error', title: res.message });
            }}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StockistSupport() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const tickets = useLiveQuery(() => db.supportTickets.where('businessId').equals(business.id).toArray(), [business.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Support" />
      <div className="card card-pad stack">
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Body"><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Button
          onClick={async () => {
            const res = await createTicket({ actor: user, business, subject, category: 'Operations', body });
            pushToast(res.ok ? { tone: 'success', title: res.data.ticketNo } : { tone: 'error', title: res.message });
          }}
        >
          Create ticket
        </Button>
      </div>
      {tickets.map((t) => (
        <div key={t.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
          <span>{t.ticketNo}: {t.subject}</span>
          <StatusBadge status={t.status} />
        </div>
      ))}
    </div>
  );
}

export function StockistNotifications() {
  const { user } = useBiz();
  const notes = useLiveQuery(() => db.notifications.where('userId').equals(user.id).reverse().sortBy('createdAt'), [user.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Notifications" />
      {notes.map((n) => (
        <div key={n.id} className="card card-pad">
          <strong>{n.title}</strong>
          <div style={{ fontSize: 13.5 }}>{n.body}</div>
        </div>
      ))}
    </div>
  );
}

export function StockistSettings() {
  const { business } = useBiz();
  return (
    <div className="stack">
      <PageHeader title="Settings" />
      <div className="card card-pad stack">
        <div><strong>{business.name}</strong></div>
        <div className="muted">Service PINs: {business.servicePins?.join(', ')}</div>
        <div className="muted">UPI: {business.upiId}</div>
      </div>
    </div>
  );
}

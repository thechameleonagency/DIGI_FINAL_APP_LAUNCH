import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { submitReturn } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { FileUpload } from '../../../ui/components/FileUpload';
import { Button, EmptyState, Field, Input, Modal, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyReturns() {
  const { business, user } = useBiz();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const returns = useLiveQuery(() => db.returns.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const credits = useLiveQuery(() => db.creditNotes.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const [newOpen, setNewOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [evidenceFileId, setEvidenceFileId] = useState<string | undefined>();

  const deliveredOrders = orders.filter((o) => ['Delivered', 'PartiallyDelivered', 'Closed'].includes(o.status));
  const picked = deliveredOrders.find((o) => o.id === orderId);

  const rows = useMemo(
    () =>
      returns.map((r) => {
        const order = orders.find((o) => o.id === r.orderId);
        const cn = credits.find((c) => c.id === r.creditNoteId || c.returnId === r.id);
        const value = r.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
        return {
          ...r,
          stockistName: stockists.find((s) => s.id === r.stockistId)?.name ?? r.stockistId.slice(0, 6),
          orderNo: order?.orderNo ?? '—',
          reasons: [...new Set(r.lines.map((l) => l.reason))].join(', '),
          value,
          cnNo: cn?.creditNoteNo ?? '—',
        };
      }),
    [returns, orders, stockists, credits],
  );

  const columns = useMemo(
    () => [
      { key: 'returnNo', label: 'Return', getValue: (r: (typeof rows)[0]) => r.returnNo },
      { key: 'stockistName', label: 'Stockist', getValue: (r: (typeof rows)[0]) => r.stockistName },
      {
        key: 'status',
        label: 'Status',
        getValue: (r: (typeof rows)[0]) => r.status,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.status} />,
      },
      { key: 'reasons', label: 'Reasons', getValue: (r: (typeof rows)[0]) => r.reasons },
      {
        key: 'value',
        label: 'Value',
        getValue: (r: (typeof rows)[0]) => r.value,
        render: (r: (typeof rows)[0]) => <Money value={r.value} />,
      },
      { key: 'cnNo', label: 'Credit note', getValue: (r: (typeof rows)[0]) => r.cnNo },
      {
        key: 'createdAt',
        label: 'Created',
        getValue: (r: (typeof rows)[0]) => r.createdAt,
        render: (r: (typeof rows)[0]) => <span className="muted">{new Date(r.createdAt).toLocaleString()}</span>,
      },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.returnNo} ${r.stockistName} ${r.status} ${r.reasons} ${r.cnNo}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Submitted', 'UnderReview', 'Approved', 'PartiallyApproved', 'Rejected', 'GoodsReceived', 'Closed'].map(
          (s) => ({ value: s, label: s }),
        ),
      },
    ],
    defaultSortKey: 'createdAt',
    defaultSortDir: 'desc',
  });

  return (
    <div className="stack">
      <PageHeader
        title="Returns"
        subtitle="Search, filter, export — or raise a new return from a delivered order"
        actions={
          <Button size="sm" onClick={() => setNewOpen(true)}>
            New return
          </Button>
        }
      />
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New return"
        footer={
          <Button
            onClick={async () => {
              if (!picked) {
                pushToast({ tone: 'error', title: 'Pick a delivered order' });
                return;
              }
              const lines = picked.lines
                .filter((l) => (returnQty[l.productId] ?? 0) > 0)
                .map((l) => ({
                  productId: l.productId,
                  qty: returnQty[l.productId],
                  reason: returnReasons[l.productId] || 'Damaged',
                }));
              if (!lines.length) {
                pushToast({ tone: 'error', title: 'Enter at least one qty' });
                return;
              }
              const res = await submitReturn({
                actor: user,
                pharmacy: business,
                orderId: picked.id,
                lines,
                evidenceFileIds: evidenceFileId ? [evidenceFileId] : [],
              });
              pushToast(
                res.ok
                  ? { tone: 'success', title: 'Return submitted', message: res.data.returnNo }
                  : { tone: 'error', title: res.message },
              );
              if (res.ok) {
                setNewOpen(false);
                setReturnQty({});
                setOrderId('');
              }
            }}
          >
            Submit return
          </Button>
        }
      >
        <div className="stack">
          <Field label="Delivered order">
            <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Select…</option>
              {deliveredOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNo} · {stockists.find((s) => s.id === o.stockistId)?.name ?? o.stockistId.slice(0, 6)}
                </option>
              ))}
            </Select>
          </Field>
          {picked
            ? picked.lines.map((l) => (
                <div key={l.id} className="grid-2">
                  <Field label={`${l.productName} (delivered ${l.deliveredQty ?? l.qty})`}>
                    <Input
                      type="number"
                      min={0}
                      max={l.deliveredQty ?? l.qty}
                      value={returnQty[l.productId] ?? 0}
                      onChange={(e) => setReturnQty((q) => ({ ...q, [l.productId]: Number(e.target.value) }))}
                    />
                  </Field>
                  <Field label="Reason">
                    <Select
                      value={returnReasons[l.productId] ?? 'Damaged'}
                      onChange={(e) => setReturnReasons((r) => ({ ...r, [l.productId]: e.target.value }))}
                    >
                      {['Short', 'Damaged', 'Expired', 'Wrong item', 'Short dated', 'Other'].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ))
            : null}
          <FileUpload label="Evidence (optional)" value={evidenceFileId} onChange={setEvidenceFileId} />
        </div>
      </Modal>

      {!returns.length ? (
        <EmptyState
          title="No returns yet"
          description="No returns yet — raise one from a delivered order."
          action={
            <Button className="btn btn-primary" onClick={() => setNewOpen(true)}>
              New return
            </Button>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search return / stockist / reason / CN"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: ['Submitted', 'UnderReview', 'Approved', 'PartiallyApproved', 'Rejected', 'GoodsReceived', 'Closed'].map(
                  (s) => ({ value: s, label: s }),
                ),
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              const ok = list.doExport(`pharmacy-returns-${business.id}.csv`);
              pushToast(ok ? { tone: 'success', title: 'Exported returns' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable
            columns={columns}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(r) => navigate(`/pharmacy/orders/${r.orderNo}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
      <Link className="btn btn-secondary btn-sm" to="/pharmacy/orders">
        Browse orders
      </Link>
    </div>
  );
}

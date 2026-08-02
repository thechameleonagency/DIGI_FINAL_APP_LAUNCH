import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { makeIdempotencyKey } from '../../../domain/utils/idempotency';
import { cancelReturn, submitReturn } from '../../../services/paymentService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { returnApprovedValue, returnRequestedValue } from '../../../ui/components/ReturnDetail';
import { ReturnLinesForm, validateReturnLines } from '../../../ui/components/ReturnLinesForm';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Modal, Money, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyReturns() {
  const { business, user } = useBiz();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const { items: returns, loading: returnsLoading } = useLiveArray(
    () => db.returns.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const stockists = useLiveQuery(() => db.businesses.where('type').equals('Stockist').toArray()) ?? [];
  const credits = useLiveQuery(() => db.creditNotes.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const [newOpen, setNewOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [returnFieldErrors, setReturnFieldErrors] = useState<
    Record<string, { qty?: string; reason?: string }>
  >({});
  const [returnFormError, setReturnFormError] = useState<string | undefined>();
  const [orderError, setOrderError] = useState<string | undefined>();
  const [evidenceFileId, setEvidenceFileId] = useState<string | undefined>();
  const [cancelId, setCancelId] = useState<string | null>(null);

  const deliveredOrders = orders.filter((o) => ['Delivered', 'PartiallyDelivered', 'Closed'].includes(o.status));
  const picked = deliveredOrders.find((o) => o.id === orderId);
  const priorForOrder =
    useLiveQuery(
      () => (orderId ? db.returns.where('orderId').equals(orderId).toArray() : []),
      [orderId],
    ) ?? [];

  const rows = useMemo(
    () =>
      returns.map((r) => {
        const order = orders.find((o) => o.id === r.orderId);
        const cn = credits.find((c) => c.id === r.creditNoteId || c.returnId === r.id);
        const requested = returnRequestedValue(r.lines);
        const displayValue = cn ? cn.amount : r.lines.some((l) => l.approvedQty != null) ? returnApprovedValue(r.lines) : requested;
        return {
          ...r,
          stockistName: stockists.find((s) => s.id === r.stockistId)?.name ?? r.stockistId.slice(0, 6),
          orderNo: order?.orderNo ?? '—',
          reasons: [...new Set(r.lines.map((l) => l.reason))].join(', '),
          value: displayValue,
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
      {
        key: 'actions',
        label: '',
        getValue: () => '',
        render: (r: (typeof rows)[0]) =>
          r.status === 'Submitted' ? (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                setCancelId(r.id);
              }}
            >
              Cancel
            </Button>
          ) : null,
      },
    ],
    [busy],
  );

  const statusOpts = [
    'Submitted',
    'UnderReview',
    'Approved',
    'PartiallyApproved',
    'Rejected',
    'GoodsReceived',
    'Closed',
    'Cancelled',
  ].map((s) => ({ value: s, label: s }));

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.returnNo} ${r.stockistName} ${r.status} ${r.reasons} ${r.cnNo}`],
    filters: [{ key: 'status', label: 'Status', options: statusOpts }],
    defaultSortKey: 'createdAt',
    defaultSortDir: 'desc',
  });

  const resetForm = () => {
    setReturnQty({});
    setReturnReasons({});
    setReturnFieldErrors({});
    setReturnFormError(undefined);
    setOrderError(undefined);
    setEvidenceFileId(undefined);
    setOrderId('');
  };

  return (
    <div className="stack">
      <PageHeader
        title="Returns"
        subtitle="Search, filter, export — or raise a new return from a delivered order"
        actions={
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setNewOpen(true);
            }}
          >
            New return
          </Button>
        }
      />
      <ConfirmDialog
        open={!!cancelId}
        title="Cancel return"
        body="Withdraw this return before the stockist reviews it."
        requireReason
        tone="danger"
        confirmLabel="Cancel return"
        onClose={() => setCancelId(null)}
        onConfirm={async (reason) => {
          await run(async () => {
            const res = await cancelReturn({
              actor: user,
              pharmacy: business,
              returnId: cancelId!,
              reason,
            });
            pushToast(res.ok ? { tone: 'info', title: 'Return cancelled' } : { tone: 'error', title: res.message });
            setCancelId(null);
          });
        }}
      />
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New return"
        footer={
          <Button
            disabled={busy}
            onClick={() => {
              void run(async () => {
                if (!picked) {
                  setOrderError('Pick a delivered order');
                  return;
                }
                setOrderError(undefined);
                const check = validateReturnLines(picked, priorForOrder, returnQty, returnReasons);
                if (!check.ok) {
                  setReturnFieldErrors(check.fieldErrors);
                  setReturnFormError(Object.keys(check.fieldErrors).length ? undefined : check.message);
                  return;
                }
                setReturnFieldErrors({});
                setReturnFormError(undefined);
                const res = await submitReturn({
                  actor: user,
                  pharmacy: business,
                  orderId: picked.id,
                  lines: check.lines,
                  evidenceFileIds: evidenceFileId ? [evidenceFileId] : [],
                  idempotencyKey: makeIdempotencyKey(`ret-${picked.id}`, user.id),
                });
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Return submitted', message: res.data.returnNo }
                    : { tone: 'error', title: res.message },
                );
                if (res.ok) {
                  setNewOpen(false);
                  resetForm();
                }
              });
            }}
          >
            {busy ? 'Submitting…' : 'Submit return'}
          </Button>
        }
      >
        <div className="stack">
          <Field label="Delivered order" error={orderError}>
            <Select
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setOrderError(undefined);
                setReturnQty({});
                setReturnReasons({});
                setReturnFieldErrors({});
                setReturnFormError(undefined);
                setEvidenceFileId(undefined);
              }}
            >
              <option value="">Select…</option>
              {deliveredOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNo} · {stockists.find((s) => s.id === o.stockistId)?.name ?? o.stockistId.slice(0, 6)}
                </option>
              ))}
            </Select>
          </Field>
          {picked ? (
            <ReturnLinesForm
              order={picked}
              priorReturns={priorForOrder}
              returnQty={returnQty}
              returnReasons={returnReasons}
              evidenceFileId={evidenceFileId}
              fieldErrors={returnFieldErrors}
              formError={returnFormError}
              onQty={(productId, qty) => {
                setReturnFieldErrors((e) => {
                  if (!e[productId]?.qty) return e;
                  const next = { ...e };
                  const row = { ...next[productId], qty: undefined };
                  if (!row.reason) delete next[productId];
                  else next[productId] = row;
                  return next;
                });
                setReturnFormError(undefined);
                setReturnQty((q) => ({ ...q, [productId]: qty }));
              }}
              onReason={(productId, reason) => {
                setReturnFieldErrors((e) => {
                  if (!e[productId]?.reason) return e;
                  const next = { ...e };
                  const row = { ...next[productId], reason: undefined };
                  if (!row.qty) delete next[productId];
                  else next[productId] = row;
                  return next;
                });
                setReturnReasons((r) => ({ ...r, [productId]: reason }));
              }}
              onEvidence={setEvidenceFileId}
            />
          ) : null}
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
            filters={[{ key: 'status', label: 'Status', options: statusOpts }]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              const ok = list.doExport(`pharmacy-returns-${business.id}.csv`);
              pushToast(ok ? { tone: 'success', title: 'Exported returns' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable
            columns={columns}
            loading={returnsLoading}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(r) => navigate(`/pharmacy/returns/${encodeURIComponent(r.returnNo)}`)}
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

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { cancelConnectionRequest, disconnectConnection, requestConnection } from '../../../services/connectionService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyConnections() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { items: connections, loading: connectionsLoading } = useLiveArray(
    () => db.connections.where('pharmacyId').equals(business.id).toArray(),
    [business.id],
  );
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const orders = useLiveQuery(() => db.orders.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('pharmacyId').equals(business.id).toArray(), [business.id]) ?? [];
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      connections.map((c) => {
        const s = businesses.find((b) => b.id === c.stockistId);
        const pairOrders = orders.filter((o) => o.stockistId === c.stockistId);
        const last = [...pairOrders].sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0];
        return {
          ...c,
          stockistName: s?.name ?? c.stockistId.slice(0, 8),
          orderCount: pairOrders.length,
          outstanding: pairOutstanding(invoices, business.id, c.stockistId),
          lastTrade: last?.placedAt ?? '',
          lastTradeLabel: last ? last.orderNo : '—',
          rejectReason: c.rejectReason ?? c.statusHistory?.find((h) => h.to === 'Rejected')?.reason ?? '',
        };
      }),
    [connections, businesses, orders, invoices, business.id],
  );

  const columns = useMemo(
    () => [
      {
        key: 'stockistName',
        label: 'Stockist',
        getValue: (r: (typeof rows)[0]) => r.stockistName,
        render: (r: (typeof rows)[0]) => <Link to={`/pharmacy/stockists/${r.stockistId}`}>{r.stockistName}</Link>,
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (r: (typeof rows)[0]) => r.status,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.status} />,
      },
      { key: 'orderCount', label: 'Orders', getValue: (r: (typeof rows)[0]) => r.orderCount },
      {
        key: 'outstanding',
        label: 'Outstanding',
        getValue: (r: (typeof rows)[0]) => r.outstanding,
        render: (r: (typeof rows)[0]) => <Money value={r.outstanding} />,
      },
      {
        key: 'lastTrade',
        label: 'Last trade',
        getValue: (r: (typeof rows)[0]) => r.lastTrade,
        render: (r: (typeof rows)[0]) => (
          <span className="muted">{r.lastTrade ? new Date(r.lastTrade).toLocaleDateString() : '—'} · {r.lastTradeLabel}</span>
        ),
      },
      {
        key: 'actions',
        label: '',
        getValue: () => '',
        render: (r: (typeof rows)[0]) => (
          <div className="row">
            {r.status === 'Active' ? (
              <>
                <Link className="btn btn-ghost btn-sm" to={`/pharmacy/ledger/${r.stockistId}`}>
                  Ledger
                </Link>
                <Link className="btn btn-ghost btn-sm" to={`/pharmacy/messages?with=${r.stockistId}`}>
                  Message
                </Link>
                <Button size="sm" variant="secondary" onClick={() => setDisconnectId(r.id)}>
                  Disconnect
                </Button>
              </>
            ) : null}
            {['Rejected', 'Disconnected', 'Cancelled'].includes(r.status) ? (
              <Button
                size="sm"
                onClick={async () => {
                  const res = await requestConnection({ actor: user, pharmacy: business, stockistId: r.stockistId });
                  pushToast(
                    res.ok
                      ? { tone: 'success', title: 'Re-requested' }
                      : { tone: 'error', title: res.message },
                  );
                }}
              >
                Re-request
              </Button>
            ) : null}
            {r.status === 'Requested' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await cancelConnectionRequest({ actor: user, pharmacy: business, connectionId: r.id });
                  pushToast(res.ok ? { tone: 'info', title: 'Request cancelled' } : { tone: 'error', title: res.message });
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [business, user, pushToast],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.stockistName} ${r.status} ${r.rejectReason}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Requested', 'Active', 'Rejected', 'Disconnected', 'Blocked', 'Cancelled'].map((s) => ({
          value: s,
          label: s,
        })),
      },
    ],
    defaultSortKey: 'stockistName',
    defaultSortDir: 'asc',
  });

  return (
    <div className="stack">
      <PageHeader
        title="Connections"
        subtitle="Per-pair orders, outstanding, last trade"
        actions={
          <Link className="btn btn-primary" to="/pharmacy/buy">
            Discover stockists
          </Link>
        }
      />
      <ConfirmDialog
        open={!!disconnectId}
        title="Disconnect stockist"
        body="Trading will stop. Provide a reason for the audit trail."
        requireReason
        tone="danger"
        confirmLabel="Disconnect"
        onClose={() => setDisconnectId(null)}
        onConfirm={async (reason) => {
          if (!disconnectId) return;
          const res = await disconnectConnection({
            actor: user,
            business,
            connectionId: disconnectId,
            reason: reason || 'Pharmacy-initiated disconnect',
          });
          pushToast(res.ok ? { tone: 'info', title: 'Disconnected' } : { tone: 'error', title: res.message });
          setDisconnectId(null);
        }}
      />
      {!connections.length ? (
        <EmptyState
          title="No connections yet"
          description="Find stockists and request a connection to start trading."
          action={
            <Link className="btn btn-primary" to="/pharmacy/buy">
              Find stockists
            </Link>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search stockist / status"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: ['Requested', 'Active', 'Rejected', 'Disconnected', 'Blocked', 'Cancelled'].map((s) => ({
                  value: s,
                  label: s,
                })),
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              const ok = list.doExport(`pharmacy-connections-${business.id}.csv`);
              pushToast(ok ? { tone: 'success', title: 'Exported connections' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable
            loading={connectionsLoading} columns={columns} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
          {rows.some((r) => r.rejectReason) ? (
            <div className="card card-pad stack">
              <strong>Rejection reasons</strong>
              {rows
                .filter((r) => r.rejectReason)
                .map((r) => (
                  <div key={r.id} className="muted" style={{ fontSize: 13 }}>
                    {r.stockistName}: {r.rejectReason}
                  </div>
                ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

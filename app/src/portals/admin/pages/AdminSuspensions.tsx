import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { archiveNotification } from '../../../services/notifications';
import { reactivateBusiness } from '../../../services/verificationService';
import { useUi } from '../../../store/ui';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit';
import { SuspendBusinessDialog } from '../../../ui/components/SuspendBusinessDialog';
import { Button, EmptyState, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function AdminSuspensions() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('admin-suspensions');
  const tableRef = useTableSectionRef();
  const businesses = useLiveQuery(() => db.businesses.filter((b) => b.type !== 'Platform').toArray()) ?? [];
  const notifications =
    useLiveQuery(() => db.notifications.filter((n) => n.code === 'N-057' && n.status !== 'Archived').toArray()) ?? [];
  const [suspendTarget, setSuspendTarget] = useState<(typeof businesses)[0] | null>(null);

  const rows = useMemo(
    () =>
      [...businesses].sort((a, b) => {
        const rank = (s: string) => (s === 'Suspended' ? 0 : s === 'Deactivated' ? 1 : 2);
        const d = rank(a.accountStatus) - rank(b.accountStatus);
        if (d !== 0) return d;
        return a.name.localeCompare(b.name);
      }),
    [businesses],
  );

  const columns = useMemo(
    () => [
      { key: 'name', label: 'Business', getValue: (b: (typeof rows)[0]) => b.name },
      { key: 'type', label: 'Type', getValue: (b: (typeof rows)[0]) => b.type },
      { key: 'accountStatus', label: 'Account', getValue: (b: (typeof rows)[0]) => b.accountStatus },
      { key: 'suspendReason', label: 'Reason', getValue: (b: (typeof rows)[0]) => b.suspendReason ?? '' },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(b) => `${b.name} ${b.city} ${b.gstNumber ?? ''} ${b.suspendReason ?? ''}`],
        filters: [
      {
        key: 'accountStatus',
        label: 'Account',
        options: ['Suspended', 'Active', 'PendingActivation', 'Deactivated'].map((s) => ({ value: s, label: s })),
      },
    ],
    defaultSortKey: 'name',
    initialFilters: { accountStatus: 'Suspended' },
    pageSize,
    onPageSizeChange: setPageSize,
  });

  const inbox = useMemo(() => {
    return notifications
      .map((n) => {
        const bizId = n.entityId;
        const biz = businesses.find((b) => b.id === bizId);
        return { ...n, businessName: biz?.name ?? bizId?.slice(0, 8) ?? '—', bizId };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notifications, businesses]);

  return (
    <div className="stack">
      <PageHeader title="Suspensions" subtitle="Suspended-first directory, confirm impact, reactivation-request inbox" />

      <div className="card card-pad stack">
        <strong>Reactivation requests</strong>
        {!inbox.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No open reactivation requests.
          </p>
        ) : (
          inbox.map((n) => (
            <div key={n.id} className="row" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13 }}>
                <strong>{n.businessName}</strong>
                <div className="muted">{n.body}</div>
              </div>
              <div className="row">
                {n.bizId ? (
                  <Link className="btn btn-secondary btn-sm" to={`/admin/network/${n.bizId}`}>
                    Open
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!n.bizId) return;
                    const res = await reactivateBusiness({
                      actor: user,
                      adminBusiness: business,
                      targetBusinessId: n.bizId,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Reactivated' } : { tone: 'error', title: res.message });
                    if (res.ok) await archiveNotification(n.id);
                  }}
                >
                  Reactivate
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search business / GST / reason"
        filters={[
          {
            key: 'accountStatus',
            label: 'Account',
            options: ['Suspended', 'Active', 'PendingActivation', 'Deactivated'].map((s) => ({ value: s, label: s })),
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
      />
      {!list.pageRows.length ? (
        <EmptyState
          title="No matches"
          description="Clear the Suspended filter to see Active or PendingActivation businesses you can suspend."
        />
      ) : (
        <>
          {list.pageRows.map((b) => (
            <div key={b.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
              <div>
                <Link to={`/admin/network/${b.id}`}>
                  <strong>{b.name}</strong>
                </Link>
                <div className="muted" style={{ fontSize: 12 }}>
                  {b.type} · {b.suspendReason || 'No reason on file'}
                </div>
              </div>
              <div className="row">
                <StatusBadge status={b.accountStatus} />
                {b.accountStatus === 'Active' || b.accountStatus === 'PendingActivation' ? (
                  <Button size="sm" variant="danger" onClick={() => setSuspendTarget(b)}>
                    Suspend
                  </Button>
                ) : b.accountStatus === 'Suspended' || b.accountStatus === 'Deactivated' ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      const res = await reactivateBusiness({
                        actor: user,
                        adminBusiness: business,
                        targetBusinessId: b.id,
                      });
                      pushToast(res.ok ? { tone: 'success', title: 'Reactivated' } : { tone: 'error', title: res.message });
                    }}
                  >
                    Reactivate
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          <PaginationBar
            page={list.page}
            pageCount={list.pageCount}
            total={list.total}
            onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
        </>
      )}

      <SuspendBusinessDialog
        open={!!suspendTarget}
        target={suspendTarget}
        actor={user}
        adminBusiness={business}
        onClose={() => setSuspendTarget(null)}
      />
    </div>
  );
}

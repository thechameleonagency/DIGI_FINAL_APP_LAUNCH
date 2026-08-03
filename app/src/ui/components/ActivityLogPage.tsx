import { useEffect, useMemo, useState } from 'react';
import type { AuditLog } from '../../domain/entities/types';
import { exportOwnActivityCsv, listOwnActivity } from '../../services/activityLogService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { useBusyAction } from '../hooks/useBusyAction';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from './ListToolkit';
import { Button, EmptyState, PageHeader } from './primitives';

export function ActivityLogPage() {
  const { user, business } = useSession();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<AuditLog[]>([]);

  const refresh = () =>
    void run(async () => {
      if (!user || !business) return;
      const res = await listOwnActivity({
        actor: user,
        business,
        filters: { from: from || undefined, to: to || undefined },
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      setRows(res.data);
    });

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, business?.id, from, to]);

  const columns = useMemo(
    () => [
      {
        key: 'at',
        label: 'When',
        getValue: (r: AuditLog) => r.at,
        render: (r: AuditLog) => new Date(r.at).toLocaleString(),
      },
      { key: 'actorName', label: 'Actor', getValue: (r: AuditLog) => r.actorName },
      { key: 'action', label: 'Action', getValue: (r: AuditLog) => r.action },
      {
        key: 'target',
        label: 'Target',
        getValue: (r: AuditLog) => `${r.entityType} ${r.entityId}`,
        render: (r: AuditLog) => (
          <>
            {r.entityType} · {r.entityId.slice(0, 8)}
          </>
        ),
      },
      {
        key: 'reason',
        label: 'Reason',
        getValue: (r: AuditLog) => r.reason ?? '',
        render: (r: AuditLog) => r.reason ?? '—',
      },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.actorName} ${r.action} ${r.entityType} ${r.entityId} ${r.reason ?? ''}`],
    defaultSortKey: 'at',
    pageSize: 7,
  });

  if (!user || !business) return null;

  return (
    <div className="stack">
      <PageHeader
        title="Activity log"
        subtitle="Own-business audit trail only"
        actions={
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search actor / action / target / reason"
        dateRange={{
          from,
          to,
          onFrom: setFrom,
          onTo: setTo,
        }}
        onExport={() =>
          void run(async () => {
            const res = await exportOwnActivityCsv({
              actor: user,
              business,
              filters: { from: from || undefined, to: to || undefined },
            });
            if (!res.ok) {
              pushToast({ tone: 'error', title: res.message });
              return;
            }
            const blob = new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.data.filename;
            a.click();
            URL.revokeObjectURL(url);
            pushToast({ tone: 'success', title: 'Activity exported' });
          })
        }
      />
      {!rows.length ? (
        <EmptyState title="No activity" description="Actions for this business appear here as they are audited." />
      ) : (
        <>
          <DataListTable
            columns={columns}
            loading={busy && !rows.length}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

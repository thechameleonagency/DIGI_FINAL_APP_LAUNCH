import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { can } from '../../../domain/permissions';
import { db } from '../../../data/db';
import { localDayKey } from '../../../domain/utils/dateKeys';
import { entityTypeLabel } from '../../../domain/utils/humanLabels';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit'
import { Button, EmptyState, Field, Input, LoadingState, Modal, PageHeader } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

function dayKey(iso?: string): string {
  return localDayKey(iso);
}

export function AdminAudit() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('admin-audit');
  const tableRef = useTableSectionRef();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { items: logs, loading: logsLoading } = useLiveArray(() =>
    db.auditLogs.orderBy('at').reverse().toArray(),
  );
  const canExport = can('audit.export', {
    businessType: business.type,
    role: user.role,
    accountStatus: business.accountStatus,
    verificationStatus: business.verificationStatus,
    overrides: user.permissionOverrides,
  }).allow;

  const rows = useMemo(() => {
    return logs
      .filter((l) => {
        const d = dayKey(l.at);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .map((l) => ({
        ...l,
        entityLabel: `${entityTypeLabel(l.entityType)}:${l.entityId.slice(0, 8)}`,
        when: l.at,
      }));
  }, [logs, from, to]);

  const entityTypes = useMemo(() => [...new Set(logs.map((l) => l.entityType))].sort(), [logs]);

  const columns = useMemo(
    () => [
      {
        key: 'when',
        label: 'When',
        getValue: (l: (typeof rows)[0]) => l.at,
        render: (l: (typeof rows)[0]) => <span className="muted">{new Date(l.at).toLocaleString()}</span>,
      },
      { key: 'actorName', label: 'Actor', getValue: (l: (typeof rows)[0]) => l.actorName },
      { key: 'action', label: 'Action', getValue: (l: (typeof rows)[0]) => l.action },
      { key: 'entityLabel', label: 'Entity', getValue: (l: (typeof rows)[0]) => l.entityLabel },
      {
        key: 'entityType',
        label: 'Entity type',
        getValue: (l: (typeof rows)[0]) => l.entityType,
        render: (l: (typeof rows)[0]) => entityTypeLabel(l.entityType),
      },
      { key: 'reason', label: 'Reason', getValue: (l: (typeof rows)[0]) => l.reason ?? '' },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(l) => `${l.actorName} ${l.action} ${l.entityType} ${l.entityId} ${l.reason ?? ''}`],
    filters: [
      {
        key: 'entityType',
        label: 'Entity',
        options: entityTypes.map((t) => ({ value: t, label: entityTypeLabel(t) })),
      },
    ],
    defaultSortKey: 'when',
    defaultSortDir: 'desc',
    pageSize: 7,
  });

  const open = expanded ? rows.find((r) => r.id === expanded) : undefined;

  return (
    <div className="stack">
      <PageHeader
        title="Audit log"
        subtitle="Search, filter by date or entity, inspect before/after, and export CSV when you have permission"
      />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {logsLoading ? (
        <LoadingState label="Loading audit log…" />
      ) : !logs.length ? (
        <EmptyState
          title="No audit entries"
          description="Actions across the platform are logged here as users trade and admins decide."
          action={
            <Link className="btn btn-primary" to="/admin">
              Go to home
            </Link>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search actor / action / entity / reason"
            filters={[
              {
                key: 'entityType',
                label: 'Entity',
                options: entityTypes.map((t) => ({ value: t, label: entityTypeLabel(t) })),
              },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              if (!canExport) {
                pushToast({
                  tone: 'error',
                  title: 'Export denied',
                  message: 'Requires permission to export the audit log.',
                });
                return;
              }
              const ok = list.doExport('audit-log.csv', true);
              pushToast(ok ? { tone: 'success', title: 'Audit CSV exported' } : { tone: 'error', title: 'Export failed' });
            }}
            exportLabel={canExport ? 'Export CSV' : 'Export (no permission)'}
          />
          <DataListTable
            stickyHeader
            scrollBody
            tableSectionRef={tableRef}
            columns={columns.filter((c) => c.key !== 'entityType')}
            loading={logsLoading}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            activeRowId={expanded}
            onRowClick={(l) => setExpanded(l.id)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Showing page of {list.total} filtered entries (full history, not capped at 200). Click a row to inspect
            before/after.
          </p>
        </>
      )}

      <Modal
        open={!!open}
        title={open ? `${open.action} · ${entityTypeLabel(open.entityType)}` : 'Audit entry'}
        onClose={() => setExpanded(null)}
        footer={
          <Button variant="secondary" onClick={() => setExpanded(null)}>
            Close
          </Button>
        }
      >
        {open ? (
          <div className="stack">
            <div className="muted" style={{ fontSize: 13 }}>
              {open.actorName} · {new Date(open.at).toLocaleString()}
              {open.reason ? ` · ${open.reason}` : ''}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {open.entityType}/{open.entityId}
            </div>
            <div className="grid-2">
              <div>
                <strong style={{ fontSize: 12 }}>Before</strong>
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>
                  {open.before ? JSON.stringify(open.before, null, 2) : '—'}
                </pre>
              </div>
              <div>
                <strong style={{ fontSize: 12 }}>After</strong>
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>
                  {open.after ? JSON.stringify(open.after, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

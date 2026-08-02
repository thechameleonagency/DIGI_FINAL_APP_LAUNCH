import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import type { SupportTicket, TicketStatus } from '../../../domain/entities/types';
import { db } from '../../../data/db';
import { updateTicket } from '../../../services/supportService';
import { useUi } from '../../../store/ui';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, PageHeader, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const PRIORITY_TONE: Record<SupportTicket['priority'], string> = {
  High: 'badge badge-danger',
  Medium: 'badge badge-warning',
  Low: 'badge badge-neutral',
};

function PriorityBadge({ priority }: { priority: SupportTicket['priority'] }) {
  return <span className={PRIORITY_TONE[priority]}>{priority}</span>;
}

export function AdminSupport() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const [reply, setReply] = useState('');
  const [pendingAssignee, setPendingAssignee] = useState<string | null>(null);
  const { items: tickets, loading: ticketsLoading } = useLiveArray(() => db.supportTickets.toArray());
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const users = useLiveQuery(() => db.users.toArray()) ?? [];
  const agents = users.filter((u) => ['SuperAdmin', 'SupportManager'].includes(u.role) && u.status === 'Active');
  const statusFromUrl = searchParams.get('status') ?? undefined;

  const rows = useMemo(
    () =>
      tickets.map((t) => ({
        ...t,
        businessName: businesses.find((b) => b.id === t.businessId)?.name ?? t.businessId.slice(0, 8),
        assigneeName: t.assigneeId ? (users.find((u) => u.id === t.assigneeId)?.name ?? '—') : 'Unassigned',
      })),
    [tickets, businesses, users],
  );

  const columns = useMemo(
    () => [
      {
        key: 'ticketNo',
        label: 'Ticket',
        getValue: (t: (typeof rows)[0]) => t.ticketNo,
        render: (t: (typeof rows)[0]) => <Link to={`/admin/support/${t.id}`}>{t.ticketNo}</Link>,
      },
      { key: 'subject', label: 'Subject', getValue: (t: (typeof rows)[0]) => t.subject },
      { key: 'businessName', label: 'Business', getValue: (t: (typeof rows)[0]) => t.businessName },
      {
        key: 'priority',
        label: 'Priority',
        getValue: (t: (typeof rows)[0]) => t.priority,
        render: (t: (typeof rows)[0]) => <PriorityBadge priority={t.priority} />,
      },
      {
        key: 'status',
        label: 'Status',
        getValue: (t: (typeof rows)[0]) => t.status,
        render: (t: (typeof rows)[0]) => <StatusBadge status={t.status} />,
      },
      { key: 'assigneeName', label: 'Assignee', getValue: (t: (typeof rows)[0]) => t.assigneeName },
    ],
    [],
  );

  const statusOpts = ['Open', 'InProgress', 'WaitingOnUser', 'Resolved', 'Closed', 'Reopened'].map((s) => ({
    value: s,
    label: s === 'WaitingOnUser' ? 'Waiting on requester' : s,
  }));

  const list = useListControls(rows, {
    columns,
    searchKeys: [(t) => `${t.ticketNo} ${t.subject} ${t.businessName} ${t.category} ${t.status} ${t.priority}`],
    filters: [
      { key: 'status', label: 'Status', options: statusOpts },
      { key: 'priority', label: 'Priority', options: ['High', 'Medium', 'Low'].map((p) => ({ value: p, label: p })) },
    ],
    defaultSortKey: 'updatedAt',
    initialFilters: statusFromUrl ? { status: statusFromUrl } : undefined,
  });

  const detail = id ? tickets.find((t) => t.id === id) : undefined;
  const detailBiz = detail ? businesses.find((b) => b.id === detail.businessId) : undefined;

  const act = async (opts: { body?: string; status?: TicketStatus; assigneeId?: string }) => {
    if (!detail) return;
    const res = await updateTicket({
      actor: user,
      business,
      ticketId: detail.id,
      body: opts.body,
      status: opts.status,
      assigneeId: opts.assigneeId,
    });
    pushToast(res.ok ? { tone: 'success', title: 'Ticket updated' } : { tone: 'error', title: res.message });
    if (res.ok && opts.body) setReply('');
  };

  if (id) {
    if (!detail) {
      return (
        <div className="stack">
          <PageHeader title="Ticket detail" />
          <EmptyState
            title="Ticket not found"
            description="Return to the support console."
            action={
              <Link className="btn btn-primary" to="/admin/support">
                Back to support
              </Link>
            }
          />
        </div>
      );
    }
    const nextActions: { label: string; status: TicketStatus; variant?: 'secondary' | 'danger' }[] = [];
    if (detail.status === 'Open') {
      nextActions.push({ label: 'Start', status: 'InProgress' });
      nextActions.push({ label: 'Close', status: 'Closed', variant: 'secondary' });
    }
    if (detail.status === 'InProgress' || detail.status === 'Reopened') {
      nextActions.push({ label: 'Waiting on requester', status: 'WaitingOnUser', variant: 'secondary' });
      nextActions.push({ label: 'Resolve', status: 'Resolved' });
      nextActions.push({ label: 'Close', status: 'Closed', variant: 'secondary' });
    }
    if (detail.status === 'WaitingOnUser') {
      nextActions.push({ label: 'Resume', status: 'InProgress' });
      nextActions.push({ label: 'Resolve', status: 'Resolved' });
      nextActions.push({ label: 'Close', status: 'Closed', variant: 'secondary' });
    }
    if (detail.status === 'Resolved') {
      nextActions.push({ label: 'Close', status: 'Closed', variant: 'secondary' });
      nextActions.push({ label: 'Reopen', status: 'Reopened' });
    }
    if (detail.status === 'Closed') nextActions.push({ label: 'Reopen', status: 'Reopened' });

    return (
      <div className="stack">
        <PageHeader
          title={`${detail.ticketNo}: ${detail.subject}`}
          subtitle={`${detailBiz?.name ?? 'Business'} · ${detail.category}`}
          actions={
            <Link className="btn btn-secondary btn-sm" to="/admin/support">
              Back to queue
            </Link>
          }
        />
        <div className="row" style={{ gap: 8 }}>
          <StatusBadge status={detail.status} />
          <PriorityBadge priority={detail.priority} />
        </div>

        <div className="card card-pad stack">
          <strong>Thread</strong>
          {detail.updates.map((u, i) => {
            const actor = users.find((x) => x.id === u.actorId);
            return (
              <div key={`${detail.id}-${i}`} style={{ fontSize: 13, borderTop: i ? '1px solid var(--border)' : undefined, paddingTop: i ? 8 : 0 }}>
                <div className="muted">
                  {actor?.name ?? 'User'} · {new Date(u.at).toLocaleString()}
                  {u.status ? (
                    <>
                      {' '}
                      · <StatusBadge status={u.status} />
                    </>
                  ) : null}
                </div>
                <div>{u.body}</div>
              </div>
            );
          })}
        </div>

        <div className="card card-pad stack">
          <Field label="Reply (adds to thread)">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Write a reply to the requester…" />
          </Field>
          <div className="row">
            <Button
              size="sm"
              onClick={() => {
                if (!reply.trim()) {
                  pushToast({ tone: 'error', title: 'Reply body is required' });
                  return;
                }
                void act({ body: reply });
              }}
            >
              Send reply
            </Button>
          </div>
          <Field label="Assign">
            <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
              <Select
                value={pendingAssignee ?? detail.assigneeId ?? ''}
                onChange={(e) => setPendingAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role})
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={pendingAssignee === null || (pendingAssignee || '') === (detail.assigneeId ?? '')}
                onClick={() => {
                  const next = pendingAssignee ?? '';
                  void act({ assigneeId: next }).then(() => setPendingAssignee(null));
                }}
              >
                Apply assign
              </Button>
            </div>
          </Field>
          <div className="row">
            {nextActions.map((a) => (
              <Button
                key={a.status}
                size="sm"
                variant={a.variant ?? 'primary'}
                onClick={() => void act({ status: a.status, body: reply.trim() || undefined })}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Support console" subtitle="Assign, reply, wait on requester, resolve / close / reopen" />
      {!rows.length ? (
        <EmptyState
          title="No tickets yet"
          description="Tickets from pharmacies and stockists appear here."
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
            placeholder="Search ticket / subject / business"
            filters={[
              { key: 'status', label: 'Status', options: statusOpts },
              { key: 'priority', label: 'Priority', options: ['High', 'Medium', 'Low'].map((p) => ({ value: p, label: p })) },
            ]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              list.doExport('support-tickets.csv');
              pushToast({ tone: 'success', title: 'Exported tickets' });
            }}
          />
          <DataListTable
            columns={columns}
            loading={ticketsLoading}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(t) => navigate(`/admin/support/${t.id}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

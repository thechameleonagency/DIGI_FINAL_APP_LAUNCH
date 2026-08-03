import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Business, SupportTicket, User } from '../../domain/entities/types';
import { db } from '../../data/db';
import { createTicket, updateTicket } from '../../services/supportService';
import { useUi } from '../../store/ui';
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge, Textarea } from './primitives';

const CATEGORIES = ['General', 'Orders', 'Payments', 'Verification', 'Technical', 'Operations'] as const;
const PRIORITIES: SupportTicket['priority'][] = ['Low', 'Medium', 'High'];
const RELATED_TYPES = ['', 'Order', 'Invoice', 'Payment', 'Delivery', 'Return'] as const;

function categoryForEntity(type: string): string {
  if (type === 'Invoice' || type === 'Payment') return 'Payments';
  if (type === 'Order' || type === 'Delivery' || type === 'Return') return 'Orders';
  return 'General';
}

export function TicketPanel({
  actor,
  business,
  basePath,
  homePath,
}: {
  actor: User;
  business: Business;
  /** e.g. /pharmacy/support */
  basePath: string;
  homePath: string;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { pushToast } = useUi();
  const tickets =
    useLiveQuery(() => db.supportTickets.where('businessId').equals(business.id).reverse().sortBy('updatedAt'), [
      business.id,
    ]) ?? [];
  const users = useLiveQuery(() => db.users.toArray()) ?? [];
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('General');
  const [priority, setPriority] = useState<SupportTicket['priority']>('Medium');
  const [relatedType, setRelatedType] = useState('');
  const [relatedId, setRelatedId] = useState('');
  const [reply, setReply] = useState('');
  const [ticketErrors, setTicketErrors] = useState<{ subject?: string; body?: string }>({});
  const [replyError, setReplyError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (id) return;
    const et = params.get('entityType') ?? '';
    const eid = params.get('entityNo') ?? params.get('entityId') ?? '';
    const wantNew = params.get('new') === '1' || !!et || !!eid;
    if (!wantNew) return;
    if (et) {
      setRelatedType(RELATED_TYPES.includes(et as (typeof RELATED_TYPES)[number]) ? et : et);
      setCategory(categoryForEntity(et));
      setSubject(`Help with ${et}${eid ? ` ${eid}` : ''}`);
    }
    if (eid) setRelatedId(eid);
    setCreateOpen(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('entityType');
    next.delete('entityId');
    next.delete('entityNo');
    setParams(next, { replace: true });
  }, [id, params, setParams]);

  const detail = id ? tickets.find((t) => t.id === id) : undefined;

  if (id) {
    if (!detail) {
      return (
        <div className="stack">
          <PageHeader title="Ticket" />
          <EmptyState
            title="Ticket not found"
            description="Return to your support list."
            action={
              <Link className="btn btn-primary" to={basePath}>
                Back to support
              </Link>
            }
          />
        </div>
      );
    }
    const canReopen = detail.status === 'Resolved' || detail.status === 'Closed';
    return (
      <div className="stack">
        <PageHeader
          title={`${detail.ticketNo}: ${detail.subject}`}
          subtitle={`${detail.category} · ${detail.priority}`}
          backTo={basePath}
          backLabel="Back to support"
        />
        <div className="row" style={{ gap: 8 }}>
          <StatusBadge status={detail.status} />
          <span className={`badge badge-${detail.priority === 'High' ? 'danger' : detail.priority === 'Low' ? 'neutral' : 'warning'}`}>
            {detail.priority}
          </span>
        </div>
        {detail.relatedEntityType || detail.relatedEntityId ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Related: {detail.relatedEntityType ?? 'Entity'} {detail.relatedEntityId ?? ''}
          </div>
        ) : null}
        <div className="card card-pad stack">
          <strong>Updates</strong>
          {detail.updates.map((u, i) => {
            const who = users.find((x) => x.id === u.actorId);
            return (
              <div key={`${detail.id}-${i}`} style={{ fontSize: 13, borderTop: i ? '1px solid var(--border)' : undefined, paddingTop: i ? 8 : 0 }}>
                <div className="muted">
                  {who?.name ?? 'User'} · {new Date(u.at).toLocaleString()}
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
          <Field label="Add update" error={replyError}>
            <Textarea
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                setReplyError(undefined);
              }}
              rows={3}
            />
          </Field>
          <div className="row">
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (!reply.trim()) {
                  setReplyError('Update body is required');
                  return;
                }
                setBusy(true);
                const res = await updateTicket({ actor, business, ticketId: detail.id, body: reply });
                setBusy(false);
                pushToast(res.ok ? { tone: 'success', title: 'Update added' } : { tone: 'error', title: res.message });
                if (res.ok) {
                  setReply('');
                  setReplyError(undefined);
                }
              }}
            >
              Send update
            </Button>
            {canReopen ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await updateTicket({
                    actor,
                    business,
                    ticketId: detail.id,
                    status: 'Reopened',
                    body: reply.trim() || 'Reopened by requester',
                  });
                  setBusy(false);
                  pushToast(res.ok ? { tone: 'info', title: 'Reopened' } : { tone: 'error', title: res.message });
                  if (res.ok) setReply('');
                }}
              >
                Reopen
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Support"
        subtitle="Raise tickets with category, priority, and optional related entity"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setTicketErrors({});
              setCreateOpen(true);
            }}
          >
            New ticket
          </Button>
        }
      />
      <Modal
        open={createOpen}
        title="New ticket"
        onClose={() => {
          setCreateOpen(false);
          setTicketErrors({});
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setTicketErrors({});
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const next: typeof ticketErrors = {};
                if (!subject.trim()) next.subject = 'Subject is required';
                if (!body.trim()) next.body = 'Description is required';
                if (Object.keys(next).length) {
                  setTicketErrors(next);
                  return;
                }
                setBusy(true);
                const res = await createTicket({
                  actor,
                  business,
                  subject,
                  category,
                  body,
                  priority,
                  relatedEntityType: relatedType || undefined,
                  relatedEntityId: relatedId || undefined,
                });
                setBusy(false);
                if (res.ok) {
                  pushToast({ tone: 'success', title: res.data.ticketNo });
                  setSubject('');
                  setBody('');
                  setRelatedType('');
                  setRelatedId('');
                  setTicketErrors({});
                  setCreateOpen(false);
                  navigate(`${basePath}/${res.data.id}`);
                } else {
                  pushToast({ tone: 'error', title: res.message });
                }
              }}
            >
              {busy ? 'Creating…' : 'Create ticket'}
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Subject" error={ticketErrors.subject}>
            <Input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setTicketErrors((err) => ({ ...err, subject: undefined }));
              }}
            />
          </Field>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description" error={ticketErrors.body}>
            <Textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setTicketErrors((err) => ({ ...err, body: undefined }));
              }}
              rows={3}
            />
          </Field>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Related entity type (optional)">
              <Select
                value={relatedType}
                onChange={(e) => {
                  const v = e.target.value;
                  setRelatedType(v);
                  if (v) setCategory(categoryForEntity(v));
                }}
              >
                {RELATED_TYPES.map((t) => (
                  <option key={t || 'none'} value={t}>
                    {t || 'None'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Related entity id / number">
              <Input
                value={relatedId}
                onChange={(e) => setRelatedId(e.target.value)}
                placeholder="ORD-… / INV-…"
              />
            </Field>
          </div>
        </div>
      </Modal>
      {!tickets.length ? (
        <EmptyState
          title="No tickets yet"
          description="Create a ticket when you need help from platform support."
          action={
            <div className="row">
              <Button onClick={() => setCreateOpen(true)}>New ticket</Button>
              <Link className="btn btn-secondary" to={homePath}>
                Go to home
              </Link>
            </div>
          }
        />
      ) : (
        tickets.map((t) => (
          <Link key={t.id} to={`${basePath}/${t.id}`} className="card card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>
                {t.ticketNo}: {t.subject}
              </strong>
              <StatusBadge status={t.status} />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {t.category} · {t.priority}
              {t.relatedEntityId ? ` · ${t.relatedEntityType ?? 'ref'} ${t.relatedEntityId}` : ''}
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Business, User } from '../../domain/entities/types';
import { db } from '../../data/db';
import { markMessagesRead, sendMessage } from '../../services/supportService';
import { useUi } from '../../store/ui';
import { Button, EmptyState, Field, Input, PageHeader, Select, Textarea } from './primitives';

export function MessagesPanel({
  actor,
  business,
  counterpartLabel,
  ordersBasePath,
}: {
  actor: User;
  business: Business;
  counterpartLabel: string;
  ordersBasePath: string;
}) {
  const { pushToast } = useUi();
  const [params] = useSearchParams();
  const threads = useLiveQuery(() => db.messageThreads.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const connections =
    useLiveQuery(
      () =>
        db.connections
          .filter(
            (c) =>
              c.status === 'Active' &&
              (c.pharmacyId === business.id || c.stockistId === business.id),
          )
          .toArray(),
      [business.id],
    ) ?? [];
  const allMessages = useLiveQuery(() => db.messages.toArray()) ?? [];
  const mine = threads.filter((t) => t.participantBusinessIds.includes(business.id));
  const [body, setBody] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>(params.get('thread') ?? undefined);
  const [newCounterpart, setNewCounterpart] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = params.get('thread');
    if (t) setThreadId(t);
  }, [params]);

  useEffect(() => {
    if (!threadId) return;
    void markMessagesRead(threadId, actor.id);
  }, [threadId, actor.id, allMessages.length]);

  const messages =
    useLiveQuery(async () => {
      if (!threadId) return [];
      return db.messages.where('threadId').equals(threadId).sortBy('createdAt');
    }, [threadId]) ?? [];

  const activeThread = mine.find((t) => t.id === threadId);
  const counterpartBusinessId = activeThread?.participantBusinessIds.find((id) => id !== business.id);

  const counterparts = useMemo(() => {
    return connections.map((c) => {
      const otherId = c.pharmacyId === business.id ? c.stockistId : c.pharmacyId;
      const other = businesses.find((b) => b.id === otherId);
      return { id: otherId, name: other?.name ?? otherId.slice(0, 8) };
    });
  }, [connections, businesses, business.id]);

  const unreadByThread = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of allMessages) {
      if (m.senderId === actor.id) continue;
      if (m.readBy?.includes(actor.id)) continue;
      map.set(m.threadId, (map.get(m.threadId) ?? 0) + 1);
    }
    return map;
  }, [allMessages, actor.id]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter((t) => {
      const otherId = t.participantBusinessIds.find((id) => id !== business.id);
      const other = businesses.find((b) => b.id === otherId);
      const msgs = allMessages.filter((m) => m.threadId === t.id);
      const hay = `${other?.name ?? ''} ${t.relatedEntityType ?? ''} ${t.relatedEntityId ?? ''} ${msgs.map((m) => m.body).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mine, search, businesses, business.id, allMessages]);

  return (
    <div className="stack">
      <PageHeader title="Messages" subtitle="Informational only — chat never approves orders, payments, or returns" />
      <div className="banner-strip">Official actions happen only via workflow buttons. Typing “Approved” here does nothing.</div>

      <div className="card card-pad stack">
        <strong>New conversation</strong>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label={`Active ${counterpartLabel}`}>
            <Select value={newCounterpart} onChange={(e) => setNewCounterpart(e.target.value)}>
              <option value="">Select…</option>
              {counterparts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            size="sm"
            disabled={!newCounterpart || busy}
            onClick={async () => {
              const existing = mine.find(
                (t) =>
                  t.participantBusinessIds.includes(newCounterpart) &&
                  !t.relatedEntityId,
              );
              if (existing) {
                setThreadId(existing.id);
                return;
              }
              setBusy(true);
              const res = await sendMessage({
                actor,
                business,
                counterpartBusinessId: newCounterpart,
                body: 'Conversation started.',
              });
              setBusy(false);
              if (res.ok) {
                setThreadId(res.data.thread.id);
                setNewCounterpart('');
              } else pushToast({ tone: 'error', title: res.message });
            }}
          >
            Start
          </Button>
        </div>
        {!counterparts.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No Active connections yet — connect first, then message.
          </p>
        ) : null}
      </div>

      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Threads</strong>
          <Field label="Search">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Partner, order, message text…" />
          </Field>
          {filteredThreads.map((t) => {
            const otherId = t.participantBusinessIds.find((id) => id !== business.id);
            const other = businesses.find((b) => b.id === otherId);
            const unread = unreadByThread.get(t.id) ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                className={`btn ${threadId === t.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setThreadId(t.id)}
              >
                {other?.name ?? counterpartLabel}
                {unread ? ` · ${unread} new` : ''}
                {t.relatedEntityId ? ` · ${t.relatedEntityType ?? 'ref'} ${t.relatedEntityId}` : ''}
                <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                  {new Date(t.lastMessageAt).toLocaleString()}
                </span>
              </button>
            );
          })}
          {!filteredThreads.length ? (
            <EmptyState title="No threads" description={`Start a conversation with a connected ${counterpartLabel.toLowerCase()}.`} />
          ) : null}
        </div>
        <div className="card card-pad stack">
          <strong>{activeThread ? 'Conversation' : 'Select a thread'}</strong>
          {activeThread?.relatedEntityType === 'Order' && activeThread.relatedEntityId ? (
            <div style={{ fontSize: 13 }}>
              Order context:{' '}
              <Link to={`${ordersBasePath}/${encodeURIComponent(activeThread.relatedEntityId)}`}>
                {activeThread.relatedEntityId}
              </Link>
            </div>
          ) : null}
          <div style={{ maxHeight: 320, overflow: 'auto' }} className="stack">
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  fontSize: 13,
                  alignSelf: m.senderId === actor.id ? 'flex-end' : 'flex-start',
                  background:
                    m.senderId === actor.id ? 'color-mix(in srgb, var(--accent) 12%, white)' : 'var(--subtle)',
                  padding: '8px 10px',
                  borderRadius: 10,
                  maxWidth: '85%',
                }}
              >
                <strong>{m.senderId === actor.id ? 'You' : counterpartLabel}</strong>: {m.body}
                <div className="muted" style={{ fontSize: 11 }}>
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" />
          <Button
            disabled={busy}
            onClick={async () => {
              if (!counterpartBusinessId) {
                pushToast({ tone: 'warning', title: 'Select a thread', message: 'Choose the conversation before sending.' });
                return;
              }
              setBusy(true);
              const res = await sendMessage({
                actor,
                business,
                counterpartBusinessId,
                body,
                threadId,
                relatedEntityType: activeThread?.relatedEntityType,
                relatedEntityId: activeThread?.relatedEntityId,
              });
              setBusy(false);
              if (res.ok) {
                setThreadId(res.data.thread.id);
                setBody('');
              } else pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
            }}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

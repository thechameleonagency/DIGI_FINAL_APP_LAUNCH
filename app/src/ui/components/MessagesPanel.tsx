import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Business, User } from '../../domain/entities/types';
import { db } from '../../data/db';
import { ensureMessageThread, markMessagesRead, sendMessage } from '../../services/supportService';
import { useUi } from '../../store/ui';
import { Button, EmptyState, Field, Input, LoadingState, Modal, PageHeader, Select, Textarea } from './primitives';

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
  const mineRaw = useLiveQuery(
    () =>
      db.messageThreads
        .filter((t) => t.participantBusinessIds.includes(business.id))
        .toArray(),
    [business.id],
  );
  const threadsLoading = mineRaw === undefined;
  const mine = mineRaw ?? [];
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
  const threadIdsKey = useMemo(() => mine.map((t) => t.id).sort().join(','), [mine]);
  const allMessages =
    useLiveQuery(() => {
      const ids = threadIdsKey ? threadIdsKey.split(',') : [];
      return ids.length ? db.messages.where('threadId').anyOf(ids).toArray() : [];
    }, [threadIdsKey]) ?? [];
  const [body, setBody] = useState(() => params.get('draft') ?? '');
  const [threadId, setThreadId] = useState<string | undefined>(params.get('thread') ?? undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCounterpart, setNewCounterpart] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = params.get('thread');
    if (t) setThreadId(t);
    const draft = params.get('draft');
    if (draft) setBody(draft);
  }, [params]);

  useEffect(() => {
    const withId = params.get('with');
    if (!withId || threadsLoading) return;
    if (params.get('thread')) return;
    const existing = mine.find(
      (t) => t.participantBusinessIds.includes(withId) && t.participantBusinessIds.includes(business.id) && !t.relatedEntityId,
    );
    if (existing) {
      setThreadId(existing.id);
      return;
    }
    let cancelled = false;
    void ensureMessageThread({
      actor,
      business,
      counterpartBusinessId: withId,
    }).then((res) => {
      if (cancelled || !res.ok) return;
      setThreadId(res.data.id);
    });
    return () => {
      cancelled = true;
    };
  }, [params, threadsLoading, mine, business, actor]);

  useEffect(() => {
    if (!threadId) return;
    void markMessagesRead(threadId, actor.id);
  }, [threadId, actor.id, allMessages.length]);

  const messages =
    useLiveQuery(async () => {
      if (!threadId) return [];
      return db.messages.where('threadId').equals(threadId).sortBy('createdAt');
    }, [threadId]) ?? [];

  useEffect(() => {
    const el = conversationRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [threadId, messages.length]);

  const activeThread = mine.find((t) => t.id === threadId);
  const counterpartBusinessId = activeThread?.participantBusinessIds.find((id) => id !== business.id);
  const counterpartName =
    businesses.find((b) => b.id === counterpartBusinessId)?.name ?? counterpartLabel;

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
      <PageHeader
        title="Messages"
        subtitle="Informational only — chat never approves orders, payments, or returns"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setNewCounterpart('');
              setCreateOpen(true);
            }}
          >
            New conversation
          </Button>
        }
      />
      <div className="banner-strip">Official actions happen only via workflow buttons. Typing “Approved” here does nothing.</div>

      <div className="grid-2">
        <div className="card card-pad stack">
          <strong>Threads</strong>
          <Field label="Search">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Partner, order, message text…" />
          </Field>
          <div className="stack" style={{ gap: 4, maxHeight: 360, overflow: 'auto' }}>
            {threadsLoading ? <LoadingState label="Loading threads…" /> : null}
            {!threadsLoading
              ? filteredThreads.map((t) => {
              const otherId = t.participantBusinessIds.find((id) => id !== business.id);
              const other = businesses.find((b) => b.id === otherId);
              const unread = unreadByThread.get(t.id) ?? 0;
              const selected = threadId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="thread-item"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => setThreadId(t.id)}
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    minHeight: 56,
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{other?.name ?? counterpartLabel}</strong>
                    {unread ? (
                      <span className="chip" style={{ fontSize: 11 }}>
                        {unread} new
                      </span>
                    ) : null}
                  </div>
                  {t.relatedEntityId ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {t.relatedEntityType ?? 'Ref'} {t.relatedEntityId}
                    </div>
                  ) : null}
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {new Date(t.lastMessageAt).toLocaleString()}
                  </div>
                </button>
              );
            })
              : null}
          </div>
          {!threadsLoading && !filteredThreads.length ? (
            <EmptyState title="No threads" description={`Start a conversation with a connected ${counterpartLabel.toLowerCase()}.`} />
          ) : null}
        </div>
        <div className="card card-pad stack">
          <strong>{activeThread ? `Conversation · ${counterpartName}` : 'Select a thread'}</strong>
          {activeThread?.relatedEntityType === 'Order' && activeThread.relatedEntityId ? (
            <div style={{ fontSize: 13 }}>
              Order context:{' '}
              <Link to={`${ordersBasePath}/${encodeURIComponent(activeThread.relatedEntityId)}`}>
                {activeThread.relatedEntityId}
              </Link>
            </div>
          ) : null}
          <div ref={conversationRef} style={{ maxHeight: 320, overflow: 'auto' }} className="stack">
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  fontSize: 13,
                  alignSelf: m.senderId === actor.id ? 'flex-end' : 'flex-start',
                  background:
                    m.senderId === actor.id ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--subtle)',
                  padding: '8px 10px',
                  borderRadius: 10,
                  maxWidth: '85%',
                }}
              >
                <strong>{m.senderId === actor.id ? 'You' : counterpartName}</strong>: {m.body}
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

      <Modal
        open={createOpen}
        title="New conversation"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newCounterpart || busy}
              onClick={async () => {
                const existing = mine.find(
                  (t) =>
                    t.participantBusinessIds.includes(newCounterpart) &&
                    !t.relatedEntityId,
                );
                if (existing) {
                  setThreadId(existing.id);
                  setNewCounterpart('');
                  setCreateOpen(false);
                  return;
                }
                setBusy(true);
                const res = await ensureMessageThread({
                  actor,
                  business,
                  counterpartBusinessId: newCounterpart,
                });
                setBusy(false);
                if (res.ok) {
                  setThreadId(res.data.id);
                  setNewCounterpart('');
                  setBody('');
                  setCreateOpen(false);
                } else pushToast({ tone: 'error', title: res.message });
              }}
            >
              Start
            </Button>
          </>
        }
      >
        <div className="stack">
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
          {!counterparts.length ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              No Active connections yet — connect first, then message.
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_PLACEMENTS,
  deleteAnnouncement,
  unpublishAnnouncement,
  upsertAnnouncement,
} from '../../../services/announcementService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type FormState = {
  id?: string;
  title: string;
  body: string;
  targetRoles: string[];
  placements: string[];
  priority: 'Low' | 'Medium' | 'High';
  startsAt: string;
  endsAt: string;
};

const emptyForm = (): FormState => ({
  title: '',
  body: '',
  targetRoles: ['Pharmacy', 'Stockist'],
  placements: ['All Dashboards'],
  priority: 'Medium',
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: '',
});

export function AdminAnnouncements() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const items = useLiveQuery(() => db.announcements.reverse().sortBy('createdAt')) ?? [];
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const toggle = (key: 'targetRoles' | 'placements', value: string) => {
    setForm((f) => {
      const list = f[key];
      const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
      return { ...f, [key]: next };
    });
  };

  const save = () =>
    void run(async () => {
      const res = await upsertAnnouncement({
        actor: user,
        business,
        id: form.id,
        title: form.title,
        body: form.body,
        targetRoles: form.targetRoles,
        placements: form.placements,
        priority: form.priority,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        active: true,
      });
      pushToast(
        res.ok
          ? { tone: 'success', title: form.id ? 'Announcement updated' : 'Announcement published' }
          : { tone: 'error', title: res.message },
      );
      if (res.ok) {
        setOpen(false);
        setForm(emptyForm());
      }
    });

  return (
    <div className="stack">
      <PageHeader
        title="Announcements"
        subtitle="Audience, placements, priority, and schedule — publishing notifies matching users"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm());
              setOpen(true);
            }}
          >
            New announcement
          </Button>
        }
      />

      {!items.length ? (
        <EmptyState
          title="No announcements"
          description="Publish your first announcement."
          action={
            <Button
              onClick={() => {
                setForm(emptyForm());
                setOpen(true);
              }}
            >
              New announcement
            </Button>
          }
        />
      ) : (
        items.map((a) => (
          <div key={a.id} className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>
                {a.title} {a.active ? '' : '(unpublished)'}
              </strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {a.priority ?? 'Medium'} · {a.targetRoles.join(', ')}
              </span>
            </div>
            <div style={{ fontSize: 13.5 }}>{a.body}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {a.placements.join(' · ')}
              {a.endsAt ? ` · ends ${new Date(a.endsAt).toLocaleString()}` : ''}
            </div>
            <div className="row">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setForm({
                    id: a.id,
                    title: a.title,
                    body: a.body,
                    targetRoles: a.targetRoles,
                    placements: a.placements,
                    priority: a.priority ?? 'Medium',
                    startsAt: a.startsAt.slice(0, 16),
                    endsAt: a.endsAt ? a.endsAt.slice(0, 16) : '',
                  });
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              {a.active ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const res = await unpublishAnnouncement({ actor: user, business, id: a.id });
                    pushToast(res.ok ? { tone: 'info', title: 'Unpublished' } : { tone: 'error', title: res.message });
                  }}
                >
                  Unpublish
                </Button>
              ) : null}
              <Button size="sm" variant="danger" onClick={() => setDeleteId(a.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete announcement?"
        tone="danger"
        confirmLabel="Delete announcement"
        body={<p>This removes the announcement permanently. Unpublished items can be deleted the same way.</p>}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          const res = await deleteAnnouncement({ actor: user, business, id: deleteId! });
          pushToast(res.ok ? { tone: 'info', title: 'Deleted' } : { tone: 'error', title: res.message });
          if (res.ok) setDeleteId(null);
        }}
      />

      <Modal
        open={open}
        title={form.id ? 'Edit announcement' : 'New announcement'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Publish'}
            </Button>
          </>
        }
      >
        <div className="stack">
          {(form.title.trim() || form.body.trim()) && (
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Live preview
              </div>
              <div className={`banner-strip ${form.priority === 'High' ? 'warning' : ''}`}>
                <strong>{form.title.trim() || 'Title'}</strong>
                {form.body.trim() ? ` — ${form.body.trim()}` : ''}
              </div>
            </div>
          )}
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label="Body">
            <Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={3} />
          </Field>
          <Field label="Priority">
            <Select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as FormState['priority'] }))}
            >
              {(['Low', 'Medium', 'High'] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Audience</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {ANNOUNCEMENT_AUDIENCES.map((r) => (
                <label key={r} style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={form.targetRoles.includes(r)} onChange={() => toggle('targetRoles', r)} /> {r}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Placements</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {ANNOUNCEMENT_PLACEMENTS.map((p) => (
                <label key={p} style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={form.placements.includes(p)} onChange={() => toggle('placements', p)} /> {p}
                </label>
              ))}
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </Field>
            <Field label="Ends (optional)">
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_PLACEMENTS,
  unpublishAnnouncement,
  upsertAnnouncement,
} from '../../../services/announcementService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
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
      if (res.ok) setForm(emptyForm());
    });

  return (
    <div className="stack">
      <PageHeader title="Announcements" subtitle="Audience, placements, priority, schedule — N-045 on publish" />
      <div className="card card-pad stack">
        <strong>{form.id ? 'Edit announcement' : 'New announcement'}</strong>
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
        <div className="row">
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : form.id ? 'Save changes' : 'Publish'}
          </Button>
          {form.id ? (
            <Button variant="secondary" onClick={() => setForm(emptyForm())}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </div>

      {!items.length ? (
        <EmptyState title="No announcements" description="Publish your first announcement above." />
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
                onClick={() =>
                  setForm({
                    id: a.id,
                    title: a.title,
                    body: a.body,
                    targetRoles: a.targetRoles,
                    placements: a.placements,
                    priority: a.priority ?? 'Medium',
                    startsAt: a.startsAt.slice(0, 16),
                    endsAt: a.endsAt ? a.endsAt.slice(0, 16) : '',
                  })
                }
              >
                Edit
              </Button>
              {a.active ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    const res = await unpublishAnnouncement({ actor: user, business, id: a.id });
                    pushToast(res.ok ? { tone: 'info', title: 'Unpublished' } : { tone: 'error', title: res.message });
                  }}
                >
                  Unpublish
                </Button>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

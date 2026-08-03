import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Banner } from '../../../domain/entities/types';
import { db } from '../../../data/db';
import {
  BANNER_PLACEMENTS,
  deleteBanner,
  setBannerActive,
  upsertBanner,
} from '../../../services/bannerService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, DeleteButton, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type FormState = {
  id?: string;
  text: string;
  tone: Banner['tone'];
  placements: string[];
  startsAt: string;
  endsAt: string;
};

const emptyForm = (): FormState => ({
  text: '',
  tone: 'info',
  placements: ['Auth'],
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: '',
});

export function AdminBanners() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const banners = useLiveQuery(() => db.banners.reverse().sortBy('createdAt')) ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const togglePlace = (value: string) => {
    setForm((f) => {
      const next = f.placements.includes(value) ? f.placements.filter((x) => x !== value) : [...f.placements, value];
      return { ...f, placements: next };
    });
  };

  const save = async () => {
    const res = await upsertBanner({
      actor: user,
      business,
      id: form.id,
      text: form.text,
      tone: form.tone,
      placements: form.placements,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      active: true,
    });
    pushToast(res.ok ? { tone: 'success', title: form.id ? 'Banner updated' : 'Banner created' } : { tone: 'error', title: res.message });
    if (res.ok) {
      setOpen(false);
      setForm(emptyForm());
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title="Banner management"
        subtitle="Auth + dashboard placements with schedule and pause/go-live"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm());
              setOpen(true);
            }}
          >
            New banner
          </Button>
        }
      />

      {!banners.length ? (
        <EmptyState
          title="No banners"
          description="Create a banner for Auth or portal dashboards."
          action={
            <Button
              onClick={() => {
                setForm(emptyForm());
                setOpen(true);
              }}
            >
              New banner
            </Button>
          }
        />
      ) : (
        banners.map((b) => (
          <div key={b.id} className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className={`banner-strip ${b.tone === 'warning' || b.tone === 'danger' ? 'warning' : ''}`} style={{ flex: 1 }}>
                {b.text}
              </div>
              <StatusBadge status={b.active ? 'Active' : 'Inactive'} />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {b.placements.join(' · ')}
              {b.endsAt ? ` · ends ${new Date(b.endsAt).toLocaleString()}` : ''}
            </div>
            <div className="row">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setForm({
                    id: b.id,
                    text: b.text,
                    tone: b.tone,
                    placements: b.placements,
                    startsAt: b.startsAt.slice(0, 16),
                    endsAt: b.endsAt ? b.endsAt.slice(0, 16) : '',
                  });
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const wasActive = b.active;
                  const res = await setBannerActive({ actor: user, business, id: b.id, active: !b.active });
                  pushToast(
                    res.ok
                      ? {
                          tone: 'info',
                          title: wasActive ? 'Paused' : 'Go live',
                          actionLabel: 'Undo',
                          onAction: async () => {
                            await setBannerActive({ actor: user, business, id: b.id, active: wasActive });
                          },
                        }
                      : { tone: 'error', title: res.message },
                  );
                }}
              >
                {b.active ? 'Pause' : 'Go live'}
              </Button>
              <DeleteButton size="sm" onClick={() => setDeleteId(b.id)}>
                Delete
              </DeleteButton>
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete banner?"
        body="This banner will be removed from all placements immediately."
        confirmLabel="Delete banner"
        tone="danger"
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          const res = await deleteBanner({ actor: user, business, id: deleteId! });
          pushToast(res.ok ? { tone: 'info', title: 'Deleted' } : { tone: 'error', title: res.message });
          if (res.ok) setDeleteId(null);
        }}
      />

      <Modal
        open={open}
        title={form.id ? 'Edit banner' : 'New banner'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Text">
            <Input value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
          </Field>
          <Field label="Tone">
            <Select
              value={form.tone}
              onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value as Banner['tone'] }))}
            >
              {(['info', 'warning', 'success', 'danger'] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Placements</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {BANNER_PLACEMENTS.map((p) => (
                <label key={p} style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={form.placements.includes(p)} onChange={() => togglePlace(p)} /> {p}
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

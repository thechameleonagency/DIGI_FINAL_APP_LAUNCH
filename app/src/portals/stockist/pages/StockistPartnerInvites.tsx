import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { createPartnerInvite, withdrawPartnerInvite } from '../../../services/partnerInviteService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { Button, EmptyState, Field, Input, Modal, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistPartnerInvites() {
  const { business, user } = useBiz();
  const navigate = useNavigate();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const invites =
    useLiveQuery(() => db.partnerInvites.where('stockistId').equals(business.id).reverse().sortBy('createdAt'), [
      business.id,
    ]) ?? [];

  const [inviteOpen, setInviteOpen] = useState(false);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gst, setGst] = useState('');
  const [shareText, setShareText] = useState('');
  const withdrawTarget = withdrawId ? invites.find((i) => i.id === withdrawId) : undefined;

  return (
    <div className="stack">
      <PageHeader
        title="Partner invites"
        subtitle="Invite off-platform pharmacies to register — no pharmacy records are created by you"
        actions={
          <div className="row">
            <Link className="btn btn-secondary btn-sm" to="/stockist/pharmacies">
              Pharmacies
            </Link>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              New invite
            </Button>
          </div>
        }
      />

      <Modal
        open={inviteOpen}
        title="New invite"
        onClose={() => setInviteOpen(false)}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await createPartnerInvite({
                    actor: user,
                    stockist: business,
                    name,
                    phone,
                    email: email || undefined,
                    gst: gst || undefined,
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  if (res.data.existingPharmacyId) {
                    pushToast({
                      tone: 'info',
                      title: 'Already on DigiSwasthya',
                      message: `${res.data.existingPharmacyName} — opening Pharmacies for connection.`,
                    });
                    setShareText('');
                    setInviteOpen(false);
                    navigate(`/stockist/pharmacies/${res.data.existingPharmacyId}`);
                    return;
                  }
                  setShareText(res.data.shareText ?? '');
                  pushToast({ tone: 'success', title: 'Invite ready to share' });
                  setName('');
                  setPhone('');
                  setEmail('');
                  setGst('');
                  setInviteOpen(false);
                })
              }
            >
              {busy ? 'Working…' : 'Create invite'}
            </Button>
          </div>
        }
      >
        <div className="stack">
          <Field label="Pharmacy name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
          </Field>
          <Field label="Email (optional)">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="GSTIN (optional)">
            <Input value={gst} onChange={(e) => setGst(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {shareText ? (
        <div className="card card-pad stack">
          <strong>Shareable message</strong>
          <Field label="Copy and send to the pharmacy">
            <Textarea rows={5} value={shareText} readOnly />
          </Field>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareText);
                pushToast({ tone: 'success', title: 'Copied' });
              } catch {
                pushToast({ tone: 'info', title: 'Copy manually from the box' });
              }
            }}
          >
            Copy message
          </Button>
        </div>
      ) : null}

      {!invites.length ? (
        <EmptyState
          title="No invites yet"
          description="Invites track Sent → Registered → Connected."
          action={<Button onClick={() => setInviteOpen(true)}>New invite</Button>}
        />
      ) : (
        invites.map((i) => (
          <div key={i.id} className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{i.name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {i.phone}
                  {i.gst ? ` · ${i.gst}` : ''}
                  {i.email ? ` · ${i.email}` : ''}
                </div>
              </div>
              <StatusBadge status={i.status} />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {new Date(i.createdAt).toLocaleString()}
            </div>
            {i.status === 'Sent' || i.status === 'Registered' ? (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => setWithdrawId(i.id)}>
                Withdraw
              </Button>
            ) : null}
          </div>
        ))
      )}

      <ConfirmDialog
        open={!!withdrawTarget}
        title="Withdraw invite?"
        tone="danger"
        confirmLabel="Withdraw invite"
        body={
          <p>
            Withdraw the invite for <strong>{withdrawTarget?.name}</strong>? Any shared registration link will stop
            working.
          </p>
        }
        onClose={() => setWithdrawId(null)}
        onConfirm={async () => {
          if (!withdrawId) return;
          const res = await withdrawPartnerInvite({ actor: user, stockist: business, id: withdrawId });
          pushToast(res.ok ? { tone: 'info', title: 'Invite withdrawn' } : { tone: 'error', title: res.message });
          if (res.ok) setWithdrawId(null);
        }}
      />
    </div>
  );
}

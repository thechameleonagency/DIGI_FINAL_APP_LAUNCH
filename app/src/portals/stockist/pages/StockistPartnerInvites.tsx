import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { createPartnerInvite, withdrawPartnerInvite } from '../../../services/partnerInviteService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
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

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gst, setGst] = useState('');
  const [shareText, setShareText] = useState('');

  return (
    <div className="stack">
      <PageHeader
        title="Partner invites"
        subtitle="Invite off-platform pharmacies to register — no pharmacy records are created by you"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/stockist/pharmacies">
            Pharmacies
          </Link>
        }
      />

      <div className="card card-pad stack">
        <strong>New invite</strong>
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
                navigate(`/stockist/pharmacies/${res.data.existingPharmacyId}`);
                return;
              }
              setShareText(res.data.shareText ?? '');
              pushToast({ tone: 'success', title: 'Invite ready to share' });
              setName('');
              setPhone('');
              setEmail('');
              setGst('');
            })
          }
        >
          {busy ? 'Working…' : 'Create invite'}
        </Button>
        {shareText ? (
          <div className="stack">
            <Field label="Shareable message">
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
      </div>

      {!invites.length ? (
        <EmptyState title="No invites yet" description="Invites track Sent → Registered → Connected." />
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
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const res = await withdrawPartnerInvite({ actor: user, stockist: business, id: i.id });
                    pushToast(
                      res.ok ? { tone: 'info', title: 'Invite withdrawn' } : { tone: 'error', title: res.message },
                    );
                  })
                }
              >
                Withdraw
              </Button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

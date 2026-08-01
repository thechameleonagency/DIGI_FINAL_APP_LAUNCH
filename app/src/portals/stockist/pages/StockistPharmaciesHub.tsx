import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import {
  blockConnection,
  disconnectConnection,
  respondConnection,
  unblockConnection,
} from '../../../services/connectionService';
import { createManagedPharmacy, inviteManagedPharmacy } from '../../../services/managedPharmacyService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, Modal, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type HubTab = 'Offline' | 'Invited' | 'Platform';

export function StockistPharmaciesHub() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [tab, setTab] = useState<HubTab>('Platform');
  const [platformFilter, setPlatformFilter] = useState('Requested');
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteFirst, setInviteFirst] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    gst: '',
    address: '',
    city: '',
    note: '',
  });
  const [shareText, setShareText] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [creditDays, setCreditDays] = useState('30');
  const [creditLimit, setCreditLimit] = useState('100000');

  const managed =
    useLiveQuery(() => db.managedPharmacies.where('stockistId').equals(business.id).reverse().sortBy('updatedAt'), [
      business.id,
    ]) ?? [];
  const connections = useLiveQuery(() => db.connections.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];

  const offline = managed.filter((m) => m.status === 'OfflineOnly');
  const invited = managed.filter((m) => m.status === 'Invited');
  const filteredConns =
    platformFilter === 'All' ? connections : connections.filter((c) => c.status === platformFilter);
  const approveTarget = approveId ? connections.find((c) => c.id === approveId) : undefined;
  const approvePharmacy = approveTarget ? pharmacies.find((p) => p.id === approveTarget.pharmacyId) : undefined;

  return (
    <div className="stack">
      <PageHeader
        title="Pharmacies"
        subtitle="Offline managed, invited, and platform-connected partners"
        actions={
          <div className="row">
            <Link className="btn btn-secondary btn-sm" to="/stockist/invites">
              Invites
            </Link>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Add offline pharmacy
            </Button>
          </div>
        }
      />

      <div className="tabs">
        {(['Offline', 'Invited', 'Platform'] as HubTab[]).map((t) => (
          <button key={t} type="button" className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
            <span className="muted" style={{ marginLeft: 6 }}>
              {t === 'Offline' ? offline.length : t === 'Invited' ? invited.length : connections.length}
            </span>
          </button>
        ))}
      </div>

      <Modal
        open={createOpen}
        title={inviteFirst ? 'Invite pharmacy first' : 'Add offline pharmacy'}
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="row">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await createManagedPharmacy({
                    actor: user,
                    stockist: business,
                    data: {
                      name: form.name,
                      phone: form.phone,
                      email: form.email || undefined,
                      gst: form.gst || undefined,
                      address: form.address || undefined,
                      city: form.city || undefined,
                      note: form.note || undefined,
                      inviteFirst,
                    },
                  });
                  if (!res.ok) {
                    pushToast({ tone: 'error', title: res.message });
                    return;
                  }
                  pushToast({ tone: 'success', title: inviteFirst ? 'Invite created' : 'Offline pharmacy added' });
                  setCreateOpen(false);
                  setForm({ name: '', phone: '', email: '', gst: '', address: '', city: '', note: '' });
                  setTab(inviteFirst ? 'Invited' : 'Offline');
                })
              }
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="stack">
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={inviteFirst} onChange={(e) => setInviteFirst(e.target.checked)} />
            Invite to DigiSwasthya first (no local ops until linked)
          </label>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="GSTIN">
            <Input value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </Field>
          <Field label="Note">
            <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {shareText ? (
        <div className="card card-pad stack">
          <strong>Share invite</strong>
          <Textarea value={shareText} readOnly rows={4} />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(shareText);
              pushToast({ tone: 'success', title: 'Copied' });
            }}
          >
            Copy
          </Button>
        </div>
      ) : null}

      {tab === 'Offline' || tab === 'Invited' ? (
        <div className="stack">
          {(tab === 'Offline' ? offline : invited).length === 0 ? (
            <EmptyState
              title={tab === 'Offline' ? 'No offline pharmacies' : 'No invited pharmacies'}
              description="Add a pharmacy to manage orders before they join DigiSwasthya."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Add pharmacy
                </Button>
              }
            />
          ) : (
            (tab === 'Offline' ? offline : invited).map((m) => (
              <div key={m.id} className="card card-pad stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{m.name}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {m.phone}
                      {m.city ? ` · ${m.city}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                <div className="row">
                  <Link className="btn btn-secondary btn-sm" to={`/stockist/pharmacies/managed/${m.id}`}>
                    Open
                  </Link>
                  <Link className="btn btn-secondary btn-sm" to={`/stockist/manual-order?managed=${m.id}`}>
                    Manual order
                  </Link>
                  {m.status === 'OfflineOnly' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const res = await inviteManagedPharmacy({ actor: user, stockist: business, id: m.id });
                          if (!res.ok) {
                            pushToast({ tone: 'error', title: res.message });
                            return;
                          }
                          setShareText(res.data.shareText ?? '');
                          pushToast({ tone: 'success', title: 'Invite ready' });
                          setTab('Invited');
                        })
                      }
                    >
                      Invite to DigiSwasthya
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
          {tab === 'Invited'
            ? managed
                .filter((m) => m.status === 'Linked')
                .map((m) => (
                  <div key={m.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{m.name}</strong> <StatusBadge status="Linked" />
                      <div className="muted" style={{ fontSize: 13 }}>
                        Linked to platform pharmacy
                      </div>
                    </div>
                    {m.linkedBusinessId ? (
                      <Link className="btn btn-secondary btn-sm" to={`/stockist/pharmacies/${m.linkedBusinessId}`}>
                        Platform detail
                      </Link>
                    ) : null}
                  </div>
                ))
            : null}
        </div>
      ) : (
        <div className="stack">
          <div className="tabs">
            {['Requested', 'Active', 'Rejected', 'Blocked', 'Disconnected', 'All'].map((t) => (
              <button
                key={t}
                type="button"
                className={`tab${platformFilter === t ? ' active' : ''}`}
                onClick={() => setPlatformFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <ConfirmDialog
            open={!!rejectId}
            title="Reject connection"
            body="Tell the pharmacy why this request was declined."
            requireReason
            tone="danger"
            confirmLabel="Reject request"
            onClose={() => setRejectId(null)}
            onConfirm={async (reason) => {
              const res = await respondConnection({
                actor: user,
                stockist: business,
                connectionId: rejectId!,
                decision: 'Rejected',
                reason: reason!,
              });
              pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
              setRejectId(null);
            }}
          />
          <ConfirmDialog
            open={!!blockId}
            title="Block connection"
            body="Blocked partners cannot place new orders."
            requireReason
            tone="danger"
            confirmLabel="Block"
            onClose={() => setBlockId(null)}
            onConfirm={async (reason) => {
              const res = await blockConnection({
                actor: user,
                stockist: business,
                connectionId: blockId!,
                reason: reason!,
              });
              pushToast(res.ok ? { tone: 'warning', title: 'Connection blocked' } : { tone: 'error', title: res.message });
              setBlockId(null);
            }}
          />
          <ConfirmDialog
            open={!!disconnectId}
            title="Disconnect pharmacy"
            body="You can reconnect later if both parties agree."
            requireReason
            tone="danger"
            confirmLabel="Disconnect"
            onClose={() => setDisconnectId(null)}
            onConfirm={async (reason) => {
              const res = await disconnectConnection({
                actor: user,
                business,
                connectionId: disconnectId!,
                reason: reason!,
              });
              pushToast(res.ok ? { tone: 'info', title: 'Disconnected' } : { tone: 'error', title: res.message });
              setDisconnectId(null);
            }}
          />
          <Modal
            open={!!approveId}
            title={`Approve ${approvePharmacy?.name ?? 'pharmacy'}`}
            onClose={() => setApproveId(null)}
            footer={
              <div className="row">
                <Button variant="secondary" onClick={() => setApproveId(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const res = await respondConnection({
                      actor: user,
                      stockist: business,
                      connectionId: approveId!,
                      decision: 'Active',
                      creditDays: Number(creditDays) || 30,
                      creditLimit: Number(creditLimit) || 100000,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Approved' } : { tone: 'error', title: res.message });
                    setApproveId(null);
                  }}
                >
                  Approve
                </Button>
              </div>
            }
          >
            <div className="grid-2">
              <Field label="Credit days">
                <Input value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
              </Field>
              <Field label="Credit limit">
                <Input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
              </Field>
            </div>
          </Modal>
          {!filteredConns.length ? (
            <EmptyState title="No connections" description="When pharmacies request to connect, they appear here." />
          ) : (
            filteredConns.map((c) => {
              const ph = pharmacies.find((p) => p.id === c.pharmacyId);
              const out = pairOutstanding(
                invoices.filter((i) => i.pharmacyId === c.pharmacyId),
                c.pharmacyId,
                business.id,
              );
              return (
                <div key={c.id} className="card card-pad stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{ph?.name ?? c.pharmacyId}</strong>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Outstanding {formatINR(out)}
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="row">
                    <Link className="btn btn-secondary btn-sm" to={`/stockist/pharmacies/${c.pharmacyId}`}>
                      Open
                    </Link>
                    {c.status === 'Requested' ? (
                      <>
                        <Button size="sm" onClick={() => setApproveId(c.id)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectId(c.id)}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {c.status === 'Active' ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setBlockId(c.id)}>
                          Block
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDisconnectId(c.id)}>
                          Disconnect
                        </Button>
                      </>
                    ) : null}
                    {c.status === 'Blocked' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const res = await unblockConnection({
                            actor: user,
                            stockist: business,
                            connectionId: c.id,
                          });
                          pushToast(res.ok ? { tone: 'success', title: 'Unblocked' } : { tone: 'error', title: res.message });
                        }}
                      >
                        Unblock
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

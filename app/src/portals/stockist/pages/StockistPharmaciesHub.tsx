import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { formatINR } from '../../../domain/utils/money';
import { parseNumberInput } from '../../../domain/utils/validation';
import {
  blockConnection,
  disconnectConnection,
  respondConnection,
  unblockConnection,
} from '../../../services/connectionService';
import { createManagedPharmacy, inviteManagedPharmacy } from '../../../services/managedPharmacyService';
import { useUi } from '../../../store/ui';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { ListPageChrome } from '../../../ui/components/ListPageChrome';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, Field, Input, Modal, Select, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type HubTab = 'Circle' | 'Platform' | 'Invited' | 'Offline';

export function StockistPharmaciesHub() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: HubTab =
    tabParam === 'Platform' || tabParam === 'Invited' || tabParam === 'Offline' || tabParam === 'Circle'
      ? tabParam
      : 'Circle';
  const setTab = (nextTab: HubTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', nextTab);
    setParams(next, { replace: true });
  };
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
  const [creditErrors, setCreditErrors] = useState<{ days?: string; limit?: string }>({});

  const managed =
    useLiveQuery(() => db.managedPharmacies.where('stockistId').equals(business.id).reverse().sortBy('updatedAt'), [
      business.id,
    ]) ?? [];
  const connections = useLiveQuery(() => db.connections.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];
  const pharmacies = useLiveQuery(() => db.businesses.where('type').equals('Pharmacy').toArray()) ?? [];
  const invoices = useLiveQuery(() => db.invoices.where('stockistId').equals(business.id).toArray(), [business.id]) ?? [];

  const offline = managed.filter((m) => m.status === 'OfflineOnly');
  const invited = managed.filter((m) => m.status === 'Invited');
  const circleConns = connections.filter((c) => c.status === 'Active' && c.inCircle);
  const filteredConns =
    platformFilter === 'All' ? connections : connections.filter((c) => c.status === platformFilter);
  const approveTarget = approveId ? connections.find((c) => c.id === approveId) : undefined;
  const approvePharmacy = approveTarget ? pharmacies.find((p) => p.id === approveTarget.pharmacyId) : undefined;

  return (
    <ListPageChrome
      title="Circle"
      subtitle="Credit Circle, platform links, invites, and offline-managed pharmacies"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Add offline pharmacy
        </Button>
      }
      tabs={[
        { id: 'Circle', label: 'Circle', count: circleConns.length },
        { id: 'Platform', label: 'Platform', count: connections.length },
        { id: 'Invited', label: 'Invited', count: invited.length },
        { id: 'Offline', label: 'Offline', count: offline.length },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as HubTab)}
    >
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

      {tab === 'Circle' ? (
        <div className="stack">
          {!circleConns.length ? (
            <EmptyState
              title="No Circle members yet"
              description="Approve a connection with a credit limit, or open a pharmacy and use Add to Circle."
              action={
                <Button size="sm" variant="secondary" onClick={() => setTab('Platform')}>
                  Open platform requests
                </Button>
              }
            />
          ) : (
            circleConns.map((c) => {
              const ph = pharmacies.find((p) => p.id === c.pharmacyId);
              const outstanding = pairOutstanding(invoices, c.pharmacyId, business.id);
              return (
                <div key={c.id} className="card card-pad row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{ph?.name ?? c.pharmacyId}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>
                      Credit {c.creditDays ?? 0}d · Limit {formatINR(c.creditLimit ?? 0)} · Outstanding {formatINR(outstanding)}
                    </div>
                  </div>
                  <div className="row">
                    <Link className="btn btn-secondary btn-sm" to={`/stockist/pharmacies/${c.pharmacyId}`}>
                      Open
                    </Link>
                    <Link className="btn btn-secondary btn-sm" to={`/stockist/manual-order?pharmacy=${c.pharmacyId}`}>
                      Manual order
                    </Link>
                    <Link className="btn btn-secondary btn-sm" to={`/stockist/payments?pharmacy=${c.pharmacyId}`}>
                      Record payment
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : tab === 'Offline' || tab === 'Invited' ? (
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
          <Field label="Connection status">
            <Select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} style={{ maxWidth: 220 }}>
              {['Requested', 'Active', 'Rejected', 'Blocked', 'Disconnected', 'All'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
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
            body="Blocked pharmacies cannot place new orders."
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
            onClose={() => {
              setApproveId(null);
              setCreditErrors({});
            }}
            footer={
              <div className="row">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setApproveId(null);
                    setCreditErrors({});
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const daysParsed = parseNumberInput(creditDays);
                    const limitParsed = parseNumberInput(creditLimit);
                    const next: typeof creditErrors = {};
                    if (daysParsed.status === 'empty') next.days = 'Credit days are required';
                    else if (
                      daysParsed.status === 'invalid' ||
                      !Number.isInteger(daysParsed.value) ||
                      daysParsed.value < 0
                    ) {
                      next.days = 'Enter a whole number of days (0 or more)';
                    }
                    if (limitParsed.status === 'empty') next.limit = 'Credit limit is required';
                    else if (limitParsed.status === 'invalid' || limitParsed.value <= 0) {
                      next.limit = 'Enter a credit limit greater than zero';
                    }
                    if (Object.keys(next).length || daysParsed.status !== 'ok' || limitParsed.status !== 'ok') {
                      setCreditErrors(next);
                      return;
                    }
                    const res = await respondConnection({
                      actor: user,
                      stockist: business,
                      connectionId: approveId!,
                      decision: 'Active',
                      creditDays: daysParsed.value,
                      creditLimit: limitParsed.value,
                    });
                    pushToast(res.ok ? { tone: 'success', title: 'Approved' } : { tone: 'error', title: res.message });
                    if (res.ok) {
                      setApproveId(null);
                      setCreditErrors({});
                    }
                  }}
                >
                  Approve
                </Button>
              </div>
            }
          >
            <div className="grid-2">
              <Field label="Credit days" error={creditErrors.days}>
                <Input
                  type="number"
                  min={0}
                  value={creditDays}
                  onChange={(e) => {
                    setCreditDays(e.target.value);
                    setCreditErrors((err) => ({ ...err, days: undefined }));
                  }}
                />
              </Field>
              <Field label="Credit limit (₹)" error={creditErrors.limit}>
                <Input
                  type="number"
                  min={1}
                  value={creditLimit}
                  onChange={(e) => {
                    setCreditLimit(e.target.value);
                    setCreditErrors((err) => ({ ...err, limit: undefined }));
                  }}
                />
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
    </ListPageChrome>
  );
}

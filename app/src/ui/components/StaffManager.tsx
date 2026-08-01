import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { Business, OperationalRole, User } from '../../domain/entities/types';
import type { Action } from '../../domain/permissions';
import { inviteStaff } from '../../services/authService';
import {
  changeRole,
  reactivateStaff,
  removeStaff,
  resendInvite,
  revokeInvite,
  setPermissionOverrides,
  suspendStaff,
  transferOwnership,
} from '../../services/staffService';
import { useUi } from '../../store/ui';
import { RolePreviewControls } from './RolePreviewControls';
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge } from './primitives';

const ROLES: OperationalRole[] = ['Owner', 'Manager', 'Staff', 'Accountant', 'DeliveryBoy'];

const PHARMACY_OVERRIDE_ACTIONS: Action[] = [
  'order.place',
  'payment.submit',
  'return.raise',
  'credit.apply',
  'inventory.adjust',
  'connection.request',
  'staff.manage',
];
const STOCKIST_OVERRIDE_ACTIONS: Action[] = [
  'order.accept',
  'order.allocate',
  'order.pack',
  'invoice.issue',
  'payment.approve',
  'return.approve',
  'catalogue.manage',
  'inventory.adjust',
  'delivery.assign',
  'staff.manage',
];

export function StaffManager({
  actor,
  business,
  roleOptions,
}: {
  actor: User;
  business: Business;
  roleOptions?: OperationalRole[];
}) {
  const { pushToast } = useUi();
  const staff = useLiveQuery(() => db.users.where('businessId').equals(business.id).toArray(), [business.id]) ?? [];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const defaultInviteRoles = (
    business.type === 'Platform'
      ? (['SupportAgent', 'Admin'] as OperationalRole[])
      : ROLES.filter((r) => !['Owner', 'SuperAdmin', 'Admin', 'SupportAgent'].includes(r))
  );
  const inviteRoles = (roleOptions ?? defaultInviteRoles).filter((r) => r !== 'Owner' && r !== 'SuperAdmin');
  const [role, setRole] = useState<OperationalRole>(inviteRoles[0] ?? 'Staff');
  const [overrideUserId, setOverrideUserId] = useState<string | null>(null);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, boolean>>({});
  const overrideActions = business.type === 'Stockist' ? STOCKIST_OVERRIDE_ACTIONS : PHARMACY_OVERRIDE_ACTIONS;
  const overrideTarget = overrideUserId ? staff.find((s) => s.id === overrideUserId) : undefined;

  return (
    <div className="stack">
      <PageHeader title="Staff" subtitle="Invite, roles, suspend/remove, ownership transfer, permission overrides" />
      <RolePreviewControls />
      <Modal
        open={!!overrideTarget}
        title={overrideTarget ? `Permission overrides — ${overrideTarget.name}` : 'Overrides'}
        onClose={() => setOverrideUserId(null)}
        footer={
          <div className="row">
            <Button variant="secondary" onClick={() => setOverrideUserId(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!overrideTarget) return;
                const res = await setPermissionOverrides({
                  actor,
                  business,
                  userId: overrideTarget.id,
                  overrides: draftOverrides,
                });
                pushToast(res.ok ? { tone: 'success', title: 'Overrides saved' } : { tone: 'error', title: res.message });
                if (res.ok) setOverrideUserId(null);
              }}
            >
              Save overrides
            </Button>
          </div>
        }
      >
        <p className="muted" style={{ fontSize: 13 }}>
          Default = role matrix. Allow / Deny override the role for this person (D11).
        </p>
        <div className="stack" style={{ marginTop: 8 }}>
          {overrideActions.map((action) => {
            const val = draftOverrides[action];
            const mode = val === true ? 'allow' : val === false ? 'deny' : 'default';
            return (
              <div key={action} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span>{action}</span>
                <Select
                  value={mode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDraftOverrides((o) => {
                      const copy = { ...o };
                      if (next === 'default') delete copy[action];
                      else copy[action] = next === 'allow';
                      return copy;
                    });
                  }}
                  style={{ maxWidth: 140 }}
                  aria-label={`Override ${action}`}
                >
                  <option value="default">Default</option>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </Select>
              </div>
            );
          })}
        </div>
      </Modal>
      {!staff.length ? (
        <EmptyState title="No staff yet" description="Invite team members below." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    {s.role === 'Owner' ? (
                      s.role
                    ) : (
                      <Select
                        value={s.role}
                        onChange={async (e) => {
                          const res = await changeRole({
                            actor,
                            business,
                            userId: s.id,
                            role: e.target.value as OperationalRole,
                          });
                          pushToast(res.ok ? { tone: 'success', title: 'Role updated' } : { tone: 'error', title: res.message });
                        }}
                      >
                        {inviteRoles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    {s.email}
                    {s.inviteToken ? (
                      <div className="muted" style={{ fontSize: 11 }}>
                        Invite:{' '}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={async () => {
                            const url = `${window.location.origin}/auth/invite/${s.inviteToken}`;
                            await navigator.clipboard.writeText(url);
                            pushToast({ tone: 'info', title: 'Invite link copied' });
                          }}
                        >
                          Copy link
                        </button>
                        {s.inviteExpiresAt ? ` · expires ${new Date(s.inviteExpiresAt).toLocaleDateString()}` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="row">
                      {s.status === 'Active' && s.role !== 'Owner' ? (
                        <Button size="sm" variant="secondary" onClick={async () => {
                          const res = await suspendStaff({ actor, business, userId: s.id });
                          pushToast(res.ok ? { tone: 'warning', title: 'Suspended' } : { tone: 'error', title: res.message });
                        }}>Suspend</Button>
                      ) : null}
                      {s.status === 'Suspended' ? (
                        <Button size="sm" onClick={async () => {
                          const res = await reactivateStaff({ actor, business, userId: s.id });
                          pushToast(res.ok ? { tone: 'success', title: 'Reactivated' } : { tone: 'error', title: res.message });
                        }}>Reactivate</Button>
                      ) : null}
                      {s.status === 'Invited' ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              const res = await resendInvite({ actor, business, userId: s.id });
                              if (!res.ok) {
                                pushToast({ tone: 'error', title: res.message });
                                return;
                              }
                              const url = `${window.location.origin}/auth/invite/${res.data.inviteToken}`;
                              await navigator.clipboard.writeText(url);
                              pushToast({
                                tone: 'success',
                                title: 'Invite resent',
                                message: 'New link copied to clipboard.',
                              });
                            }}
                          >
                            Resend
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const res = await revokeInvite({ actor, business, userId: s.id });
                              pushToast(
                                res.ok ? { tone: 'info', title: 'Invite revoked' } : { tone: 'error', title: res.message },
                              );
                            }}
                          >
                            Revoke
                          </Button>
                        </>
                      ) : null}
                      {s.role !== 'Owner' && s.status !== 'Removed' ? (
                        <Button size="sm" variant="danger" onClick={async () => {
                          const res = await removeStaff({ actor, business, userId: s.id });
                          pushToast(res.ok ? { tone: 'info', title: 'Removed' } : { tone: 'error', title: res.message });
                        }}>Remove</Button>
                      ) : null}
                      {actor.role === 'Owner' && s.role !== 'Owner' && s.status === 'Active' ? (
                        <Button size="sm" variant="ghost" onClick={async () => {
                          const res = await transferOwnership({ actor, business, newOwnerUserId: s.id });
                          pushToast(res.ok ? { tone: 'success', title: 'Ownership transferred' } : { tone: 'error', title: res.message });
                        }}>Make owner</Button>
                      ) : null}
                      {s.role !== 'Owner' && s.status === 'Active' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setOverrideUserId(s.id);
                            setDraftOverrides({ ...(s.permissionOverrides ?? {}) });
                          }}
                        >
                          Overrides
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card card-pad stack">
        <strong>Invite</strong>
        <div className="grid-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as OperationalRole)}>
              {inviteRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          onClick={async () => {
            const res = await inviteStaff({ actor, business, name, email, phone, role });
            if (res.ok) {
              const url = `${window.location.origin}/auth/invite/${res.data.inviteToken}`;
              await navigator.clipboard.writeText(url);
              pushToast({
                tone: 'success',
                title: 'Invited',
                message: `Link copied. Expires ${
                  res.data.inviteExpiresAt ? new Date(res.data.inviteExpiresAt).toLocaleDateString() : 'soon'
                }.`,
              });
              setName('');
              setEmail('');
              setPhone('');
            } else pushToast({ tone: 'error', title: res.message });
          }}
        >
          Invite
        </Button>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { Business, OperationalRole, User } from '../../domain/entities/types';
import type { Action } from '../../domain/permissions';
import { normalizeRoleForBusiness } from '../../domain/permissions';
import { verifyPassword } from '../../domain/utils/crypto';
import { actionLabel } from '../../domain/utils/humanLabels';
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
import { ConfirmDialog } from './ConfirmDialog';
import { PaginationBar, usePagedRows } from './ListToolkit';
import { RolePreviewControls } from './RolePreviewControls';
import { Button, DeleteButton, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge } from './primitives';

function primaryRoleFor(business: Business): OperationalRole {
  if (business.type === 'Stockist') return 'Stockist';
  if (business.type === 'Platform') return 'SuperAdmin';
  return 'Pharmacist';
}

function isPrimaryUser(user: User, business: Business): boolean {
  const role = normalizeRoleForBusiness(user.role, business.type);
  return role === primaryRoleFor(business) || user.id === business.ownerUserId;
}

const PHARMACY_OVERRIDE_ACTIONS: Action[] = [
  'order.place',
  'payment.submit',
  'return.raise',
  'credit.apply',
  'inventory.adjust',
  'connection.request',
  'staff.manage',
  'delivery.update',
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
  'delivery.update',
  'staff.manage',
];
/** Platform overrides: ops SupportManager may hold; never settings.manage / plan.manage / impersonate. */
const PLATFORM_OVERRIDE_ACTIONS: Action[] = [
  'verification.review',
  'business.suspend',
  'support.manage',
  'announcement.manage',
  'audit.export',
  'counterfeit.review',
  'staff.manage',
];

function demotedRoleLabel(business: Business): string {
  return business.type === 'Platform' ? 'SupportManager' : 'DeliveryStaff';
}

function overrideActionsFor(business: Business): Action[] {
  if (business.type === 'Stockist') return STOCKIST_OVERRIDE_ACTIONS;
  if (business.type === 'Platform') return PLATFORM_OVERRIDE_ACTIONS;
  return PHARMACY_OVERRIDE_ACTIONS;
}

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteErrors, setInviteErrors] = useState<{ name?: string; email?: string; phone?: string }>({});
  const defaultInviteRoles: OperationalRole[] =
    business.type === 'Platform' ? ['SupportManager'] : ['DeliveryStaff'];
  const inviteRoles = (roleOptions ?? defaultInviteRoles).filter(
    (r) => r === 'DeliveryStaff' || r === 'SupportManager',
  );
  const [role, setRole] = useState<OperationalRole>(inviteRoles[0] ?? 'DeliveryStaff');
  const [overrideUserId, setOverrideUserId] = useState<string | null>(null);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, boolean>>({});
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [suspendTargetId, setSuspendTargetId] = useState<string | null>(null);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [roleChange, setRoleChange] = useState<{
    userId: string;
    name: string;
    from: OperationalRole;
    to: OperationalRole;
  } | null>(null);
  const overrideActions = overrideActionsFor(business);
  const demotedLabel = demotedRoleLabel(business);
  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)),
    [staff],
  );
  const list = usePagedRows(sortedStaff);
  const overrideTarget = overrideUserId ? staff.find((s) => s.id === overrideUserId) : undefined;
  const transferTarget = transferTargetId ? staff.find((s) => s.id === transferTargetId) : undefined;
  const suspendTarget = suspendTargetId ? staff.find((s) => s.id === suspendTargetId) : undefined;
  const removeTarget = removeTargetId ? staff.find((s) => s.id === removeTargetId) : undefined;

  return (
    <div className="stack">
      <PageHeader
        title="Staff"
        subtitle="Invite, roles, suspend/remove, ownership transfer, permission overrides"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setInviteErrors({});
              setInviteOpen(true);
            }}
          >
            Invite staff
          </Button>
        }
      />
      <RolePreviewControls />
      <ConfirmDialog
        open={!!transferTarget}
        title="Transfer ownership"
        tone="danger"
        confirmLabel="Transfer ownership"
        confirmPhrase={business.name}
        confirmPhraseLabel={`Type “${business.name}” to confirm`}
        requirePassword
        passwordLabel="Re-enter your password"
        body={
          transferTarget ? (
            <>
              <p>
                You are about to make <strong>{transferTarget.name}</strong> the primary account holder (
                {primaryRoleFor(business)}) for <strong>{business.name}</strong>.
              </p>
              <p style={{ marginTop: 8 }}>
                You will become <strong>{demotedLabel}</strong> and lose primary admin rights. This cannot be undone
                without the new holder transferring ownership back.
              </p>
            </>
          ) : null
        }
        onClose={() => setTransferTargetId(null)}
        onConfirm={async (_reason, password) => {
          if (!transferTarget || !password) return;
          const valid = await verifyPassword(password, actor.passwordSalt, actor.passwordHash);
          if (!valid) {
            pushToast({ tone: 'error', title: 'Incorrect password', message: 'Ownership was not transferred.' });
            return;
          }
          const res = await transferOwnership({ actor, business, newOwnerUserId: transferTarget.id });
          pushToast(
            res.ok
              ? {
                  tone: 'success',
                  title: 'Ownership transferred',
                  message: `You are now ${demotedLabel}. ${transferTarget.name} is ${primaryRoleFor(business)}.`,
                }
              : { tone: 'error', title: res.message },
          );
          if (res.ok) setTransferTargetId(null);
        }}
      />
      <ConfirmDialog
        open={!!suspendTarget}
        title="Suspend staff member?"
        tone="danger"
        confirmLabel="Suspend"
        requireReason
        reasonLabel="Reason"
        body={
          suspendTarget ? (
            <p>
              <strong>{suspendTarget.name}</strong> will lose access until reactivated. Their account stays on the
              roster.
            </p>
          ) : null
        }
        onClose={() => setSuspendTargetId(null)}
        onConfirm={async (reason) => {
          if (!suspendTarget) return;
          const res = await suspendStaff({ actor, business, userId: suspendTarget.id, reason });
          pushToast(res.ok ? { tone: 'warning', title: 'Suspended' } : { tone: 'error', title: res.message });
          if (res.ok) setSuspendTargetId(null);
        }}
      />
      <ConfirmDialog
        open={!!removeTarget}
        title="Remove staff member?"
        tone="danger"
        confirmLabel="Remove permanently"
        requireReason
        reasonLabel="Reason"
        body={
          removeTarget ? (
            <p>
              <strong>{removeTarget.name}</strong> will permanently lose access to{' '}
              <strong>{business.name}</strong>. This ends their login for this business.
            </p>
          ) : null
        }
        onClose={() => setRemoveTargetId(null)}
        onConfirm={async (reason) => {
          if (!removeTarget) return;
          const res = await removeStaff({ actor, business, userId: removeTarget.id, reason });
          pushToast(res.ok ? { tone: 'info', title: 'Removed' } : { tone: 'error', title: res.message });
          if (res.ok) setRemoveTargetId(null);
        }}
      />
      <ConfirmDialog
        open={!!roleChange}
        title="Change staff role?"
        confirmLabel="Save role"
        body={
          roleChange ? (
            <p>
              Change <strong>{roleChange.name}</strong> from <strong>{roleChange.from}</strong> to{' '}
              <strong>{roleChange.to}</strong>? Their permissions update immediately.
            </p>
          ) : null
        }
        onClose={() => setRoleChange(null)}
        onConfirm={async () => {
          if (!roleChange) return;
          const res = await changeRole({
            actor,
            business,
            userId: roleChange.userId,
            role: roleChange.to,
          });
          pushToast(res.ok ? { tone: 'success', title: 'Role updated' } : { tone: 'error', title: res.message });
          if (res.ok) setRoleChange(null);
        }}
      />
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
          Default = role matrix. Allow / Deny override the role for this person.
        </p>
        <div className="stack" style={{ marginTop: 8 }}>
          {overrideActions.map((action) => {
            const val = draftOverrides[action];
            const mode = val === true ? 'allow' : val === false ? 'deny' : 'default';
            const label = actionLabel(action);
            return (
              <div key={action} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span>{label}</span>
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
                  aria-label={`Override ${label}`}
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
        <EmptyState
          title="No staff yet"
          description="Invite team members to share access."
          action={
            <Button
              onClick={() => {
                setInviteErrors({});
                setInviteOpen(true);
              }}
            >
              Invite staff
            </Button>
          }
        />
      ) : (
        <>
          <div className="table-wrap queue-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Email</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.pageRows.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Name">{s.name}</td>
                    <td data-label="Role">
                      {isPrimaryUser(s, business) ? (
                        s.role
                      ) : (
                        <Select
                          className="select-sm"
                          value={s.role}
                          onChange={(e) => {
                            const to = e.target.value as OperationalRole;
                            if (to === s.role) return;
                            setRoleChange({ userId: s.id, name: s.name, from: s.role, to });
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
                    <td data-label="Status">
                      <StatusBadge status={s.status} />
                    </td>
                    <td data-label="Email">
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
                    <td className="col-actions" data-label="Actions">
                      <div className="table-row-actions">
                        {s.status === 'Active' && !isPrimaryUser(s, business) ? (
                          <Button size="sm" variant="secondary" onClick={() => setSuspendTargetId(s.id)}>
                            Suspend
                          </Button>
                        ) : null}
                        {s.status === 'Suspended' ? (
                          <Button
                            size="sm"
                            onClick={async () => {
                              const res = await reactivateStaff({ actor, business, userId: s.id });
                              pushToast(
                                res.ok
                                  ? { tone: 'success', title: 'Reactivated' }
                                  : { tone: 'error', title: res.message },
                              );
                            }}
                          >
                            Reactivate
                          </Button>
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
                                  res.ok
                                    ? { tone: 'info', title: 'Invite revoked' }
                                    : { tone: 'error', title: res.message },
                                );
                              }}
                            >
                              Revoke
                            </Button>
                          </>
                        ) : null}
                        {!isPrimaryUser(s, business) && s.status !== 'Removed' ? (
                          <details
                            className="table-actions-menu"
                            open={actionsOpenId === s.id}
                            onToggle={(e) => {
                              const open = (e.target as HTMLDetailsElement).open;
                              setActionsOpenId(open ? s.id : null);
                            }}
                          >
                            <summary className="btn btn-ghost btn-sm">More</summary>
                            <div className="table-actions-panel">
                              {s.status === 'Active' ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setOverrideUserId(s.id);
                                    setDraftOverrides({ ...(s.permissionOverrides ?? {}) });
                                    setActionsOpenId(null);
                                  }}
                                >
                                  Overrides
                                </Button>
                              ) : null}
                              {isPrimaryUser(actor, business) && s.status === 'Active' ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setTransferTargetId(s.id);
                                    setActionsOpenId(null);
                                  }}
                                >
                                  Make primary
                                </Button>
                              ) : null}
                              <DeleteButton
                                size="sm"
                                onClick={() => {
                                  setRemoveTargetId(s.id);
                                  setActionsOpenId(null);
                                }}
                              >
                                Remove
                              </DeleteButton>
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
      <Modal
        open={inviteOpen}
        title="Invite staff"
        onClose={() => {
          setInviteOpen(false);
          setInviteErrors({});
        }}
        footer={
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setInviteOpen(false);
                setInviteErrors({});
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const next: typeof inviteErrors = {};
                if (!name.trim()) next.name = 'Name is required';
                if (!email.trim()) next.email = 'Email is required';
                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email';
                if (!phone.trim()) next.phone = 'Phone is required';
                if (Object.keys(next).length) {
                  setInviteErrors(next);
                  return;
                }
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
                  setInviteErrors({});
                  setInviteOpen(false);
                } else if (res.code === 'AUTH_EMAIL_DUP') {
                  setInviteErrors({ email: res.message });
                } else pushToast({ tone: 'error', title: res.message });
              }}
            >
              Invite
            </Button>
          </div>
        }
      >
        <div className="grid-2">
          <Field label="Name" error={inviteErrors.name}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setInviteErrors((err) => ({ ...err, name: undefined }));
              }}
            />
          </Field>
          <Field label="Email" error={inviteErrors.email}>
            <Input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setInviteErrors((err) => ({ ...err, email: undefined }));
              }}
            />
          </Field>
          <Field label="Phone" error={inviteErrors.phone}>
            <Input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setInviteErrors((err) => ({ ...err, phone: undefined }));
              }}
            />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as OperationalRole)}>
              {inviteRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

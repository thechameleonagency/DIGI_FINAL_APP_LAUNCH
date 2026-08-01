import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { enterImpersonation } from '../../../services/impersonationService';
import { deactivateBusiness, reactivateBusiness, suspendBusiness } from '../../../services/verificationService';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { FileLink } from '../../../ui/components/FileUpload';
import { Button, EmptyState, Field, Input, Money, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function AdminBusinessDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { business: adminBiz, user } = useBiz();
  const { can, beginImpersonation, impersonation } = useSession();
  const { pushToast } = useUi();
  const [reason, setReason] = useState('');
  const [auditNote, setAuditNote] = useState('');
  const [viewAsReason, setViewAsReason] = useState('');
  const [notifyOwner, setNotifyOwner] = useState(true);

  const biz = useLiveQuery(() => (id ? db.businesses.get(id) : undefined), [id]);
  const users = useLiveQuery(() => (id ? db.users.where('businessId').equals(id).toArray() : []), [id]) ?? [];
  const verifications =
    useLiveQuery(() => (id ? db.verifications.where('businessId').equals(id).reverse().sortBy('updatedAt') : []), [id]) ??
    [];
  const orders =
    useLiveQuery(
      () =>
        id
          ? db.orders.filter((o) => o.pharmacyId === id || o.stockistId === id).toArray()
          : [],
      [id],
    ) ?? [];
  const invoices =
    useLiveQuery(
      () =>
        id
          ? db.invoices.filter((i) => i.pharmacyId === id || i.stockistId === id).toArray()
          : [],
      [id],
    ) ?? [];
  const connections =
    useLiveQuery(
      () =>
        id
          ? db.connections.filter((c) => c.pharmacyId === id || c.stockistId === id).toArray()
          : [],
      [id],
    ) ?? [];

  if (biz === undefined) {
    return (
      <div className="stack">
        <PageHeader title="Business detail" />
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!biz || biz.type === 'Platform') {
    return (
      <div className="stack">
        <PageHeader title="Business detail" />
        <EmptyState
          title="Business not found"
          description="Return to the network directory."
          action={
            <Link className="btn btn-primary" to="/admin/network">
              Back to network
            </Link>
          }
        />
      </div>
    );
  }

  const issuedInvoices = invoices.filter((i) => i.status !== 'Draft' && i.status !== 'Void');
  const gmv = issuedInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const outstanding = issuedInvoices.reduce((s, i) => s + i.outstanding, 0);
  const latestVer = verifications[0];
  const docs =
    latestVer?.documents?.length
      ? latestVer.documents
      : (latestVer?.documentIds ?? []).map((fid) => ({ fileId: fid, label: 'Document', kind: 'DrugLicense' as const, licenseNumber: undefined }));

  const run = async (action: 'suspend' | 'reactivate' | 'deactivate') => {
    if ((action === 'suspend' || action === 'deactivate') && !reason.trim()) {
      pushToast({ tone: 'error', title: 'Reason is required' });
      return;
    }
    const note = auditNote.trim();
    const fullReason = note ? `${reason.trim()} — ${note}` : reason.trim();
    const res =
      action === 'suspend'
        ? await suspendBusiness({
            actor: user,
            adminBusiness: adminBiz,
            targetBusinessId: biz.id,
            reason: fullReason,
          })
        : action === 'deactivate'
          ? await deactivateBusiness({
              actor: user,
              adminBusiness: adminBiz,
              targetBusinessId: biz.id,
              reason: fullReason,
            })
          : await reactivateBusiness({ actor: user, adminBusiness: adminBiz, targetBusinessId: biz.id });
    pushToast(
      res.ok
        ? {
            tone: action === 'reactivate' ? 'success' : 'warning',
            title: action === 'suspend' ? 'Suspended' : action === 'deactivate' ? 'Deactivated' : 'Reactivated',
          }
        : { tone: 'error', title: res.message },
    );
    if (res.ok) {
      setReason('');
      setAuditNote('');
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title={biz.name}
        subtitle={`${biz.type} · ${biz.city}, ${biz.state}`}
        actions={
          <Link className="btn btn-secondary btn-sm" to="/admin/network">
            Back to network
          </Link>
        }
      />

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge status={biz.accountStatus} />
        <StatusBadge status={biz.verificationStatus} />
      </div>

      <div className="kpi-grid">
        <div className="card kpi">
          <div className="label">Orders</div>
          <div className="value">{orders.length}</div>
        </div>
        <div className="card kpi">
          <div className="label">GMV (issued invoices)</div>
          <div className="value">
            <Money value={gmv} />
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Outstanding</div>
          <div className="value">
            <Money value={outstanding} />
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Connections</div>
          <div className="value">{connections.length}</div>
        </div>
        <div className="card kpi">
          <div className="label">Users</div>
          <div className="value">{users.length}</div>
        </div>
      </div>

      <div className="card card-pad stack">
        <strong>Profile</strong>
        <div style={{ fontSize: 13 }}>
          GST {biz.gstNumber ?? '—'} · DL {biz.drugLicenseNumber ?? '—'} · PAN {biz.panNumber ?? '—'}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {biz.address}, {biz.city}, {biz.state} {biz.pincode}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {biz.phone} · {biz.email}
        </div>
        {biz.suspendReason ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Last account note: {biz.suspendReason}
          </div>
        ) : null}
      </div>

      {can('impersonate') ? (
        <div className="card card-pad stack">
          <strong>View as business (read-only)</strong>
          <p className="muted" style={{ margin: 0 }}>
            Opens this workspace as Platform Support. All mutations are blocked at the service layer.
          </p>
          <Field label="Reason (required)">
            <Input value={viewAsReason} onChange={(e) => setViewAsReason(e.target.value)} placeholder="Support ticket #…" />
          </Field>
          <label className="row gap" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={notifyOwner} onChange={(e) => setNotifyOwner(e.target.checked)} />
            Notify business Owner (N-315)
          </label>
          <Button
            type="button"
            onClick={() =>
              void (async () => {
                const res = await enterImpersonation({
                  actor: user,
                  platform: adminBiz,
                  targetBusinessId: biz.id,
                  reason: viewAsReason,
                  notifyOwner,
                  alreadyImpersonating: Boolean(impersonation),
                });
                if (!res.ok) {
                  pushToast({ tone: 'error', title: res.message });
                  return;
                }
                beginImpersonation(res.data.viewUser, res.data.viewBusiness, res.data.impersonation);
                pushToast({ tone: 'info', title: 'View-as started — read-only' });
                navigate(res.data.portal === 'pharmacy' ? '/pharmacy' : '/stockist');
              })()
            }
          >
            View as business
          </Button>
        </div>
      ) : null}

      <div className="card card-pad stack">
        <strong>Users</strong>
        {!users.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No users on this business.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.role}</td>
                    <td>{u.email}</td>
                    <td>
                      <StatusBadge status={u.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad stack">
        <strong>Verification history</strong>
        {!verifications.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No verification records.
          </p>
        ) : (
          verifications.map((v) => (
            <div key={v.id} style={{ fontSize: 13 }}>
              <StatusBadge status={v.status} />{' '}
              <span className="muted">
                {v.submittedAt ? new Date(v.submittedAt).toLocaleString() : '—'} ·{' '}
                <Link to={`/admin/verifications/${v.id}`}>Open</Link>
              </span>
              {v.rejectReason ? <div className="muted">Reject: {v.rejectReason}</div> : null}
              {v.requestDocsNote ? <div className="muted">Docs note: {v.requestDocsNote}</div> : null}
              {v.internalNotes ? <div className="muted">Internal: {v.internalNotes}</div> : null}
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {v.decisionHistory.map((h, i) => (
                  <li key={`${v.id}-${i}`} className="muted">
                    {h.from} → {h.to} · {new Date(h.at).toLocaleString()}
                    {h.reason ? ` · ${h.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="card card-pad stack">
        <strong>Documents (latest submission)</strong>
        {!docs.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No documents on file.
          </p>
        ) : (
          docs.map((d) => (
            <div key={d.fileId} style={{ fontSize: 13 }}>
              <strong>{d.label}</strong>
              {'licenseNumber' in d && d.licenseNumber ? <span className="muted"> · {d.licenseNumber}</span> : null}
              <div>
                <FileLink fileId={d.fileId} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card card-pad stack">
        <strong>Account actions</strong>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Suspend blocks trade. Deactivate blocks login; historical orders/invoices/users are retained.
        </p>
        <Field label="Business-visible reason (required for Suspend / Deactivate)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown in audit / account note" />
        </Field>
        <Field label="Internal audit note (optional)">
          <Textarea value={auditNote} onChange={(e) => setAuditNote(e.target.value)} rows={2} />
        </Field>
        <div className="row">
          {biz.accountStatus === 'Active' ? (
            <>
              <Button size="sm" variant="danger" onClick={() => void run('suspend')}>
                Suspend
              </Button>
              <Button size="sm" variant="danger" onClick={() => void run('deactivate')}>
                Deactivate
              </Button>
            </>
          ) : null}
          {biz.accountStatus === 'Suspended' ? (
            <>
              <Button size="sm" onClick={() => void run('reactivate')}>
                Reactivate
              </Button>
              <Button size="sm" variant="danger" onClick={() => void run('deactivate')}>
                Deactivate
              </Button>
            </>
          ) : null}
          {biz.accountStatus === 'Deactivated' ? (
            <Button size="sm" onClick={() => void run('reactivate')}>
              Reactivate
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

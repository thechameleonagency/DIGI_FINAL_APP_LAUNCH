import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { newId } from '../../domain/utils/ids';
import { reactivateBusiness, suspendBusiness, adminReviewVerification } from '../../services/verificationService';
import { updateTicket } from '../../services/supportService';
import { exportWorkspace, importWorkspace, runPolicyClock } from '../../services/supportService';
import { platformAnalytics } from '../../services/analyticsService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { AnalyticsDashboard } from '../../ui/components/AnalyticsDashboard';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, Kpi, Money, PageHeader, Select, StatusBadge, Textarea } from '../../ui/components/primitives';

function useBiz() {
  const { user, business } = useSession();
  return { user: user!, business: business! };
}

export function AdminHome() {
  const verifications = useLiveQuery(() => db.verifications.filter((v) => ['Submitted', 'UnderReview', 'DocumentsRequested'].includes(v.status)).toArray()) ?? [];
  const suspended = useLiveQuery(() => db.businesses.where('accountStatus').equals('Suspended').toArray()) ?? [];
  const tickets = useLiveQuery(() => db.supportTickets.filter((t) => ['Open', 'InProgress', 'Reopened'].includes(t.status)).toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const connections = useLiveQuery(() => db.connections.where('status').equals('Active').toArray()) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray()) ?? [];
  const gmv = orders.reduce((s, o) => s + o.grandTotal, 0);

  return (
    <div className="stack">
      <PageHeader title="Platform home" subtitle="Verification, governance, support" />
      <div className="kpi-grid">
        <Kpi label="Pending verifications" value={verifications.length} />
        <Kpi label="Suspended" value={suspended.length} />
        <Kpi label="Open tickets" value={tickets.length} />
        <Kpi label="Active businesses" value={businesses.filter((b) => b.type !== 'Platform' && b.accountStatus === 'Active').length} />
        <Kpi label="Active connections" value={connections.length} />
        <Kpi label="Platform GMV (local)" value={<Money value={gmv} />} />
      </div>
    </div>
  );
}

export function AdminVerifications() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const verifications = useLiveQuery(() => db.verifications.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const queue = verifications.filter((v) => ['Submitted', 'UnderReview', 'DocumentsRequested'].includes(v.status));
  const [note, setNote] = useState('');

  return (
    <div className="stack">
      <PageHeader title="Verification queue" subtitle="Approve / reject / request documents" />
      {queue.map((v) => {
        const biz = businesses.find((b) => b.id === v.businessId);
        return (
          <div key={v.id} className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{biz?.name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {biz?.type} · GST {biz?.gstNumber} · DL {biz?.drugLicenseNumber}
                </div>
              </div>
              <StatusBadge status={v.status} />
            </div>
            <Field label="Note / reason">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required for reject / request docs" />
            </Field>
            <div className="row">
              {v.status === 'Submitted' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const res = await adminReviewVerification({
                      actor: user,
                      business,
                      verificationId: v.id,
                      decision: 'UnderReview',
                    });
                    pushToast(res.ok ? { tone: 'info', title: 'Marked under review' } : { tone: 'error', title: res.message });
                  }}
                >
                  Start review
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={async () => {
                  const res = await adminReviewVerification({
                    actor: user,
                    business,
                    verificationId: v.id,
                    decision: 'Approved',
                  });
                  pushToast(res.ok ? { tone: 'success', title: 'Approved' } : { tone: 'error', title: res.message });
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const res = await adminReviewVerification({
                    actor: user,
                    business,
                    verificationId: v.id,
                    decision: 'DocumentsRequested',
                    note: note || 'Please upload clearer drug license scan',
                    reason: note || 'Documents incomplete',
                  });
                  pushToast(res.ok ? { tone: 'warning', title: 'Documents requested' } : { tone: 'error', title: res.message });
                }}
              >
                Request docs
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const res = await adminReviewVerification({
                    actor: user,
                    business,
                    verificationId: v.id,
                    decision: 'Rejected',
                    reason: note || 'Verification requirements not met',
                  });
                  pushToast(res.ok ? { tone: 'info', title: 'Rejected' } : { tone: 'error', title: res.message });
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        );
      })}
      {!queue.length ? <EmptyState title="Queue clear" description="No businesses awaiting verification." /> : null}
    </div>
  );
}

export function AdminNetwork() {
  const { pushToast } = useUi();
  const businesses = useLiveQuery(() => db.businesses.filter((b) => b.type !== 'Platform').toArray()) ?? [];
  const columns = useMemo(
    () => [
      { key: 'name', label: 'Name', getValue: (b: (typeof businesses)[0]) => b.name },
      { key: 'type', label: 'Type', getValue: (b: (typeof businesses)[0]) => b.type },
      { key: 'city', label: 'City', getValue: (b: (typeof businesses)[0]) => b.city },
      {
        key: 'verificationStatus',
        label: 'Verification',
        getValue: (b: (typeof businesses)[0]) => b.verificationStatus,
        render: (b: (typeof businesses)[0]) => <StatusBadge status={b.verificationStatus} />,
      },
      {
        key: 'accountStatus',
        label: 'Account',
        getValue: (b: (typeof businesses)[0]) => b.accountStatus,
        render: (b: (typeof businesses)[0]) => <StatusBadge status={b.accountStatus} />,
      },
    ],
    [],
  );
  const list = useListControls(businesses, {
    columns,
    searchKeys: [(b) => `${b.name} ${b.gstNumber ?? ''} ${b.city} ${b.email}`],
    filters: [
      { key: 'type', label: 'Type', options: ['Pharmacy', 'Stockist'].map((t) => ({ value: t, label: t })) },
      {
        key: 'accountStatus',
        label: 'Account',
        options: ['Active', 'Suspended', 'Deactivated'].map((t) => ({ value: t, label: t })),
      },
    ],
    defaultSortKey: 'name',
    defaultSortDir: 'asc',
  });
  return (
    <div className="stack">
      <PageHeader title="Network directory" subtitle="Cross-tenant isolation — admin read / suspend only" />
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search name / GST / city"
        filters={[
          { key: 'type', label: 'Type', options: ['Pharmacy', 'Stockist'].map((t) => ({ value: t, label: t })) },
          {
            key: 'accountStatus',
            label: 'Account',
            options: ['Active', 'Suspended', 'Deactivated'].map((t) => ({ value: t, label: t })),
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport('network-directory.csv');
          pushToast({ tone: 'success', title: 'Network export ready' });
        }}
      />
      <DataListTable columns={columns} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
    </div>
  );
}

export function AdminOrders() {
  const { pushToast } = useUi();
  const orders = useLiveQuery(() => db.orders.toArray()) ?? [];
  const columns = useMemo(
    () => [
      { key: 'orderNo', label: 'Order', getValue: (o: (typeof orders)[0]) => o.orderNo },
      { key: 'status', label: 'Status', getValue: (o: (typeof orders)[0]) => o.status, render: (o: (typeof orders)[0]) => <StatusBadge status={o.status} /> },
      { key: 'grandTotal', label: 'Total', getValue: (o: (typeof orders)[0]) => o.grandTotal, render: (o: (typeof orders)[0]) => <Money value={o.grandTotal} /> },
      { key: 'placedAt', label: 'Placed', getValue: (o: (typeof orders)[0]) => o.placedAt, render: (o: (typeof orders)[0]) => <span className="muted">{new Date(o.placedAt).toLocaleString()}</span> },
    ],
    [],
  );
  const list = useListControls(orders, {
    columns,
    searchKeys: [(o) => `${o.orderNo} ${o.status} ${o.pharmacyId} ${o.stockistId}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Pending', 'Accepted', 'Allocated', 'Packed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'].map((s) => ({
          value: s,
          label: s,
        })),
      },
    ],
    defaultSortKey: 'placedAt',
  });
  return (
    <div className="stack">
      <PageHeader title="Platform orders" subtitle="Read-only investigation — admin cannot create trade orders" />
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search order number"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['Pending', 'Accepted', 'Allocated', 'Packed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'].map((s) => ({
              value: s,
              label: s,
            })),
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport('platform-orders.csv');
          pushToast({ tone: 'success', title: 'Exported (filtered)' });
        }}
      />
      <DataListTable columns={columns} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
    </div>
  );
}

export function AdminPayments() {
  const { pushToast } = useUi();
  const payments = useLiveQuery(() => db.payments.toArray()) ?? [];
  const columns = useMemo(
    () => [
      { key: 'paymentNo', label: 'Payment', getValue: (p: (typeof payments)[0]) => p.paymentNo },
      { key: 'status', label: 'Status', getValue: (p: (typeof payments)[0]) => p.status, render: (p: (typeof payments)[0]) => <StatusBadge status={p.status} /> },
      { key: 'amount', label: 'Amount', getValue: (p: (typeof payments)[0]) => p.amount, render: (p: (typeof payments)[0]) => <Money value={p.amount} /> },
      { key: 'reference', label: 'Reference', getValue: (p: (typeof payments)[0]) => p.reference ?? '' },
    ],
    [],
  );
  const list = useListControls(payments, {
    columns,
    searchKeys: [(p) => `${p.paymentNo} ${p.reference ?? ''} ${p.status}`],
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: ['Submitted', 'UnderReview', 'Approved', 'Rejected', 'OnHold'].map((s) => ({ value: s, label: s })),
      },
    ],
    defaultSortKey: 'paymentNo',
  });
  return (
    <div className="stack">
      <PageHeader title="Platform payments monitor" subtitle="Read-only — no commission ledger in v1" />
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search payment / reference"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['Submitted', 'UnderReview', 'Approved', 'Rejected', 'OnHold'].map((s) => ({ value: s, label: s })),
          },
        ]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport('platform-payments.csv');
          pushToast({ tone: 'success', title: 'Exported payments' });
        }}
      />
      <DataListTable columns={columns} rows={list.pageRows} sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
      <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
    </div>
  );
}

export function AdminAnalytics() {
  return (
    <AnalyticsDashboard
      title="Platform analytics"
      subtitle="Governance KPIs recompute from source entities"
      load={() => platformAnalytics()}
    />
  );
}

export function AdminSupport() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const tickets = useLiveQuery(() => db.supportTickets.toArray()) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Support console" />
      {tickets.map((t) => (
        <div key={t.id} className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>
              {t.ticketNo}: {t.subject}
            </strong>
            <StatusBadge status={t.status} />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {t.updates[t.updates.length - 1]?.body}
          </div>
          <div className="row">
            <Button
              size="sm"
              onClick={async () => {
                const res = await updateTicket({ actor: user, business, ticketId: t.id, status: 'InProgress', body: 'Agent reviewing' });
                pushToast(res.ok ? { tone: 'info', title: 'In progress' } : { tone: 'error', title: res.message });
              }}
            >
              Start
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const res = await updateTicket({ actor: user, business, ticketId: t.id, status: 'Resolved', body: 'Resolved by platform' });
                pushToast(res.ok ? { tone: 'success', title: 'Resolved' } : { tone: 'error', title: res.message });
              }}
            >
              Resolve
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminAnnouncements() {
  const { user } = useBiz();
  const { pushToast } = useUi();
  const items = useLiveQuery(() => db.announcements.toArray()) ?? [];
  const banners = useLiveQuery(() => db.banners.toArray()) ?? [];
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <div className="stack">
      <PageHeader title="Announcements & banners" />
      <div className="card card-pad stack">
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Body"><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Button
          onClick={async () => {
            await db.announcements.add({
              id: newId(),
              title,
              body,
              targetRoles: ['Pharmacy', 'Stockist'],
              placements: ['All Dashboards'],
              startsAt: new Date().toISOString(),
              active: true,
              createdBy: user.id,
              createdAt: new Date().toISOString(),
            });
            pushToast({ tone: 'success', title: 'Announcement published' });
            setTitle('');
            setBody('');
          }}
        >
          Publish
        </Button>
      </div>
      {items.map((a) => (
        <div key={a.id} className="card card-pad">
          <strong>{a.title}</strong>
          <div style={{ fontSize: 13.5 }}>{a.body}</div>
        </div>
      ))}
      <h3 style={{ fontSize: 15 }}>Banners</h3>
      {banners.map((b) => (
        <div key={b.id} className={`banner-strip ${b.tone === 'warning' ? 'warning' : ''}`}>
          {b.text}
        </div>
      ))}
    </div>
  );
}

export function AdminSuspensions() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const businesses = useLiveQuery(() => db.businesses.filter((b) => b.type !== 'Platform').toArray()) ?? [];
  const [reason, setReason] = useState('');
  return (
    <div className="stack">
      <PageHeader title="Suspensions" />
      <Field label="Suspend reason">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {businesses.map((b) => (
        <div key={b.id} className="card card-pad row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>{b.name}</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {b.suspendReason}
            </div>
          </div>
          <div className="row">
            <StatusBadge status={b.accountStatus} />
            {b.accountStatus !== 'Suspended' ? (
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const res = await suspendBusiness({
                    actor: user,
                    adminBusiness: business,
                    targetBusinessId: b.id,
                    reason: reason || 'Policy violation',
                  });
                  pushToast(res.ok ? { tone: 'warning', title: 'Suspended' } : { tone: 'error', title: res.message });
                }}
              >
                Suspend
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  const res = await reactivateBusiness({ actor: user, adminBusiness: business, targetBusinessId: b.id });
                  pushToast(res.ok ? { tone: 'success', title: 'Reactivated' } : { tone: 'error', title: res.message });
                }}
              >
                Reactivate
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminAudit() {
  const logs = useLiveQuery(() => db.auditLogs.orderBy('at').reverse().limit(200).toArray()) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Audit log" />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="muted">{new Date(l.at).toLocaleString()}</td>
                <td>{l.actorName}</td>
                <td>{l.action}</td>
                <td>
                  {l.entityType}:{l.entityId.slice(0, 8)}
                </td>
                <td>{l.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminSettings() {
  const { pushToast } = useUi();
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const [importText, setImportText] = useState('');

  if (!settings) return null;

  return (
    <div className="stack">
      <PageHeader title="Platform settings" subtitle={`Last policy run: ${settings.lastPolicyRunAt ? new Date(settings.lastPolicyRunAt).toLocaleString() : '—'}`} />
      <div className="card card-pad stack">
        <div className="grid-2">
          <Field label="Return window (days)">
            <Input
              type="number"
              defaultValue={settings.returnWindowDays}
              onBlur={async (e) => db.platformSettings.update('platform', { returnWindowDays: Number(e.target.value) })}
            />
          </Field>
          <Field label="Invite TTL (days)">
            <Input
              type="number"
              defaultValue={settings.inviteTtlDays}
              onBlur={async (e) => db.platformSettings.update('platform', { inviteTtlDays: Number(e.target.value) })}
            />
          </Field>
          <Field label="Order SLA (hours)">
            <Input
              type="number"
              defaultValue={settings.orderSlaHours}
              onBlur={async (e) => db.platformSettings.update('platform', { orderSlaHours: Number(e.target.value) })}
            />
          </Field>
          <Field label="Payment proof mandatory">
            <Select
              defaultValue={settings.paymentProofMandatory ? 'yes' : 'no'}
              onChange={async (e) => db.platformSettings.update('platform', { paymentProofMandatory: e.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
        </div>
        <div className="row">
          <Button
            onClick={async () => {
              await runPolicyClock();
              pushToast({ tone: 'success', title: 'Policy clock ran', message: 'Expiry + overdue invoices updated' });
            }}
          >
            Run policy clock
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              const json = await exportWorkspace();
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'digiswasthya-workspace.json';
              a.click();
            }}
          >
            Export workspace
          </Button>
        </div>
        <Field label="Import workspace JSON">
          <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste exported JSON" />
        </Field>
        <Button
          variant="secondary"
          onClick={async () => {
            const res = await importWorkspace(importText);
            pushToast(res.ok ? { tone: 'success', title: 'Imported — reload page' } : { tone: 'error', title: res.message });
          }}
        >
          Import
        </Button>
      </div>
    </div>
  );
}

export function AdminNotifications() {
  const { user } = useBiz();
  const notes = useLiveQuery(() => db.notifications.where('userId').equals(user.id).reverse().sortBy('createdAt'), [user.id]) ?? [];
  return (
    <div className="stack">
      <PageHeader title="Notifications" />
      {notes.map((n) => (
        <div key={n.id} className="card card-pad">
          <strong>{n.title}</strong>
          <div style={{ fontSize: 13.5 }}>{n.body}</div>
        </div>
      ))}
    </div>
  );
}

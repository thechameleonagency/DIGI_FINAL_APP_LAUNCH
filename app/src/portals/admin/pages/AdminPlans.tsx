import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import {
  decideUpgradeRequest,
  DEFAULT_PLAN_CONFIG,
  resolvePlanConfig,
  revokePremium,
  savePlanConfig,
} from '../../../services/planService';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { FileLink } from '../../../ui/components/FileUpload';
import { Button, EmptyState, Field, Input, PageHeader, StatusBadge, Tabs, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Tab = 'Queue' | 'Plan copy' | 'Premium list';

export function AdminPlans() {
  const { business, user } = useBiz();
  const { can: sessionCan } = useSession();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [tab, setTab] = useState<Tab>('Queue');
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const requests = useLiveQuery(() => db.upgradeRequests.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  const canManagePlan = sessionCan('plan.manage');
  const [priceText, setPriceText] = useState(DEFAULT_PLAN_CONFIG.priceText);
  const [upiId, setUpiId] = useState(DEFAULT_PLAN_CONFIG.upiId);
  const [benefitsText, setBenefitsText] = useState(DEFAULT_PLAN_CONFIG.benefits.join('\n'));

  useEffect(() => {
    const cfg = resolvePlanConfig(settings);
    setPriceText(cfg.priceText);
    setUpiId(cfg.upiId);
    setBenefitsText(cfg.benefits.join('\n'));
  }, [settings]);

  const openQueue = useMemo(
    () => requests.filter((r) => r.status === 'Submitted').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests],
  );
  const premiumBiz = useMemo(
    () => businesses.filter((b) => b.plan === 'Premium' && b.type !== 'Platform'),
    [businesses],
  );

  const utrCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) m.set(r.utr, (m.get(r.utr) ?? 0) + 1);
    return m;
  }, [requests]);

  const decide = (id: string, decision: 'Approved' | 'Rejected') =>
    void run(async () => {
      const res = await decideUpgradeRequest({
        actor: user,
        platform: business,
        id,
        decision,
        reason: rejectReason[id],
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      if (decision === 'Approved' && res.data.duplicateUtr) {
        pushToast({ tone: 'warning', title: 'Approved — duplicate UTR flagged' });
      } else {
        pushToast({ tone: 'success', title: `Request ${decision}` });
      }
    });

  const saveCopy = () =>
    void run(async () => {
      const res = await savePlanConfig({
        actor: user,
        platform: business,
        config: {
          priceText,
          upiId,
          benefits: benefitsText.split('\n').map((b) => b.trim()).filter(Boolean),
        },
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      pushToast({ tone: 'success', title: 'Plan copy saved' });
    });

  const revoke = (businessId: string) =>
    void run(async () => {
      const res = await revokePremium({
        actor: user,
        platform: business,
        businessId,
        reason: revokeReason[businessId] ?? '',
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      pushToast({ tone: 'success', title: 'Premium revoked' });
    });

  return (
    <div className="stack">
      <PageHeader title="Premium plans" subtitle="UTR/proof upgrade requests — conveniences only, no gateway" />
      <Tabs
        ariaLabel="Premium plans"
        value={tab}
        onChange={setTab}
        items={(['Queue', 'Plan copy', 'Premium list'] as Tab[]).map((t) => ({ id: t, label: t }))}
      />

      {tab === 'Queue' && (
        <div className="stack">
          {!canManagePlan ? (
            <p className="muted">View-only. SuperAdmin with plan.manage can approve or reject requests.</p>
          ) : null}
          {!openQueue.length ? (
            <EmptyState title="No open upgrade requests" description="Submitted requests appear here for review." />
          ) : (
            openQueue.map((r) => {
              const dup = (utrCounts.get(r.utr) ?? 0) > 1;
              return (
                <div key={r.id} className="card card-pad stack">
                  <div className="row gap" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <Link to={`/admin/network/${r.businessId}`}>
                        <strong>{nameOf(r.businessId)}</strong>
                      </Link>
                      <div className="muted">{new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div>
                    UTR <code>{r.utr}</code>
                    {dup ? <span className="badge badge-warning" style={{ marginLeft: 8 }}>Duplicate UTR</span> : null}
                  </div>
                  {r.proofFileId ? <FileLink fileId={r.proofFileId} /> : <span className="muted">No proof attached</span>}
                  {canManagePlan ? (
                    <>
                      <Field label="Reject reason (required to reject)">
                        <Input
                          value={rejectReason[r.id] ?? ''}
                          onChange={(e) => setRejectReason((m) => ({ ...m, [r.id]: e.target.value }))}
                        />
                      </Field>
                      <div className="row gap">
                        <Button type="button" disabled={busy} onClick={() => void decide(r.id, 'Approved')}>
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy}
                          onClick={() => void decide(r.id, 'Rejected')}
                        >
                          Reject
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'Plan copy' && (
        <div className="card card-pad stack">
          {!canManagePlan ? <p className="muted">View-only. SuperAdmin with plan.manage can edit.</p> : null}
          <Field label="Price text">
            <Input value={priceText} disabled={!canManagePlan} onChange={(e) => setPriceText(e.target.value)} />
          </Field>
          <Field label="UPI ID (shown to businesses)">
            <Input value={upiId} disabled={!canManagePlan} onChange={(e) => setUpiId(e.target.value)} />
          </Field>
          <Field label="Benefits (one per line)">
            <Textarea
              rows={6}
              value={benefitsText}
              disabled={!canManagePlan}
              onChange={(e) => setBenefitsText(e.target.value)}
            />
          </Field>
          {canManagePlan ? (
            <Button type="button" disabled={busy} onClick={() => void saveCopy()}>
              Save plan copy
            </Button>
          ) : null}
        </div>
      )}

      {tab === 'Premium list' && (
        <div className="stack">
          {!canManagePlan ? (
            <p className="muted">View-only. SuperAdmin with plan.manage can revoke Premium.</p>
          ) : null}
          {!premiumBiz.length ? (
            <EmptyState title="No Premium businesses" description="Approved upgrades appear here." />
          ) : (
            premiumBiz.map((b) => (
              <div key={b.id} className="card card-pad stack">
                <div className="row gap" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/admin/network/${b.id}`}>
                    <strong>{b.name}</strong>
                  </Link>
                  <StatusBadge status="Premium" />
                </div>
                {canManagePlan ? (
                  <>
                    <Field label="Revoke reason">
                      <Input
                        value={revokeReason[b.id] ?? ''}
                        onChange={(e) => setRevokeReason((m) => ({ ...m, [b.id]: e.target.value }))}
                      />
                    </Field>
                    <Button type="button" variant="danger" disabled={busy} onClick={() => void revoke(b.id)}>
                      Revoke Premium
                    </Button>
                  </>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

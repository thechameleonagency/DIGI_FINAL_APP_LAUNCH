import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { resolvePlanConfig, submitUpgradeRequest } from '../../services/planService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { useBusyAction } from '../hooks/useBusyAction';
import { FileLink, FileUpload } from './FileUpload';
import { Button, EmptyState, Field, Input, PageHeader, StatusBadge } from './primitives';

export function UpgradePlanPage() {
  const { user, business: sessionBiz, refreshEntities } = useSession();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const business =
    useLiveQuery(() => (sessionBiz ? db.businesses.get(sessionBiz.id) : undefined), [sessionBiz?.id]) ?? sessionBiz;
  const requests =
    useLiveQuery(
      () => (business ? db.upgradeRequests.where('businessId').equals(business.id).toArray() : []),
      [business?.id],
    ) ?? [];
  const [utr, setUtr] = useState('');
  const [proofFileId, setProofFileId] = useState<string | undefined>();

  const config = useMemo(() => resolvePlanConfig(settings), [settings]);
  const plan = business?.plan ?? 'Free';
  const open = requests.find((r) => r.status === 'Submitted');
  const history = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const isOwner = user?.role === 'Pharmacist' || user?.role === 'Stockist';

  useEffect(() => {
    if (user && business && sessionBiz && business.plan !== sessionBiz.plan) {
      refreshEntities(user, business);
    }
  }, [user, business, sessionBiz, refreshEntities]);

  const submit = () =>
    void run(async () => {
      if (!user || !business) return;
      const res = await submitUpgradeRequest({
        actor: user,
        business,
        utr,
        proofFileId,
      });
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      setUtr('');
      setProofFileId(undefined);
      pushToast({ tone: 'success', title: 'Upgrade request submitted' });
    });

  if (!user || !business) return null;

  return (
    <div className="stack">
      <PageHeader
        title="Upgrade to Premium"
        subtitle="Plan state never affects trade rules or financial documents — conveniences only"
        actions={<StatusBadge status={plan} />}
      />

      <div className="card card-pad stack">
        <h3 style={{ margin: 0 }}>Premium</h3>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{config.priceText}</p>
        {config.upiId ? <p className="muted" style={{ margin: 0 }}>Pay to UPI: {config.upiId}</p> : null}
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          {config.benefits.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>

      {plan === 'Premium' ? (
        <EmptyState title="You are on Premium" description="Enjoy saved report presets and the Premium badge." />
      ) : open ? (
        <div className="card card-pad stack">
          <strong>Open request</strong>
          <div>
            UTR <code>{open.utr}</code> · submitted {new Date(open.createdAt).toLocaleString()}
          </div>
          {open.proofFileId ? <FileLink fileId={open.proofFileId} /> : null}
          <p className="muted" style={{ margin: 0 }}>
            Waiting for platform review. Only one open request is allowed.
          </p>
        </div>
      ) : (
        <div className="card card-pad stack">
          <h3 style={{ margin: 0 }}>Declare offline payment</h3>
          <p className="muted" style={{ margin: 0 }}>
            No payment gateway is called. Enter the UPI reference / UTR from your transfer.
          </p>
          {!isOwner ? (
            <p className="muted">Only the primary Pharmacist or Stockist account can submit an upgrade request.</p>
          ) : (
            <>
              <Field label="UPI reference / UTR">
                <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. 123456789012" />
              </Field>
              <FileUpload label="Proof screenshot (optional, ≤5 MB)" value={proofFileId} onChange={setProofFileId} />
              <Button type="button" onClick={() => void submit()} disabled={busy || !utr.trim()}>
                Submit for approval
              </Button>
            </>
          )}
        </div>
      )}

      {history.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>UTR</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    <code>{r.utr}</code>
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.decisionReason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { PlatformSettings } from '../../../domain/entities/types';
import { db } from '../../../data/db';
import { writeAudit } from '../../../services/audit';
import { exportWorkspace, importWorkspace, runPolicyClock } from '../../../services/supportService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { MoreHub } from '../../../ui/components/MoreHub';
import { Button, Field, Input, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

type Draft = Omit<PlatformSettings, 'id' | 'lastPolicyRunAt' | 'premiumPlan'>;

function toDraft(s: PlatformSettings): Draft {
  return {
    returnWindowDays: s.returnWindowDays,
    inviteTtlDays: s.inviteTtlDays,
    verificationSlaHours: s.verificationSlaHours,
    orderSlaHours: s.orderSlaHours,
    paymentSlaHours: s.paymentSlaHours,
    paymentProofMandatory: s.paymentProofMandatory,
    billAheadAllowed: s.billAheadAllowed,
    roundingMode: s.roundingMode,
    expiryNearDays: s.expiryNearDays,
    expiryCriticalDays: s.expiryCriticalDays,
    creditNoteAutoExpire: s.creditNoteAutoExpire,
    creditNoteExpiryDays: s.creditNoteExpiryDays ?? 90,
    genericCommissionPercent: s.genericCommissionPercent ?? 0.5,
    ethicalCommissionFlatPerProduct: s.ethicalCommissionFlatPerProduct ?? 1,
    offlineManagedFlatPerLine: s.offlineManagedFlatPerLine ?? 1,
    largePaymentMultiple: s.largePaymentMultiple ?? 3,
    defaultGstPercent: s.defaultGstPercent ?? 12,
    maintenanceMode: s.maintenanceMode ?? false,
  };
}

export function AdminSettings() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const settings = useLiveQuery(() => db.platformSettings.get('platform'));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importText, setImportText] = useState('');
  const { busy: saving, run } = useBusyAction();

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [settings]);

  const setNum = (key: keyof Draft, value: string) => {
    setDraft((d) => (d ? { ...d, [key]: Number(value) } : d));
  };

  if (!settings || !draft) {
    return (
      <div className="stack">
        <PageHeader title="More" />
        <div className="card card-pad muted">Loading settings…</div>
      </div>
    );
  }

  const save = () =>
    void run(async () => {
      const before = { ...settings };
      await db.platformSettings.update('platform', {
        ...draft,
        creditNoteExpiryDays: draft.creditNoteExpiryDays,
      });
      await writeAudit({
        actorId: user.id,
        actorName: user.name,
        businessId: business.id,
        entityType: 'PlatformSettings',
        entityId: 'platform',
        action: 'settings.save',
        before,
        after: draft,
      });
      pushToast({ tone: 'success', title: 'Settings saved' });
    });

  return (
    <div className="stack">
      <PageHeader title="More" subtitle="Platform hub and policy settings" />
      <MoreHub
        sections={[
          {
            title: 'Finance',
            items: [
              { to: '/admin/payments', title: 'Payments', description: 'Review and approve payment proofs' },
              { to: '/admin/reports', title: 'Reports', description: 'GMV and trade-commission exports' },
              { to: '/admin/plans', title: 'Premium plans', description: 'Upgrade requests and plan config' },
            ],
          },
          {
            title: 'Trust',
            items: [
              { to: '/admin/verifications', title: 'Verifications', description: 'KYC / document review queue' },
              { to: '/admin/counterfeit', title: 'Counterfeit', description: 'Suspect batch reports' },
              { to: '/admin/suspensions', title: 'Suspensions', description: 'Account suspensions and reactivation' },
              { to: '/admin/audit', title: 'Audit log', description: 'Platform audit export' },
            ],
          },
          {
            title: 'Content',
            items: [
              { to: '/admin/announcements', title: 'Announcements', description: 'Broadcast messages' },
              { to: '/admin/banners', title: 'Banners', description: 'Portal banner strips' },
              { to: '/admin/help', title: 'Help Center', description: 'Admin help content' },
            ],
          },
          {
            title: 'Platform',
            items: [
              { to: '/admin/analytics', title: 'Analytics', description: 'Platform KPIs' },
              { to: '/admin/network', title: 'Network', description: 'Business directory and view-as' },
              { to: '/admin/staff', title: 'Staff', description: 'Admin team roles' },
              { to: '/admin/profile', title: 'Profile', description: 'Your admin profile' },
              { to: '/admin/notifications', title: 'Notifications', description: 'Inbox' },
            ],
          },
        ]}
      />

      <PageHeader
        title="Platform settings"
        subtitle={`Last policy run: ${settings.lastPolicyRunAt ? new Date(settings.lastPolicyRunAt).toLocaleString() : '—'}`}
      />
      <div className="card card-pad stack">
        <div className="grid-2">
          <Field label="Return window (days)">
            <Input type="number" value={draft.returnWindowDays} onChange={(e) => setNum('returnWindowDays', e.target.value)} />
          </Field>
          <Field label="Invite TTL (days)">
            <Input type="number" value={draft.inviteTtlDays} onChange={(e) => setNum('inviteTtlDays', e.target.value)} />
          </Field>
          <Field label="Verification SLA (hours)">
            <Input
              type="number"
              value={draft.verificationSlaHours}
              onChange={(e) => setNum('verificationSlaHours', e.target.value)}
            />
          </Field>
          <Field label="Order SLA (hours)">
            <Input type="number" value={draft.orderSlaHours} onChange={(e) => setNum('orderSlaHours', e.target.value)} />
          </Field>
          <Field label="Payment SLA (hours)">
            <Input type="number" value={draft.paymentSlaHours} onChange={(e) => setNum('paymentSlaHours', e.target.value)} />
          </Field>
          <Field label="Payment proof mandatory">
            <Select
              value={draft.paymentProofMandatory ? 'yes' : 'no'}
              onChange={(e) => setDraft((d) => (d ? { ...d, paymentProofMandatory: e.target.value === 'yes' } : d))}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Bill ahead allowed">
            <Select
              value={draft.billAheadAllowed ? 'yes' : 'no'}
              onChange={(e) => setDraft((d) => (d ? { ...d, billAheadAllowed: e.target.value === 'yes' } : d))}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Rounding mode">
            <Select
              value={draft.roundingMode}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, roundingMode: e.target.value as PlatformSettings['roundingMode'] } : d))
              }
            >
              <option value="nearest">Nearest</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </Select>
          </Field>
          <Field label="Expiry near (days)">
            <Input type="number" value={draft.expiryNearDays} onChange={(e) => setNum('expiryNearDays', e.target.value)} />
          </Field>
          <Field label="Expiry critical (days)">
            <Input
              type="number"
              value={draft.expiryCriticalDays}
              onChange={(e) => setNum('expiryCriticalDays', e.target.value)}
            />
          </Field>
          <Field label="Credit note auto-expire">
            <Select
              value={draft.creditNoteAutoExpire ? 'yes' : 'no'}
              onChange={(e) => setDraft((d) => (d ? { ...d, creditNoteAutoExpire: e.target.value === 'yes' } : d))}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Credit note expiry (days)">
            <Input
              type="number"
              value={draft.creditNoteExpiryDays ?? 90}
              onChange={(e) => setNum('creditNoteExpiryDays', e.target.value)}
            />
          </Field>
          <Field label="Default GST %">
            <Input
              type="number"
              value={draft.defaultGstPercent ?? 12}
              onChange={(e) => setNum('defaultGstPercent', e.target.value)}
            />
          </Field>
          <Field label="Generic commission %">
            <Input
              type="number"
              step="0.1"
              value={draft.genericCommissionPercent ?? 0.5}
              onChange={(e) => setNum('genericCommissionPercent', e.target.value)}
            />
          </Field>
          <Field label="Ethical flat ₹ / product line">
            <Input
              type="number"
              value={draft.ethicalCommissionFlatPerProduct ?? 1}
              onChange={(e) => setNum('ethicalCommissionFlatPerProduct', e.target.value)}
            />
          </Field>
          <Field label="Offline managed ₹ / line">
            <Input
              type="number"
              value={draft.offlineManagedFlatPerLine ?? 1}
              onChange={(e) => setNum('offlineManagedFlatPerLine', e.target.value)}
            />
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Baked into pharmacy-visible prices. Pharmacy never sees a commission breakout.
            </p>
          </Field>
          <Field label="Maintenance mode">
            <Select
              value={draft.maintenanceMode ? 'yes' : 'no'}
              onChange={(e) => setDraft((d) => (d ? { ...d, maintenanceMode: e.target.value === 'yes' } : d))}
            >
              <option value="no">Off</option>
              <option value="yes">On (warn new trade)</option>
            </Select>
          </Field>
        </div>
        <div className="row">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await runPolicyClock();
              pushToast({ tone: 'success', title: 'Policy clock ran', message: 'SLA / expiry / overdue updated' });
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
              URL.revokeObjectURL(url);
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
            pushToast(
              res.ok
                ? { tone: 'success', title: 'Imported — reloading' }
                : { tone: 'error', title: res.message },
            );
            if (res.ok) window.setTimeout(() => window.location.reload(), 600);
          }}
        >
          Import
        </Button>
      </div>
    </div>
  );
}

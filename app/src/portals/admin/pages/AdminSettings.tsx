import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { PlatformSettings } from '../../../domain/entities/types';
import { db } from '../../../data/db';
import { resetAndSeedWorld } from '../../../data/worldSeed';
import { updatePlatformSettings } from '../../../services/platformSettingsService';
import {
  downloadWorkspaceJson,
  exportWorkspace,
  importWorkspace,
  previewWorkspaceImport,
  runPolicyClock,
  type WorkspaceImportPreview,
} from '../../../services/supportService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { MoreHub } from '../../../ui/components/MoreHub';
import { Button, DeleteButton, Field, Input, Modal, PageHeader, Select, Textarea } from '../../../ui/components/primitives';
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
    bankFeePercent: s.bankFeePercent ?? 2,
    bankFeeBearer: s.bankFeeBearer ?? 'Stockist',
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
  const [importPreview, setImportPreview] = useState<WorkspaceImportPreview | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const { busy: saving, run } = useBusyAction();
  const isSuperAdmin = user.role === 'SuperAdmin';

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [settings]);

  const setNum = (key: keyof Draft, value: string) => {
    setDraft((d) => (d ? { ...d, [key]: Number(value) } : d));
  };

  if (!settings || !draft) {
    return (
      <div className="stack">
        <PageHeader title="Settings" />
        <div className="card card-pad muted">Loading settings…</div>
      </div>
    );
  }

  const save = () =>
    void run(async () => {
      const res = await updatePlatformSettings({
        actor: user,
        adminBusiness: business,
        patch: {
          ...draft,
          creditNoteExpiryDays: draft.creditNoteExpiryDays,
        },
      });
      pushToast(res.ok ? { tone: 'success', title: 'Settings saved' } : { tone: 'error', title: res.message });
    });

  return (
    <div className="stack">
      <PageHeader title="Settings" subtitle="Platform hub and policy settings" />

      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Platform settings</h2>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
          Last policy run:{' '}
          {settings.lastPolicyRunAt ? new Date(settings.lastPolicyRunAt).toLocaleString() : '—'}
        </p>
      </div>
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
          <Field
            label="Large payment flag (× avg invoice)"
            hint="Admin payments monitor highlights payments at or above this multiple of the pair’s average invoice."
          >
            <Input
              type="number"
              min={1}
              step="0.5"
              value={draft.largePaymentMultiple ?? 3}
              onChange={(e) => setNum('largePaymentMultiple', e.target.value)}
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
          <Field label="Bank / MDR fee %">
            <Input
              type="number"
              step="0.1"
              value={draft.bankFeePercent ?? 2}
              onChange={(e) => setNum('bankFeePercent', e.target.value)}
            />
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Stockist-borne. Included in pharmacy rates and cut from Razorpay settlements.
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
              downloadWorkspaceJson(json);
            }}
          >
            Export workspace
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setImportText('');
              setImportOpen(true);
            }}
          >
            Import workspace
          </Button>
          {isSuperAdmin ? (
            <DeleteButton onClick={() => setRebuildOpen(true)}>
              Rebuild demo world
            </DeleteButton>
          ) : null}
        </div>
      </div>

      <MoreHub
        sections={[
          {
            title: 'Finance',
            items: [
              { to: '/admin/payments', title: 'Payments', description: 'Read-only payments monitor across counterparties' },
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
            title: 'Account',
            items: [
              { to: '/admin/appearance', title: 'Appearance', description: 'Theme and accent color' },
              { to: '/admin/profile', title: 'Profile', description: 'Your admin profile' },
              { to: '/admin/notifications', title: 'Notifications', description: 'Inbox' },
            ],
          },
          {
            title: 'Platform',
            items: [
              { to: '/admin/analytics', title: 'Analytics', description: 'Platform KPIs' },
              { to: '/admin/network', title: 'Network', description: 'Business directory and view-as' },
              { to: '/admin/staff', title: 'Staff', description: 'Admin team roles' },
            ],
          },
        ]}
      />

      <ConfirmDialog
        open={rebuildOpen}
        title="Rebuild demo world?"
        tone="danger"
        confirmLabel="Wipe & re-seed"
        confirmPhrase="REBUILD"
        confirmPhraseLabel='Type “REBUILD” to confirm'
        body={
          <p style={{ margin: 0 }}>
            This clears the entire local workspace and re-runs the flow-based world seed. All current
            businesses, trade, and settings will be replaced with the demo cast.
          </p>
        }
        onClose={() => setRebuildOpen(false)}
        onConfirm={async () => {
          setRebuildOpen(false);
          try {
            await resetAndSeedWorld();
            pushToast({ tone: 'success', title: 'Demo world rebuilt', message: 'Reloading…' });
            window.setTimeout(() => window.location.reload(), 600);
          } catch (err) {
            pushToast({
              tone: 'error',
              title: 'World seed failed',
              message: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }}
      />

      <Modal
        open={importOpen}
        title="Import workspace"
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const preview = await previewWorkspaceImport(importText);
                if (!preview.ok) {
                  pushToast({ tone: 'error', title: preview.message });
                  return;
                }
                setImportPreview(preview.data);
              }}
            >
              Import
            </Button>
          </>
        }
      >
        <Field label="Import workspace JSON">
          <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste exported JSON" />
        </Field>
      </Modal>
      <ConfirmDialog
          open={!!importPreview}
          title="Replace entire workspace?"
          tone="danger"
          confirmLabel="Export backup & import"
          confirmPhrase="REPLACE"
          confirmPhraseLabel='Type “REPLACE” to confirm'
          body={
            importPreview ? (
              <div className="stack" style={{ gap: 8 }}>
                <p>
                  This will <strong>erase all current data</strong> (
                  {importPreview.currentTotal.toLocaleString()} records across{' '}
                  {Object.keys(importPreview.currentCounts).length} tables) and replace it with the
                  pasted payload ({importPreview.incomingTotal.toLocaleString()} records).
                </p>
                <p>
                  A backup of the current workspace will download automatically before import.
                </p>
                {importPreview.exportedAt ? (
                  <p className="muted" style={{ fontSize: 12 }}>
                    Payload exported at: {new Date(importPreview.exportedAt).toLocaleString()}
                  </p>
                ) : null}
                <div style={{ fontSize: 12 }}>
                  <strong>Incoming preview (key tables)</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {(
                      [
                        'businesses',
                        'users',
                        'orders',
                        'invoices',
                        'payments',
                        'products',
                        'batches',
                      ] as const
                    ).map((t) => (
                      <li key={t}>
                        {t}: {importPreview.currentCounts[t] ?? 0} → {importPreview.incomingCounts[t] ?? 0}
                      </li>
                    ))}
                  </ul>
                </div>
                {importPreview.unknownTables.length ? (
                  <p className="muted" style={{ fontSize: 12 }}>
                    Unknown tables in payload (ignored): {importPreview.unknownTables.join(', ')}
                  </p>
                ) : null}
                {importPreview.missingTables.length ? (
                  <p className="muted" style={{ fontSize: 12 }}>
                    Tables missing from payload (will be cleared):{' '}
                    {importPreview.missingTables.slice(0, 8).join(', ')}
                    {importPreview.missingTables.length > 8
                      ? ` +${importPreview.missingTables.length - 8} more`
                      : ''}
                  </p>
                ) : null}
              </div>
            ) : null
          }
          onClose={() => setImportPreview(null)}
          onConfirm={async () => {
            const backup = await exportWorkspace();
            downloadWorkspaceJson(
              backup,
              `digiswasthya-backup-before-import-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
            );
            const res = await importWorkspace(importText);
            pushToast(
              res.ok
                ? { tone: 'success', title: 'Imported — reloading', message: 'Backup downloaded first.' }
                : { tone: 'error', title: res.message },
            );
            setImportPreview(null);
            if (res.ok) {
              setImportOpen(false);
              setImportText('');
              window.setTimeout(() => window.location.reload(), 600);
            }
          }}
        />
    </div>
  );
}

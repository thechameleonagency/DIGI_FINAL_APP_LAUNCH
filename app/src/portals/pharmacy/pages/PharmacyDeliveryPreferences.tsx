import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { updateBusiness } from '../../../services/businessService';
import { useSession } from '../../../store/session';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, Field, Input, PageHeader, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const SLOT_OPTIONS = ['Morning (8–12)', 'Afternoon (12–5)', 'Evening (5–9)', 'Anytime'];

export function PharmacyDeliveryPreferences() {
  const { business, user } = useBiz();
  const { refreshEntities } = useSession();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const [slots, setSlots] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [defaultReceiver, setDefaultReceiver] = useState('');

  useEffect(() => {
    setSlots(business.preferences?.deliverySlots ?? []);
    setInstructions(business.preferences?.instructions ?? '');
    setDefaultReceiver(business.preferences?.defaultReceiver ?? '');
  }, [business.id, business.preferences]);

  const canEdit = user.role === 'Pharmacist';

  const toggleSlot = (s: string) => {
    setSlots((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className="stack">
      <PageHeader
        title="Delivery preferences"
        subtitle="Advisory only — shown to stockists on orders and deliveries; never blocks dispatch"
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pharmacy/settings">
            Settings
          </Link>
        }
      />

      <div className="card card-pad stack">
        <div style={{ fontSize: 12, fontWeight: 600 }}>Preferred time slots</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {SLOT_OPTIONS.map((s) => (
            <label key={s} style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={slots.includes(s)}
                disabled={!canEdit}
                onChange={() => toggleSlot(s)}
              />{' '}
              {s}
            </label>
          ))}
        </div>
        <Field label="Standing delivery instructions">
          <Textarea
            rows={3}
            value={instructions}
            disabled={!canEdit}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Gate code, call before delivery…"
          />
        </Field>
        <Field label="Default receiver name">
          <Input
            value={defaultReceiver}
            disabled={!canEdit}
            onChange={(e) => setDefaultReceiver(e.target.value)}
            placeholder="Pharmacist on duty"
          />
        </Field>
        {canEdit ? (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await updateBusiness({
                  actor: user,
                  business,
                  patch: {
                    preferences: {
                      deliverySlots: slots,
                      instructions: instructions.trim() || undefined,
                      defaultReceiver: defaultReceiver.trim() || undefined,
                    },
                  },
                });
                if (res.ok) refreshEntities(user, res.data);
                pushToast(
                  res.ok
                    ? { tone: 'success', title: 'Preferences saved', message: 'Applies to future deliveries only.' }
                    : { tone: 'error', title: res.message },
                );
              })
            }
          >
            {busy ? 'Saving…' : 'Save preferences'}
          </Button>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            Only the Pharmacist can edit delivery preferences.
          </div>
        )}
      </div>
    </div>
  );
}

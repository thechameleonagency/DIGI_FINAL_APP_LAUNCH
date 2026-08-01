import type { Business } from '../../domain/entities/types';

/** Advisory pharmacy receive-side prefs for stockist order/delivery views (CF-09). */
export function PharmacyDeliveryPrefs({ pharmacy }: { pharmacy?: Business | null }) {
  const prefs = pharmacy?.preferences;
  if (!prefs) return null;
  const hasSlots = !!prefs.deliverySlots?.length;
  const hasInst = !!prefs.instructions?.trim();
  const hasRecv = !!prefs.defaultReceiver?.trim();
  if (!hasSlots && !hasInst && !hasRecv) return null;

  return (
    <div className="card card-pad" style={{ fontSize: 13, background: 'var(--page)' }}>
      <strong>Pharmacy delivery preferences</strong>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
        Advisory — do not block dispatch
      </div>
      {hasSlots ? <div>Slots: {prefs.deliverySlots!.join(' · ')}</div> : null}
      {hasRecv ? <div>Receiver: {prefs.defaultReceiver}</div> : null}
      {hasInst ? <div>Instructions: {prefs.instructions}</div> : null}
    </div>
  );
}

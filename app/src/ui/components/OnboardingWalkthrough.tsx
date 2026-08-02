import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { REPLAY_WALKTHROUGH_EVENT } from '../../content/help';
import type { Business, User } from '../../domain/entities/types';
import { db } from '../../data/db';
import { markOnboardingSeen } from '../../services/preferencesService';
import { Button, Modal } from './primitives';

type Slide = { title: string; body: string };

function slidesFor(role: User['role'], bizType: Business['type']): Slide[] {
  if (bizType === 'Platform') {
    return [
      { title: 'Review verifications', body: 'Approve pharmacies and stockists from the Verifications queue before they can trade.' },
      { title: 'Govern the network', body: 'Suspend, reactivate, or deactivate businesses from Network detail when policy requires it.' },
      { title: 'Support & announcements', body: 'Work tickets in Support; publish announcements and banners for the right audiences.' },
      { title: 'Audit & settings', body: 'Export audit logs and tune SLA hours under Settings (SuperAdmin).' },
    ];
  }
  if (role === 'DeliveryStaff') {
    if (bizType === 'Pharmacy') {
      return [
        { title: 'Customer deliveries', body: 'Open Delivery to see routes and stops assigned to you.' },
        { title: 'Update stops', body: 'Mark stops Out for delivery / Delivered / Failed with notes when needed.' },
        { title: 'No trade access', body: 'Orders, payments, and catalogue stay with the Pharmacist account.' },
        { title: 'Ask for help', body: 'Use Support if a stop fails or an address needs clarification.' },
      ];
    }
    return [
      { title: 'Your deliveries', body: 'Open Delivery to see Assigned and Out-for-delivery B2B work only.' },
      { title: 'Update status', body: 'Mark Out for delivery / Delivered / Failed with POD when required.' },
      { title: 'No finance access', body: 'Payments and catalogues stay with the Stockist account.' },
      { title: 'Ask for help', body: 'Use Support if a stop fails or an address needs clarification.' },
    ];
  }
  if (bizType === 'Pharmacy') {
    return [
      { title: 'Connect to stockists', body: 'Find approved stockists and request Active connections before you can see prices.' },
      { title: 'Buy & order', body: 'Browse catalogues, build a cart, and place orders — GRN when goods arrive.' },
      { title: 'Pay & returns', body: 'Submit payment proofs against invoices; raise returns with evidence when needed.' },
      { title: 'Team & delivery', body: 'Invite DeliveryStaff for customer home-delivery and mute notification categories as needed.' },
    ];
  }
  return [
    { title: 'Catalogue & stock', body: 'Add products, receive stock batches, and keep the catalogue Active for pharmacies.' },
    { title: 'Fulfil orders', body: 'Accept → allocate → pack → invoice → dispatch → deliver in the Orders flow.' },
    { title: 'Pharmacies & money', body: 'Approve connection requests; review payments and returns from your queues.' },
    { title: 'Team', body: 'Invite DeliveryStaff for B2B pharmacy deliveries and set permission overrides when needed.' },
  ];
}

/** Listens for replay events (Help / Preferences). No permanent topbar chrome. */
export function OnboardingWalkthrough({ user, business }: { user: User; business: Business }) {
  const live = useLiveQuery(() => db.users.get(user.id), [user.id]);
  const [force, setForce] = useState(false);
  const [idx, setIdx] = useState(0);
  const slides = useMemo(() => slidesFor(user.role, business.type), [user.role, business.type]);
  // Auto-open only when the loaded user record explicitly lacks a seen flag.
  const open = force || (live != null && live.onboardingSeenAt == null);

  useEffect(() => {
    const onReplay = () => {
      setForce(true);
      setIdx(0);
    };
    window.addEventListener(REPLAY_WALKTHROUGH_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_WALKTHROUGH_EVENT, onReplay);
  }, []);

  const close = async (seen: boolean) => {
    if (seen) {
      await markOnboardingSeen(user.id);
    }
    setForce(false);
    setIdx(0);
  };

  return (
    <Modal
      open={open}
      title={slides[idx]?.title ?? 'Welcome'}
      onClose={() => void close(true)}
      footer={
        <>
          <Button variant="secondary" onClick={() => void close(true)}>
            Skip
          </Button>
          {idx > 0 ? (
            <Button variant="secondary" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
              Back
            </Button>
          ) : null}
          {idx < slides.length - 1 ? (
            <Button onClick={() => setIdx((i) => i + 1)}>Next</Button>
          ) : (
            <Button onClick={() => void close(true)}>Got it</Button>
          )}
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14 }}>{slides[idx]?.body}</p>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Step {idx + 1} of {slides.length}
      </p>
    </Modal>
  );
}

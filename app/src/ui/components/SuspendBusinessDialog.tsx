import { useEffect, useState } from 'react';
import type { Business, User } from '../../domain/entities/types';
import { suspendBusiness } from '../../services/verificationService';
import { useUi } from '../../store/ui';
import { Button, Field, Input, Modal, Textarea } from './primitives';

/** Shared suspend confirm used by Suspensions queue and Business detail. */
export function SuspendBusinessDialog({
  open,
  target,
  actor,
  adminBusiness,
  onClose,
  onDone,
}: {
  open: boolean;
  target: Business | null;
  actor: User;
  adminBusiness: Business;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { pushToast } = useUi();
  const [reason, setReason] = useState('');
  const [auditNote, setAuditNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setAuditNote('');
  }, [open, target?.id]);

  const confirm = async () => {
    if (!target) return;
    if (!reason.trim()) {
      pushToast({ tone: 'error', title: 'Reason is required' });
      return;
    }
    setBusy(true);
    try {
      const res = await suspendBusiness({
        actor,
        adminBusiness,
        targetBusinessId: target.id,
        reason: reason.trim(),
        internalNotes: auditNote.trim() || undefined,
      });
      pushToast(res.ok ? { tone: 'warning', title: 'Suspended' } : { tone: 'error', title: res.message });
      if (res.ok) {
        onClose();
        onDone?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open && !!target}
      title="Suspend account"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
            Confirm suspend
          </Button>
        </>
      }
    >
      {target ? (
        <div className="stack">
          <div className="banner-strip warning">
            <strong>{target.name}</strong> will lose trade permissions (orders, payments, catalogue). History is retained.
            Users can request reactivation from the suspended page.
          </div>
          <Field label="Reason (required — shown to business)">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Policy violation / docs expired…"
            />
          </Field>
          <Field label="Internal audit note (optional)" hint="Never shown to the business — admin and audit only.">
            <Textarea value={auditNote} onChange={(e) => setAuditNote(e.target.value)} rows={2} />
          </Field>
        </div>
      ) : null}
    </Modal>
  );
}

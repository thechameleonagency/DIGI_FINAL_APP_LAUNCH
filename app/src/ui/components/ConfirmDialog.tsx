import { useEffect, useState, type ReactNode } from 'react';
import { Button, Field, Modal, Textarea } from './primitives';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  /** When true, user must enter a non-empty reason before confirm is enabled */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  onClose: () => void;
};

/**
 * Confirm + optional required-reason dialog wrapping Modal.
 * Use for every destructive/decision action (reject, disconnect, void, fail, etc.).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Required',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const canConfirm = !requireReason || reason.trim().length > 0;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={!canConfirm || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(requireReason ? reason.trim() : undefined);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="stack">
        {body ? <div style={{ fontSize: 13.5 }}>{body}</div> : null}
        {requireReason ? (
          <Field label={reasonLabel}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              autoFocus
            />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

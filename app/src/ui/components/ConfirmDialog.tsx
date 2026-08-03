import { useEffect, useState, type ReactNode } from 'react';
import { Button, DeleteButton, Field, Input, Modal, Textarea } from './primitives';

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
  /** When set, user must type this exact phrase (trimmed) to enable confirm */
  confirmPhrase?: string;
  confirmPhraseLabel?: string;
  /** When true, user must enter a password; value is passed as the second onConfirm arg */
  requirePassword?: boolean;
  passwordLabel?: string;
  onConfirm: (reason?: string, password?: string) => void | Promise<void>;
  onClose: () => void;
};

/**
 * Confirm + optional required-reason / typed-phrase / password dialog wrapping Modal.
 * Use for every destructive/decision action (reject, disconnect, void, fail, ownership transfer, etc.).
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
  confirmPhrase,
  confirmPhraseLabel = 'Type the business name to confirm',
  requirePassword = false,
  passwordLabel = 'Your password',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setPhrase('');
      setPassword('');
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

  const phraseOk = !confirmPhrase || phrase.trim() === confirmPhrase.trim();
  const reasonOk = !requireReason || reason.trim().length > 0;
  const passwordOk = !requirePassword || password.length > 0;
  const canConfirm = phraseOk && reasonOk && passwordOk;
  const isDeleteConfirm = /^(Delete|Wipe)\b/i.test(confirmLabel);

  const runConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(
        requireReason ? reason.trim() : undefined,
        requirePassword ? password : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      layer={1}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          {isDeleteConfirm ? (
            <DeleteButton disabled={!canConfirm || busy} onClick={() => void runConfirm()}>
              {busy ? 'Working…' : confirmLabel}
            </DeleteButton>
          ) : (
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={!canConfirm || busy}
              onClick={() => void runConfirm()}
            >
              {busy ? 'Working…' : confirmLabel}
            </Button>
          )}
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
              autoFocus={!confirmPhrase && !requirePassword}
            />
          </Field>
        ) : null}
        {confirmPhrase ? (
          <Field label={confirmPhraseLabel}>
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
              autoComplete="off"
            />
          </Field>
        ) : null}
        {requirePassword ? (
          <Field label={passwordLabel}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Re-enter your password"
              autoComplete="current-password"
              autoFocus={!confirmPhrase}
            />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

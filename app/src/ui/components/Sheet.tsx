import { useEffect, type ReactNode } from 'react';
import { Button } from './primitives';

/** Right-side sheet panel (Escape + backdrop close). */
export function Sheet({
  open,
  title,
  children,
  onClose,
  width = 420,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        className="sheet-panel"
        style={{ width: `min(100vw, ${width}px)` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-header">
          <strong>{title}</strong>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>
  );
}

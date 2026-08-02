import { useEffect, type ReactNode } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button } from './primitives';

/** Right-side sheet panel (Escape + backdrop close + focus trap). */
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
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        ref={panelRef}
        className="sheet-panel"
        tabIndex={-1}
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

import type { ReactNode } from 'react';

export type ShortcutHint = {
  keys: string;
  label: string;
};

/** Compact top-right shortcut chips for PageHeader actions. */
export function ShortcutHints({ hints, extra }: { hints: ShortcutHint[]; extra?: ReactNode }) {
  if (!hints.length && !extra) return null;
  return (
    <div className="shortcut-hints">
      {hints.map((h) => (
        <span key={`${h.keys}-${h.label}`} className="shortcut-hint" title={`${h.keys} — ${h.label}`}>
          <kbd className="kbd">{h.keys}</kbd>
          <span className="shortcut-hint-label">{h.label}</span>
        </span>
      ))}
      {extra}
    </div>
  );
}

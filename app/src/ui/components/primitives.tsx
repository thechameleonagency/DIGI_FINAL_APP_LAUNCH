import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { formatINR } from '../../domain/utils/money';

export function Button({
  variant = 'primary',
  size,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' }) {
  return <button className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}

export function Money({ value }: { value: number }) {
  return <span className="mono">{formatINR(value)}</span>;
}

const STATUS_TONE: Record<string, string> = {
  Active: 'success',
  Approved: 'success',
  Paid: 'success',
  Delivered: 'success',
  Issued: 'info',
  Submitted: 'info',
  Pending: 'warning',
  UnderReview: 'warning',
  Requested: 'warning',
  PartiallyPaid: 'warning',
  Overdue: 'danger',
  Rejected: 'danger',
  Suspended: 'danger',
  Cancelled: 'neutral',
  Void: 'neutral',
  Failed: 'danger',
  Open: 'warning',
  Packed: 'info',
  Allocated: 'info',
  Dispatched: 'info',
  Accepted: 'success',
  DocumentsRequested: 'warning',
  OnHold: 'warning',
  PartiallyDelivered: 'warning',
  PartiallyAccepted: 'warning',
  PartiallyApproved: 'warning',
  FullyApplied: 'success',
  PartiallyApplied: 'warning',
  Closed: 'neutral',
  Available: 'success',
  Expired: 'danger',
  Quarantined: 'warning',
  Recalled: 'danger',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = status.replace(/([a-z])([A-Z])/g, '$1 $2');
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty card">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <strong>{title}</strong>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: { id: string; tone: string; title: string; message?: string }[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => onDismiss(t.id)} role="status">
          <strong>{t.title}</strong>
          {t.message ? <span>{t.message}</span> : null}
        </div>
      ))}
    </div>
  );
}

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Trash2 } from 'lucide-react';
import { formatINR } from '../../domain/utils/money';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { BackLink } from '../navigation/BackLink';

export function Button({
  variant = 'primary',
  size,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' }) {
  return <button className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} {...props} />;
}

/** Text-style destructive control — red label + optional trash icon, bordered, no fill. */
export function DeleteButton({
  size,
  className = '',
  children = 'Delete',
  showIcon = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm'; showIcon?: boolean }) {
  return (
    <button type="button" className={`btn btn-delete ${size === 'sm' ? 'btn-sm' : ''} ${className}`} {...props}>
      {showIcon ? <Trash2 size={size === 'sm' ? 14 : 16} aria-hidden /> : null}
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} className="input" {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = '', ...props },
  ref,
) {
  return <select ref={ref} className={`select ${className}`.trim()} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea(props, ref) {
    return <textarea ref={ref} className="textarea" {...props} />;
  },
);

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
  const uid = useId();
  const controlId = htmlFor ?? uid;
  const errorId = error ? `${controlId}-error` : undefined;
  const hintId = hint && !error ? `${controlId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const control = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
    return cloneElement(el, {
      id: el.props.id ?? controlId,
      'aria-invalid': error ? true : el.props['aria-invalid'],
      'aria-describedby': describedBy ?? el.props['aria-describedby'],
    });
  });
  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={controlId}>{label}</label>
      {control}
      {hint && !error ? (
        <span id={hintId} className="hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Money({ value }: { value: number }) {
  return <span className="mono">{formatINR(value)}</span>;
}

const STATUS_TONE: Record<string, string> = {
  Active: 'success',
  Circle: 'info',
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
  PendingActivation: 'warning',
  Deactivated: 'neutral',
  Cancelled: 'neutral',
  Void: 'neutral',
  Voided: 'neutral',
  Failed: 'danger',
  Open: 'warning',
  Packed: 'info',
  Allocated: 'info',
  Dispatched: 'info',
  OutForDelivery: 'info',
  InProgress: 'info',
  WaitingOnUser: 'warning',
  WaitingOnSupport: 'info',
  Accepted: 'success',
  DocumentsRequested: 'warning',
  OnHold: 'warning',
  PartiallyDelivered: 'warning',
  PartiallyAccepted: 'warning',
  PartiallyApproved: 'warning',
  FullyApplied: 'success',
  PartiallyApplied: 'warning',
  Closed: 'neutral',
  Resolved: 'success',
  Reported: 'info',
  Investigating: 'warning',
  RecallIssued: 'danger',
  Dismissed: 'neutral',
  Available: 'success',
  Expired: 'danger',
  Quarantined: 'warning',
  Recalled: 'danger',
  Healthy: 'success',
  Near: 'warning',
  Critical: 'danger',
  low: 'warning',
  zero: 'danger',
  'near-expiry': 'warning',
  expired: 'danger',
  quarantined: 'warning',
  recalled: 'danger',
  ok: 'success',
  Manual: 'neutral',
  Free: 'neutral',
  Premium: 'info',
  Invited: 'info',
  OfflineOnly: 'neutral',
  Linked: 'success',
  Blocked: 'danger',
  Disconnected: 'neutral',
  Draft: 'neutral',
  Published: 'success',
  Unpublished: 'warning',
  GoodsReceived: 'success',
  Reopened: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  Circle: 'Circle',
  OutForDelivery: 'Out for delivery',
  InProgress: 'In progress',
  WaitingOnUser: 'Waiting on user',
  WaitingOnSupport: 'Waiting on support',
  DocumentsRequested: 'Documents requested',
  PartiallyDelivered: 'Partially delivered',
  PartiallyAccepted: 'Partially accepted',
  PartiallyApproved: 'Partially approved',
  PartiallyPaid: 'Partially paid',
  PartiallyApplied: 'Partially applied',
  FullyApplied: 'Fully applied',
  GoodsReceived: 'Goods received',
  OfflineOnly: 'Offline only',
  'near-expiry': 'Near expiry',
  low: 'Low stock',
  zero: 'Zero stock',
  ok: 'OK',
  expired: 'Expired',
  quarantined: 'Quarantined',
  recalled: 'Recalled',
  Near: 'Near expiry',
  Critical: 'Critical',
  Healthy: 'Healthy',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = STATUS_LABEL[status] ?? status.replace(/([a-z])([A-Z])/g, '$1 $2');
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      className="tabs"
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const idx = items.findIndex((i) => i.id === value);
        if (idx < 0) return;
        let next = idx;
        if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
        else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        onChange(items[next].id);
        const tabs = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]');
        tabs[next]?.focus();
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          id={`tab-${item.id}`}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          aria-controls={`tabpanel-${item.id}`}
          tabIndex={value === item.id ? 0 : -1}
          className={`tab${value === item.id ? ' active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Pair with Tabs ids (`tab-${id}` / `tabpanel-${id}`) for WAI-ARIA tabs. */
export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
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

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="empty card" role="status" aria-live="polite">
      <h3>{label}</h3>
      <p className="muted">Fetching the latest records.</p>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
  backLabel = 'Back',
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Canonical parent path for deep detail pages. */
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        {backTo ? <BackLink to={backTo} label={backLabel} /> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="row page-header-actions">{actions}</div> : null}
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub || '\u00A0'}</div>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  /** Stack above other overlays (0 = base 50; ConfirmDialog uses 1 → 60). */
  layer = 0,
  /** Prefer this control over the Close button when the dialog opens. */
  initialFocusRef,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  layer?: number;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(open, initialFocusRef);

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
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      style={{ zIndex: 50 + Math.max(0, layer) * 10 }}
    >
      <div
        ref={panelRef}
        className="modal"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
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
  toasts: {
    id: string;
    tone: string;
    title: string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void | Promise<void>;
  }[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <div className="toast-body">
            <strong>{t.title}</strong>
            {t.message ? <span>{t.message}</span> : null}
            {t.actionLabel && t.onAction ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'flex-start', marginTop: 4, padding: '2px 6px' }}
                onClick={() => {
                  void t.onAction?.();
                  onDismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

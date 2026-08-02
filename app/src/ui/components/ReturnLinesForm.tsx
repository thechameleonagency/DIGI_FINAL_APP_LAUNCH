import type { Order, ReturnRequest } from '../../domain/entities/types';
import { nextNumberFieldValue } from '../../domain/utils/validation';
import { FileUpload } from './FileUpload';
import { EmptyState, Field, Input, Select } from './primitives';

export const RETURN_REASONS = ['Short', 'Damaged', 'Expired', 'Wrong item', 'Short dated', 'Other'] as const;

/** Qty already covered by non-rejected/cancelled returns for a product on an order. */
export function alreadyReturnedQty(priorReturns: ReturnRequest[], productId: string): number {
  return priorReturns
    .filter((r) => !['Rejected', 'Cancelled'].includes(r.status))
    .flatMap((r) => r.lines)
    .filter((l) => l.productId === productId)
    .reduce((s, l) => s + (l.approvedQty ?? l.qty), 0);
}

export function eligibleReturnQty(
  line: { productId: string; qty: number; deliveredQty?: number },
  priorReturns: ReturnRequest[],
): number {
  const delivered = line.deliveredQty ?? line.qty;
  return Math.max(0, delivered - alreadyReturnedQty(priorReturns, line.productId));
}

export type ReturnLineDraft = { productId: string; qty: number; reason: string };

/** Validate drafts against stricter eligibility (delivered − already returned) and required reasons. */
export function validateReturnLines(
  order: Order,
  priorReturns: ReturnRequest[],
  returnQty: Record<string, number>,
  returnReasons: Record<string, string>,
):
  | { ok: true; lines: ReturnLineDraft[] }
  | { ok: false; message: string; fieldErrors: Record<string, { qty?: string; reason?: string }> } {
  const lines: ReturnLineDraft[] = [];
  const fieldErrors: Record<string, { qty?: string; reason?: string }> = {};
  for (const l of order.lines) {
    const qty = returnQty[l.productId] ?? 0;
    if (qty <= 0) continue;
    const eligible = eligibleReturnQty(l, priorReturns);
    if (qty > eligible) {
      fieldErrors[l.productId] = { ...fieldErrors[l.productId], qty: `Max eligible is ${eligible}` };
    }
    const reason = (returnReasons[l.productId] ?? '').trim();
    if (!reason) {
      fieldErrors[l.productId] = { ...fieldErrors[l.productId], reason: 'Select a reason' };
    }
    if (!fieldErrors[l.productId]) {
      lines.push({ productId: l.productId, qty, reason });
    }
  }
  if (Object.keys(fieldErrors).length) {
    const first = Object.values(fieldErrors)[0];
    return {
      ok: false,
      message: first.qty || first.reason || 'Fix return lines',
      fieldErrors,
    };
  }
  if (!lines.length) {
    return { ok: false, message: 'Add at least one return qty', fieldErrors: {} };
  }
  return { ok: true, lines };
}

/** Shared return line editor — caps at delivered − already-returned; reason blank by default. */
export function ReturnLinesForm({
  order,
  priorReturns,
  returnQty,
  returnReasons,
  evidenceFileId,
  fieldErrors,
  formError,
  onQty,
  onReason,
  onEvidence,
}: {
  order: Order;
  priorReturns: ReturnRequest[];
  returnQty: Record<string, number>;
  returnReasons: Record<string, string>;
  evidenceFileId?: string;
  fieldErrors?: Record<string, { qty?: string; reason?: string }>;
  formError?: string;
  onQty: (productId: string, qty: number) => void;
  onReason: (productId: string, reason: string) => void;
  onEvidence: (fileId: string | undefined) => void;
}) {
  const anyEligible = order.lines.some((l) => eligibleReturnQty(l, priorReturns) > 0);

  return (
    <div className="stack">
      {formError ? <div className="banner-strip danger">{formError}</div> : null}
      {!anyEligible ? (
        <EmptyState
          title="Nothing eligible to return"
          description="All delivered qty is already covered by prior returns."
        />
      ) : (
        order.lines.map((l) => {
          const delivered = l.deliveredQty ?? l.qty;
          const already = alreadyReturnedQty(priorReturns, l.productId);
          const eligible = Math.max(0, delivered - already);
          if (eligible <= 0) return null;
          const errs = fieldErrors?.[l.productId];
          return (
            <div key={l.id} className="card card-pad stack">
              <strong>{l.productName}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                Eligible {eligible} (delivered {delivered} − already returned {already})
              </div>
              <div className="grid-2">
                <Field label="Qty" error={errs?.qty}>
                  <Input
                    type="number"
                    min={0}
                    max={eligible}
                    value={returnQty[l.productId] ? returnQty[l.productId] : ''}
                    placeholder="0"
                    onChange={(e) => {
                      const next = nextNumberFieldValue(e.target.value, returnQty[l.productId] || '');
                      onQty(l.productId, next === '' ? 0 : next);
                    }}
                  />
                </Field>
                <Field label="Reason" error={errs?.reason}>
                  <Select
                    value={returnReasons[l.productId] ?? ''}
                    onChange={(e) => onReason(l.productId, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          );
        })
      )}
      <FileUpload label="Attach evidence (optional)" value={evidenceFileId} onChange={onEvidence} />
    </div>
  );
}

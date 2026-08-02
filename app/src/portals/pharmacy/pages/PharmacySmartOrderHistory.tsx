import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { pluralize } from '../../../domain/utils/pluralize';
import { reapplySmartOrderRun } from '../../../services/smartOrderService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { Button, EmptyState, PageHeader } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacySmartOrderHistory() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { busy, run } = useBusyAction();
  const runs =
    useLiveQuery(
      () => db.smartOrderRuns.where('pharmacyId').equals(business.id).reverse().sortBy('createdAt'),
      [business.id],
    ) ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="Smart Order history"
        subtitle="Past suggestion runs — re-apply accepted lines to cart (re-validated)"
        actions={
          <Link className="btn btn-primary btn-sm" to="/pharmacy/smart-order">
            New Smart Order
          </Link>
        }
      />

      {!runs.length ? (
        <EmptyState
          title="No Smart Order runs yet"
          description="Generate suggestions from Buy → Smart Order. Runs never place orders automatically."
          action={
            <Link className="btn btn-primary" to="/pharmacy/smart-order">
              Start Smart Order
            </Link>
          }
        />
      ) : (
        runs.map((r) => (
          <div key={r.id} className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{new Date(r.createdAt).toLocaleString()}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  Scope: {r.scope || '—'} · Suggested {r.suggestions.length} · Accepted {r.acceptedLines.length}
                </div>
              </div>
              <Button
                size="sm"
                disabled={busy || !r.acceptedLines.length}
                onClick={() =>
                  void run(async () => {
                    const res = await reapplySmartOrderRun({ actor: user, pharmacy: business, runId: r.id });
                    pushToast(
                      res.ok
                        ? {
                            tone: 'success',
                            title: 'Re-applied to cart',
                            message: `${pluralize(res.data.added, 'line')}${res.data.skipped.length ? `; skipped ${res.data.skipped.length}` : ''}`,
                          }
                        : { tone: 'error', title: res.message },
                    );
                  })
                }
              >
                Re-apply to cart
              </Button>
            </div>
            {r.acceptedLines.length ? (
              <div className="stack" style={{ fontSize: 13 }}>
                {r.acceptedLines.map((l) => (
                  <div key={`${l.productId}-${l.stockistId}`} className="muted">
                    {l.productName} × {l.qty} @ {formatINR(l.unitPrice)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No lines accepted (empty cart add).
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

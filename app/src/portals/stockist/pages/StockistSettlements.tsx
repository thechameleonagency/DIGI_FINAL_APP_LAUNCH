import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatINR } from '../../../domain/utils/money';
import {
  acknowledgeSettlement,
  listPendingFeeCharges,
  listSettlementsForStockist,
} from '../../../services/settlementService';
import { useUi } from '../../../store/ui';
import { Button, EmptyState, Money, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

/** Settlements body — embeddable in Payments hub. EmptyState stays outside cards. */
export function StockistSettlementsPanel() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const settlements =
    useLiveQuery(() => listSettlementsForStockist(business.id), [business.id]) ?? [];
  const pending =
    useLiveQuery(() => listPendingFeeCharges(business.id), [business.id]) ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const open = settlements.find((s) => s.id === openId);

  return (
    <div className="stack">
      <div className="stack">
        <strong>Pending fee arrears</strong>
        {!pending.length ? (
          <EmptyState
            title="No pending fees"
            description="Offline charges appear here until the next online settlement."
          />
        ) : (
          <div className="card card-pad">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="cell-num">Commission</th>
                    <th className="cell-num">Bank fee</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((c) => (
                    <tr key={c.id}>
                      <td>{c.source}</td>
                      <td className="cell-num">
                        <Money value={c.commission} />
                      </td>
                      <td className="cell-num">
                        <Money value={c.bankFee} />
                      </td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td>{c.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="stack">
        <strong>Settlement advice</strong>
        {!settlements.length ? (
          <EmptyState
            title="No settlements yet"
            description="When pharmacies pay via Razorpay, net payouts appear here."
            action={
              <Link className="btn btn-secondary btn-sm" to="/stockist/payments">
                Open payments
              </Link>
            }
          />
        ) : (
          <div className="card card-pad">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>No</th>
                    <th className="cell-num">Gross</th>
                    <th className="cell-num">Net</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id}>
                      <td>{s.settlementNo}</td>
                      <td className="cell-num">{formatINR(s.grossAmount)}</td>
                      <td className="cell-num">{formatINR(s.netAmount)}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td>
                        <Button size="sm" variant="secondary" onClick={() => setOpenId(s.id)}>
                          Detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {open ? (
        <div className="card card-pad stack">
          <div className="row row-between">
            <strong>
              {open.settlementNo} · <StatusBadge status={open.status} />
            </strong>
            <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
              Close
            </Button>
          </div>
          <div className="grid-2">
            <div>
              Gross: <Money value={open.grossAmount} />
            </div>
            <div>
              Commission: <Money value={open.commissionTotal} />
            </div>
            <div>
              Bank fee: <Money value={open.bankFeeTotal} />
            </div>
            <div>
              Deferred cut: <Money value={open.deferredCollected} />
            </div>
            <div>
              <strong>
                Net to you: <Money value={open.netAmount} />
              </strong>
            </div>
          </div>
          {open.lineBreakouts?.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th className="cell-num">Gross</th>
                    <th className="cell-num">Commission</th>
                    <th className="cell-num">Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {open.lineBreakouts.map((l, i) => (
                    <tr key={l.invoiceId ?? `line-${i}`}>
                      <td className="mono">{(l.invoiceId ?? l.orderId ?? '—').slice(0, 8)}</td>
                      <td className="cell-num">{formatINR(l.gross)}</td>
                      <td className="cell-num">{formatINR(l.commission)}</td>
                      <td className="cell-num">{formatINR(l.bankFee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Button
            onClick={async () => {
              const res = await acknowledgeSettlement({
                actor: user,
                stockist: business,
                settlementId: open.id,
              });
              pushToast(
                res.ok
                  ? { tone: 'success', title: 'Settlement acknowledged' }
                  : { tone: 'error', title: res.message },
              );
            }}
          >
            Acknowledge advice
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Standalone route redirects into Payments hub. */
export function StockistSettlements() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('tab', 'Settlements');
  const qs = next.toString();
  return <Navigate to={`/stockist/payments${qs ? `?${qs}` : ''}`} replace />;
}

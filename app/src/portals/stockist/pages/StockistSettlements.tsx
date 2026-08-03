import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { formatINR } from '../../../domain/utils/money';
import { listPendingFeeCharges, listSettlementsForStockist } from '../../../services/settlementService';
import { EmptyState, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function StockistSettlements() {
  const { business } = useBiz();
  const settlements =
    useLiveQuery(() => listSettlementsForStockist(business.id), [business.id]) ?? [];
  const pending =
    useLiveQuery(() => listPendingFeeCharges(business.id), [business.id]) ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="Settlements"
        subtitle="Razorpay collections net of platform commission, bank MDR, and deferred offline fees"
      />

      <div className="card card-pad stack">
        <strong>Pending fee arrears (offline / deferred)</strong>
        {!pending.length ? (
          <EmptyState title="No pending fees" description="Offline charges appear here until the next online settlement." />
        ) : (
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Commission</th>
                <th>Bank fee</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((c) => (
                <tr key={c.id}>
                  <td>{c.source}</td>
                  <td>
                    <Money value={c.commission} />
                  </td>
                  <td>
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
        )}
      </div>

      <div className="card card-pad stack">
        <strong>Settlement advice</strong>
        {!settlements.length ? (
          <EmptyState title="No settlements yet" description="When pharmacies pay via Razorpay, net payouts appear here." />
        ) : (
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>No</th>
                <th>Gross</th>
                <th>Commission</th>
                <th>Bank fee</th>
                <th>Deferred cut</th>
                <th>Net to you</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id}>
                  <td>{s.settlementNo}</td>
                  <td>{formatINR(s.grossAmount)}</td>
                  <td>{formatINR(s.commissionTotal)}</td>
                  <td>{formatINR(s.bankFeeTotal)}</td>
                  <td>{formatINR(s.deferredCollected)}</td>
                  <td>
                    <strong>{formatINR(s.netAmount)}</strong>
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

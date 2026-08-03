import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { pairOutstanding } from '../../../domain/calc';
import { PaginationBar, usePagedRows } from '../../../ui/components/ListToolkit';
import { EmptyState, Kpi, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

export function PharmacyLedger() {
  const { stockistId } = useParams();
  const { business } = useBiz();
  const stockist = useLiveQuery(() => (stockistId ? db.businesses.get(stockistId) : undefined), [stockistId]);
  const invoices =
    useLiveQuery(
      () => (stockistId ? db.invoices.where({ pharmacyId: business.id, stockistId }).toArray() : []),
      [business.id, stockistId],
    ) ?? [];
  const payments =
    useLiveQuery(
      () => (stockistId ? db.payments.where({ pharmacyId: business.id, stockistId }).toArray() : []),
      [business.id, stockistId],
    ) ?? [];
  const creditNotes =
    useLiveQuery(
      () => (stockistId ? db.creditNotes.where({ pharmacyId: business.id, stockistId }).toArray() : []),
      [business.id, stockistId],
    ) ?? [];

  const purchases = invoices.filter((i) => i.status !== 'Void').reduce((s, i) => s + i.grandTotal, 0);
  const paid = payments.filter((p) => p.status === 'Approved').reduce((s, p) => s + p.amount, 0);
  const outstanding = stockistId ? pairOutstanding(invoices, business.id, stockistId) : 0;

  const entries = useMemo(() => {
    type E = { id: string; at: string; label: string; signed: number; meta: string };
    const list: E[] = [];
    for (const i of invoices.filter((x) => x.status !== 'Void')) {
      list.push({
        id: `inv-${i.id}`,
        at: i.issuedAt ?? i.createdAt,
        label: `Invoice ${i.invoiceNo}`,
        signed: i.grandTotal,
        meta: i.status,
      });
    }
    for (const p of payments.filter((x) => x.status === 'Approved')) {
      list.push({
        id: `pay-${p.id}`,
        at: p.reviewedAt ?? p.createdAt,
        label: `Payment ${p.paymentNo}`,
        signed: -p.amount,
        meta: p.method,
      });
    }
    for (const c of creditNotes.filter((x) => x.status !== 'Void')) {
      list.push({
        id: `cn-${c.id}`,
        at: c.issuedAt,
        label: `Credit ${c.creditNoteNo}`,
        signed: -c.amount,
        meta: c.status,
      });
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [invoices, payments, creditNotes]);
  const list = usePagedRows(entries);

  if (!stockistId) {
    return <EmptyState title="Pick a stockist" description="Open ledger from a connection or stockist profile." />;
  }
  if (!stockist) return <EmptyState title="Stockist not found" description="" />;

  return (
    <div className="stack">
      <PageHeader
        title={`Ledger · ${stockist.name}`}
        subtitle="Purchases, payments, credits — outstanding must match invoices"
        actions={
          <Link className="btn btn-secondary btn-sm" to={`/pharmacy/stockists/${stockistId}`}>
            Profile
          </Link>
        }
      />
      <div className="kpi-grid">
        <Kpi label="Purchases" value={<Money value={purchases} />} />
        <Kpi label="Paid" value={<Money value={paid} />} />
        <Kpi label="Outstanding" value={<Money value={outstanding} />} />
      </div>
      {!entries.length ? (
        <EmptyState title="No ledger entries" description="Trade with this stockist to build the ledger." />
      ) : (
        <>
          <div className="table-wrap queue-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Entry</th>
                  <th>Amount</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {list.pageRows.map((e) => (
                  <tr key={e.id}>
                    <td className="muted" data-label="When">
                      {new Date(e.at).toLocaleString()}
                    </td>
                    <td data-label="Entry">{e.label}</td>
                    <td
                      data-label="Amount"
                      style={{ color: e.signed < 0 ? 'var(--success, #166534)' : undefined }}
                    >
                      <Money value={e.signed} />
                    </td>
                    <td data-label="Meta">
                      <StatusBadge status={e.meta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { useUi } from '../../../store/ui';
import { FileLink } from '../../../ui/components/FileUpload';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { EmptyState, Field, Input, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';

function dayKey(iso?: string): string {
  return iso ? iso.slice(0, 10) : '';
}

export function AdminPayments() {
  const { paymentNo } = useParams();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const payments = useLiveQuery(() => db.payments.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  const rows = useMemo(() => {
    return payments
      .filter((p) => {
        const d = dayKey(p.submittedAt ?? p.createdAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .map((p) => ({
        ...p,
        pharmacyName: nameOf(p.pharmacyId),
        stockistName: nameOf(p.stockistId),
      }));
  }, [payments, businesses, from, to]);

  const columns = useMemo(
    () => [
      {
        key: 'paymentNo',
        label: 'Payment',
        getValue: (p: (typeof rows)[0]) => p.paymentNo,
        render: (p: (typeof rows)[0]) => (
          <Link to={`/admin/payments/${encodeURIComponent(p.paymentNo)}`}>{p.paymentNo}</Link>
        ),
      },
      { key: 'pharmacyName', label: 'Pharmacy', getValue: (p: (typeof rows)[0]) => p.pharmacyName },
      { key: 'stockistName', label: 'Stockist', getValue: (p: (typeof rows)[0]) => p.stockistName },
      {
        key: 'status',
        label: 'Status',
        getValue: (p: (typeof rows)[0]) => p.status,
        render: (p: (typeof rows)[0]) => <StatusBadge status={p.status} />,
      },
      {
        key: 'amount',
        label: 'Amount',
        getValue: (p: (typeof rows)[0]) => p.amount,
        render: (p: (typeof rows)[0]) => <Money value={p.amount} />,
      },
      { key: 'method', label: 'Mode', getValue: (p: (typeof rows)[0]) => p.method },
      { key: 'reference', label: 'Reference', getValue: (p: (typeof rows)[0]) => p.reference ?? '' },
    ],
    [],
  );

  const statusOpts = ['Submitted', 'UnderReview', 'Approved', 'Rejected', 'OnHold', 'Cancelled'].map((s) => ({
    value: s,
    label: s,
  }));

  const list = useListControls(rows, {
    columns,
    searchKeys: [(p) => `${p.paymentNo} ${p.reference ?? ''} ${p.status} ${p.pharmacyName} ${p.stockistName}`],
    filters: [{ key: 'status', label: 'Status', options: statusOpts }],
    defaultSortKey: 'paymentNo',
  });

  if (paymentNo) {
    const decoded = decodeURIComponent(paymentNo);
    const payment = payments.find((p) => p.paymentNo === decoded);
    if (!payment) {
      return (
        <div className="stack">
          <PageHeader title="Payment detail" />
          <EmptyState
            title="Payment not found"
            description="Return to the payments monitor."
            action={
              <Link className="btn btn-primary" to="/admin/payments">
                Back to payments
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="stack">
        <PageHeader
          title={payment.paymentNo}
          subtitle={`${nameOf(payment.pharmacyId)} → ${nameOf(payment.stockistId)} · read-only`}
          actions={
            <Link className="btn btn-secondary btn-sm" to="/admin/payments">
              Back to payments
            </Link>
          }
        />
        <div className="row" style={{ gap: 8 }}>
          <StatusBadge status={payment.status} />
          <span className="muted" style={{ fontSize: 13 }}>
            {payment.method} · <Money value={payment.amount} />
            {payment.reference ? ` · ref ${payment.reference}` : ''}
          </span>
        </div>
        <div className="card card-pad stack">
          <strong>Allocations</strong>
          {!payment.allocations.length ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              No invoice allocations.
            </p>
          ) : (
            payment.allocations.map((a) => (
              <div key={a.invoiceId} style={{ fontSize: 13 }}>
                {a.invoiceNo}: <Money value={a.amount} />
              </div>
            ))
          )}
        </div>
        {payment.proofFileId ? (
          <div className="card card-pad stack">
            <strong>Proof</strong>
            <FileLink fileId={payment.proofFileId} />
          </div>
        ) : null}
        {payment.rejectReason || payment.holdReason ? (
          <div className="card card-pad stack">
            {payment.rejectReason ? <div style={{ fontSize: 13 }}>Reject: {payment.rejectReason}</div> : null}
            {payment.holdReason ? <div style={{ fontSize: 13 }}>Hold: {payment.holdReason}</div> : null}
          </div>
        ) : null}
        <div className="card card-pad stack">
          <strong>Status history</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {payment.statusHistory.map((h, i) => (
              <li key={i} className="muted" style={{ fontSize: 13 }}>
                {h.from} → {h.to} · {new Date(h.at).toLocaleString()}
                {h.reason ? ` · ${h.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Platform payments monitor" subtitle="Read-only — counterparty names + date filter" />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <ListToolbar
        query={list.query}
        onQuery={list.setQuery}
        placeholder="Search payment / pharmacy / stockist / reference"
        filters={[{ key: 'status', label: 'Status', options: statusOpts }]}
        filterValues={list.filterValues}
        onFilter={list.setFilter}
        onExport={() => {
          list.doExport('platform-payments.csv');
          pushToast({ tone: 'success', title: 'Exported payments' });
        }}
      />
      {!rows.length ? (
        <EmptyState title="No payments" description="Payments appear after pharmacies submit remittances." />
      ) : (
        <>
          <DataListTable
            columns={columns}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(p) => navigate(`/admin/payments/${encodeURIComponent(p.paymentNo)}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

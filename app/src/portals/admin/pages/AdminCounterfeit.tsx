import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import {
  addCounterfeitNote,
  dismissCounterfeitReport,
  issueCounterfeitRecall,
  resolveCounterfeitReport,
  startCounterfeitInvestigation,
} from '../../../services/counterfeitService';
import { useUi } from '../../../store/ui';
import { useBusyAction } from '../../../ui/hooks/useBusyAction';
import { useLiveArray } from '../../../ui/hooks/useLiveArray';
import { usePersistedPageSize } from '../../../ui/hooks/usePersistedPageSize';
import { ConfirmDialog } from '../../../ui/components/ConfirmDialog';
import { FileLink } from '../../../ui/components/FileUpload';
import { DataListTable, ListToolbar, PaginationBar, useListControls, useTableSectionRef } from '../../../ui/components/ListToolkit'
import {
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  Textarea,
} from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

const STATUS_OPTS = ['Reported', 'Investigating', 'RecallIssued', 'Dismissed', 'Resolved'].map((s) => ({
  value: s,
  label: s,
}));

export function AdminCounterfeit() {
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const { pageSize, setPageSize } = usePersistedPageSize('admin-counterfeit');
  const tableRef = useTableSectionRef();
  const { busy, run } = useBusyAction();
  const { items: reports, loading } = useLiveArray(() => db.counterfeitReports.toArray());
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const batches = useLiveQuery(() => db.batches.toArray()) ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [dismissReason, setDismissReason] = useState('');
  const [dismissError, setDismissError] = useState<string | undefined>();
  const [recallOpen, setRecallOpen] = useState(false);

  const orders = useLiveQuery(() => db.orders.toArray()) ?? [];

  const nameOf = (id?: string) => (id ? businesses.find((b) => b.id === id)?.name ?? id.slice(0, 8) : '—');
  const productName = (id?: string) => (id ? products.find((p) => p.id === id)?.name ?? id.slice(0, 8) : '—');
  const batchNo = (id?: string) => (id ? batches.find((b) => b.id === id)?.batchNumber ?? id.slice(0, 8) : '—');

  const rows = useMemo(
    () =>
      [...reports]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          ...r,
          reportLabel: r.reportNo ?? r.id.slice(0, 8),
          reporterName: nameOf(r.reporterBusinessId),
          productLabel: productName(r.productId),
          batchLabel: batchNo(r.batchId),
          sellerName: r.sellerBusinessId ? nameOf(r.sellerBusinessId) : '—',
        })),
    [reports, businesses, products, batches],
  );

  const columns = useMemo(
    () => [
      { key: 'reportLabel', label: 'Report', getValue: (r: (typeof rows)[0]) => r.reportLabel },
      {
        key: 'status',
        label: 'Status',
        getValue: (r: (typeof rows)[0]) => r.status,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.status} />,
      },
      { key: 'reporterName', label: 'Reporter', getValue: (r: (typeof rows)[0]) => r.reporterName },
      { key: 'productLabel', label: 'Product', getValue: (r: (typeof rows)[0]) => r.productLabel },
      { key: 'batchLabel', label: 'Batch', getValue: (r: (typeof rows)[0]) => r.batchLabel },
      { key: 'sellerName', label: 'Seller', getValue: (r: (typeof rows)[0]) => r.sellerName },
      {
        key: 'createdAt',
        label: 'Filed',
        getValue: (r: (typeof rows)[0]) => r.createdAt,
        render: (r: (typeof rows)[0]) => (
          <span className="muted">{new Date(r.createdAt).toLocaleString()}</span>
        ),
      },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [
      (r) =>
        `${r.reportLabel} ${r.reporterName} ${r.productLabel} ${r.batchLabel} ${r.sellerName} ${r.status} ${r.description}`,
    ],
    filters: [{ key: 'status', label: 'Status', options: STATUS_OPTS }],
    defaultSortKey: 'createdAt',
    defaultSortDir: 'desc',
    pageSize,
    onPageSizeChange: setPageSize,
  });

  const selected = selectedId ? rows.find((r) => r.id === selectedId) : undefined;

  const recallImpact = useMemo(() => {
    if (!selected?.batchId) return { holders: 0, units: 0, openOrders: 0 };
    const batch = batches.find((b) => b.id === selected.batchId);
    const pharmacyIds = new Set<string>();
    let networkUnits = batch?.onHand ?? 0;
    let openOrders = 0;
    const openStatuses = new Set(['Accepted', 'PartiallyAccepted', 'Allocated', 'Packed']);
    for (const o of orders) {
      let orderHasBatch = false;
      for (const line of o.lines) {
        for (const a of line.batchAllocations ?? []) {
          if (a.batchId !== selected.batchId) continue;
          orderHasBatch = true;
          networkUnits += a.qty;
        }
      }
      if (!orderHasBatch) continue;
      pharmacyIds.add(o.pharmacyId);
      if (openStatuses.has(o.status)) openOrders += 1;
    }
    const holders = (batch?.stockistId ? 1 : 0) + pharmacyIds.size;
    return { holders, units: networkUnits, openOrders };
  }, [selected, batches, orders]);

  const act = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>, okTitle: string) =>
    void run(async () => {
      const res = await fn();
      if (!res.ok) {
        pushToast({ tone: 'error', title: res.message });
        return;
      }
      pushToast({ tone: 'success', title: okTitle });
      setNote('');
      setDismissReason('');
      setDismissError(undefined);
    });

  return (
    <div className="stack">
      <PageHeader title="Counterfeit management" subtitle="Investigate reports → recall batches → resolve" />

      <ConfirmDialog
        open={recallOpen && !!selected}
        title="Issue network recall?"
        tone="danger"
        confirmLabel="Issue recall"
        requireReason
        reasonLabel="Recall reason"
        body={
          selected ? (
            <div className="stack" style={{ fontSize: 13 }}>
              <p style={{ margin: 0 }}>
                This quarantines batch <strong>{selected.batchLabel}</strong> (
                <strong>{selected.productLabel}</strong>) across the network.
              </p>
              <p style={{ margin: 0 }}>
                Impact estimate: <strong>{recallImpact.holders}</strong> holder business(es),{' '}
                <strong>{recallImpact.units}</strong> units exposed (on hand + allocated),{' '}
                <strong>{recallImpact.openOrders}</strong> open order(s) to adjust.
              </p>
            </div>
          ) : null
        }
        onClose={() => setRecallOpen(false)}
        onConfirm={(recallReason) =>
          void run(async () => {
            const res = await issueCounterfeitRecall({
              actor: user,
              platform: business,
              id: selected!.id,
              note: [note, recallReason].filter(Boolean).join(' — ') || recallReason,
            });
            if (!res.ok) {
              pushToast({ tone: 'error', title: res.message });
              return;
            }
            setRecallOpen(false);
            setNote('');
            const n = res.data.flaggedOrderIds.length;
            pushToast({
              tone: 'success',
              title: 'Recall issued',
              message: n ? `${n} open order(s) adjusted` : undefined,
            });
          })
        }
      />

      {loading ? (
        <LoadingState label="Loading reports…" />
      ) : !rows.length ? (
        <EmptyState title="No counterfeit reports" description="Reports filed by pharmacies or stockists appear here." />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search report / product / batch / party"
            filters={[{ key: 'status', label: 'Status', options: STATUS_OPTS }]}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              list.doExport('counterfeit-reports.csv');
              pushToast({ tone: 'success', title: 'Exported reports' });
            }}
          />
          <DataListTable
            stickyHeader
            scrollBody
            tableSectionRef={tableRef}
            columns={columns}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(r) => {
              setSelectedId(r.id);
              setNote('');
              setDismissReason('');
              setDismissError(undefined);
            }}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSizeChange={setPageSize}
            stickyFooter
            tableSectionRef={tableRef}
          />
        </>
      )}

      <Modal
        open={!!selected}
        title={selected ? `${selected.reportLabel} · ${selected.status}` : 'Report'}
        onClose={() => setSelectedId(null)}
        footer={
          <Button variant="secondary" onClick={() => setSelectedId(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <StatusBadge status={selected.status} />
              <span className="muted" style={{ fontSize: 12 }}>
                {new Date(selected.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              Reporter:{' '}
              <Link to={`/admin/network/${selected.reporterBusinessId}`}>{selected.reporterName}</Link>
            </div>
            <div>
              Product: {selected.productLabel} · Batch: {selected.batchLabel}
              {selected.sellerBusinessId ? (
                <>
                  {' '}
                  · Seller:{' '}
                  <Link to={`/admin/network/${selected.sellerBusinessId}`}>{selected.sellerName}</Link>
                </>
              ) : null}
            </div>
            <p style={{ margin: 0 }}>{selected.description}</p>
            {selected.linkedReportId ? (
              <p className="muted">Linked to investigation {selected.linkedReportId.slice(0, 8)}</p>
            ) : null}
            {selected.evidenceFileIds?.map((fid) => (
              <FileLink key={fid} fileId={fid} />
            ))}
            {selected.internalNotes.length ? (
              <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {selected.internalNotes.join('\n')}
              </div>
            ) : null}
            {selected.decisionReason ? <p className="muted">Decision: {selected.decisionReason}</p> : null}

            {selected.status === 'Reported' ? (
              <div className="stack">
                <Field label="Investigation note (optional)">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(
                      async () =>
                        startCounterfeitInvestigation({
                          actor: user,
                          platform: business,
                          id: selected.id,
                          note,
                        }),
                      'Investigation started',
                    )
                  }
                >
                  Investigate
                </Button>
              </div>
            ) : null}

            {selected.status === 'Investigating' ? (
              <div className="stack">
                <Field label="Internal note">
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="row gap">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        async () =>
                          addCounterfeitNote({ actor: user, platform: business, id: selected.id, note }),
                        'Note added',
                      )
                    }
                  >
                    Add note
                  </Button>
                  <Button disabled={busy || !selected.batchId} onClick={() => setRecallOpen(true)}>
                    Issue recall
                  </Button>
                </div>
                <Field label="Dismiss reason *" error={dismissError}>
                  <Input
                    value={dismissReason}
                    onChange={(e) => {
                      setDismissReason(e.target.value);
                      setDismissError(undefined);
                    }}
                    placeholder="Required to dismiss"
                  />
                </Field>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (!dismissReason.trim()) {
                      setDismissError('Reason is required');
                      return;
                    }
                    act(
                      async () =>
                        dismissCounterfeitReport({
                          actor: user,
                          platform: business,
                          id: selected.id,
                          reason: dismissReason.trim(),
                        }),
                      'Dismissed',
                    );
                  }}
                >
                  Dismiss
                </Button>
              </div>
            ) : null}

            {selected.status === 'RecallIssued' ? (
              <div className="stack">
                <Field label="Internal / resolution note">
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="row gap">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        async () =>
                          addCounterfeitNote({ actor: user, platform: business, id: selected.id, note }),
                        'Note added',
                      )
                    }
                  >
                    Add note
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(
                        async () =>
                          resolveCounterfeitReport({
                            actor: user,
                            platform: business,
                            id: selected.id,
                            note,
                          }),
                        'Resolved',
                      )
                    }
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { VerificationDocument } from '../../../domain/entities/types';
import { db } from '../../../data/db';
import { adminReviewVerification } from '../../../services/verificationService';
import { useUi } from '../../../store/ui';
import { FileLink } from '../../../ui/components/FileUpload';
import { DataListTable, ListToolbar, PaginationBar, useListControls } from '../../../ui/components/ListToolkit';
import { Button, EmptyState, Field, Input, PageHeader, StatusBadge, Textarea } from '../../../ui/components/primitives';
import { useBiz } from './useBiz';

function daysPending(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function AdminVerifications() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { business, user } = useBiz();
  const { pushToast } = useUi();
  const navigate = useNavigate();
  const statusFromUrl = searchParams.get('status') ?? undefined;
  const verifications = useLiveQuery(() => db.verifications.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  /** Per-verification business-visible reason (BUG-7: never share one note across cards). */
  const [reasons, setReasons] = useState<Record<string, string>>({});
  /** Per-verification admin-only internal notes. */
  const [internal, setInternal] = useState<Record<string, string>>({});

  const rows = useMemo(
    () =>
      verifications
        .filter((v) => ['Submitted', 'UnderReview', 'DocumentsRequested', 'Rejected'].includes(v.status))
        .map((v) => {
          const biz = businesses.find((b) => b.id === v.businessId);
          return {
            ...v,
            businessName: biz?.name ?? v.businessId.slice(0, 8),
            businessType: biz?.type ?? '—',
            gstNumber: biz?.gstNumber ?? '—',
            drugLicenseNumber: biz?.drugLicenseNumber ?? '—',
            days: daysPending(v.submittedAt ?? v.createdAt),
            docCount: v.documents?.length ?? v.documentIds?.length ?? 0,
          };
        }),
    [verifications, businesses],
  );

  const columns = useMemo(
    () => [
      {
        key: 'businessName',
        label: 'Business',
        getValue: (r: (typeof rows)[0]) => r.businessName,
        render: (r: (typeof rows)[0]) => <Link to={`/admin/verifications/${r.id}`}>{r.businessName}</Link>,
      },
      { key: 'businessType', label: 'Type', getValue: (r: (typeof rows)[0]) => r.businessType },
      {
        key: 'status',
        label: 'Status',
        getValue: (r: (typeof rows)[0]) => r.status,
        render: (r: (typeof rows)[0]) => <StatusBadge status={r.status} />,
      },
      { key: 'days', label: 'Days pending', getValue: (r: (typeof rows)[0]) => r.days },
      { key: 'docCount', label: 'Docs', getValue: (r: (typeof rows)[0]) => r.docCount },
      { key: 'gstNumber', label: 'GSTIN', getValue: (r: (typeof rows)[0]) => r.gstNumber },
    ],
    [],
  );

  const filterDefs = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        options: ['Submitted', 'UnderReview', 'DocumentsRequested', 'Rejected'].map((s) => ({ value: s, label: s })),
      },
      {
        key: 'businessType',
        label: 'Type',
        options: ['Pharmacy', 'Stockist'].map((s) => ({ value: s, label: s })),
      },
    ],
    [],
  );

  const list = useListControls(rows, {
    columns,
    searchKeys: [(r) => `${r.businessName} ${r.gstNumber} ${r.drugLicenseNumber} ${r.status}`],
    filters: filterDefs,
    defaultSortKey: 'days',
    defaultSortDir: 'desc',
    initialFilters: statusFromUrl ? { status: statusFromUrl } : undefined,
  });

  const detail = id ? verifications.find((v) => v.id === id) : undefined;
  const detailBiz = detail ? businesses.find((b) => b.id === detail.businessId) : undefined;
  const detailDocs: VerificationDocument[] =
    detail?.documents?.length
      ? detail.documents
      : (detail?.documentIds ?? []).map((fid) => ({
          fileId: fid,
          label: 'Document',
          kind: 'DrugLicense',
        }));

  const decide = async (
    verificationId: string,
    decision: 'UnderReview' | 'Approved' | 'Rejected' | 'DocumentsRequested',
  ) => {
    const reason = (reasons[verificationId] ?? '').trim();
    if ((decision === 'Rejected' || decision === 'DocumentsRequested') && !reason) {
      pushToast({ tone: 'error', title: 'Business-visible reason is required' });
      return;
    }
    const res = await adminReviewVerification({
      actor: user,
      business,
      verificationId,
      decision,
      reason: reason || undefined,
      note: reason || undefined,
      internalNotes: (internal[verificationId] ?? '').trim() || undefined,
    });
    pushToast(
      res.ok
        ? { tone: decision === 'Approved' ? 'success' : 'info', title: decision === 'UnderReview' ? 'Marked under review' : decision }
        : { tone: 'error', title: res.message },
    );
    if (res.ok && decision === 'Approved') navigate('/admin/verifications');
  };

  if (id) {
    if (!detail || !detailBiz) {
      return (
        <div className="stack">
          <PageHeader title="Verification detail" />
          <EmptyState
            title="Verification not found"
            description="Return to the queue."
            action={
              <Link className="btn btn-primary" to="/admin/verifications">
                Back to queue
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="stack">
        <PageHeader
          title={detailBiz.name}
          subtitle={`${detailBiz.type} · ${detail.status} · ${daysPending(detail.submittedAt ?? detail.createdAt)} days pending`}
          actions={
            <Link className="btn btn-secondary btn-sm" to="/admin/verifications">
              Back to queue
            </Link>
          }
        />
        <div className="card card-pad stack">
          <strong>Profile</strong>
          <div style={{ fontSize: 13 }}>
            GST {detailBiz.gstNumber} · DL {detailBiz.drugLicenseNumber}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {detailBiz.address}, {detailBiz.city}, {detailBiz.state} {detailBiz.pincode}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {detailBiz.phone} · {detailBiz.email}
          </div>
        </div>
        <div className="card card-pad stack">
          <strong>Submitted documents</strong>
          {!detailDocs.length ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              No documents uploaded.
            </p>
          ) : (
            detailDocs.map((d) => (
              <div key={d.fileId} style={{ fontSize: 13 }}>
                <strong>{d.label}</strong>
                {d.licenseNumber ? <span className="muted"> · {d.licenseNumber}</span> : null}
                <div>
                  <FileLink fileId={d.fileId} />
                </div>
              </div>
            ))
          )}
        </div>
        <div className="card card-pad stack">
          <Field label="Business-visible reason (required for Reject / Request docs)">
            <Input
              value={reasons[detail.id] ?? ''}
              onChange={(e) => setReasons((m) => ({ ...m, [detail.id]: e.target.value }))}
              placeholder="Shown to the business"
            />
          </Field>
          <Field label="Internal notes (admin only — never shown to business)">
            <Textarea
              value={internal[detail.id] ?? detail.internalNotes ?? ''}
              onChange={(e) => setInternal((m) => ({ ...m, [detail.id]: e.target.value }))}
              rows={3}
            />
          </Field>
          <div className="row">
            {detail.status === 'Submitted' ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => void decide(detail.id, 'UnderReview')}>
                  Start review
                </Button>
                <Button size="sm" variant="danger" onClick={() => void decide(detail.id, 'Rejected')}>
                  Reject
                </Button>
              </>
            ) : null}
            {detail.status === 'UnderReview' ? (
              <>
                <Button size="sm" onClick={() => void decide(detail.id, 'Approved')}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void decide(detail.id, 'DocumentsRequested')}>
                  Request docs
                </Button>
                <Button size="sm" variant="danger" onClick={() => void decide(detail.id, 'Rejected')}>
                  Reject
                </Button>
              </>
            ) : null}
            {detail.status === 'DocumentsRequested' ? (
              <Button size="sm" variant="danger" onClick={() => void decide(detail.id, 'Rejected')}>
                Reject
              </Button>
            ) : null}
            {detail.status === 'Rejected' ? (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Waiting for business resubmission.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Verification queue" subtitle="Search, filter, Days pending, export — open a row to review documents" />
      {!rows.length ? (
        <EmptyState title="Queue clear" description="No businesses awaiting verification." />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            placeholder="Search business / GST / DL / status"
            filters={filterDefs}
            filterValues={list.filterValues}
            onFilter={list.setFilter}
            onExport={() => {
              const ok = list.doExport('admin-verifications.csv');
              pushToast(ok ? { tone: 'success', title: 'Exported queue' } : { tone: 'error', title: 'Export denied' });
            }}
          />
          <DataListTable
            columns={columns}
            rows={list.pageRows}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={list.toggleSort}
            onRowClick={(r) => navigate(`/admin/verifications/${r.id}`)}
          />
          <PaginationBar page={list.page} pageCount={list.pageCount} total={list.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { AnnouncementStrip } from '../../../ui/components/AnnouncementStrip';
import { BannerStrip } from '../../../ui/components/BannerStrip';
import { Kpi, Money, PageHeader, StatusBadge } from '../../../ui/components/primitives';

function daysPending(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/** Issued invoices only — exclude Draft/Void (AD-19). */
function isIssuedInvoice(status: string): boolean {
  return status !== 'Draft' && status !== 'Void';
}

export function AdminHome() {
  const verifications = useLiveQuery(() => db.verifications.toArray()) ?? [];
  const businesses = useLiveQuery(() => db.businesses.toArray()) ?? [];
  const tickets = useLiveQuery(() => db.supportTickets.toArray()) ?? [];
  const connections = useLiveQuery(() => db.connections.where('status').equals('Active').toArray()) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray()) ?? [];

  const pendingVer = verifications.filter((v) => ['Submitted', 'UnderReview'].includes(v.status));
  const docsRequested = verifications.filter((v) => v.status === 'DocumentsRequested');
  const suspended = businesses.filter((b) => b.type !== 'Platform' && b.accountStatus === 'Suspended');
  const openTickets = tickets.filter((t) => ['Open', 'InProgress', 'Reopened'].includes(t.status));
  const waitingOnRequester = tickets.filter((t) => t.status === 'WaitingOnUser');
  const activeBiz = businesses.filter((b) => b.type !== 'Platform' && b.accountStatus === 'Active');
  const gmv = invoices.filter((i) => isIssuedInvoice(i.status)).reduce((s, i) => s + i.grandTotal, 0);
  const payments = useLiveQuery(() => db.payments.toArray()) ?? [];

  const dupGst = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of businesses.filter((x) => x.type !== 'Platform' && x.gstNumber)) {
      const g = (b.gstNumber ?? '').toUpperCase();
      map.set(g, [...(map.get(g) ?? []), b.name]);
    }
    return [...map.entries()].filter(([, names]) => names.length > 1);
  }, [businesses]);

  const dupPayRefs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of payments) {
      const ref = (p.reference ?? '').trim().toUpperCase();
      if (!ref) continue;
      map.set(ref, [...(map.get(ref) ?? []), p.paymentNo]);
    }
    return [...map.entries()].filter(([, nos]) => nos.length > 1);
  }, [payments]);

  const pendingRows = [...pendingVer, ...docsRequested]
    .map((v) => {
      const biz = businesses.find((b) => b.id === v.businessId);
      return {
        ...v,
        businessName: biz?.name ?? v.businessId.slice(0, 8),
        businessType: biz?.type ?? '—',
        days: daysPending(v.submittedAt ?? v.createdAt),
      };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);

  return (
    <div className="stack">
      <PageHeader title="Platform home" subtitle="Verification, governance, support — click a KPI to drill down" />
      <BannerStrip placement="Admin Home" />
      <AnnouncementStrip audience="Admin" placement="Admin Home" archivePath="/admin/announcements-archive" />
      <div className="card card-pad stack">
        <strong>Today&apos;s work</strong>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-secondary btn-sm" to="/admin/verifications">
            Approvals ({pendingVer.length})
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/admin/payments">
            Settlements
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/admin/suspensions">
            Suspensions ({suspended.length})
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/admin/counterfeit">
            Counterfeit
          </Link>
        </div>
      </div>
      <div className="card card-pad stack">
        <strong>Quick actions</strong>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-primary btn-sm" to="/admin/verifications">
            Review verification
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/admin/announcements">
            Post announcement
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/admin/support">
            Open tickets ({openTickets.length})
          </Link>
        </div>
      </div>
      <div className="kpi-grid">
        <Link to="/admin/verifications" className="kpi-link">
          <Kpi label="Pending verifications" value={pendingVer.length} sub="Submitted / Under review" />
        </Link>
        <Link to="/admin/verifications?status=DocumentsRequested" className="kpi-link">
          <Kpi label="Documents requested" value={docsRequested.length} sub="Waiting on business docs" />
        </Link>
        <Link to="/admin/support?status=WaitingOnUser" className="kpi-link">
          <Kpi label="Waiting on requester" value={waitingOnRequester.length} sub="Support tickets" />
        </Link>
        <Link to="/admin/suspensions" className="kpi-link">
          <Kpi label="Suspended" value={suspended.length} />
        </Link>
        <Link to="/admin/support" className="kpi-link">
          <Kpi label="Open tickets" value={openTickets.length} />
        </Link>
        <Link to="/admin/network" className="kpi-link">
          <Kpi label="Active businesses" value={activeBiz.length} />
        </Link>
        <Link to="/admin/network" className="kpi-link">
          <Kpi label="Active connections" value={connections.length} />
        </Link>
        <Link to="/admin/orders" className="kpi-link">
          <Kpi label="Platform GMV" value={<Money value={gmv} />} sub="Σ non-void issued invoices" />
        </Link>
      </div>

      <div className="card card-pad stack">
        <strong>Suspicious activity</strong>
        <div style={{ fontSize: 13 }}>
          Duplicate GST candidates: <strong>{dupGst.length}</strong>
          {dupGst.length ? (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {dupGst.slice(0, 5).map(([gst, names]) => (
                <li key={gst}>
                  {gst}: {names.join(' · ')}
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted"> — none</span>
          )}
        </div>
        <div style={{ fontSize: 13 }}>
          Duplicate payment references: <strong>{dupPayRefs.length}</strong>
          {dupPayRefs.length ? (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {dupPayRefs.slice(0, 5).map(([ref, nos]) => (
                <li key={ref}>
                  {ref}: {nos.join(', ')}
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted"> — none</span>
          )}
        </div>
        <Link className="btn btn-ghost btn-sm" to="/admin/payments">
          Open payments monitor
        </Link>
      </div>

      <div className="card card-pad stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Pending verifications</strong>
          <Link className="btn btn-ghost btn-sm" to="/admin/verifications">
            Open queue
          </Link>
        </div>
        {!pendingRows.length ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Queue clear — no businesses awaiting review.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Days</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((v) => (
                  <tr key={v.id}>
                    <td>{v.businessName}</td>
                    <td>{v.businessType}</td>
                    <td>
                      <StatusBadge status={v.status} />
                    </td>
                    <td>{v.days}</td>
                    <td>
                      <Link className="btn btn-secondary btn-sm" to={`/admin/verifications/${v.id}`}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

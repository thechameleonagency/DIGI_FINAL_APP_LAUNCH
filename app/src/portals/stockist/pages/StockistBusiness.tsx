import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../data/db';
import { BusinessProfileEditor } from '../../../ui/components/BusinessProfileEditor';
import { useBiz } from './useBiz';

/** ST-11 + ST-52: business profile + verification resubmit entry. */
export function StockistBusiness() {
  const { business, user } = useBiz();
  const verification = useLiveQuery(
    () => db.verifications.where('businessId').equals(business.id).reverse().sortBy('updatedAt'),
    [business.id],
  )?.[0];
  const needsResubmit =
    business.verificationStatus === 'DocumentsRequested' || business.verificationStatus === 'Rejected';

  return (
    <div className="stack">
      {needsResubmit ? (
        <div className={`banner-strip ${business.verificationStatus === 'Rejected' ? 'danger' : 'warning'}`}>
          <div>
            {business.verificationStatus === 'Rejected'
              ? `Verification rejected${verification?.rejectReason ? `: ${verification.rejectReason}` : ''}`
              : `Documents requested${verification?.requestDocsNote ? `: ${verification.requestDocsNote}` : ''}`}
          </div>
          <div style={{ marginTop: 8 }}>
            <Link className="btn btn-primary btn-sm" to="/auth/pending">
              Re-upload & resubmit
            </Link>
          </div>
        </div>
      ) : null}
      <BusinessProfileEditor actor={user} business={business} />
    </div>
  );
}

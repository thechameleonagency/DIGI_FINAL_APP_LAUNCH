import { Link } from 'react-router-dom';
import { BusinessProfileEditor } from '../../../ui/components/BusinessProfileEditor';
import { useBiz } from './useBiz';

export function PharmacyBusiness() {
  const { business, user } = useBiz();
  const needsResubmit =
    business.verificationStatus === 'DocumentsRequested' || business.verificationStatus === 'Rejected';

  return (
    <div className="stack">
      {needsResubmit ? (
        <div className={`banner-strip ${business.verificationStatus === 'Rejected' ? 'danger' : 'warning'}`}>
          Verification needs attention.{' '}
          <Link to="/auth/pending">Open verification workspace</Link>
        </div>
      ) : null}
      <BusinessProfileEditor business={business} actor={user} />
    </div>
  );
}

import { useParams } from 'react-router-dom';
import { ReturnDetail } from '../../../ui/components/ReturnDetail';
import { EmptyState, PageHeader } from '../../../ui/components/primitives';

export function AdminReturnDetail() {
  const { returnNo } = useParams();
  if (!returnNo) {
    return (
      <div className="stack">
        <PageHeader title="Return detail" />
        <EmptyState title="Missing return" description="" />
      </div>
    );
  }
  return <ReturnDetail returnNo={returnNo} portal="admin" listPath="/admin/trade?tab=Returns" />;
}

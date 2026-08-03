import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../../../ui/components/primitives';
import { PharmacyComparePanel } from './PharmacyComparePanel';

export function PharmacyCompare() {
  const [params] = useSearchParams();
  const productId = params.get('productId') ?? '';

  if (!productId) {
    return (
      <div className="stack">
        <PageHeader title="Compare prices" backTo="/pharmacy/buy" backLabel="Back to buy" />
        <EmptyState
          title="Pick a product to compare"
          description="Open a product detail and choose Compare prices."
          action={
            <Link className="btn btn-primary" to="/pharmacy/buy">
              Browse
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Compare prices"
        backTo={`/pharmacy/product/${productId}`}
        backLabel="Back to product"
      />
      <PharmacyComparePanel productId={productId} />
    </div>
  );
}

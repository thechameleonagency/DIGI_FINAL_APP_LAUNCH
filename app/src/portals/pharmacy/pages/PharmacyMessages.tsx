import { MessagesPanel } from '../../../ui/components/MessagesPanel';
import { useBiz } from './useBiz';

export function PharmacyMessages() {
  const { business, user } = useBiz();
  return (
    <MessagesPanel
      actor={user}
      business={business}
      counterpartLabel="Stockist"
      ordersBasePath="/pharmacy/orders"
    />
  );
}

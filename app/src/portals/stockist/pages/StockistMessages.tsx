import { MessagesPanel } from '../../../ui/components/MessagesPanel';
import { useBiz } from './useBiz';

export function StockistMessages() {
  const { business, user } = useBiz();
  return (
    <MessagesPanel
      actor={user}
      business={business}
      counterpartLabel="Pharmacy"
      ordersBasePath="/stockist/orders"
    />
  );
}

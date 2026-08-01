import { TicketPanel } from '../../../ui/components/TicketPanel';
import { useBiz } from './useBiz';

export function StockistSupport() {
  const { business, user } = useBiz();
  return <TicketPanel actor={user} business={business} basePath="/stockist/support" homePath="/stockist" />;
}

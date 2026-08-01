import { TicketPanel } from '../../../ui/components/TicketPanel';
import { useBiz } from './useBiz';

export function PharmacySupport() {
  const { business, user } = useBiz();
  return <TicketPanel actor={user} business={business} basePath="/pharmacy/support" homePath="/pharmacy" />;
}

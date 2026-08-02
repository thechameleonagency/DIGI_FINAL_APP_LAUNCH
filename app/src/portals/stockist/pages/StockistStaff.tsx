import { StaffManager } from '../../../ui/components/StaffManager';
import { useBiz } from './useBiz';

export function StockistStaff() {
  const { business, user } = useBiz();
  return <StaffManager actor={user} business={business} roleOptions={['DeliveryStaff']} />;
}

import type { OperationalRole } from '../../../domain/entities/types';
import { StaffManager } from '../../../ui/components/StaffManager';
import { useBiz } from './useBiz';

/** Platform staff: SupportManager invites only (first SuperAdmin via /auth/setup when empty). */
export function AdminStaff() {
  const { business, user } = useBiz();
  const roles: OperationalRole[] = ['SupportManager'];
  return <StaffManager actor={user} business={business} roleOptions={roles} />;
}

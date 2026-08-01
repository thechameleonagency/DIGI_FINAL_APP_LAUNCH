import type { OperationalRole } from '../../../domain/entities/types';
import { StaffManager } from '../../../ui/components/StaffManager';
import { useBiz } from './useBiz';

/** Platform staff: invite SupportAgent / Admin (SuperAdmin only for Admin). */
export function AdminStaff() {
  const { business, user } = useBiz();
  const roles: OperationalRole[] =
    user.role === 'SuperAdmin' ? ['SupportAgent', 'Admin'] : ['SupportAgent'];
  return <StaffManager actor={user} business={business} roleOptions={roles} />;
}

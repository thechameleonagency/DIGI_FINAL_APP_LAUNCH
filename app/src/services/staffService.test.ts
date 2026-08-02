import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { changeRole, setPermissionOverrides, suspendStaff } from './staffService';

describe('staffService (T-1)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('primary can change staff role to DeliveryStaff', async () => {
    const owner = await makeActor({ id: 'owner', businessId: 'biz-p', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-p', type: 'Pharmacy', ownerUserId: owner.id });
    const staff = await makeActor({ id: 'staff', businessId: biz.id, role: 'DeliveryStaff' });
    const res = await changeRole({ actor: owner, business: biz, userId: staff.id, role: 'DeliveryStaff' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.role).toBe('DeliveryStaff');
  });

  it('cannot demote primary via changeRole', async () => {
    const owner = await makeActor({ id: 'owner2', businessId: 'biz-p2', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-p2', type: 'Pharmacy', ownerUserId: owner.id });
    const res = await changeRole({ actor: owner, business: biz, userId: owner.id, role: 'DeliveryStaff' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('PRIMARY_ROLE');
  });

  it('suspend staff sets Suspended', async () => {
    const owner = await makeActor({ id: 'owner3', businessId: 'biz-p3', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-p3', type: 'Pharmacy', ownerUserId: owner.id });
    const staff = await makeActor({ id: 'staff3', businessId: biz.id, role: 'DeliveryStaff' });
    const res = await suspendStaff({ actor: owner, business: biz, userId: staff.id, reason: 'test' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe('Suspended');
  });

  it('permission overrides persist', async () => {
    const owner = await makeActor({ id: 'owner4', businessId: 'biz-p4', role: 'Pharmacist' });
    const biz = await makeBusiness({ id: 'biz-p4', type: 'Pharmacy', ownerUserId: owner.id });
    const staff = await makeActor({ id: 'staff4', businessId: biz.id, role: 'DeliveryStaff' });
    const res = await setPermissionOverrides({
      actor: owner,
      business: biz,
      userId: staff.id,
      overrides: { 'order.place': false },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.permissionOverrides?.['order.place']).toBe(false);
  });
});

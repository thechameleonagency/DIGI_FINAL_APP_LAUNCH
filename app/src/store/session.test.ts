import { beforeEach, describe, expect, it } from 'vitest';
import { assertCan } from '../services/authService';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { isSessionExpired, SESSION_TTL_MS, useSession } from './session';

describe('session TTL', () => {
  it('expires after SESSION_TTL_MS from issuedAt', () => {
    const issuedAt = Date.now() - SESSION_TTL_MS - 1;
    expect(isSessionExpired(issuedAt)).toBe(true);
    expect(isSessionExpired(Date.now())).toBe(false);
  });
});

describe('role preview (CF-34)', () => {
  beforeEach(async () => {
    await clearDb();
    useSession.setState({
      user: null,
      business: null,
      hydrated: true,
      impersonation: null,
      rolePreview: null,
    });
  });

  it('trims UI can() to preview role while assertCan stays Owner', async () => {
    const owner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    const biz = await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id });
    // Avoid setSession (needs sessionStorage); hydrate store directly.
    useSession.setState({ user: owner, business: biz, rolePreview: null });
    expect(useSession.getState().can('sale.record')).toBe(true);

    useSession.getState().setRolePreview('Accountant');
    expect(useSession.getState().can('sale.record')).toBe(false);
    expect(useSession.getState().can('sale.view')).toBe(true);
    // Mutations still authorised as real Owner
    expect(assertCan(owner, biz, 'sale.record').allow).toBe(true);
    expect(useSession.getState().user?.role).toBe('Owner');
  });
});

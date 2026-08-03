import { acceptInvite, createFirstSuperAdmin, inviteStaff } from '../../../services/authService';
import { assertOk } from '../assert';
import { CAST, DEMO_PASSWORD } from '../cast';
import { getWorldCtx } from '../context';
import { registerSeedAccount } from '../registry';

/** Phase 1 — Platform bootstrap: SuperAdmin + SupportManager invite/accept. */
export async function seedPlatformPhase(): Promise<void> {
  const created = assertOk(
    '01-platform.createFirstSuperAdmin',
    await createFirstSuperAdmin({
      name: CAST.superAdmin.name,
      email: CAST.superAdmin.email,
      phone: CAST.superAdmin.phone,
      password: DEMO_PASSWORD,
    }),
  );

  const ctx = getWorldCtx();
  ctx.adminUser = created.data.user;
  ctx.adminBusiness = created.data.business;

  registerSeedAccount({
    email: CAST.superAdmin.email,
    name: CAST.superAdmin.name,
    role: 'SuperAdmin',
    portal: 'admin',
    businessName: 'DigiSwasthya Platform',
  });

  const invited = assertOk(
    '01-platform.inviteSupportManager',
    await inviteStaff({
      actor: created.data.user,
      business: created.data.business,
      name: CAST.supportManager.name,
      email: CAST.supportManager.email,
      phone: CAST.supportManager.phone,
      role: 'SupportManager',
    }),
  );

  const token = invited.data.inviteToken;
  if (!token) {
    throw new Error('[worldSeed:01-platform.acceptSupportManager] inviteToken missing after invite');
  }

  const accepted = assertOk('01-platform.acceptSupportManager', await acceptInvite(token, DEMO_PASSWORD));
  ctx.supportUser = accepted.data.user;

  registerSeedAccount({
    email: CAST.supportManager.email,
    name: CAST.supportManager.name,
    role: 'SupportManager',
    portal: 'admin',
    businessName: 'DigiSwasthya Platform',
  });
}

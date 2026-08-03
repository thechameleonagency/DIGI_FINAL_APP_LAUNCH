import { acceptInvite, inviteStaff, updateProfile, upsertDeliveryAddress } from '../../../services/authService';
import { assertOk } from '../assert';
import { CAST, DEMO_PASSWORD, type CastTrader } from '../cast';
import { advanceBusinessDay } from '../chronology';
import { getWorldCtx, type TraderParty } from '../context';
import { registerSeedAccount } from '../registry';

async function inviteAndAcceptDelivery(party: TraderParty, cast: CastTrader): Promise<TraderParty> {
  advanceBusinessDay();
  const invited = assertOk(
    `03-staff.invite.${party.key}`,
    await inviteStaff({
      actor: party.user,
      business: party.business,
      name: cast.delivery.name,
      email: cast.delivery.email,
      phone: cast.delivery.phone,
      role: 'DeliveryStaff',
    }),
  );
  const token = invited.data.inviteToken;
  if (!token) {
    throw new Error(`[worldSeed:03-staff.accept.${party.key}] inviteToken missing`);
  }
  const accepted = assertOk(`03-staff.accept.${party.key}`, await acceptInvite(token, DEMO_PASSWORD));
  registerSeedAccount({
    email: cast.delivery.email,
    name: cast.delivery.name,
    role: 'DeliveryStaff',
    portal: party.business.type === 'Stockist' ? 'stockist' : 'pharmacy',
    businessName: cast.site.businessName,
  });
  return { ...party, delivery: accepted.data.user };
}

/** Phase 3 — Staff invites, profile touch-ups, pharmacy delivery addresses. */
export async function seedStaffPhase(): Promise<void> {
  const ctx = getWorldCtx();

  const stockistCast: Record<string, CastTrader> = {
    stockistA: CAST.stockistA,
    stockistB: CAST.stockistB,
  };
  const pharmacyCast: Record<string, CastTrader> = {
    pharmacyA: CAST.pharmacyA,
    pharmacyB: CAST.pharmacyB,
    pharmacyC: CAST.pharmacyC,
  };

  for (let i = 0; i < ctx.stockists.length; i++) {
    const party = ctx.stockists[i]!;
    const cast = stockistCast[party.key];
    if (!cast) continue;
    if (party.business.accountStatus !== 'Active') continue;
    ctx.stockists[i] = await inviteAndAcceptDelivery(party, cast);
    assertOk(
      `03-staff.profile.${party.key}`,
      await updateProfile({ actor: ctx.stockists[i]!.user, name: cast.owner.name }),
    );
  }

  for (let i = 0; i < ctx.pharmacies.length; i++) {
    const party = ctx.pharmacies[i]!;
    const cast = pharmacyCast[party.key];
    if (!cast) continue;
    if (party.business.accountStatus !== 'Active') continue;
    ctx.pharmacies[i] = await inviteAndAcceptDelivery(party, cast);
    const updated = ctx.pharmacies[i]!;
    assertOk(
      `03-staff.profile.${party.key}`,
      await updateProfile({ actor: updated.user, name: cast.owner.name }),
    );
    assertOk(
      `03-staff.address.${party.key}`,
      await upsertDeliveryAddress({
        actor: updated.user,
        business: updated.business,
        address: {
          label: 'Main shop',
          line1: cast.site.address,
          city: cast.site.city,
          state: cast.site.state,
          pincode: cast.site.pincode,
          isDefault: true,
        },
      }),
    );
  }
}

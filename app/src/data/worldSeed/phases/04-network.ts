import {
  disconnectConnection,
  requestConnection,
  respondConnection,
  setConnectionCircle,
} from '../../../services/connectionService';
import { setFavourite, setSupplierRating } from '../../../services/favouriteService';
import { createManagedPharmacy } from '../../../services/managedPharmacyService';
import { assertOk } from '../assert';
import { CAST } from '../cast';
import { advanceBusinessDay } from '../chronology';
import {
  connectionKey,
  getWorldCtx,
  pharmacyByKey,
  stockistByKey,
  type TraderKey,
} from '../context';

/**
 * Activation terms:
 * - Circle: pass creditLimit > 0 → respondConnection sets inCircle true (Credit allowed).
 * - Pay-First-only: omit creditLimit → inCircle false (PayFirst orders only).
 */
type CreditTerms = { creditDays: number; creditLimit?: number };

async function requestAndActivate(params: {
  pharmacyKey: TraderKey;
  stockistKey: TraderKey;
  terms: CreditTerms;
  note?: string;
}): Promise<void> {
  const ctx = getWorldCtx();
  const pharmacy = pharmacyByKey(params.pharmacyKey);
  const stockist = stockistByKey(params.stockistKey);
  advanceBusinessDay();

  const requested = assertOk(
    `04-network.request.${params.pharmacyKey}-${params.stockistKey}`,
    await requestConnection({
      actor: pharmacy.user,
      pharmacy: pharmacy.business,
      stockistId: stockist.business.id,
      note: params.note,
    }),
  );

  const activated = assertOk(
    `04-network.activate.${params.pharmacyKey}-${params.stockistKey}`,
    await respondConnection({
      actor: stockist.user,
      stockist: stockist.business,
      connectionId: requested.data.id,
      decision: 'Active',
      creditDays: params.terms.creditDays,
      creditLimit: params.terms.creditLimit,
    }),
  );

  ctx.connections.set(connectionKey(params.pharmacyKey, params.stockistKey), activated.data);
}

/** Phase 4 — Dense pharmacy×stockist network (Circle vs Pay-First), favourites, managed pharmacies. */
export async function seedNetworkPhase(): Promise<void> {
  const ctx = getWorldCtx();
  const pharmacyA = pharmacyByKey('pharmacyA');
  const pharmacyB = pharmacyByKey('pharmacyB');
  const pharmacyC = pharmacyByKey('pharmacyC');
  const stockistA = stockistByKey('stockistA');
  const stockistB = stockistByKey('stockistB');

  // Circle pairs — creditLimit > 0 so inCircle === true
  await requestAndActivate({
    pharmacyKey: 'pharmacyA',
    stockistKey: 'stockistA',
    terms: { creditDays: 30, creditLimit: 200_000 },
    note: 'Primary Mumbai supplier',
  });
  await requestAndActivate({
    pharmacyKey: 'pharmacyA',
    stockistKey: 'stockistB',
    terms: { creditDays: 15, creditLimit: 75_000 },
  });
  await requestAndActivate({
    pharmacyKey: 'pharmacyB',
    stockistKey: 'stockistA',
    terms: { creditDays: 45, creditLimit: 150_000 },
  });
  // Pay-First-only — no creditLimit → inCircle false
  await requestAndActivate({
    pharmacyKey: 'pharmacyB',
    stockistKey: 'stockistB',
    terms: { creditDays: 7 },
  });
  // Circle
  await requestAndActivate({
    pharmacyKey: 'pharmacyC',
    stockistKey: 'stockistA',
    terms: { creditDays: 21, creditLimit: 100_000 },
  });
  // Pay-First-only cash path before reconnect demo (later becomes Circle with limit)
  await requestAndActivate({
    pharmacyKey: 'pharmacyC',
    stockistKey: 'stockistB',
    terms: { creditDays: 0 },
    note: 'Pay-First / cash terms',
  });

  // Exercise stockist "Add to Circle" API on an already-Circle edge (idempotent confirm)
  {
    const key = connectionKey('pharmacyA', 'stockistA');
    const conn = ctx.connections.get(key)!;
    const circled = assertOk(
      '04-network.circle.set.A-A',
      await setConnectionCircle({
        actor: stockistA.user,
        stockist: stockistA.business,
        connectionId: conn.id,
        inCircle: true,
        creditDays: conn.creditDays ?? 30,
        creditLimit: conn.creditLimit ?? 200_000,
        reason: 'Seed — confirm Circle membership via setConnectionCircle',
      }),
    );
    ctx.connections.set(key, circled.data);
  }

  // Reject then re-request → Active as Circle (creditLimit set on final activate).
  // Disconnect pharmacyC↔stockistB (was Pay-First), request, reject, re-request, activate with limit.
  {
    const key = connectionKey('pharmacyC', 'stockistB');
    const existing = ctx.connections.get(key)!;
    advanceBusinessDay();
    assertOk(
      '04-network.disconnect.beforeRejectDemo',
      await disconnectConnection({
        actor: pharmacyC.user,
        business: pharmacyC.business,
        connectionId: existing.id,
        reason: 'Testing reconnect flow',
      }),
    );

    const req1 = assertOk(
      '04-network.reRequest.afterDisconnect',
      await requestConnection({
        actor: pharmacyC.user,
        pharmacy: pharmacyC.business,
        stockistId: stockistB.business.id,
        note: 'Please reconnect',
      }),
    );
    assertOk(
      '04-network.reject',
      await respondConnection({
        actor: stockistB.user,
        stockist: stockistB.business,
        connectionId: req1.data.id,
        decision: 'Rejected',
        reason: 'Credit review pending — try again next week.',
      }),
    );
    advanceBusinessDay();
    const req2 = assertOk(
      '04-network.reRequest.afterReject',
      await requestConnection({
        actor: pharmacyC.user,
        pharmacy: pharmacyC.business,
        stockistId: stockistB.business.id,
        note: 'Credit docs ready',
      }),
    );
    const activated = assertOk(
      '04-network.activate.afterReject',
      await respondConnection({
        actor: stockistB.user,
        stockist: stockistB.business,
        connectionId: req2.data.id,
        decision: 'Active',
        creditDays: 14,
        creditLimit: 50_000,
      }),
    );
    ctx.connections.set(key, activated.data);
  }

  // Disconnect → request → Active (pharmacyB ↔ stockistA)
  {
    const key = connectionKey('pharmacyB', 'stockistA');
    const existing = ctx.connections.get(key)!;
    advanceBusinessDay();
    assertOk(
      '04-network.disconnect',
      await disconnectConnection({
        actor: stockistA.user,
        business: stockistA.business,
        connectionId: existing.id,
        reason: 'Seasonal pause — reconnect shortly',
      }),
    );
    const req = assertOk(
      '04-network.request.afterDisconnect',
      await requestConnection({
        actor: pharmacyB.user,
        pharmacy: pharmacyB.business,
        stockistId: stockistA.business.id,
        note: 'Ready to resume',
      }),
    );
    const activated = assertOk(
      '04-network.activate.afterDisconnect',
      await respondConnection({
        actor: stockistA.user,
        stockist: stockistA.business,
        connectionId: req.data.id,
        decision: 'Active',
        creditDays: 30,
        creditLimit: 120_000,
      }),
    );
    ctx.connections.set(key, activated.data);
  }

  assertOk(
    '04-network.favourite.A-A',
    await setFavourite({
      actor: pharmacyA.user,
      pharmacy: pharmacyA.business,
      stockistId: stockistA.business.id,
      favourite: true,
    }),
  );
  assertOk(
    '04-network.rating.A-A',
    await setSupplierRating({
      actor: pharmacyA.user,
      pharmacy: pharmacyA.business,
      stockistId: stockistA.business.id,
      rating: 5,
      note: 'Reliable fill rates',
    }),
  );
  assertOk(
    '04-network.favourite.B-B',
    await setFavourite({
      actor: pharmacyB.user,
      pharmacy: pharmacyB.business,
      stockistId: stockistB.business.id,
      favourite: true,
    }),
  );
  assertOk(
    '04-network.rating.C-A',
    await setSupplierRating({
      actor: pharmacyC.user,
      pharmacy: pharmacyC.business,
      stockistId: stockistA.business.id,
      rating: 4,
      note: 'Good Nashik coverage',
    }),
  );

  const offline = assertOk(
    '04-network.managed.offline',
    await createManagedPharmacy({
      actor: stockistA.user,
      stockist: stockistA.business,
      data: {
        name: CAST.managedOffline.name,
        phone: CAST.managedOffline.phone,
        email: CAST.managedOffline.email,
        gst: CAST.managedOffline.gst,
        drugLicense: CAST.managedOffline.drugLicense,
        address: CAST.managedOffline.address,
        city: CAST.managedOffline.city,
        state: CAST.managedOffline.state,
        pincode: CAST.managedOffline.pincode,
        creditDays: 15,
        creditLimit: 40_000,
        note: 'Offline-only for manual orders later',
        inviteFirst: false,
      },
    }),
  );
  ctx.managedPharmacies.push(offline.data);

  const invited = assertOk(
    '04-network.managed.inviteFirst',
    await createManagedPharmacy({
      actor: stockistB.user,
      stockist: stockistB.business,
      data: {
        name: CAST.managedInvite.name,
        phone: CAST.managedInvite.phone,
        email: CAST.managedInvite.email,
        gst: CAST.managedInvite.gst,
        drugLicense: CAST.managedInvite.drugLicense,
        address: CAST.managedInvite.address,
        city: CAST.managedInvite.city,
        state: CAST.managedInvite.state,
        pincode: CAST.managedInvite.pincode,
        creditDays: 21,
        inviteFirst: true,
      },
    }),
  );
  ctx.managedPharmacies.push(invited.data);
}

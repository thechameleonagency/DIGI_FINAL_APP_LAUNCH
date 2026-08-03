import { nowIso } from '../../../domain/utils/clock';
import { db } from '../../db';
import { upsertAnnouncement, unpublishAnnouncement } from '../../../services/announcementService';
import { upsertBanner } from '../../../services/bannerService';
import {
  dismissCounterfeitReport,
  fileCounterfeitReport,
  issueCounterfeitRecall,
  resolveCounterfeitReport,
  startCounterfeitInvestigation,
} from '../../../services/counterfeitService';
import { decideUpgradeRequest, submitUpgradeRequest } from '../../../services/planService';
import {
  createTicket,
  ensureMessageThread,
  runPolicyClock,
  sendMessage,
  updateTicket,
} from '../../../services/supportService';
import { assertOk } from '../assert';
import { advanceBusinessDay, advanceDays } from '../chronology';
import { getWorldCtx, pharmacyByKey, requireAdmin, stockistByKey } from '../context';

function isoPlusDays(days: number): string {
  const d = new Date(nowIso());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Phase 10 — Platform ops & chrome (Session D). */
export async function seedPlatformOpsPhase(): Promise<void> {
  const { user: admin, business: platform } = requireAdmin();
  const ctx = getWorldCtx();
  const support = ctx.supportUser;
  if (!support) throw new Error('[worldSeed:10] supportUser missing');

  const pharmacyA = pharmacyByKey('pharmacyA');
  const pharmacyB = pharmacyByKey('pharmacyB');
  const stockistA = stockistByKey('stockistA');
  const stockistB = stockistByKey('stockistB');

  // --- Announcements ---
  advanceBusinessDay();
  assertOk(
    '10-ann.active',
    await upsertAnnouncement({
      actor: admin,
      business: platform,
      title: 'Monsoon delivery windows',
      body: 'Expect slight delays on coastal routes during heavy rain. Plan orders a day ahead.',
      targetRoles: ['Pharmacy', 'Stockist'],
      placements: ['All Dashboards', 'Pharmacy Home', 'Stockist Home'],
      priority: 'Medium',
      startsAt: nowIso(),
      endsAt: isoPlusDays(45),
      active: true,
    }),
  );

  advanceDays(1);
  assertOk(
    '10-ann.future-end',
    await upsertAnnouncement({
      actor: admin,
      business: platform,
      title: 'GST e-invoice reminder',
      body: 'Keep your GSTIN and invoice series aligned before the next filing cycle.',
      targetRoles: ['Stockist'],
      placements: ['Stockist Home'],
      priority: 'Low',
      startsAt: nowIso(),
      endsAt: isoPlusDays(90),
      active: true,
    }),
  );

  advanceDays(1);
  const toUnpublish = assertOk(
    '10-ann.unpublish-create',
    await upsertAnnouncement({
      actor: admin,
      business: platform,
      title: 'Temporary promo — draft chrome',
      body: 'This announcement will be unpublished in seed to leave inactive chrome history.',
      targetRoles: ['Pharmacy'],
      placements: ['Pharmacy Buy'],
      priority: 'High',
      startsAt: nowIso(),
      active: true,
    }),
  ).data;
  advanceDays(1);
  assertOk(
    '10-ann.unpublish',
    await unpublishAnnouncement({
      actor: admin,
      business: platform,
      id: toUnpublish.id,
    }),
  );

  // --- Banner ---
  advanceBusinessDay();
  assertOk(
    '10-banner',
    await upsertBanner({
      actor: admin,
      business: platform,
      text: 'Demo world: DigiSwasthya seed data is active. Support tickets are monitored.',
      tone: 'info',
      placements: ['All Dashboards', 'Auth'],
      startsAt: nowIso(),
      endsAt: isoPlusDays(60),
      active: true,
    }),
  );

  // --- Support tickets ---
  advanceBusinessDay();
  const phTicket = assertOk(
    '10-tkt.pharmacy',
    await createTicket({
      actor: pharmacyA.user,
      business: pharmacyA.business,
      subject: 'GRN batch mismatch on last delivery',
      category: 'Orders',
      body: 'Received qty on one line did not match packing slip. Need guidance on discrepancy workflow.',
      priority: 'High',
    }),
  ).data;

  const stTicket = assertOk(
    '10-tkt.stockist',
    await createTicket({
      actor: stockistA.user,
      business: stockistA.business,
      subject: 'Payment review queue backlog',
      category: 'Payments',
      body: 'Several pharmacy remittances are sitting UnderReview longer than expected in the demo week.',
      priority: 'Medium',
    }),
  ).data;

  advanceDays(1);
  assertOk(
    '10-tkt.pharmacy.update',
    await updateTicket({
      actor: pharmacyA.user,
      business: pharmacyA.business,
      ticketId: phTicket.id,
      body: 'Also attaching order reference from last week — still open.',
    }),
  );

  assertOk(
    '10-tkt.support.progress',
    await updateTicket({
      actor: support,
      business: platform,
      ticketId: phTicket.id,
      status: 'InProgress',
      assigneeId: support.id,
      body: 'SupportManager: reviewing GRN discrepancy against delivery lines.',
    }),
  );

  advanceDays(1);
  assertOk(
    '10-tkt.support.resolve',
    await updateTicket({
      actor: support,
      business: platform,
      ticketId: phTicket.id,
      status: 'Resolved',
      body: 'Use Record GRN with discrepancy reason; stockist was notified. Closing for seed.',
    }),
  );

  assertOk(
    '10-tkt.stockist.progress',
    await updateTicket({
      actor: support,
      business: platform,
      ticketId: stTicket.id,
      status: 'InProgress',
      assigneeId: support.id,
      body: 'Acknowledged — will clear UnderReview samples in money phase follow-up.',
    }),
  );

  // Extra open ticket for UI queues
  assertOk(
    '10-tkt.pharmacyB.open',
    await createTicket({
      actor: pharmacyB.user,
      business: pharmacyB.business,
      subject: 'How to set home-delivery PIN areas?',
      category: 'Delivery',
      body: 'Looking for steps to configure delivery areas and assign riders.',
      priority: 'Low',
    }),
  );

  // --- Partner messages ---
  advanceBusinessDay();
  const thread = assertOk(
    '10-msg.thread',
    await ensureMessageThread({
      actor: pharmacyA.user,
      business: pharmacyA.business,
      counterpartBusinessId: stockistA.business.id,
    }),
  ).data;

  assertOk(
    '10-msg.ph→st',
    await sendMessage({
      actor: pharmacyA.user,
      business: pharmacyA.business,
      counterpartBusinessId: stockistA.business.id,
      threadId: thread.id,
      body: 'Can you prioritise our pending Allocated orders for tomorrow morning?',
    }),
  );

  assertOk(
    '10-msg.st→ph',
    await sendMessage({
      actor: stockistA.user,
      business: stockistA.business,
      counterpartBusinessId: pharmacyA.business.id,
      threadId: thread.id,
      body: 'Yes — packing those first. Rider will call before OFD.',
    }),
  );

  assertOk(
    '10-msg.phB→stB',
    await sendMessage({
      actor: pharmacyB.user,
      business: pharmacyB.business,
      counterpartBusinessId: stockistB.business.id,
      body: 'Please confirm updated credit terms are reflected on our next invoice.',
    }),
  );

  // --- Counterfeit ---
  advanceBusinessDay();
  const availableBatch = await db.batches
    .where('stockistId')
    .equals(stockistA.business.id)
    .filter((b) => b.status === 'Available' && b.onHand > 0)
    .first();
  const productId = availableBatch?.productId ?? getWorldCtx().productIdsByStockist.get(stockistA.business.id)?.[0];

  const recallReport = assertOk(
    '10-cf.file.recall',
    await fileCounterfeitReport({
      actor: pharmacyA.user,
      business: pharmacyA.business,
      description: 'Suspected counterfeit blister — hologram misaligned on received stock.',
      productId,
      batchId: availableBatch?.id,
      sellerBusinessId: stockistA.business.id,
    }),
  ).data;

  advanceDays(1);
  assertOk(
    '10-cf.investigate.recall',
    await startCounterfeitInvestigation({
      actor: admin,
      platform,
      id: recallReport.id,
      note: 'Opening investigation — comparing batch artwork samples.',
    }),
  );

  if (availableBatch) {
    advanceDays(1);
    assertOk(
      '10-cf.recall',
      await issueCounterfeitRecall({
        actor: admin,
        platform,
        id: recallReport.id,
        note: 'Confirmed defect — recall issued in seed.',
      }),
    );
    advanceDays(1);
    assertOk(
      '10-cf.resolve.recall',
      await resolveCounterfeitReport({
        actor: admin,
        platform,
        id: recallReport.id,
        note: 'Recall communicated; case closed for seed.',
      }),
    );
  } else {
    advanceDays(1);
    assertOk(
      '10-cf.dismiss.no-batch',
      await dismissCounterfeitReport({
        actor: admin,
        platform,
        id: recallReport.id,
        reason: 'No batch linked — dismissed after review.',
      }),
    );
  }

  const dismissReport = assertOk(
    '10-cf.file.dismiss',
    await fileCounterfeitReport({
      actor: stockistB.user,
      business: stockistB.business,
      description: 'Customer complaint about packaging colour variance — filing for review.',
      productId: getWorldCtx().productIdsByStockist.get(stockistB.business.id)?.[0],
    }),
  ).data;

  advanceDays(1);
  assertOk(
    '10-cf.investigate.dismiss',
    await startCounterfeitInvestigation({
      actor: support,
      platform,
      id: dismissReport.id,
      note: 'SupportManager reviewing complaint photos.',
    }),
  );
  advanceDays(1);
  assertOk(
    '10-cf.dismiss',
    await dismissCounterfeitReport({
      actor: admin,
      platform,
      id: dismissReport.id,
      reason: 'Legitimate packaging refresh from manufacturer — not counterfeit.',
    }),
  );

  // --- Upgrade requests: Approve one / Reject one ---
  advanceBusinessDay();
  const pharmacyC = pharmacyByKey('pharmacyC');
  const approveReq = assertOk(
    '10-upg.submit.approve',
    await submitUpgradeRequest({
      actor: pharmacyC.user,
      business: pharmacyC.business,
      utr: 'SEEDUTRAPPROVE01',
    }),
  ).data;

  const rejectReq = assertOk(
    '10-upg.submit.reject',
    await submitUpgradeRequest({
      actor: stockistB.user,
      business: stockistB.business,
      utr: 'SEEDUTRREJECT02',
    }),
  ).data;

  advanceDays(1);
  assertOk(
    '10-upg.approve',
    await decideUpgradeRequest({
      actor: admin,
      platform,
      id: approveReq.id,
      decision: 'Approved',
    }),
  );
  assertOk(
    '10-upg.reject',
    await decideUpgradeRequest({
      actor: admin,
      platform,
      id: rejectReq.id,
      decision: 'Rejected',
      reason: 'UTR could not be matched to platform settlement account — seed reject.',
    }),
  );

  // Impersonation intentionally skipped (session mutation not seed-safe).

  advanceBusinessDay();
  await runPolicyClock();
}

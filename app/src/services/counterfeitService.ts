import type { Business, CounterfeitReport, Order, OrderStatus, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { emitNotification, notifyBusinessUsers } from './notifications';
import { nowIso } from '../domain/utils/clock';

async function notifyPlatformAdmins(code: string, vars: Record<string, string>, entityId: string) {
  const admins = await db.users
    .filter((u) => ['SuperAdmin', 'SupportManager'].includes(u.role) && u.status === 'Active')
    .toArray();
  for (const a of admins) {
    await emitNotification({
      userId: a.id,
      businessId: a.businessId,
      code,
      vars,
      entityType: 'CounterfeitReport',
      entityId,
    });
  }
}

/** File a counterfeit report (pharmacy or stockist). */
export async function fileCounterfeitReport(params: {
  actor: User;
  business: Business;
  description: string;
  productId?: string;
  batchId?: string;
  sellerBusinessId?: string;
  evidenceFileIds?: string[];
}): Promise<Result<CounterfeitReport>> {
  const perm = assertCan(params.actor, params.business, 'counterfeit.report');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Report was not filed.');
  if (params.business.type === 'Platform') {
    return fail('BusinessRule', 'CF_BIZ', 'Platform accounts file via admin tools.', 'Report was not filed.');
  }
  const description = params.description.trim();
  if (description.length < 10) {
    return fail('Validation', 'CF_DESC', 'Describe the issue (at least 10 characters).', 'Report was not filed.');
  }

  const batch = params.batchId ? await db.batches.get(params.batchId) : undefined;
  if (params.batchId && !batch) {
    return fail('NotFound', 'CF_BATCH', 'Batch not found.', 'Report was not filed.');
  }
  if (params.productId) {
    const product = await db.products.get(params.productId);
    if (!product) return fail('NotFound', 'CF_PROD', 'Product not found.', 'Report was not filed.');
  }
  if (params.productId && batch && batch.productId !== params.productId) {
    return fail(
      'Validation',
      'CF_PROD_BATCH',
      'Selected batch does not belong to the selected product.',
      'Report was not filed.',
    );
  }
  if (params.sellerBusinessId) {
    const seller = await db.businesses.get(params.sellerBusinessId);
    if (!seller) {
      return fail('NotFound', 'CF_SELLER', 'Related business not found.', 'Report was not filed.');
    }
    if (params.business.type === 'Pharmacy' && seller.type !== 'Stockist') {
      return fail('Validation', 'CF_SELLER', 'Seller must be a stockist.', 'Report was not filed.');
    }
    if (params.business.type === 'Stockist' && seller.type !== 'Pharmacy') {
      return fail('Validation', 'CF_SELLER', 'Related party must be a pharmacy.', 'Report was not filed.');
    }
    if (batch && seller.type === 'Stockist' && batch.stockistId !== seller.id) {
      return fail(
        'Validation',
        'CF_SELLER',
        'Selected batch does not belong to the selected stockist.',
        'Report was not filed.',
      );
    }
  }

  const ts = nowIso();
  const reportNo = nextNumber('CF');
  const row: CounterfeitReport = {
    id: newId(),
    reportNo,
    reporterBusinessId: params.business.id,
    productId: params.productId,
    batchId: params.batchId,
    sellerBusinessId: params.sellerBusinessId,
    description,
    evidenceFileIds: params.evidenceFileIds ?? [],
    status: 'Reported',
    internalNotes: [],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.counterfeitReports.add(row);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'CounterfeitReport',
    entityId: row.id,
    action: 'counterfeit.file',
    after: row,
  });
  await notifyPlatformAdmins('N-311', { reportNo }, row.id);
  return ok(row);
}

export async function startCounterfeitInvestigation(params: {
  actor: User;
  platform: Business;
  id: string;
  note?: string;
}): Promise<Result<CounterfeitReport>> {
  const perm = assertCan(params.actor, params.platform, 'counterfeit.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Investigation was not started.');
  const row = await db.counterfeitReports.get(params.id);
  if (!row) return fail('NotFound', 'CF_MISSING', 'Report not found.', 'Investigation was not started.');
  if (row.status !== 'Reported') {
    return fail('StateConflict', 'CF_STATE', 'Only Reported items can enter investigation.', 'Investigation was not started.');
  }
  const ts = nowIso();
  const note = params.note?.trim();
  const next: CounterfeitReport = {
    ...row,
    status: 'Investigating',
    assigneeId: params.actor.id,
    internalNotes: note ? [...row.internalNotes, `${ts}: ${note}`] : row.internalNotes,
    updatedAt: ts,
  };
  await db.counterfeitReports.put(next);

  // E-CF-24b: link duplicate reports on same batch into this investigation
  if (row.batchId) {
    const dups = await db.counterfeitReports
      .where('batchId')
      .equals(row.batchId)
      .filter((r) => r.id !== row.id && r.status === 'Reported')
      .toArray();
    for (const d of dups) {
      await db.counterfeitReports.put({
        ...d,
        status: 'Investigating',
        assigneeId: params.actor.id,
        linkedReportId: row.id,
        internalNotes: [
          ...d.internalNotes,
          `${ts}: Linked to investigation ${row.reportNo ?? row.id}`,
        ],
        updatedAt: ts,
      });
      await writeAudit({
        actorId: params.actor.id,
        actorName: params.actor.name,
        businessId: params.platform.id,
        entityType: 'CounterfeitReport',
        entityId: d.id,
        action: 'counterfeit.link',
        after: { linkedReportId: row.id },
      });
    }
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'CounterfeitReport',
    entityId: row.id,
    action: 'counterfeit.investigate',
    before: row,
    after: next,
  });
  return ok(next);
}

export async function addCounterfeitNote(params: {
  actor: User;
  platform: Business;
  id: string;
  note: string;
}): Promise<Result<CounterfeitReport>> {
  const perm = assertCan(params.actor, params.platform, 'counterfeit.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Note was not added.');
  const row = await db.counterfeitReports.get(params.id);
  if (!row) return fail('NotFound', 'CF_MISSING', 'Report not found.', 'Note was not added.');
  if (!['Investigating', 'RecallIssued'].includes(row.status)) {
    return fail('StateConflict', 'CF_STATE', 'Notes only while investigating or after recall.', 'Note was not added.');
  }
  const text = params.note.trim();
  if (!text) return fail('Validation', 'CF_NOTE', 'Note is required.', 'Note was not added.');
  const ts = nowIso();
  const next = {
    ...row,
    internalNotes: [...row.internalNotes, `${ts}: ${text}`],
    updatedAt: ts,
  };
  await db.counterfeitReports.put(next);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'CounterfeitReport',
    entityId: row.id,
    action: 'counterfeit.note',
    before: row,
    after: next,
  });
  return ok(next);
}

async function releaseReservationsForBatch(
  batchId: string,
  actorId: string,
  reason: string,
): Promise<{ flaggedOrderIds: string[] }> {
  const ts = nowIso();
  const flaggedOrderIds: string[] = [];
  const openStatuses = new Set(['Accepted', 'PartiallyAccepted', 'Allocated', 'Packed']);
  const orders = await db.orders.filter((o) => openStatuses.has(o.status)).toArray();
  for (const order of orders) {
    let touched = false;
    const lines = order.lines.map((line) => {
      const allocs = line.batchAllocations ?? [];
      if (!allocs.some((a) => a.batchId === batchId)) return line;
      touched = true;
      const removedQty = allocs.filter((a) => a.batchId === batchId).reduce((s, a) => s + a.qty, 0);
      const remainingAllocs = allocs.filter((a) => a.batchId !== batchId);
      const nextAllocated = Math.max(0, (line.allocatedQty ?? 0) - removedQty);
      const next: typeof line = {
        ...line,
        batchAllocations: remainingAllocs,
        allocatedQty: nextAllocated,
        discrepancyReason: reason,
      };
      if (line.packedQty != null) {
        next.packedQty = remainingAllocs.length === 0 ? 0 : Math.min(line.packedQty, nextAllocated);
      }
      return next;
    });
    if (!touched) continue;

    // Release reserved qty from batch for Allocated and Packed (re-read each time)
    if (order.status === 'Allocated' || order.status === 'Packed') {
      for (const line of order.lines) {
        for (const alloc of line.batchAllocations ?? []) {
          if (alloc.batchId !== batchId) continue;
          const batch = await db.batches.get(batchId);
          if (batch) {
            await db.batches.update(batchId, {
              reserved: Math.max(0, batch.reserved - alloc.qty),
              updatedAt: ts,
            });
          }
        }
      }
    }

    let nextStatus: OrderStatus = order.status;
    if (order.status === 'Packed') {
      const stillAllocated = lines.some((l) => (l.batchAllocations ?? []).length > 0);
      nextStatus = stillAllocated ? 'Allocated' : 'Accepted';
      const demote = machines.order('Packed', nextStatus);
      if (!demote.ok) {
        // Machine must allow Packed → Allocated/Accepted; fall back to keeping Packed only if illegal.
        nextStatus = order.status;
      }
    }

    const patch: Partial<Order> = {
      lines,
      status: nextStatus,
      updatedAt: ts,
      version: order.version + 1,
      statusHistory: [
        ...order.statusHistory,
        { from: order.status, to: nextStatus, at: ts, actorId, reason },
      ],
    };
    await db.orders.update(order.id, patch);
    flaggedOrderIds.push(order.id);
  }
  return { flaggedOrderIds };
}

/** Collect pharmacies whose orders allocate this batch (any status) — call before stripping. */
async function pharmaciesWithBatchAllocations(stockistId: string, batchId: string): Promise<string[]> {
  const pharmacyIds = new Set<string>();
  const relatedOrders = await db.orders.where('stockistId').equals(stockistId).toArray();
  for (const o of relatedOrders) {
    if (o.lines.some((l) => (l.batchAllocations ?? []).some((a) => a.batchId === batchId))) {
      pharmacyIds.add(o.pharmacyId);
    }
  }
  return [...pharmacyIds];
}

/** Issue recall on the report's batch (E-CF-24a releases reservations). */
export async function issueCounterfeitRecall(params: {
  actor: User;
  platform: Business;
  id: string;
  note?: string;
}): Promise<Result<CounterfeitReport & { flaggedOrderIds: string[] }>> {
  const perm = assertCan(params.actor, params.platform, 'counterfeit.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Recall was not issued.');
  const row = await db.counterfeitReports.get(params.id);
  if (!row) return fail('NotFound', 'CF_MISSING', 'Report not found.', 'Recall was not issued.');
  if (row.status !== 'Investigating') {
    return fail('StateConflict', 'CF_STATE', 'Recall requires Investigating status.', 'Recall was not issued.');
  }
  if (!row.batchId) {
    return fail('Validation', 'CF_BATCH', 'A batch must be identified before recall.', 'Recall was not issued.');
  }
  const batch = await db.batches.get(row.batchId);
  if (!batch) return fail('NotFound', 'CF_BATCH', 'Batch not found.', 'Recall was not issued.');

  const t = machines.batch(batch.status, 'Recalled');
  if (!t.ok) return fail('StateConflict', 'BATCH_STATE', t.reason!, 'Recall was not issued.');

  const ts = nowIso();
  const reason = `Counterfeit recall ${row.reportNo ?? row.id}`;

  // Collect pharmacy fan-out targets BEFORE stripping open-order allocations
  const pharmacyIds = await pharmaciesWithBatchAllocations(batch.stockistId, batch.id);
  const { flaggedOrderIds } = await releaseReservationsForBatch(batch.id, params.actor.id, reason);

  await db.batches.update(batch.id, { status: 'Recalled', reserved: 0, updatedAt: ts });
  await db.inventoryMovements.add({
    id: newId(),
    businessId: batch.stockistId,
    productId: batch.productId,
    batchId: batch.id,
    type: 'Adjustment',
    qty: 0,
    reason,
    actorId: params.actor.id,
    prevQty: batch.onHand,
    newQty: batch.onHand,
    at: ts,
  });

  const product = await db.products.get(batch.productId);
  const productName = product?.name ?? 'Product';

  await notifyBusinessUsers(
    batch.stockistId,
    'N-313',
    { batchNumber: batch.batchNumber, productName },
    { type: 'Batch', id: batch.id },
  );
  for (const pid of pharmacyIds) {
    await notifyBusinessUsers(pid, 'N-313', { batchNumber: batch.batchNumber, productName }, {
      type: 'Batch',
      id: batch.id,
    });
  }

  const note = params.note?.trim();
  const next: CounterfeitReport = {
    ...row,
    status: 'RecallIssued',
    outcome: 'RecallIssued',
    internalNotes: note ? [...row.internalNotes, `${ts}: Recall — ${note}`] : [...row.internalNotes, `${ts}: Recall issued`],
    updatedAt: ts,
  };
  await db.counterfeitReports.put(next);

  // Linked / same-batch Investigating reports also move to RecallIssued
  if (row.batchId) {
    const linked = await db.counterfeitReports
      .where('batchId')
      .equals(row.batchId)
      .filter((r) => r.id !== row.id && r.status === 'Investigating')
      .toArray();
    for (const l of linked) {
      await db.counterfeitReports.put({
        ...l,
        status: 'RecallIssued',
        outcome: 'RecallIssued',
        updatedAt: ts,
      });
    }
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'CounterfeitReport',
    entityId: row.id,
    action: 'counterfeit.recall',
    before: row,
    after: next,
    reason,
  });
  return ok({ ...next, flaggedOrderIds });
}

export async function dismissCounterfeitReport(params: {
  actor: User;
  platform: Business;
  id: string;
  reason: string;
}): Promise<Result<CounterfeitReport>> {
  const perm = assertCan(params.actor, params.platform, 'counterfeit.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Report was not dismissed.');
  const row = await db.counterfeitReports.get(params.id);
  if (!row) return fail('NotFound', 'CF_MISSING', 'Report not found.', 'Report was not dismissed.');
  if (row.status !== 'Investigating') {
    return fail('StateConflict', 'CF_STATE', 'Only Investigating reports can be dismissed.', 'Report was not dismissed.');
  }
  if (!params.reason.trim()) {
    return fail('Validation', 'CF_REASON', 'Dismissal reason is required.', 'Report was not dismissed.');
  }
  const ts = nowIso();
  const decisionReason = params.reason.trim();
  const next: CounterfeitReport = {
    ...row,
    status: 'Dismissed',
    outcome: 'Dismissed',
    decisionReason,
    updatedAt: ts,
    internalNotes: [...row.internalNotes, `${ts}: Dismissed — ${decisionReason}`],
  };
  await db.counterfeitReports.put(next);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'CounterfeitReport',
    entityId: row.id,
    action: 'counterfeit.dismiss',
    before: row,
    after: next,
    reason: decisionReason,
  });

  const notifiedBiz = new Set<string>([row.reporterBusinessId]);
  await notifyBusinessUsers(
    row.reporterBusinessId,
    'N-314',
    { reportNo: row.reportNo ?? row.id.slice(0, 8), status: 'Dismissed' },
    { type: 'CounterfeitReport', id: row.id },
  );

  // Cascade same-batch Investigating siblings (linked or not)
  if (row.batchId) {
    const siblings = await db.counterfeitReports
      .where('batchId')
      .equals(row.batchId)
      .filter((r) => r.id !== row.id && r.status === 'Investigating')
      .toArray();
    for (const s of siblings) {
      const closed: CounterfeitReport = {
        ...s,
        status: 'Dismissed',
        outcome: 'Dismissed',
        decisionReason,
        updatedAt: ts,
        internalNotes: [
          ...s.internalNotes,
          `${ts}: Dismissed with ${row.reportNo ?? row.id} — ${decisionReason}`,
        ],
      };
      await db.counterfeitReports.put(closed);
      await writeAudit({
        actorId: params.actor.id,
        actorName: params.actor.name,
        businessId: params.platform.id,
        entityType: 'CounterfeitReport',
        entityId: s.id,
        action: 'counterfeit.dismiss',
        before: s,
        after: closed,
        reason: decisionReason,
      });
      if (!notifiedBiz.has(s.reporterBusinessId)) {
        notifiedBiz.add(s.reporterBusinessId);
        await notifyBusinessUsers(
          s.reporterBusinessId,
          'N-314',
          { reportNo: s.reportNo ?? s.id.slice(0, 8), status: 'Dismissed' },
          { type: 'CounterfeitReport', id: s.id },
        );
      }
    }
  }

  return ok(next);
}

export async function resolveCounterfeitReport(params: {
  actor: User;
  platform: Business;
  id: string;
  note: string;
}): Promise<Result<CounterfeitReport>> {
  const perm = assertCan(params.actor, params.platform, 'counterfeit.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Report was not resolved.');
  const row = await db.counterfeitReports.get(params.id);
  if (!row) return fail('NotFound', 'CF_MISSING', 'Report not found.', 'Report was not resolved.');
  if (row.status === 'Investigating') {
    return fail(
      'StateConflict',
      'CF_RESOLVE',
      'Use Dismiss to close without recall, or Issue Recall first.',
      'Report was not resolved.',
    );
  }
  if (row.status !== 'RecallIssued') {
    return fail(
      'StateConflict',
      'CF_STATE',
      'Resolve after recall (or close investigation without recall via Dismiss).',
      'Report was not resolved.',
    );
  }
  if (!params.note.trim()) {
    return fail('Validation', 'CF_NOTE', 'Resolution note is required.', 'Report was not resolved.');
  }
  const ts = nowIso();
  const decisionReason = params.note.trim();
  const next: CounterfeitReport = {
    ...row,
    status: 'Resolved',
    outcome: 'Resolved',
    decisionReason,
    updatedAt: ts,
    internalNotes: [...row.internalNotes, `${ts}: Resolved — ${decisionReason}`],
  };
  await db.counterfeitReports.put(next);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'CounterfeitReport',
    entityId: row.id,
    action: 'counterfeit.resolve',
    before: row,
    after: next,
    reason: decisionReason,
  });

  const notifiedBiz = new Set<string>([row.reporterBusinessId]);
  await notifyBusinessUsers(
    row.reporterBusinessId,
    'N-314',
    { reportNo: row.reportNo ?? row.id.slice(0, 8), status: 'Resolved' },
    { type: 'CounterfeitReport', id: row.id },
  );

  // Cascade same-batch RecallIssued siblings
  if (row.batchId) {
    const siblings = await db.counterfeitReports
      .where('batchId')
      .equals(row.batchId)
      .filter((r) => r.id !== row.id && r.status === 'RecallIssued')
      .toArray();
    for (const s of siblings) {
      const closed: CounterfeitReport = {
        ...s,
        status: 'Resolved',
        outcome: 'Resolved',
        decisionReason,
        updatedAt: ts,
        internalNotes: [
          ...s.internalNotes,
          `${ts}: Resolved with ${row.reportNo ?? row.id} — ${decisionReason}`,
        ],
      };
      await db.counterfeitReports.put(closed);
      await writeAudit({
        actorId: params.actor.id,
        actorName: params.actor.name,
        businessId: params.platform.id,
        entityType: 'CounterfeitReport',
        entityId: s.id,
        action: 'counterfeit.resolve',
        before: s,
        after: closed,
        reason: decisionReason,
      });
      if (!notifiedBiz.has(s.reporterBusinessId)) {
        notifiedBiz.add(s.reporterBusinessId);
        await notifyBusinessUsers(
          s.reporterBusinessId,
          'N-314',
          { reportNo: s.reportNo ?? s.id.slice(0, 8), status: 'Resolved' },
          { type: 'CounterfeitReport', id: s.id },
        );
      }
    }
  }

  return ok(next);
}

/** Create a platform-wide counterfeit/banned product alert (hub-style). */
export async function createCounterfeitAlert(params: {
  actor: User;
  platform: Business;
  productName: string;
  manufacturer?: string;
  batchNumber?: string;
  description: string;
  alertType?: 'counterfeit' | 'banned' | 'spurious' | 'nsq' | 'recalled';
}): Promise<Result<import('../domain/entities/types').CounterfeitAlert>> {
  const perm = assertCan(params.actor, params.platform, 'counterfeit.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Alert was not created.');
  const productName = params.productName.trim();
  const description = params.description.trim();
  if (!productName || description.length < 5) {
    return fail('Validation', 'CF_ALERT', 'Product name and description are required.', 'Alert was not created.');
  }
  const ts = nowIso();
  const alertRow: import('../domain/entities/types').CounterfeitAlert = {
    id: newId(),
    productName,
    manufacturer: params.manufacturer?.trim(),
    batchNumber: params.batchNumber?.trim(),
    description,
    alertType: params.alertType ?? 'counterfeit',
    active: true,
    createdBy: params.actor.id,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.counterfeitAlerts.add(alertRow);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.platform.id,
    entityType: 'CounterfeitAlert',
    entityId: alertRow.id,
    action: 'counterfeit.alertCreate',
    after: alertRow,
  });
  return ok(alertRow);
}

/** Match product name against active alerts (case-insensitive contains). */
export async function matchCounterfeitAlerts(
  productName: string,
): Promise<import('../domain/entities/types').CounterfeitAlert[]> {
  const needle = productName.toLowerCase().trim();
  if (!needle) return [];
  const alerts = await db.counterfeitAlerts.filter((a) => a.active).toArray();
  return alerts.filter((a) => {
    const n = a.productName.toLowerCase();
    return n.includes(needle) || needle.includes(n);
  });
}

export async function setCounterfeitAlertActive(params: {
  actor: User;
  platform: Business;
  alertId: string;
  active: boolean;
}): Promise<Result<import('../domain/entities/types').CounterfeitAlert>> {
  const perm = assertCan(params.actor, params.platform, 'counterfeit.review');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Alert was not updated.');
  const existing = await db.counterfeitAlerts.get(params.alertId);
  if (!existing) return fail('NotFound', 'CF_ALERT_MISSING', 'Alert not found.', 'Alert was not updated.');
  const updated = { ...existing, active: params.active, updatedAt: nowIso() };
  await db.counterfeitAlerts.put(updated);
  return ok(updated);
}

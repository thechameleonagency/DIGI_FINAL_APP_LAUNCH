import type { AuditLog, Business, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';

export type ActivityFilters = {
  from?: string;
  to?: string;
  action?: string;
  entityType?: string;
};

/** Own-business activity log (CF-37). Admin platform log remains on /admin/audit. */
export async function listOwnActivity(params: {
  actor: User;
  business: Business;
  filters?: ActivityFilters;
}): Promise<Result<AuditLog[]>> {
  const perm = assertCan(params.actor, params.business, 'read.own');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Activity was not loaded.');
  if (params.business.type === 'Platform') {
    return fail('BusinessRule', 'ACT_PLAT', 'Use platform Audit for admin logs.', 'Activity was not loaded.');
  }
  let rows = await db.auditLogs.filter((r) => r.businessId === params.business.id).toArray();
  const f = params.filters ?? {};
  if (f.from) rows = rows.filter((r) => r.at.slice(0, 10) >= f.from!);
  if (f.to) rows = rows.filter((r) => r.at.slice(0, 10) <= f.to!);
  if (f.action) rows = rows.filter((r) => r.action.includes(f.action!));
  if (f.entityType) rows = rows.filter((r) => r.entityType === f.entityType);
  rows.sort((a, b) => b.at.localeCompare(a.at));
  return ok(rows);
}

export async function exportOwnActivityCsv(params: {
  actor: User;
  business: Business;
  filters?: ActivityFilters;
}): Promise<Result<{ filename: string; csv: string }>> {
  const list = await listOwnActivity(params);
  if (!list.ok) return list;
  const generatedAt = new Date().toISOString();
  const filters = JSON.stringify(params.filters ?? {});
  const header = [`# GeneratedAt=${generatedAt}`, `# Filters=${filters}`, 'at,actor,action,entityType,entityId,reason'];
  const body = list.data.map((r) =>
    [r.at, r.actorName ?? r.actorId, r.action, r.entityType, r.entityId, r.reason ?? '']
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(','),
  );
  const csv = [...header, ...body].join('\n');
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.business.id,
    entityType: 'AuditLog',
    entityId: params.business.id,
    action: 'activity.export',
    after: { count: list.data.length, filters: params.filters },
  });
  return ok({
    filename: `activity-${params.business.id.slice(0, 8)}-${generatedAt.slice(0, 10)}.csv`,
    csv,
  });
}

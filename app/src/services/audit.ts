import type { AuditLog } from '../domain/entities/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { nowIso } from '../domain/utils/clock';

export async function writeAudit(entry: Omit<AuditLog, 'id' | 'at'> & { at?: string }): Promise<void> {
  await db.auditLogs.add({
    id: newId(),
    at: entry.at ?? nowIso(),
    ...entry,
  });
}

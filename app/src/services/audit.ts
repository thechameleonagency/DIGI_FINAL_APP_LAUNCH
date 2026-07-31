import type { AuditLog } from '../domain/entities/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';

export async function writeAudit(entry: Omit<AuditLog, 'id' | 'at'> & { at?: string }): Promise<void> {
  await db.auditLogs.add({
    id: newId(),
    at: entry.at ?? new Date().toISOString(),
    ...entry,
  });
}

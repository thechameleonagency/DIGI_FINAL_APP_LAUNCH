import { resetCounters } from '../domain/utils/ids';
import { db } from './db';

const DOC_SERIES: Array<{ prefix: string; table: keyof typeof db; field: string }> = [
  { prefix: 'ORD', table: 'orders', field: 'orderNo' },
  { prefix: 'INV', table: 'invoices', field: 'invoiceNo' },
  { prefix: 'PAY', table: 'payments', field: 'paymentNo' },
  { prefix: 'DEL', table: 'deliveries', field: 'deliveryNo' },
  { prefix: 'RET', table: 'returns', field: 'returnNo' },
  { prefix: 'CN', table: 'creditNotes', field: 'creditNoteNo' },
  { prefix: 'TKT', table: 'supportTickets', field: 'ticketNo' },
  { prefix: 'SALE', table: 'customerSales', field: 'saleNo' },
];

/**
 * Derive in-memory doc-number floors from existing Dexie documents.
 * Keeps `nextNumber()` synchronous; call at boot and after workspace import.
 */
export async function hydrateCounters(): Promise<void> {
  const seed: Record<string, number> = {};

  for (const series of DOC_SERIES) {
    const table = db[series.table] as { toArray: () => Promise<Record<string, unknown>[]> };
    const rows = await table.toArray().catch(() => [] as Record<string, unknown>[]);
    for (const row of rows) {
      const value = row[series.field];
      if (typeof value !== 'string') continue;
      const match = value.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
      if (!match) continue;
      const [, prefix, year, numStr] = match;
      if (prefix !== series.prefix) continue;
      const key = `${prefix}-${year}`;
      const n = parseInt(numStr, 10);
      if (!Number.isFinite(n)) continue;
      seed[key] = Math.max(seed[key] ?? 0, n);
    }
  }

  resetCounters(seed);
}

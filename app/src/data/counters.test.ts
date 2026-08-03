import { beforeEach, describe, expect, it } from 'vitest';
import { getCounters, nextNumber, resetCounters, yearPrefix } from '../domain/utils/ids';
import { clearDb } from '../test/fixtures';
import { db } from './db';
import { hydrateCounters } from './counters';

describe('hydrateCounters (T-1 / F3)', () => {
  beforeEach(async () => {
    await clearDb();
    resetCounters();
  });

  it('floors ORD counter from existing order numbers', async () => {
    const y = yearPrefix();
    await db.orders.put({
      id: 'o1',
      orderNo: `ORD-${y}-0007`,
      pharmacyId: 'p',
      stockistId: 's',
      connectionId: 'c',
      status: 'Pending',
      lines: [],
      subtotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      deliveryAddress: {
        id: 'a',
        label: 'Home',
        line1: '1',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
      },
      idempotencyKey: 'k1',
      statusHistory: [],
      placedBy: 'u',
      placedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });
    await hydrateCounters();
    expect(getCounters()[`ORD-${y}`]).toBe(7);
    expect(nextNumber('ORD')).toBe(`ORD-${y}-0008`);
  });

  it('floors CF counter from existing counterfeit report numbers', async () => {
    const y = yearPrefix();
    await db.counterfeitReports.put({
      id: 'cf1',
      reportNo: `CF-${y}-0003`,
      reporterBusinessId: 'p',
      description: 'Existing report for hydrate test',
      evidenceFileIds: [],
      status: 'Reported',
      internalNotes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await hydrateCounters();
    expect(getCounters()[`CF-${y}`]).toBe(3);
    expect(nextNumber('CF')).toBe(`CF-${y}-0004`);
  });
});

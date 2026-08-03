import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { sendPaymentReminder } from './reminderService';
import { nowIso } from '../domain/utils/clock';

describe('sendPaymentReminder (CF-14)', () => {
  beforeEach(async () => {
    await clearDb();
    const phOwner = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Stockist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: phOwner.id });
    const stOwner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: stOwner.id });
    const ts = nowIso();
    await db.invoices.add({
      id: 'inv-1',
      invoiceNo: 'INV-1',
      orderId: 'ord-1',
      stockistId: 'biz-st',
      pharmacyId: 'biz-ph',
      status: 'Overdue',
      lines: [],
      subtotal: 100,
      taxTotal: 0,
      roundOff: 0,
      grandTotal: 100,
      outstanding: 100,
      paidAmount: 0,
      creditApplied: 0,
      issuedAt: ts,
      dueDate: '2020-01-01',
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    });
  });

  it('notifies pharmacy N-307 and posts message; throttles 1/day', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const first = await sendPaymentReminder({ actor, stockist, invoiceId: 'inv-1' });
    expect(first.ok).toBe(true);
    const n = await db.notifications.filter((x) => x.code === 'N-307').first();
    expect(n).toBeTruthy();
    expect(await db.messages.count()).toBeGreaterThan(0);
    const inv = await db.invoices.get('inv-1');
    expect(inv?.outstanding).toBe(100);

    const second = await sendPaymentReminder({ actor, stockist, invoiceId: 'inv-1' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('REM_THROTTLE');
  });

  it('blocks settled invoices (E-CF-14a)', async () => {
    await db.invoices.update('inv-1', { status: 'Paid', outstanding: 0, paidAmount: 100 });
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await sendPaymentReminder({ actor, stockist, invoiceId: 'inv-1' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('REM_SETTLED');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { runPolicyClock } from './supportService';

describe('runPolicyClock emitters (T-1 / F11)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('marks overdue invoices and emits N-028 deduped', async () => {
    const owner = await makeActor({ id: 'ph-owner', businessId: 'biz-ph', role: 'Owner' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: owner.id, name: 'Care' });
    await db.platformSettings.put({
      id: 'platform',
      returnWindowDays: 7,
      inviteTtlDays: 7,
      verificationSlaHours: 72,
      orderSlaHours: 24,
      paymentSlaHours: 48,
      paymentProofMandatory: false,
      billAheadAllowed: false,
      roundingMode: 'nearest',
      expiryNearDays: 90,
      expiryCriticalDays: 30,
      creditNoteAutoExpire: false,
    });
    const past = new Date(Date.now() - 86400000 * 3).toISOString();
    await db.invoices.put({
      id: 'inv-1',
      invoiceNo: 'INV-TEST-1',
      orderId: 'o1',
      stockistId: 'biz-st',
      pharmacyId: 'biz-ph',
      status: 'Issued',
      lines: [],
      subtotal: 100,
      taxTotal: 0,
      roundOff: 0,
      grandTotal: 100,
      outstanding: 100,
      paidAmount: 0,
      creditApplied: 0,
      issuedAt: past,
      dueDate: past,
      statusHistory: [],
      createdAt: past,
      updatedAt: past,
      version: 1,
    });

    await runPolicyClock();
    await runPolicyClock();

    const inv = await db.invoices.get('inv-1');
    expect(inv?.status).toBe('Overdue');
    const notes = await db.notifications.where('userId').equals(owner.id).toArray();
    const n028 = notes.filter((n) => n.code === 'N-028' && n.entityId === 'inv-1');
    expect(n028).toHaveLength(1);
  });

  it('expires announcements past endsAt', async () => {
    await db.platformSettings.put({
      id: 'platform',
      returnWindowDays: 7,
      inviteTtlDays: 7,
      verificationSlaHours: 72,
      orderSlaHours: 24,
      paymentSlaHours: 48,
      paymentProofMandatory: false,
      billAheadAllowed: false,
      roundingMode: 'nearest',
      expiryNearDays: 90,
      expiryCriticalDays: 30,
      creditNoteAutoExpire: false,
    });
    const past = new Date(Date.now() - 3600000).toISOString();
    await db.announcements.put({
      id: 'ann-1',
      title: 'Old',
      body: 'Gone',
      targetRoles: ['Pharmacy'],
      placements: ['All Dashboards'],
      startsAt: past,
      endsAt: past,
      active: true,
      createdBy: 'admin',
      createdAt: past,
    });
    await runPolicyClock();
    expect((await db.announcements.get('ann-1'))?.active).toBe(false);
  });
});

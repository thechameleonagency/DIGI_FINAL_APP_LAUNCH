import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { hasNotification, markRead, resolveNotificationLink, setMutedCategories } from './notificationService';
import { emitNotification } from './notifications';

describe('resolveNotificationLink', () => {
  it('routes SupportTicket by id', () => {
    expect(
      resolveNotificationLink({ entityType: 'SupportTicket', entityId: 't1', code: 'N-044' }, 'pharmacy'),
    ).toBe('/pharmacy/support/t1');
  });

  it('routes Verification to admin detail', () => {
    expect(
      resolveNotificationLink({ entityType: 'Verification', entityId: 'v1', code: 'N-002' }, 'admin'),
    ).toBe('/admin/verifications/v1');
  });

  it('never uses N-code in the path', () => {
    const link = resolveNotificationLink({ entityType: 'Order', entityId: 'o1', code: 'N-016' }, 'stockist');
    expect(link.includes('N-016')).toBe(false);
    expect(link.startsWith('/stockist/')).toBe(true);
  });

  it('deep-links Order/Invoice/Payment by human number', () => {
    expect(
      resolveNotificationLink(
        { entityType: 'Order', entityId: 'o1', entityNo: 'ORD-1042', code: 'N-016' },
        'stockist',
      ),
    ).toBe('/stockist/orders/ORD-1042');
    expect(
      resolveNotificationLink(
        { entityType: 'Invoice', entityId: 'i1', entityNo: 'INV-9', code: 'N-028' },
        'pharmacy',
      ),
    ).toBe('/pharmacy/invoices/INV-9');
    expect(
      resolveNotificationLink(
        { entityType: 'Payment', entityId: 'p1', entityNo: 'PAY-3', code: 'N-030' },
        'admin',
      ),
    ).toBe('/admin/payments/PAY-3');
  });
});

describe('notification fan-out prefs (T-1)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('markRead flips Unread → Read', async () => {
    const user = await makeActor({ id: 'nu1', businessId: 'nb1', role: 'Stockist' });
    await makeBusiness({ id: 'nb1', type: 'Pharmacy', ownerUserId: user.id });
    await db.notifications.add({
      id: 'n1',
      userId: user.id,
      businessId: 'nb1',
      code: 'N-001',
      title: 't',
      body: 'b',
      status: 'Unread',
      createdAt: new Date().toISOString(),
    });
    await markRead('n1', user.id);
    expect((await db.notifications.get('n1'))?.status).toBe('Read');
  });

  it('muted category skips emitNotification', async () => {
    const user = await makeActor({ id: 'nu2', businessId: 'nb2', role: 'Stockist' });
    await makeBusiness({ id: 'nb2', type: 'Pharmacy', ownerUserId: user.id });
    await setMutedCategories(user.id, ['Order']);
    await emitNotification({
      userId: user.id,
      businessId: 'nb2',
      code: 'N-016',
      vars: { orderNo: 'ORD-1', pharmacy: 'P' },
      entityType: 'Order',
      entityId: 'o1',
    });
    expect(await db.notifications.where('userId').equals(user.id).count()).toBe(0);
  });

  it('hasNotification detects prior code+entity', async () => {
    const user = await makeActor({ id: 'nu3', businessId: 'nb3', role: 'Stockist' });
    await db.notifications.add({
      id: 'n3',
      userId: user.id,
      businessId: 'nb3',
      code: 'N-028',
      title: 't',
      body: 'b',
      status: 'Unread',
      entityId: 'inv-9',
      createdAt: new Date().toISOString(),
    });
    expect(await hasNotification(user.id, 'N-028', 'inv-9')).toBe(true);
    expect(await hasNotification(user.id, 'N-028', 'other')).toBe(false);
  });
});

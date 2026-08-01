import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { buildBillQrPayload } from '../domain/utils/billIntegrity';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { verifyBillPayload } from './verifyBillService';

describe('verifyBillPayload (CF-15)', () => {
  beforeEach(async () => {
    await clearDb();
    const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Owner' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id, name: 'CarePlus' });
    const st = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Owner' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: st.id, name: 'MedRoute' });
    const ts = '2026-01-15T10:00:00.000Z';
    await db.invoices.add({
      id: 'inv-1',
      invoiceNo: 'INV-100',
      orderId: 'ord-1',
      stockistId: 'biz-st',
      pharmacyId: 'biz-ph',
      status: 'Issued',
      lines: [],
      subtotal: 100,
      taxTotal: 12,
      roundOff: 0,
      grandTotal: 112,
      outstanding: 112,
      paidAmount: 0,
      creditApplied: 0,
      issuedAt: ts,
      statusHistory: [],
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    });
  });

  it('returns Genuine for matching payload', async () => {
    const inv = (await db.invoices.get('inv-1'))!;
    const payload = buildBillQrPayload({ invoice: inv, stockistName: 'MedRoute', pharmacyName: 'CarePlus' });
    const res = await verifyBillPayload(JSON.stringify(payload));
    expect(res.outcome).toBe('Genuine');
    if (res.outcome === 'Genuine') expect(res.voided).toBe(false);
  });

  it('detects tampered amount as Mismatch (AC-Q05 / E-CF-15a)', async () => {
    const inv = (await db.invoices.get('inv-1'))!;
    const payload = buildBillQrPayload({ invoice: inv, stockistName: 'MedRoute', pharmacyName: 'CarePlus' });
    payload.grandTotal = 999;
    const res = await verifyBillPayload(JSON.stringify(payload));
    expect(res.outcome).toBe('Mismatch');
    if (res.outcome === 'Mismatch') expect(res.differingFields).toContain('amount');
  });

  it('returns NotFound for unknown invoice (E-CF-15b)', async () => {
    const res = await verifyBillPayload(
      JSON.stringify({
        invoiceNo: 'INV-UNKNOWN',
        stockistName: 'X',
        pharmacyName: 'Y',
        grandTotal: 1,
        issuedAt: '2026-01-01',
        integrity: 'deadbeef',
        stockistId: 'x',
        pharmacyId: 'y',
      }),
    );
    expect(res.outcome).toBe('NotFound');
  });
});

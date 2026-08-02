import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness } from '../test/fixtures';
import { exportAdminReport, exportPharmacyReport, exportStockistReport } from './reportService';

const ts = '2026-05-01T12:00:00.000Z';

describe('reportService (CF-26)', () => {
  beforeEach(async () => {
    await clearDb();
    const admin = await makeActor({ id: 'u-admin', businessId: 'biz-plat', role: 'SupportManager' });
    await makeBusiness({ id: 'biz-plat', type: 'Platform', ownerUserId: admin.id, name: 'Platform' });
    const ph = await makeActor({ id: 'u-ph', businessId: 'biz-ph', role: 'Stockist' });
    await makeBusiness({ id: 'biz-ph', type: 'Pharmacy', ownerUserId: ph.id, name: 'CarePlus' });
    const st = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: st.id, name: 'MedRoute' });
    await db.invoices.add({
      id: 'inv-1',
      invoiceNo: 'INV-1',
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
      genericCommissionPercent: 0.5,
      ethicalCommissionFlatPerProduct: 1,
      offlineManagedFlatPerLine: 1,
    });
  });

  it('admin GMV and trade-commission CSVs include timestamp + filters', async () => {
    const admin = (await db.users.get('u-admin'))!;
    const platform = (await db.businesses.get('biz-plat'))!;
    const gmv = await exportAdminReport({
      actor: admin,
      platform,
      report: 'gmv-monthly',
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(gmv.ok).toBe(true);
    if (!gmv.ok) return;
    expect(gmv.data.csv).toMatch(/GeneratedAt=/);
    expect(gmv.data.csv).toMatch(/Filters=/);
    expect(gmv.data.csv).toContain('2026-05');
    expect(gmv.data.csv).toContain('112');

    const comm = await exportAdminReport({ actor: admin, platform, report: 'trade-commission' });
    expect(comm.ok).toBe(true);
    if (comm.ok) expect(comm.data.csv).toMatch(/commission|trade/i);
  });

  it('pharmacy and stockist reports export with audit', async () => {
    const ph = (await db.users.get('u-ph'))!;
    const pharmacy = (await db.businesses.get('biz-ph'))!;
    const st = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;

    const gst = await exportPharmacyReport({ actor: ph, pharmacy, report: 'gst-summary' });
    expect(gst.ok).toBe(true);
    if (gst.ok) expect(gst.data.csv).toContain('input_tax_total=12');

    const sales = await exportStockistReport({ actor: st, stockist, report: 'sales' });
    expect(sales.ok).toBe(true);
    if (sales.ok) {
      expect(sales.data.csv).toContain('INV-1');
      expect(sales.data.filterSummary).toContain('report=sales');
    }

    const audits = await db.auditLogs.toArray();
    expect(audits.some((a) => a.action === 'report.export')).toBe(true);
  });
});

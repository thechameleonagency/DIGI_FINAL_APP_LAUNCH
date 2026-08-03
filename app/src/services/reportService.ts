import { db } from '../data/db';
import type { Business, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { invoiceOutstanding } from '../domain/calc';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { nowIso } from '../domain/utils/clock';

export type ReportCsv = {
  filename: string;
  csv: string;
  filterSummary: string;
  generatedAt: string;
};

function stamp(filters: string): { generatedAt: string; header: string[] } {
  const generatedAt = nowIso();
  return {
    generatedAt,
    header: [`# GeneratedAt=${generatedAt}`, `# Filters=${filters}`],
  };
}

function toCsv(headerLines: string[], columns: string[], rows: (string | number)[][]): string {
  const body = [
    columns.join(','),
    ...rows.map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(','),
    ),
  ];
  return [...headerLines, ...body].join('\n');
}

function inPeriod(iso: string | undefined, from?: string, to?: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function expiryBand(expiryDate: string, today = new Date()): string {
  const days = Math.floor((new Date(expiryDate).getTime() - today.getTime()) / 86400000);
  if (days < 0) return 'Expired';
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

async function auditExport(actor: User, business: Business, reportId: string, filters: string) {
  await writeAudit({
    actorId: actor.id,
    actorName: actor.name,
    businessId: business.id,
    entityType: 'Report',
    entityId: reportId,
    action: 'report.export',
    after: { reportId, filters, at: nowIso() },
  });
}

/** Admin canned reports (CF-26). */
export async function exportAdminReport(params: {
  actor: User;
  platform: Business;
  report:
    | 'registrations'
    | 'verification-throughput'
    | 'gmv-monthly'
    | 'tickets'
    | 'trade-commission';
  from?: string;
  to?: string;
}): Promise<Result<ReportCsv>> {
  const perm = assertCan(params.actor, params.platform, 'audit.export');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Report was not exported.');
  const filters = `from=${params.from || 'all'};to=${params.to || 'all'};report=${params.report}`;
  const { generatedAt, header } = stamp(filters);

  if (params.report === 'registrations') {
    const businesses = await db.businesses.toArray();
    const rows = businesses
      .filter((b) => b.type !== 'Platform' && inPeriod(b.createdAt, params.from, params.to))
      .map((b) => [b.createdAt.slice(0, 10), b.type, b.name, b.city, b.verificationStatus, b.accountStatus]);
    const csv = toCsv(header, ['date', 'type', 'name', 'city', 'verification', 'account'], rows);
    await auditExport(params.actor, params.platform, params.report, filters);
    return ok({ filename: `admin-registrations-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  if (params.report === 'verification-throughput') {
    const vers = (await db.verifications.toArray()).filter((v) =>
      inPeriod(v.submittedAt ?? v.createdAt, params.from, params.to),
    );
    const submitted = vers.length;
    const approved = vers.filter((v) => v.status === 'Approved').length;
    const rejected = vers.filter((v) => v.status === 'Rejected').length;
    const days: number[] = [];
    for (const v of vers.filter((x) => x.status === 'Approved' && x.submittedAt && x.reviewedAt)) {
      days.push(
        Math.max(
          0,
          (new Date(v.reviewedAt!).getTime() - new Date(v.submittedAt!).getTime()) / 86400000,
        ),
      );
    }
    const avgDays = days.length ? (days.reduce((s, d) => s + d, 0) / days.length).toFixed(2) : '0';
    const csv = toCsv(
      header,
      ['metric', 'value'],
      [
        ['submitted', submitted],
        ['approved', approved],
        ['rejected', rejected],
        ['avg_days_to_approve', avgDays],
      ],
    );
    await auditExport(params.actor, params.platform, params.report, filters);
    return ok({
      filename: `admin-verification-throughput-${generatedAt.slice(0, 10)}.csv`,
      csv,
      filterSummary: filters,
      generatedAt,
    });
  }

  if (params.report === 'gmv-monthly') {
    const invoices = (await db.invoices.toArray()).filter(
      (i) => i.status !== 'Void' && i.status !== 'Draft' && inPeriod(i.issuedAt ?? i.createdAt, params.from, params.to),
    );
    const byMonth = new Map<string, number>();
    for (const i of invoices) {
      const m = (i.issuedAt ?? i.createdAt).slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + i.grandTotal);
    }
    const rows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => [m, v]);
    const csv = toCsv(header, ['month', 'gmv'], rows);
    await auditExport(params.actor, params.platform, params.report, filters);
    return ok({ filename: `admin-gmv-monthly-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  if (params.report === 'tickets') {
    const tickets = (await db.supportTickets.toArray()).filter((t) =>
      inPeriod(t.createdAt, params.from, params.to),
    );
    const rows = tickets.map((t) => [t.ticketNo, t.createdAt.slice(0, 10), t.status, t.businessId, t.subject ?? '']);
    const resolved = tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length;
    const summary = toCsv(
      header,
      ['ticketNo', 'date', 'status', 'businessId', 'subject'],
      rows,
    );
    const csv = `${summary}\n# total=${tickets.length};resolved=${resolved}`;
    await auditExport(params.actor, params.platform, params.report, filters);
    return ok({ filename: `admin-tickets-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  // trade-commission — sum of order-line commissionAmount snapshots
  const orders = (await db.orders.toArray()).filter((o) => inPeriod(o.placedAt, params.from, params.to));
  const rows: (string | number)[][] = [];
  let total = 0;
  for (const o of orders) {
    for (const l of o.lines) {
      const c = l.commissionAmount ?? 0;
      if (!c) continue;
      total += c;
      rows.push([
        o.placedAt.slice(0, 10),
        o.orderNo,
        o.stockistId,
        o.pharmacyId || o.managedPharmacyId || '',
        l.sku,
        l.pricingClass ?? '',
        l.commissionMode ?? '',
        c,
      ]);
    }
  }
  const csv = `${toCsv(
    header,
    ['date', 'orderNo', 'stockistId', 'pharmacyOrManagedId', 'sku', 'pricingClass', 'mode', 'commission'],
    rows,
  )}\n# totalCommission=${total}`;
  await auditExport(params.actor, params.platform, params.report, filters);
  return ok({
    filename: `admin-trade-commission-${generatedAt.slice(0, 10)}.csv`,
    csv,
    filterSummary: filters,
    generatedAt,
  });
}

/** Pharmacy canned reports (CF-26). */
export async function exportPharmacyReport(params: {
  actor: User;
  pharmacy: Business;
  report: 'purchases' | 'gst-summary' | 'stock-aging' | 'outstanding';
  from?: string;
  to?: string;
}): Promise<Result<ReportCsv>> {
  const perm = assertCan(params.actor, params.pharmacy, 'read.own');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Report was not exported.');
  if (params.pharmacy.type !== 'Pharmacy') {
    return fail('BusinessRule', 'RPT_ROLE', 'Pharmacy reports only.', 'Report was not exported.');
  }
  const filters = `pharmacy=${params.pharmacy.id};from=${params.from || 'all'};to=${params.to || 'all'};report=${params.report}`;
  const { generatedAt, header } = stamp(filters);
  const pid = params.pharmacy.id;

  if (params.report === 'purchases') {
    const orders = (await db.orders.where('pharmacyId').equals(pid).toArray()).filter((o) =>
      inPeriod(o.placedAt, params.from, params.to),
    );
    const businesses = await db.businesses.toArray();
    const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id;
    const rows = orders.map((o) => [
      o.placedAt.slice(0, 10),
      o.orderNo,
      nameOf(o.stockistId),
      o.status,
      o.grandTotal,
    ]);
    const csv = toCsv(header, ['date', 'orderNo', 'stockist', 'status', 'total'], rows);
    await auditExport(params.actor, params.pharmacy, params.report, filters);
    return ok({ filename: `pharmacy-purchases-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  if (params.report === 'gst-summary') {
    const invoices = (await db.invoices.where('pharmacyId').equals(pid).toArray()).filter(
      (i) => i.status !== 'Void' && i.status !== 'Draft' && inPeriod(i.issuedAt ?? i.createdAt, params.from, params.to),
    );
    const rows = invoices.map((i) => [
      (i.issuedAt ?? i.createdAt).slice(0, 10),
      i.invoiceNo,
      i.subtotal,
      i.taxTotal,
      i.grandTotal,
    ]);
    const tax = invoices.reduce((s, i) => s + i.taxTotal, 0);
    const csv = `${toCsv(header, ['date', 'invoiceNo', 'taxable', 'tax', 'grandTotal'], rows)}\n# input_tax_total=${tax}`;
    await auditExport(params.actor, params.pharmacy, params.report, filters);
    return ok({ filename: `pharmacy-gst-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  if (params.report === 'stock-aging') {
    const inv = await db.pharmacyInventory.where('pharmacyId').equals(pid).toArray();
    const rows = inv.map((r) => {
      const exp = r.expiryDate ?? '';
      return [r.productName || r.productId, r.batchNumber ?? '', exp, exp ? expiryBand(exp) : 'n/a', r.onHand];
    });
    const csv = toCsv(header, ['product', 'batch', 'expiry', 'band', 'qty'], rows);
    await auditExport(params.actor, params.pharmacy, params.report, filters);
    return ok({ filename: `pharmacy-stock-aging-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  // outstanding by supplier
  const invoices = (await db.invoices.where('pharmacyId').equals(pid).toArray()).filter(
    (i) => i.status !== 'Void' && invoiceOutstanding(i) > 0,
  );
  const businesses = await db.businesses.toArray();
  const bySt = new Map<string, number>();
  for (const i of invoices) {
    bySt.set(i.stockistId, (bySt.get(i.stockistId) ?? 0) + invoiceOutstanding(i));
  }
  const rows = [...bySt.entries()].map(([id, amt]) => [
    businesses.find((b) => b.id === id)?.name ?? id,
    amt,
  ]);
  const csv = toCsv(header, ['stockist', 'outstanding'], rows);
  await auditExport(params.actor, params.pharmacy, params.report, filters);
  return ok({ filename: `pharmacy-outstanding-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
}

/** Stockist canned reports (CF-26). */
export async function exportStockistReport(params: {
  actor: User;
  stockist: Business;
  report: 'sales' | 'gst-summary' | 'outstanding' | 'stock-aging';
  from?: string;
  to?: string;
}): Promise<Result<ReportCsv>> {
  const perm = assertCan(params.actor, params.stockist, 'read.own');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Report was not exported.');
  if (params.stockist.type !== 'Stockist') {
    return fail('BusinessRule', 'RPT_ROLE', 'Stockist reports only.', 'Report was not exported.');
  }
  const filters = `stockist=${params.stockist.id};from=${params.from || 'all'};to=${params.to || 'all'};report=${params.report}`;
  const { generatedAt, header } = stamp(filters);
  const sid = params.stockist.id;
  const businesses = await db.businesses.toArray();
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? id;

  if (params.report === 'sales') {
    const invoices = (await db.invoices.where('stockistId').equals(sid).toArray()).filter(
      (i) => i.status !== 'Void' && i.status !== 'Draft' && inPeriod(i.issuedAt ?? i.createdAt, params.from, params.to),
    );
    const rows = invoices.map((i) => [
      (i.issuedAt ?? i.createdAt).slice(0, 10),
      i.invoiceNo,
      nameOf(i.pharmacyId),
      i.grandTotal,
      i.status,
    ]);
    const csv = toCsv(header, ['date', 'invoiceNo', 'pharmacy', 'total', 'status'], rows);
    await auditExport(params.actor, params.stockist, params.report, filters);
    return ok({ filename: `stockist-sales-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  if (params.report === 'gst-summary') {
    const invoices = (await db.invoices.where('stockistId').equals(sid).toArray()).filter(
      (i) => i.status !== 'Void' && i.status !== 'Draft' && inPeriod(i.issuedAt ?? i.createdAt, params.from, params.to),
    );
    const rows = invoices.map((i) => [
      (i.issuedAt ?? i.createdAt).slice(0, 10),
      i.invoiceNo,
      i.subtotal,
      i.taxTotal,
      i.grandTotal,
    ]);
    const tax = invoices.reduce((s, i) => s + i.taxTotal, 0);
    const csv = `${toCsv(header, ['date', 'invoiceNo', 'taxable', 'tax', 'grandTotal'], rows)}\n# output_tax_total=${tax}`;
    await auditExport(params.actor, params.stockist, params.report, filters);
    return ok({ filename: `stockist-gst-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  if (params.report === 'outstanding') {
    const invoices = (await db.invoices.where('stockistId').equals(sid).toArray()).filter(
      (i) => i.status !== 'Void' && invoiceOutstanding(i) > 0,
    );
    const byPh = new Map<string, { amt: number; oldest: string }>();
    for (const i of invoices) {
      const cur = byPh.get(i.pharmacyId) ?? { amt: 0, oldest: i.issuedAt ?? i.createdAt };
      cur.amt += invoiceOutstanding(i);
      const issued = i.issuedAt ?? i.createdAt;
      if (issued < cur.oldest) cur.oldest = issued;
      byPh.set(i.pharmacyId, cur);
    }
    const now = Date.now();
    const rows = [...byPh.entries()].map(([id, v]) => {
      const age = Math.floor((now - new Date(v.oldest).getTime()) / 86400000);
      const band = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
      return [nameOf(id), v.amt, band, age];
    });
    const csv = toCsv(header, ['pharmacy', 'outstanding', 'aging_band', 'oldest_days'], rows);
    await auditExport(params.actor, params.stockist, params.report, filters);
    return ok({ filename: `stockist-outstanding-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
  }

  // stock aging
  const batches = await db.batches.where('stockistId').equals(sid).toArray();
  const products = await db.products.where('stockistId').equals(sid).toArray();
  const rows = batches.map((b) => {
    const p = products.find((x) => x.id === b.productId);
    const value = b.onHand * (p?.ptr ?? 0);
    return [p?.name ?? b.productId, b.batchNumber, b.expiryDate, expiryBand(b.expiryDate), b.onHand, b.status, value];
  });
  const csv = toCsv(header, ['product', 'batch', 'expiry', 'band', 'onHand', 'status', 'value_at_ptr'], rows);
  await auditExport(params.actor, params.stockist, params.report, filters);
  return ok({ filename: `stockist-stock-aging-${generatedAt.slice(0, 10)}.csv`, csv, filterSummary: filters, generatedAt });
}

export function downloadReportCsv(report: ReportCsv): void {
  const blob = new Blob([report.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = report.filename;
  a.click();
  URL.revokeObjectURL(url);
}

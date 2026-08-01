import { db } from '../data/db';
import {
  buildBillQrPayload,
  invoiceIntegrityCode,
  parseBillQrPayload,
  type VerifyBillResult,
} from '../domain/utils/billIntegrity';

export async function verifyBillPayload(raw: string): Promise<VerifyBillResult> {
  const parsed = parseBillQrPayload(raw.trim());
  if (!parsed.ok) {
    return { outcome: 'NotFound', reason: parsed.reason };
  }
  const payload = parsed.payload;
  const invoice =
    (await db.invoices.where('invoiceNo').equals(payload.invoiceNo).first()) ??
    (await db.invoices.filter((i) => i.invoiceNo === payload.invoiceNo).first());

  if (!invoice) {
    return {
      outcome: 'NotFound',
      reason: 'Invoice not found on this local DigiSwasthya installation. Verification is per-installation.',
    };
  }

  const stockist = await db.businesses.get(invoice.stockistId);
  const pharmacy = await db.businesses.get(invoice.pharmacyId);
  const issuedAt = invoice.issuedAt ?? invoice.createdAt;
  const expectedIntegrity = invoiceIntegrityCode({
    invoiceNo: invoice.invoiceNo,
    stockistId: invoice.stockistId,
    pharmacyId: invoice.pharmacyId,
    grandTotal: invoice.grandTotal,
    issuedAt,
  });

  const differing: string[] = [];
  if (payload.grandTotal !== invoice.grandTotal) differing.push('amount');
  if (payload.issuedAt && payload.issuedAt !== issuedAt) differing.push('issue date');
  if (payload.stockistId && payload.stockistId !== invoice.stockistId) differing.push('stockist');
  if (payload.pharmacyId && payload.pharmacyId !== invoice.pharmacyId) differing.push('pharmacy');
  if (payload.stockistName && stockist && payload.stockistName !== stockist.name) differing.push('stockist name');
  if (payload.pharmacyName && pharmacy && payload.pharmacyName !== pharmacy.name) differing.push('pharmacy name');
  // Integrity-only failure (fields claim match but code does not) → name integrity
  if (!differing.length && payload.integrity !== expectedIntegrity) differing.push('integrity');

  if (differing.length) {
    return { outcome: 'Mismatch', differingFields: differing };
  }

  return {
    outcome: 'Genuine',
    voided: invoice.status === 'Void',
    voidDate: invoice.status === 'Void' ? invoice.updatedAt : undefined,
    summary: {
      invoiceNo: invoice.invoiceNo,
      stockistName: stockist?.name ?? invoice.stockistId,
      pharmacyName: pharmacy?.name ?? invoice.pharmacyId,
      grandTotal: invoice.grandTotal,
      issuedAt,
    },
  };
}

export { buildBillQrPayload };

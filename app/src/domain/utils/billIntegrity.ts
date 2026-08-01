import type { Invoice } from '../entities/types';

/** Deterministic integrity code over immutable invoice fields (CF-15 / PLAN/05). */
export function invoiceIntegrityCode(fields: {
  invoiceNo: string;
  stockistId: string;
  pharmacyId: string;
  grandTotal: number;
  issuedAt: string;
}): string {
  const material = [
    fields.invoiceNo,
    fields.stockistId,
    fields.pharmacyId,
    String(fields.grandTotal),
    fields.issuedAt,
  ].join('|');
  let h = 2166136261;
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type BillQrPayload = {
  invoiceNo: string;
  stockistName: string;
  pharmacyName: string;
  grandTotal: number;
  issuedAt: string;
  integrity: string;
  stockistId: string;
  pharmacyId: string;
};

export function buildBillQrPayload(params: {
  invoice: Invoice;
  stockistName: string;
  pharmacyName: string;
}): BillQrPayload {
  const issuedAt = params.invoice.issuedAt ?? params.invoice.createdAt;
  return {
    invoiceNo: params.invoice.invoiceNo,
    stockistName: params.stockistName,
    pharmacyName: params.pharmacyName,
    grandTotal: params.invoice.grandTotal,
    issuedAt,
    stockistId: params.invoice.stockistId,
    pharmacyId: params.invoice.pharmacyId,
    integrity: invoiceIntegrityCode({
      invoiceNo: params.invoice.invoiceNo,
      stockistId: params.invoice.stockistId,
      pharmacyId: params.invoice.pharmacyId,
      grandTotal: params.invoice.grandTotal,
      issuedAt,
    }),
  };
}

export type VerifyBillResult =
  | {
      outcome: 'Genuine';
      voided: boolean;
      voidDate?: string;
      summary: {
        invoiceNo: string;
        stockistName: string;
        pharmacyName: string;
        grandTotal: number;
        issuedAt: string;
      };
    }
  | { outcome: 'Mismatch'; differingFields: string[] }
  | { outcome: 'NotFound'; reason: string };

export function parseBillQrPayload(raw: string): { ok: true; payload: BillQrPayload } | { ok: false; reason: string } {
  try {
    const data = JSON.parse(raw) as Partial<BillQrPayload>;
    if (!data.invoiceNo || data.grandTotal == null || !data.integrity) {
      return { ok: false, reason: 'Payload is missing required fields.' };
    }
    return {
      ok: true,
      payload: {
        invoiceNo: String(data.invoiceNo),
        stockistName: String(data.stockistName ?? ''),
        pharmacyName: String(data.pharmacyName ?? ''),
        grandTotal: Number(data.grandTotal),
        issuedAt: String(data.issuedAt ?? ''),
        integrity: String(data.integrity),
        stockistId: String(data.stockistId ?? ''),
        pharmacyId: String(data.pharmacyId ?? ''),
      },
    };
  } catch {
    return { ok: false, reason: 'Payload is not valid JSON.' };
  }
}

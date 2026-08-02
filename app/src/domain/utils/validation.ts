/** Format helpers for registration / profile (canvas DigiSwasthya.dc.html parity). */

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeGstin(gst: string): string {
  return gst.replace(/\s/g, '').toUpperCase();
}

export function normalizePan(pan: string): string {
  return pan.replace(/\s/g, '').toUpperCase();
}

export function normalizeIfsc(ifsc: string): string {
  return ifsc.replace(/\s/g, '').toUpperCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isPhone(value: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(value));
}

export function isPin(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export function isGstin(value: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizeGstin(value));
}

export function isPan(value: string): boolean {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(normalizePan(value));
}

export function isIfsc(value: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalizeIfsc(value));
}

export function isLicenseNo(value: string): boolean {
  const v = value.trim();
  return v.length >= 4 && v.length <= 40;
}

export function isUpi(value: string): boolean {
  if (!value.trim()) return true;
  return /^[\w.\-]{2,}@[\w]{2,}$/i.test(value.trim());
}

/**
 * Parse a numeric field distinguishing empty from a real 0, and rejecting non-finite.
 * Prefer this over `Number(raw)` — `Number('') === 0` silently traps empty inputs.
 */
export type ParsedNumberInput =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'ok'; value: number };

export function parseNumberInput(raw: string): ParsedNumberInput {
  const t = raw.trim();
  if (t === '') return { status: 'empty' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { status: 'invalid' };
  return { status: 'ok', value: n };
}

/** Next controlled value for number inputs that allow a blank mid-edit. */
export function nextNumberFieldValue(raw: string, previous: number | ''): number | '' {
  const parsed = parseNumberInput(raw);
  if (parsed.status === 'empty') return '';
  if (parsed.status === 'invalid') return previous;
  return parsed.value;
}

/** Rough bank name hint from IFSC bank code (first 4 letters). */
export function bankNameFromIfsc(ifsc: string): string | undefined {
  const code = normalizeIfsc(ifsc).slice(0, 4);
  const map: Record<string, string> = {
    HDFC: 'HDFC Bank',
    ICIC: 'ICICI Bank',
    SBIN: 'State Bank of India',
    UTIB: 'Axis Bank',
    PUNB: 'Punjab National Bank',
    YESB: 'Yes Bank',
    KKBK: 'Kotak Mahindra Bank',
    INDB: 'IndusInd Bank',
    BARB: 'Bank of Baroda',
  };
  return map[code];
}

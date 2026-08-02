import { describe, expect, it } from 'vitest';
import {
  bankNameFromIfsc,
  isEmail,
  isGstin,
  isIfsc,
  isLicenseNo,
  isPan,
  isPhone,
  isPin,
  nextNumberFieldValue,
  normalizePhone,
  parseNumberInput,
} from './validation';

describe('validation helpers', () => {
  it('normalizes and validates phone', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(isPhone('9876543210')).toBe(true);
    expect(isPhone('5876543210')).toBe(false);
  });

  it('validates GSTIN / PAN / PIN / IFSC / email / license', () => {
    expect(isGstin('27ABCDE1234F1Z5')).toBe(true);
    expect(isGstin('27E2E12345678Z1')).toBe(false);
    expect(isPan('ABCDE1234F')).toBe(true);
    expect(isPan('ABCDE12345')).toBe(false);
    expect(isPin('411001')).toBe(true);
    expect(isPin('41100')).toBe(false);
    expect(isIfsc('HDFC0001234')).toBe(true);
    expect(isIfsc('HDFC1234567')).toBe(false);
    expect(isEmail('a@b.co')).toBe(true);
    expect(isLicenseNo('MH-20-12345')).toBe(true);
    expect(bankNameFromIfsc('HDFC0001234')).toBe('HDFC Bank');
  });

  it('parseNumberInput distinguishes empty from zero', () => {
    expect(parseNumberInput('')).toEqual({ status: 'empty' });
    expect(parseNumberInput('   ')).toEqual({ status: 'empty' });
    expect(parseNumberInput('0')).toEqual({ status: 'ok', value: 0 });
    expect(parseNumberInput('12.5')).toEqual({ status: 'ok', value: 12.5 });
    expect(parseNumberInput('abc')).toEqual({ status: 'invalid' });
    expect(nextNumberFieldValue('', 5)).toBe('');
    expect(nextNumberFieldValue('0', 5)).toBe(0);
    expect(nextNumberFieldValue('x', 5)).toBe(5);
  });
});

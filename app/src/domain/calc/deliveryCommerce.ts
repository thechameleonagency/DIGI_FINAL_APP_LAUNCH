import type { DeliveryDate, DeliveryRule, HolidayEntry, PinDeliverySetting } from '../entities/types';
import { roundMoney } from '../utils/money';

export function normalizeHolidays(
  holidays?: string[] | HolidayEntry[],
  holidayEntries?: HolidayEntry[],
): HolidayEntry[] {
  if (holidayEntries?.length) return holidayEntries;
  if (!holidays?.length) return [];
  return holidays.map((h) => {
    if (typeof h === 'object' && h && 'startDate' in h) return h as HolidayEntry;
    const raw = String(h);
    const [datePart, ...rest] = raw.split('|');
    const date = datePart.trim().slice(0, 10);
    return {
      startDate: date,
      endDate: date,
      reason: rest.join('|').trim() || undefined,
      allowPreorder: true,
    };
  });
}

export function isHolidayBlocked(params: {
  holidays?: string[] | HolidayEntry[];
  holidayEntries?: HolidayEntry[];
  date: string;
}): { blocked: boolean; allowPreorder: boolean; reason?: string } {
  const day = params.date.slice(0, 10);
  const entries = normalizeHolidays(params.holidays, params.holidayEntries);
  for (const h of entries) {
    if (day >= h.startDate.slice(0, 10) && day <= h.endDate.slice(0, 10)) {
      return {
        blocked: !h.allowPreorder,
        allowPreorder: h.allowPreorder,
        reason: h.reason,
      };
    }
  }
  return { blocked: false, allowPreorder: true };
}

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function pinRulesFromSettings(
  pinSettings: PinDeliverySetting[],
  pharmacyPin?: string,
): DeliveryRule[] {
  if (!pharmacyPin) return [];
  const match = pinSettings.find((p) => p.pinCode === pharmacyPin && p.deliveryCharge >= 0);
  if (!match) return [];
  const rules: DeliveryRule[] = [];
  if (match.freeAbove != null && match.freeAbove > 0) {
    rules.push({
      id: `pin-free-${match.id}`,
      stockistId: match.stockistId,
      ruleType: 'order_amount',
      priority: -100,
      active: true,
      minOrderAmount: match.freeAbove,
    });
  }
  rules.push({
    id: `pin-flat-${match.id}`,
    stockistId: match.stockistId,
    ruleType: 'flat_fee',
    priority: -99,
    active: true,
    flatFee: match.deliveryCharge,
  });
  return rules;
}

export function estimateDeliveryFee(params: {
  rules: DeliveryRule[];
  goodsSubtotal: number;
  preferredDate?: string;
  deliveryDates?: DeliveryDate[];
  distanceKm?: number;
  pinSettings?: PinDeliverySetting[];
  pharmacyPin?: string;
}): { fee: number; matchedRuleId?: string; matchedRuleType?: DeliveryRule['ruleType'] } {
  const injected = pinRulesFromSettings(params.pinSettings ?? [], params.pharmacyPin);
  const active = [...injected, ...params.rules.filter((r) => r.active)].sort(
    (a, b) => a.priority - b.priority,
  );
  const dateSet = new Set(
    (params.deliveryDates ?? []).filter((d) => d.active).map((d) => d.date.slice(0, 10)),
  );
  const preferred = params.preferredDate?.slice(0, 10);

  for (const rule of active) {
    if (rule.ruleType === 'delivery_date') {
      if (rule.freeOnDeliveryDate && preferred && dateSet.has(preferred)) {
        return { fee: 0, matchedRuleId: rule.id, matchedRuleType: rule.ruleType };
      }
      continue;
    }
    if (rule.ruleType === 'order_amount') {
      if (rule.minOrderAmount != null && params.goodsSubtotal >= rule.minOrderAmount) {
        return { fee: 0, matchedRuleId: rule.id, matchedRuleType: rule.ruleType };
      }
      continue;
    }
    if (rule.ruleType === 'distance') {
      if (params.distanceKm == null || !Number.isFinite(params.distanceKm)) continue;
      const base = rule.baseDistanceKm ?? 0;
      const perKm = rule.perKmCharge ?? 0;
      const fee = roundMoney(Math.max(0, (params.distanceKm - base) * perKm));
      return { fee, matchedRuleId: rule.id, matchedRuleType: rule.ruleType };
    }
    if (rule.ruleType === 'flat_fee') {
      return {
        fee: roundMoney(rule.flatFee ?? 0),
        matchedRuleId: rule.id,
        matchedRuleType: rule.ruleType,
      };
    }
  }
  return { fee: 0 };
}

export function listSelectableDeliveryDates(
  dates: DeliveryDate[],
  today = new Date(),
): DeliveryDate[] {
  const key = today.toISOString().slice(0, 10);
  return dates
    .filter((d) => d.active && d.date.slice(0, 10) >= key)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Build default rules from legacy CF-18 preference fields. */
export function defaultRulesFromPrefs(
  stockistId: string,
  prefs?: { deliveryFeeFlat?: number; deliveryFeeFreeAbove?: number },
): DeliveryRule[] {
  const rules: DeliveryRule[] = [];
  if (prefs?.deliveryFeeFreeAbove != null && prefs.deliveryFeeFreeAbove > 0) {
    rules.push({
      id: `rule-free-${stockistId}`,
      stockistId,
      ruleType: 'order_amount',
      priority: 10,
      active: true,
      minOrderAmount: prefs.deliveryFeeFreeAbove,
    });
  }
  if (prefs?.deliveryFeeFlat != null && prefs.deliveryFeeFlat > 0) {
    rules.push({
      id: `rule-flat-${stockistId}`,
      stockistId,
      ruleType: 'flat_fee',
      priority: 20,
      active: true,
      flatFee: prefs.deliveryFeeFlat,
    });
  }
  return rules;
}

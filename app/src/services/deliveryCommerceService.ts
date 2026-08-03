import { db } from '../data/db';
import {
  defaultRulesFromPrefs,
  distanceKm,
  estimateDeliveryFee,
  isHolidayBlocked,
  listSelectableDeliveryDates,
  normalizeHolidays,
} from '../domain/calc/deliveryCommerce';
import type {
  Business,
  DeliveryDate,
  DeliveryRule,
  PinDeliverySetting,
  Scheme,
} from '../domain/entities/types';
import { newId } from '../domain/utils/ids';
import { nowIso } from '../domain/utils/clock';
import { applySchemeToUnitPrice } from '../domain/calc/schemePricing';

export async function getDeliveryDates(stockistId: string): Promise<DeliveryDate[]> {
  return db.deliveryDates.where('stockistId').equals(stockistId).toArray();
}

export async function replaceDeliveryDates(stockistId: string, dates: string[]): Promise<void> {
  const existing = await db.deliveryDates.where('stockistId').equals(stockistId).toArray();
  await db.deliveryDates.bulkDelete(existing.map((d) => d.id));
  const rows: DeliveryDate[] = dates.map((date) => ({
    id: newId(),
    stockistId,
    date: date.slice(0, 10),
    active: true,
  }));
  if (rows.length) await db.deliveryDates.bulkPut(rows);
}

export async function getDeliveryRules(stockistId: string): Promise<DeliveryRule[]> {
  const rules = await db.deliveryRules.where('stockistId').equals(stockistId).toArray();
  if (rules.length) return rules.sort((a, b) => a.priority - b.priority);
  const biz = await db.businesses.get(stockistId);
  return defaultRulesFromPrefs(stockistId, biz?.preferences);
}

export async function replaceDeliveryRules(stockistId: string, rules: Omit<DeliveryRule, 'id' | 'stockistId'>[]): Promise<void> {
  const existing = await db.deliveryRules.where('stockistId').equals(stockistId).toArray();
  await db.deliveryRules.bulkDelete(existing.map((r) => r.id));
  const rows: DeliveryRule[] = rules.map((r, i) => ({
    ...r,
    id: newId(),
    stockistId,
    priority: r.priority ?? (i + 1) * 10,
  }));
  if (rows.length) await db.deliveryRules.bulkPut(rows);
}

export async function getPinDeliverySettings(stockistId: string): Promise<PinDeliverySetting[]> {
  return db.pinDeliverySettings.where('stockistId').equals(stockistId).toArray();
}

export async function replacePinDeliverySettings(
  stockistId: string,
  rows: Omit<PinDeliverySetting, 'id' | 'stockistId'>[],
): Promise<void> {
  const existing = await db.pinDeliverySettings.where('stockistId').equals(stockistId).toArray();
  await db.pinDeliverySettings.bulkDelete(existing.map((r) => r.id));
  const next: PinDeliverySetting[] = rows.map((r) => ({ ...r, id: newId(), stockistId }));
  if (next.length) await db.pinDeliverySettings.bulkPut(next);
}

export async function getSchemes(stockistId: string): Promise<Scheme[]> {
  return db.schemes.where('stockistId').equals(stockistId).toArray();
}

export async function upsertScheme(scheme: Scheme): Promise<void> {
  await db.schemes.put(scheme);
}

export async function deleteScheme(id: string): Promise<void> {
  await db.schemes.delete(id);
}

export async function estimateFeeForPair(params: {
  stockist: Business;
  pharmacy: Business;
  goodsSubtotal: number;
  preferredDate?: string;
}) {
  const [rules, dates, pins] = await Promise.all([
    getDeliveryRules(params.stockist.id),
    getDeliveryDates(params.stockist.id),
    getPinDeliverySettings(params.stockist.id),
  ]);
  const dispatchLat = params.stockist.preferences?.dispatchLatitude ?? params.stockist.latitude;
  const dispatchLng = params.stockist.preferences?.dispatchLongitude ?? params.stockist.longitude;
  let km: number | undefined;
  if (
    dispatchLat != null &&
    dispatchLng != null &&
    params.pharmacy.latitude != null &&
    params.pharmacy.longitude != null
  ) {
    km = distanceKm(
      { latitude: dispatchLat, longitude: dispatchLng },
      { latitude: params.pharmacy.latitude, longitude: params.pharmacy.longitude },
    );
  }
  return estimateDeliveryFee({
    rules,
    goodsSubtotal: params.goodsSubtotal,
    preferredDate: params.preferredDate,
    deliveryDates: dates,
    distanceKm: km,
    pinSettings: pins,
    pharmacyPin: params.pharmacy.pincode,
  });
}

export async function holidayGate(stockist: Business, preferredDate?: string) {
  if (!preferredDate) return { blocked: false as const, allowPreorder: true as const };
  return isHolidayBlocked({
    holidays: stockist.holidays,
    holidayEntries: stockist.holidayEntries ?? normalizeHolidays(stockist.holidays),
    date: preferredDate,
  });
}

export async function selectableDates(stockistId: string) {
  return listSelectableDeliveryDates(await getDeliveryDates(stockistId));
}

export { applySchemeToUnitPrice, nowIso };

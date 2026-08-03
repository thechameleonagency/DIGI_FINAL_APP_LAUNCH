import type { Business, RecurringOrder, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { nowIso } from '../domain/utils/clock';
import { localTodayKey } from '../domain/utils/dateKeys';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { setCartLine } from './catalogueService';

export async function listRecurringOrders(pharmacyId: string): Promise<RecurringOrder[]> {
  return db.recurringOrders.where('pharmacyId').equals(pharmacyId).toArray();
}

export async function upsertRecurringOrder(order: RecurringOrder): Promise<void> {
  await db.recurringOrders.put(order);
}

export async function deleteRecurringOrder(id: string): Promise<void> {
  await db.recurringOrders.delete(id);
}

function advanceNextRunDate(cadence: RecurringOrder['cadence'], fromDate: string): string {
  const d = new Date(`${fromDate.slice(0, 10)}T12:00:00`);
  if (cadence === 'Weekly') d.setDate(d.getDate() + 7);
  else if (cadence === 'BiWeekly') d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isRecurringDue(order: RecurringOrder, today = localTodayKey()): boolean {
  return order.active && order.nextRunDate.slice(0, 10) <= today;
}

/** Push due (or forced) recurring lines into cart — never places an order. */
export async function fillCartFromRecurring(params: {
  actor: User;
  pharmacy: Business;
  recurringId: string;
  /** When false, only fill if nextRunDate is due. */
  requireDue?: boolean;
}): Promise<Result<{ filled: number; failed: string[]; nextRunDate: string }>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Cart was not filled.');

  const recurring = await db.recurringOrders.get(params.recurringId);
  if (!recurring || recurring.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'RECUR_MISSING', 'Recurring order not found.', 'Cart was not filled.');
  }
  if (!recurring.active) {
    return fail('BusinessRule', 'RECUR_INACTIVE', 'Recurring order is inactive.', 'Cart was not filled.');
  }
  const requireDue = params.requireDue !== false;
  if (requireDue && !isRecurringDue(recurring)) {
    return fail('BusinessRule', 'RECUR_NOT_DUE', 'This recurring order is not due yet.', 'Cart was not filled.');
  }
  if (!recurring.lines.length) {
    return fail('Validation', 'RECUR_EMPTY', 'Add at least one product line.', 'Cart was not filled.');
  }

  let filled = 0;
  const failed: string[] = [];
  for (const line of recurring.lines) {
    const res = await setCartLine({
      actor: params.actor,
      pharmacy: params.pharmacy,
      stockistId: recurring.stockistId,
      productId: line.productId,
      qty: line.qty,
    });
    if (res.ok) filled += 1;
    else {
      const product = await db.products.get(line.productId);
      failed.push(product?.name ?? line.productId.slice(0, 8));
    }
  }

  const nextRunDate = advanceNextRunDate(recurring.cadence, recurring.nextRunDate);
  const updated: RecurringOrder = {
    ...recurring,
    nextRunDate,
    updatedAt: nowIso(),
  };
  await db.recurringOrders.put(updated);

  if (!filled && failed.length) {
    return fail(
      'BusinessRule',
      'RECUR_FILL_FAIL',
      `Could not add lines: ${failed.join(', ')}`,
      'Cart was not filled.',
    );
  }

  return ok({ filled, failed, nextRunDate });
}

export function buildRecurringOrder(params: {
  pharmacyId: string;
  stockistId: string;
  cadence: RecurringOrder['cadence'];
  nextRunDate: string;
  lines: { productId: string; qty: number }[];
  active?: boolean;
  paymentMode?: RecurringOrder['paymentMode'];
  note?: string;
  existing?: RecurringOrder;
}): RecurringOrder {
  const ts = nowIso();
  return {
    id: params.existing?.id ?? newId(),
    pharmacyId: params.pharmacyId,
    stockistId: params.stockistId,
    cadence: params.cadence,
    nextRunDate: params.nextRunDate.slice(0, 10),
    lines: params.lines,
    active: params.active ?? true,
    paymentMode: params.paymentMode,
    note: params.note,
    createdAt: params.existing?.createdAt ?? ts,
    updatedAt: ts,
  };
}

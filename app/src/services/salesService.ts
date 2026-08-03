import type {
  Business,
  CustomerSale,
  CustomerSaleLine,
  CustomerSalePaymentMode,
  User,
} from '../domain/entities/types';
import { daysToExpiry } from '../domain/calc';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId, nextNumber } from '../domain/utils/ids';
import { roundMoney } from '../domain/utils/money';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { nowIso } from '../domain/utils/clock';

export type SaleDraftLine = {
  inventoryId: string;
  qty: number;
  unitPrice: number;
};

async function allocateFromInventory(
  pharmacyId: string,
  inventoryId: string,
  qty: number,
): Promise<Result<CustomerSaleLine>> {
  const item = await db.pharmacyInventory.get(inventoryId);
  if (!item || item.pharmacyId !== pharmacyId) {
    return fail('NotFound', 'SALE_INV', 'Inventory item not found.', 'Sale was not recorded.');
  }
  if (item.expiryDate && daysToExpiry(item.expiryDate) <= 0) {
    return fail('BusinessRule', 'SALE_EXPIRED', `${item.productName} is expired and not sellable.`, 'Sale was not recorded.');
  }
  if (qty <= 0) return fail('Validation', 'SALE_QTY', 'Quantity must be positive.', 'Sale was not recorded.');
  if (item.onHand < qty) {
    return fail('Integrity', 'STOCK_NEG', `${item.productName}: insufficient stock (on hand ${item.onHand}).`, 'Sale was not recorded.');
  }
  return ok({
    productRef: item.productId,
    productName: item.productName,
    batchAllocations: [
      {
        inventoryId: item.id,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        qty,
      },
    ],
    qty,
    unitPrice: 0,
    returnedQty: 0,
  });
}

export async function createCustomerSale(params: {
  actor: User;
  pharmacy: Business;
  customerName: string;
  phone?: string;
  paymentMode: CustomerSalePaymentMode;
  homeDelivery?: boolean;
  address?: string;
  lines: SaleDraftLine[];
}): Promise<Result<CustomerSale>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Sale was not recorded.');
  if (params.pharmacy.type !== 'Pharmacy') {
    return fail('BusinessRule', 'SALE_ROLE', 'Only pharmacies can record customer sales.', 'Sale was not recorded.');
  }
  if (!params.customerName.trim()) {
    return fail('Validation', 'SALE_CUSTOMER', 'Customer name is required.', 'Sale was not recorded.');
  }
  if (!params.lines.length) {
    return fail('Validation', 'SALE_LINES', 'Add at least one line.', 'Sale was not recorded.');
  }
  if (params.homeDelivery && !params.address?.trim()) {
    return fail('Validation', 'SALE_ADDR', 'Delivery address is required for home delivery.', 'Sale was not recorded.');
  }
  if (params.paymentMode === 'Credit' && !params.phone?.trim()) {
    return fail(
      'Validation',
      'SALE_CREDIT_PHONE',
      'Phone is required for credit sales so the receivable can be collected later.',
      'Sale was not recorded.',
    );
  }

  const built: CustomerSaleLine[] = [];
  for (const draft of params.lines) {
    const alloc = await allocateFromInventory(params.pharmacy.id, draft.inventoryId, draft.qty);
    if (!alloc.ok) return alloc;
    if (draft.unitPrice < 0) {
      return fail('Validation', 'SALE_PRICE', 'Unit price cannot be negative.', 'Sale was not recorded.');
    }
    built.push({ ...alloc.data, unitPrice: roundMoney(draft.unitPrice) });
  }

  const revenue = roundMoney(built.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const ts = nowIso();
  const sale: CustomerSale = {
    id: newId(),
    saleNo: nextNumber('SALE'),
    pharmacyId: params.pharmacy.id,
    customerName: params.customerName.trim(),
    phone: params.phone?.trim() || undefined,
    lines: built,
    paymentMode: params.paymentMode,
    amountCollected: params.paymentMode === 'Credit' ? 0 : revenue,
    collections: [],
    homeDelivery: !!params.homeDelivery,
    address: params.homeDelivery ? params.address?.trim() : undefined,
    deliveryStatus: params.homeDelivery ? 'Unassigned' : undefined,
    status: 'Completed',
    returnedLines: [],
    createdBy: params.actor.id,
    createdAt: ts,
  };

  await db.transaction('rw', db.customerSales, db.pharmacyInventory, db.inventoryMovements, async () => {
    for (const line of built) {
      for (const a of line.batchAllocations) {
        const item = await db.pharmacyInventory.get(a.inventoryId);
        if (!item) throw new Error('Inventory missing mid-sale');
        const newQty = item.onHand - a.qty;
        if (newQty < 0) throw new Error('Negative stock');
        await db.pharmacyInventory.update(item.id, { onHand: newQty, updatedAt: ts });
        await db.inventoryMovements.add({
          id: newId(),
          businessId: params.pharmacy.id,
          productId: line.productRef,
          type: 'SaleOut',
          qty: a.qty,
          reason: `Customer sale ${sale.saleNo}`,
          sourceDocType: 'CustomerSale',
          sourceDocId: sale.id,
          actorId: params.actor.id,
          prevQty: item.onHand,
          newQty,
          at: ts,
        });
      }
    }
    await db.customerSales.add(sale);
  });

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'CustomerSale',
    entityId: sale.id,
    action: 'sale.create',
    after: { saleNo: sale.saleNo, lines: sale.lines.length, paymentMode: sale.paymentMode },
  });
  return ok(sale);
}

export async function voidCustomerSale(params: {
  actor: User;
  pharmacy: Business;
  saleId: string;
  reason: string;
}): Promise<Result<CustomerSale>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Sale was not voided.');
  if (!params.reason.trim()) {
    return fail('Validation', 'SALE_VOID_REASON', 'Void reason is required.', 'Sale was not voided.');
  }
  const sale = await db.customerSales.get(params.saleId);
  if (!sale || sale.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'SALE_MISSING', 'Sale not found.', 'Sale was not voided.');
  }
  if (sale.status === 'Voided') {
    return fail('StateConflict', 'SALE_VOIDED', 'Sale is already voided.', 'No change made.');
  }
  if (sale.returnedLines.length || sale.lines.some((l) => l.returnedQty > 0)) {
    return fail('BusinessRule', 'SALE_VOID_RETURNED', 'Void is not allowed after partial returns — return remaining lines instead.', 'Sale was not voided.');
  }

  const ts = nowIso();
  await db.transaction('rw', db.customerSales, db.pharmacyInventory, db.inventoryMovements, async () => {
    for (const line of sale.lines) {
      for (const a of line.batchAllocations) {
        const item = await db.pharmacyInventory.get(a.inventoryId);
        const prev = item?.onHand ?? 0;
        const newQty = prev + a.qty;
        if (item) {
          await db.pharmacyInventory.update(item.id, { onHand: newQty, updatedAt: ts });
        }
        await db.inventoryMovements.add({
          id: newId(),
          businessId: params.pharmacy.id,
          productId: line.productRef,
          type: 'SaleVoidIn',
          qty: a.qty,
          reason: params.reason.trim(),
          sourceDocType: 'CustomerSale',
          sourceDocId: sale.id,
          actorId: params.actor.id,
          prevQty: prev,
          newQty,
          at: ts,
        });
      }
    }
    await db.customerSales.update(sale.id, {
      status: 'Voided',
      voidReason: params.reason.trim(),
    });
  });

  const next = (await db.customerSales.get(sale.id))!;
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'CustomerSale',
    entityId: sale.id,
    action: 'sale.void',
    reason: params.reason,
    before: sale,
    after: next,
  });
  return ok(next);
}

export async function returnCustomerSaleLines(params: {
  actor: User;
  pharmacy: Business;
  saleId: string;
  returns: { productRef: string; qty: number }[];
  reason: string;
}): Promise<Result<CustomerSale>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Return was not recorded.');
  if (!params.reason.trim()) {
    return fail('Validation', 'SALE_RET_REASON', 'Return reason is required.', 'Return was not recorded.');
  }
  const sale = await db.customerSales.get(params.saleId);
  if (!sale || sale.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'SALE_MISSING', 'Sale not found.', 'Return was not recorded.');
  }
  if (sale.status === 'Voided') {
    return fail('StateConflict', 'SALE_VOIDED', 'Voided sales cannot be returned.', 'Return was not recorded.');
  }
  if (!params.returns.length) {
    return fail('Validation', 'SALE_RET_EMPTY', 'Select at least one line to return.', 'Return was not recorded.');
  }

  const ts = nowIso();
  const lines = sale.lines.map((l) => ({ ...l, batchAllocations: l.batchAllocations.map((a) => ({ ...a })) }));
  const returnedLines = [...sale.returnedLines];

  try {
    await db.transaction('rw', db.customerSales, db.pharmacyInventory, db.inventoryMovements, async () => {
      for (const r of params.returns) {
        const line = lines.find((l) => l.productRef === r.productRef);
        if (!line) throw new Error(`Unknown product on sale.`);
        const remaining = line.qty - line.returnedQty;
        if (r.qty <= 0 || r.qty > remaining) {
          throw new Error(`${line.productName}: return qty must be 1–${remaining}`);
        }
        let left = r.qty;
        for (const a of line.batchAllocations) {
          if (left <= 0) break;
          const take = Math.min(left, a.qty);
          const item = await db.pharmacyInventory.get(a.inventoryId);
          const prev = item?.onHand ?? 0;
          const newQty = prev + take;
          if (item) await db.pharmacyInventory.update(item.id, { onHand: newQty, updatedAt: ts });
          await db.inventoryMovements.add({
            id: newId(),
            businessId: params.pharmacy.id,
            productId: line.productRef,
            type: 'SaleReturnIn',
            qty: take,
            reason: params.reason.trim(),
            sourceDocType: 'CustomerSale',
            sourceDocId: sale.id,
            actorId: params.actor.id,
            prevQty: prev,
            newQty,
            at: ts,
          });
          left -= take;
        }
        line.returnedQty += r.qty;
        returnedLines.push({ productRef: r.productRef, qty: r.qty, reason: params.reason.trim(), at: ts });
      }

      const allReturned = lines.every((l) => l.returnedQty >= l.qty);
      const nextRevenue = roundMoney(lines.reduce((s, l) => s + Math.max(0, l.qty - l.returnedQty) * l.unitPrice, 0));
      const collected = sale.amountCollected ?? 0;
      // Returns reduce what the customer owes; clamp collections that exceed remaining net total.
      const amountCollected = sale.paymentMode === 'Credit' ? Math.min(collected, nextRevenue) : collected;
      await db.customerSales.update(sale.id, {
        lines,
        returnedLines,
        status: allReturned ? 'Returned' : 'PartiallyReturned',
        amountCollected,
      });
    });
  } catch (e) {
    return fail('Validation', 'SALE_RET', e instanceof Error ? e.message : 'Return failed.', 'Return was not recorded.');
  }

  const next = (await db.customerSales.get(sale.id))!;
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'CustomerSale',
    entityId: sale.id,
    action: 'sale.return',
    reason: params.reason,
    after: { returns: params.returns },
  });
  return ok(next);
}

export async function collectCustomerSalePayment(params: {
  actor: User;
  pharmacy: Business;
  saleId: string;
  amount: number;
  note?: string;
}): Promise<Result<CustomerSale>> {
  const perm = assertCan(params.actor, params.pharmacy, 'sale.record');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Collection was not recorded.');
  const sale = await db.customerSales.get(params.saleId);
  if (!sale || sale.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'SALE_MISSING', 'Sale not found.', 'Collection was not recorded.');
  }
  if (sale.paymentMode !== 'Credit') {
    return fail('BusinessRule', 'SALE_NOT_CREDIT', 'Only credit sales have a receivable to collect.', 'Collection was not recorded.');
  }
  if (sale.status === 'Voided') {
    return fail('StateConflict', 'SALE_VOIDED', 'Voided sales cannot be collected.', 'Collection was not recorded.');
  }
  const due = saleCreditOutstanding(sale);
  if (due <= 0) {
    return fail('BusinessRule', 'SALE_PAID', 'Nothing outstanding on this sale.', 'Collection was not recorded.');
  }
  const amount = roundMoney(params.amount);
  if (!(amount > 0)) {
    return fail('Validation', 'SALE_COLLECT_AMT', 'Collection amount must be positive.', 'Collection was not recorded.');
  }
  if (amount > due) {
    return fail('Validation', 'SALE_COLLECT_OVER', `Amount exceeds outstanding (${due}).`, 'Collection was not recorded.');
  }

  const ts = nowIso();
  const entry = {
    id: newId(),
    amount,
    at: ts,
    actorId: params.actor.id,
    note: params.note?.trim() || undefined,
  };
  const amountCollected = roundMoney((sale.amountCollected ?? 0) + amount);
  await db.customerSales.update(sale.id, {
    amountCollected,
    collections: [...(sale.collections ?? []), entry],
  });

  const next = (await db.customerSales.get(sale.id))!;
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'CustomerSale',
    entityId: sale.id,
    action: 'sale.collect',
    after: { amount, amountCollected, saleNo: sale.saleNo },
  });
  return ok(next);
}

export function saleTotals(sale: CustomerSale) {
  const activeLines = sale.lines.map((l) => ({
    ...l,
    netQty: Math.max(0, l.qty - l.returnedQty),
  }));
  const revenue = roundMoney(activeLines.reduce((s, l) => s + l.netQty * l.unitPrice, 0));
  return { revenue, activeLines };
}

/** Outstanding customer credit for a POS sale (0 for cash/UPI or voided). */
export function saleCreditOutstanding(sale: CustomerSale): number {
  if (sale.paymentMode !== 'Credit' || sale.status === 'Voided') return 0;
  const { revenue } = saleTotals(sale);
  const collected = sale.amountCollected ?? 0;
  return roundMoney(Math.max(0, revenue - collected));
}

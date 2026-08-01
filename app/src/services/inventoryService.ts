import type { Batch, BatchStatus, Business, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';

export async function stockIn(params: {
  actor: User;
  stockist: Business;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  qty: number;
  cost?: number;
}): Promise<Result<Batch>> {
  const perm = assertCan(params.actor, params.stockist, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Stock was not added.');
  if (params.qty <= 0) return fail('Validation', 'STOCK_QTY', 'Quantity must be greater than zero.', 'Stock was not added.');
  const product = await db.products.get(params.productId);
  if (!product || product.stockistId !== params.stockist.id) {
    return fail('NotFound', 'PROD_MISSING', 'Product not found.', 'Stock was not added.');
  }
  const dup = await db.batches
    .where({ stockistId: params.stockist.id, productId: params.productId })
    .filter((b) => b.batchNumber.toLowerCase() === params.batchNumber.trim().toLowerCase())
    .first();
  if (dup) {
    return fail('Duplicate', 'BATCH_DUP', 'This batch number already exists for the product.', 'Stock was not added.');
  }
  const ts = new Date().toISOString();
  const batch: Batch = {
    id: newId(),
    productId: params.productId,
    stockistId: params.stockist.id,
    batchNumber: params.batchNumber.trim(),
    expiryDate: params.expiryDate,
    onHand: params.qty,
    reserved: 0,
    cost: params.cost,
    status: 'Available',
    createdAt: ts,
    updatedAt: ts,
  };
  await db.transaction('rw', db.batches, db.inventoryMovements, async () => {
    await db.batches.add(batch);
    await db.inventoryMovements.add({
      id: newId(),
      businessId: params.stockist.id,
      productId: params.productId,
      batchId: batch.id,
      type: 'StockIn',
      qty: params.qty,
      reason: 'Stock in',
      actorId: params.actor.id,
      prevQty: 0,
      newQty: params.qty,
      at: ts,
    });
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Batch',
    entityId: batch.id,
    action: 'inventory.stockIn',
    after: { qty: params.qty, batchNumber: batch.batchNumber },
  });
  return ok(batch);
}

export async function adjustStock(params: {
  actor: User;
  stockist: Business;
  batchId: string;
  delta: number;
  reason: string;
}): Promise<Result<Batch>> {
  const perm = assertCan(params.actor, params.stockist, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Stock was not adjusted.');
  if (!params.reason.trim()) return fail('Validation', 'STOCK_REASON', 'Reason is required.', 'Stock was not adjusted.');
  if (params.delta === 0) return fail('Validation', 'STOCK_DELTA', 'Adjustment cannot be zero.', 'Stock was not adjusted.');
  const batch = await db.batches.get(params.batchId);
  if (!batch || batch.stockistId !== params.stockist.id) {
    return fail('NotFound', 'BATCH_MISSING', 'Batch not found.', 'Stock was not adjusted.');
  }
  const newOnHand = batch.onHand + params.delta;
  if (newOnHand < 0 || newOnHand < batch.reserved) {
    return fail('Integrity', 'STOCK_NEG', 'Adjustment would make available stock negative.', 'Stock was not adjusted.');
  }
  const ts = new Date().toISOString();
  await db.transaction('rw', db.batches, db.inventoryMovements, async () => {
    await db.batches.update(batch.id, { onHand: newOnHand, updatedAt: ts });
    await db.inventoryMovements.add({
      id: newId(),
      businessId: params.stockist.id,
      productId: batch.productId,
      batchId: batch.id,
      type: 'Adjustment',
      qty: params.delta,
      reason: params.reason.trim(),
      actorId: params.actor.id,
      prevQty: batch.onHand,
      newQty: newOnHand,
      at: ts,
    });
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Batch',
    entityId: batch.id,
    action: 'inventory.adjust',
    reason: params.reason,
    after: { onHand: newOnHand },
  });
  return ok((await db.batches.get(batch.id))!);
}

export async function setBatchStatus(params: {
  actor: User;
  stockist: Business;
  batchId: string;
  status: Extract<BatchStatus, 'Quarantined' | 'Available' | 'Recalled'>;
  reason?: string;
}): Promise<Result<Batch>> {
  const perm = assertCan(params.actor, params.stockist, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Batch status was not changed.');
  const batch = await db.batches.get(params.batchId);
  if (!batch || batch.stockistId !== params.stockist.id) {
    return fail('NotFound', 'BATCH_MISSING', 'Batch not found.', 'Batch status was not changed.');
  }
  const t = machines.batch(batch.status, params.status);
  if (!t.ok) return fail('StateConflict', 'BATCH_STATE', t.reason!, 'Batch status was not changed.');
  const ts = new Date().toISOString();
  await db.batches.update(batch.id, { status: params.status, updatedAt: ts });
  await db.inventoryMovements.add({
    id: newId(),
    businessId: params.stockist.id,
    productId: batch.productId,
    batchId: batch.id,
    type: params.status === 'Quarantined' ? 'Quarantine' : 'Adjustment',
    qty: 0,
    reason: params.reason?.trim() || `Status → ${params.status}`,
    actorId: params.actor.id,
    prevQty: batch.onHand,
    newQty: batch.onHand,
    at: ts,
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Batch',
    entityId: batch.id,
    action: `inventory.${params.status}`,
    reason: params.reason,
  });
  return ok((await db.batches.get(batch.id))!);
}

/** CF-33: locations-lite transfer — updates batch.location; paired movements; sellable qty unchanged */
export async function transferStock(params: {
  actor: User;
  stockist: Business;
  batchId: string;
  fromLocation: string;
  toLocation: string;
  qty: number;
}): Promise<Result<{ outId: string; inId: string }>> {
  const perm = assertCan(params.actor, params.stockist, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Transfer was not recorded.');
  if (params.stockist.type !== 'Stockist') {
    return fail('BusinessRule', 'XFER_ROLE', 'Only stockists can transfer stock.', 'Transfer was not recorded.');
  }
  const from = params.fromLocation.trim();
  const to = params.toLocation.trim();
  if (!from || !to) return fail('Validation', 'XFER_LOC', 'From and to locations are required.', 'Transfer was not recorded.');
  if (from === to) return fail('Validation', 'XFER_SAME', 'From and to locations must differ.', 'Transfer was not recorded.');
  if (params.qty <= 0) return fail('Validation', 'XFER_QTY', 'Quantity must be positive.', 'Transfer was not recorded.');

  const batch = await db.batches.get(params.batchId);
  if (!batch || batch.stockistId !== params.stockist.id) {
    return fail('NotFound', 'XFER_BATCH', 'Batch not found.', 'Transfer was not recorded.');
  }
  const available = batch.onHand - batch.reserved;
  if (params.qty > available) {
    return fail(
      'BusinessRule',
      'XFER_OVER',
      `Cannot transfer more than un-reserved on-hand (${available}).`,
      'Transfer was not recorded.',
    );
  }
  const currentLoc = batch.location?.trim() || 'Unassigned';
  if (currentLoc !== from && currentLoc !== 'Unassigned') {
    return fail(
      'BusinessRule',
      'XFER_FROM',
      `Batch is at "${currentLoc}", not "${from}".`,
      'Transfer was not recorded.',
    );
  }

  const ts = new Date().toISOString();
  const pairId = newId();
  const outId = newId();
  const inId = newId();
  await db.transaction('rw', db.batches, db.inventoryMovements, async () => {
    await db.batches.update(batch.id, { location: to, updatedAt: ts });
    await db.inventoryMovements.add({
      id: outId,
      businessId: params.stockist.id,
      productId: batch.productId,
      batchId: batch.id,
      type: 'TransferOut',
      qty: params.qty,
      reason: `Transfer ${from} → ${to}`,
      sourceDocType: 'StockTransfer',
      sourceDocId: pairId,
      actorId: params.actor.id,
      prevQty: batch.onHand,
      newQty: batch.onHand,
      at: ts,
    });
    await db.inventoryMovements.add({
      id: inId,
      businessId: params.stockist.id,
      productId: batch.productId,
      batchId: batch.id,
      type: 'TransferIn',
      qty: params.qty,
      reason: `Transfer ${from} → ${to}`,
      sourceDocType: 'StockTransfer',
      sourceDocId: pairId,
      actorId: params.actor.id,
      prevQty: batch.onHand,
      newQty: batch.onHand,
      at: ts,
    });
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Batch',
    entityId: batch.id,
    action: 'inventory.transfer',
    after: { from, to, qty: params.qty, pairId },
  });
  return ok({ outId, inId });
}

export async function stockAdd(params: {
  actor: User;
  pharmacy: Business;
  productId: string;
  productName: string;
  qty: number;
  batchNumber?: string;
  expiryDate?: string;
  reason: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.pharmacy, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Stock was not added.');
  if (params.qty <= 0) return fail('Validation', 'STOCK_QTY', 'Quantity must be greater than zero.', 'Stock was not added.');
  if (!params.reason.trim()) return fail('Validation', 'STOCK_REASON', 'Reason is required.', 'Stock was not added.');
  const ts = new Date().toISOString();
  const existing = await db.pharmacyInventory.where({ pharmacyId: params.pharmacy.id, productId: params.productId }).first();
  const prev = existing?.onHand ?? 0;
  await db.transaction('rw', db.pharmacyInventory, db.inventoryMovements, async () => {
    if (existing) {
      await db.pharmacyInventory.update(existing.id, {
        onHand: prev + params.qty,
        batchNumber: params.batchNumber ?? existing.batchNumber,
        expiryDate: params.expiryDate ?? existing.expiryDate,
        updatedAt: ts,
      });
    } else {
      await db.pharmacyInventory.add({
        id: newId(),
        pharmacyId: params.pharmacy.id,
        productId: params.productId,
        productName: params.productName,
        batchNumber: params.batchNumber,
        expiryDate: params.expiryDate,
        onHand: params.qty,
        updatedAt: ts,
      });
    }
    await db.inventoryMovements.add({
      id: newId(),
      businessId: params.pharmacy.id,
      productId: params.productId,
      type: 'StockIn',
      qty: params.qty,
      reason: params.reason.trim(),
      actorId: params.actor.id,
      prevQty: prev,
      newQty: prev + params.qty,
      at: ts,
    });
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'PharmacyInventory',
    entityId: params.productId,
    action: 'inventory.stockAdd',
    reason: params.reason,
  });
  return ok(true);
}

export async function stockAdjust(params: {
  actor: User;
  pharmacy: Business;
  inventoryId: string;
  delta: number;
  reason: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.pharmacy, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Stock was not adjusted.');
  if (!params.reason.trim()) return fail('Validation', 'STOCK_REASON', 'Reason is required.', 'Stock was not adjusted.');
  const item = await db.pharmacyInventory.get(params.inventoryId);
  if (!item || item.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'INV_MISSING', 'Inventory item not found.', 'Stock was not adjusted.');
  }
  const newQty = item.onHand + params.delta;
  if (newQty < 0) return fail('Integrity', 'STOCK_NEG', 'Stock cannot go negative.', 'Stock was not adjusted.');
  const ts = new Date().toISOString();
  await db.transaction('rw', db.pharmacyInventory, db.inventoryMovements, async () => {
    await db.pharmacyInventory.update(item.id, { onHand: newQty, updatedAt: ts });
    await db.inventoryMovements.add({
      id: newId(),
      businessId: params.pharmacy.id,
      productId: item.productId,
      type: 'Adjustment',
      qty: params.delta,
      reason: params.reason.trim(),
      actorId: params.actor.id,
      prevQty: item.onHand,
      newQty,
      at: ts,
    });
  });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'PharmacyInventory',
    entityId: item.id,
    action: 'inventory.stockAdjust',
    reason: params.reason,
  });
  return ok(true);
}

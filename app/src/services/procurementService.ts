import type {
  Business,
  PurchaseBill,
  PurchaseOrder,
  PurchaseOrderStatus,
  Supplier,
  SupplierReturn,
  User,
} from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { localTodayKey } from '../domain/utils/dateKeys';
import { newId, nextNumber } from '../domain/utils/ids';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { notifyBusinessUsers } from './notifications';

const OPEN_PO: PurchaseOrderStatus[] = ['Draft', 'Sent', 'PartiallyReceived'];

export async function upsertSupplier(params: {
  actor: User;
  stockist: Business;
  id?: string;
  name: string;
  contact: string;
  gst?: string;
  terms?: string;
  active?: boolean;
}): Promise<Result<Supplier>> {
  const perm = assertCan(params.actor, params.stockist, 'supplier.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Supplier was not saved.');
  const name = params.name.trim();
  if (!name) return fail('Validation', 'SUP_NAME', 'Supplier name is required.', 'Supplier was not saved.');
  const contact = params.contact.trim();
  if (!contact) return fail('Validation', 'SUP_CONTACT', 'Contact is required.', 'Supplier was not saved.');

  if (params.id) {
    const existing = await db.suppliers.get(params.id);
    if (!existing || existing.stockistId !== params.stockist.id) {
      return fail('NotFound', 'SUP_MISSING', 'Supplier not found.', 'Supplier was not saved.');
    }
    const next: Supplier = {
      ...existing,
      name,
      contact,
      gst: params.gst?.trim() || undefined,
      terms: params.terms?.trim() || undefined,
      active: params.active ?? existing.active,
    };
    await db.suppliers.put(next);
    return ok(next);
  }

  const supplier: Supplier = {
    id: newId(),
    stockistId: params.stockist.id,
    name,
    contact,
    gst: params.gst?.trim() || undefined,
    terms: params.terms?.trim() || undefined,
    active: params.active ?? true,
  };
  await db.suppliers.add(supplier);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Supplier',
    entityId: supplier.id,
    action: 'supplier.create',
    after: supplier,
  });
  return ok(supplier);
}

export async function deleteOrDeactivateSupplier(params: {
  actor: User;
  stockist: Business;
  id: string;
}): Promise<Result<Supplier | true>> {
  const perm = assertCan(params.actor, params.stockist, 'supplier.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Supplier was not removed.');
  const supplier = await db.suppliers.get(params.id);
  if (!supplier || supplier.stockistId !== params.stockist.id) {
    return fail('NotFound', 'SUP_MISSING', 'Supplier not found.', 'Supplier was not removed.');
  }
  const open = await db.purchaseOrders
    .where('supplierId')
    .equals(params.id)
    .filter((p) => OPEN_PO.includes(p.status as PurchaseOrderStatus))
    .count();
  if (open > 0) {
    const next = { ...supplier, active: false };
    await db.suppliers.put(next);
    return ok(next);
  }
  await db.suppliers.delete(params.id);
  return ok(true);
}

export async function createPurchaseOrder(params: {
  actor: User;
  stockist: Business;
  supplierId: string;
  lines: { productId: string; qty: number; expectedCost: number }[];
}): Promise<Result<PurchaseOrder>> {
  const perm = assertCan(params.actor, params.stockist, 'po.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'PO was not created.');
  const supplier = await db.suppliers.get(params.supplierId);
  if (!supplier || supplier.stockistId !== params.stockist.id || !supplier.active) {
    return fail('NotFound', 'PO_SUP', 'Active supplier required.', 'PO was not created.');
  }
  if (!params.lines.length) return fail('Validation', 'PO_LINES', 'Add at least one line.', 'PO was not created.');
  const lines = [];
  for (const l of params.lines) {
    if (l.qty <= 0) return fail('Validation', 'PO_QTY', 'Line quantity must be positive.', 'PO was not created.');
    const product = await db.products.get(l.productId);
    if (!product || product.stockistId !== params.stockist.id) {
      return fail('NotFound', 'PO_PROD', 'Product not found.', 'PO was not created.');
    }
    lines.push({
      productId: l.productId,
      productName: product.name,
      qty: l.qty,
      expectedCost: l.expectedCost,
      receivedQty: 0,
    });
  }
  const ts = new Date().toISOString();
  const po: PurchaseOrder = {
    id: newId(),
    poNo: nextNumber('PO'),
    stockistId: params.stockist.id,
    supplierId: params.supplierId,
    lines,
    status: 'Draft',
    statusHistory: [{ from: 'New', to: 'Draft', at: ts, actorId: params.actor.id }],
    createdAt: ts,
    updatedAt: ts,
  };
  await db.purchaseOrders.add(po);
  return ok(po);
}

export async function transitionPurchaseOrder(params: {
  actor: User;
  stockist: Business;
  poId: string;
  to: 'Sent' | 'Cancelled' | 'Closed';
}): Promise<Result<PurchaseOrder>> {
  const perm = assertCan(params.actor, params.stockist, 'po.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'PO was not updated.');
  const po = await db.purchaseOrders.get(params.poId);
  if (!po || po.stockistId !== params.stockist.id) {
    return fail('NotFound', 'PO_MISSING', 'Purchase order not found.', 'PO was not updated.');
  }
  const allowed: Record<string, PurchaseOrderStatus[]> = {
    Sent: ['Draft'],
    Cancelled: ['Draft', 'Sent'],
    Closed: ['Received', 'PartiallyReceived'],
  };
  if (!allowed[params.to]?.includes(po.status)) {
    if (params.to === 'Cancelled' && po.status === 'PartiallyReceived') {
      return fail(
        'BusinessRule',
        'PO_CANCEL_PARTIAL',
        'Cannot cancel a partially received PO — close it instead.',
        'PO was not updated.',
      );
    }
    return fail('StateConflict', 'PO_STATE', `Cannot move from ${po.status} to ${params.to}.`, 'PO was not updated.');
  }
  const ts = new Date().toISOString();
  const next = {
    ...po,
    status: params.to,
    updatedAt: ts,
    statusHistory: [...po.statusHistory, { from: po.status, to: params.to, at: ts, actorId: params.actor.id }],
  };
  await db.purchaseOrders.put(next);
  return ok(next);
}

export async function receivePurchaseOrder(params: {
  actor: User;
  stockist: Business;
  poId: string;
  lines: {
    productId: string;
    qty: number;
    batchNumber: string;
    expiryDate: string;
    cost?: number;
  }[];
  confirmOverReceipt?: boolean;
}): Promise<Result<PurchaseOrder>> {
  // Staff may receive via inventory.adjust; owners/managers via po.manage
  const poPerm = assertCan(params.actor, params.stockist, 'po.manage');
  const invPerm = assertCan(params.actor, params.stockist, 'inventory.adjust');
  if (!poPerm.allow && !invPerm.allow) {
    return fail('Permission', 'PERM_DENIED', 'Missing receive permission.', 'Receipt was not recorded.');
  }
  const po = await db.purchaseOrders.get(params.poId);
  if (!po || po.stockistId !== params.stockist.id) {
    return fail('NotFound', 'PO_MISSING', 'Purchase order not found.', 'Receipt was not recorded.');
  }
  if (!['Sent', 'PartiallyReceived'].includes(po.status)) {
    return fail('StateConflict', 'PO_RECV_STATE', 'PO must be Sent or PartiallyReceived.', 'Receipt was not recorded.');
  }
  if (!params.lines.length) {
    return fail('Validation', 'PO_RECV_EMPTY', 'Add received lines.', 'Receipt was not recorded.');
  }

  const updatedLines = po.lines.map((l) => ({ ...l }));
  const ts = new Date().toISOString();

  for (const recv of params.lines) {
    if (recv.qty <= 0) {
      return fail('Validation', 'PO_RECV_QTY', 'Receive quantity must be positive.', 'Receipt was not recorded.');
    }
    const line = updatedLines.find((l) => l.productId === recv.productId);
    if (!line) {
      return fail('Validation', 'PO_RECV_LINE', 'Product is not on this PO.', 'Receipt was not recorded.');
    }
    const remaining = line.qty - line.receivedQty;
    if (recv.qty > remaining && !params.confirmOverReceipt) {
      return fail(
        'BusinessRule',
        'PO_OVER',
        `Over-receipt for ${line.productName ?? recv.productId}: confirm to continue.`,
        'Receipt was not recorded.',
      );
    }
    const expiry = recv.expiryDate.slice(0, 10);
    const today = localTodayKey();
    const expired = expiry < today;
    const batchNumber = recv.batchNumber.trim();
    if (!batchNumber) {
      return fail('Validation', 'PO_BATCH', 'Batch number is required.', 'Receipt was not recorded.');
    }

    let batch = await db.batches
      .where('productId')
      .equals(recv.productId)
      .filter((b) => b.stockistId === params.stockist.id && b.batchNumber.toLowerCase() === batchNumber.toLowerCase())
      .first();

    if (batch && batch.expiryDate.slice(0, 10) !== expiry) {
      return fail(
        'BusinessRule',
        'PO_BATCH_EXP',
        'Batch number exists with a different expiry — use a distinct batch number.',
        'Receipt was not recorded.',
      );
    }

    if (batch) {
      const prev = batch.onHand;
      const status = expired ? 'Expired' : batch.status === 'Expired' ? 'Expired' : 'Available';
      await db.batches.update(batch.id, {
        onHand: prev + recv.qty,
        cost: recv.cost ?? batch.cost,
        status,
        updatedAt: ts,
      });
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.stockist.id,
        productId: recv.productId,
        batchId: batch.id,
        type: 'StockIn',
        qty: recv.qty,
        reason: `PO ${po.poNo} receive`,
        sourceDocType: 'PO',
        sourceDocId: po.id,
        actorId: params.actor.id,
        prevQty: prev,
        newQty: prev + recv.qty,
        at: ts,
      });
    } else {
      const batchId = newId();
      await db.batches.add({
        id: batchId,
        productId: recv.productId,
        stockistId: params.stockist.id,
        batchNumber,
        expiryDate: expiry,
        onHand: recv.qty,
        reserved: 0,
        cost: recv.cost,
        status: expired ? 'Expired' : 'Available',
        createdAt: ts,
        updatedAt: ts,
      });
      await db.inventoryMovements.add({
        id: newId(),
        businessId: params.stockist.id,
        productId: recv.productId,
        batchId,
        type: 'StockIn',
        qty: recv.qty,
        reason: `PO ${po.poNo} receive`,
        sourceDocType: 'PO',
        sourceDocId: po.id,
        actorId: params.actor.id,
        prevQty: 0,
        newQty: recv.qty,
        at: ts,
      });
    }
    line.receivedQty += recv.qty;
  }

  const allReceived = updatedLines.every((l) => l.receivedQty >= l.qty);
  const anyReceived = updatedLines.some((l) => l.receivedQty > 0);
  const nextStatus: PurchaseOrderStatus = allReceived ? 'Received' : anyReceived ? 'PartiallyReceived' : po.status;
  const next: PurchaseOrder = {
    ...po,
    lines: updatedLines,
    status: nextStatus,
    updatedAt: ts,
    statusHistory: [...po.statusHistory, { from: po.status, to: nextStatus, at: ts, actorId: params.actor.id }],
  };
  await db.purchaseOrders.put(next);
  if (nextStatus === 'Received') {
    await notifyBusinessUsers(params.stockist.id, 'N-308', { poNo: po.poNo }, { type: 'PurchaseOrder', id: po.id });
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: 'po.receive',
    after: { status: nextStatus, poNo: po.poNo },
  });
  return ok(next);
}

export async function createPurchaseBill(params: {
  actor: User;
  stockist: Business;
  supplierId: string;
  billNo: string;
  date: string;
  amount: number;
  fileId?: string;
  poIds?: string[];
  notes?: string;
}): Promise<Result<PurchaseBill>> {
  const perm = assertCan(params.actor, params.stockist, 'supplier.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Bill was not saved.');
  if (!params.billNo.trim()) return fail('Validation', 'BILL_NO', 'Bill number is required.', 'Bill was not saved.');
  if (params.amount <= 0) return fail('Validation', 'BILL_AMT', 'Amount must be positive.', 'Bill was not saved.');
  const supplier = await db.suppliers.get(params.supplierId);
  if (!supplier || supplier.stockistId !== params.stockist.id) {
    return fail('NotFound', 'BILL_SUP', 'Supplier not found.', 'Bill was not saved.');
  }
  const bill: PurchaseBill = {
    id: newId(),
    billNo: params.billNo.trim(),
    stockistId: params.stockist.id,
    supplierId: params.supplierId,
    date: params.date.slice(0, 10),
    amount: params.amount,
    fileId: params.fileId,
    poIds: params.poIds ?? [],
    notes: params.notes,
    createdAt: new Date().toISOString(),
  };
  await db.purchaseBills.add(bill);
  return ok(bill);
}

/** Simple bill text parser: lines like "Bill XYZ / amount 1200" or "SKU qty rate" */
export function parsePurchaseBillText(text: string): {
  billNo?: string;
  amount?: number;
  lines: { skuOrName: string; qty: number; rate: number }[];
} {
  const lines: { skuOrName: string; qty: number; rate: number }[] = [];
  let billNo: string | undefined;
  let amount: number | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const billMatch = line.match(/bill\s*[:#-]?\s*([A-Za-z0-9/-]+)/i);
    if (billMatch) billNo = billMatch[1];
    const amtMatch = line.match(/(?:amount|total|₹)\s*[:-]?\s*(\d+(?:\.\d+)?)/i);
    if (amtMatch) amount = Number(amtMatch[1]);
    const item = line.match(/^(.+?)[\s,]+(\d+)\s*[xX@]\s*(\d+(?:\.\d+)?)$/);
    if (item) {
      lines.push({ skuOrName: item[1].trim(), qty: Number(item[2]), rate: Number(item[3]) });
    }
  }
  return { billNo, amount, lines };
}

export async function createSupplierReturn(params: {
  actor: User;
  stockist: Business;
  supplierId: string;
  lines: { batchId: string; qty: number; reason: string }[];
}): Promise<Result<SupplierReturn>> {
  const perm = assertCan(params.actor, params.stockist, 'supplier.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Return was not created.');
  if (!params.lines.length) return fail('Validation', 'SRET_LINES', 'Add lines.', 'Return was not created.');
  const lines = [];
  for (const l of params.lines) {
    const batch = await db.batches.get(l.batchId);
    if (!batch || batch.stockistId !== params.stockist.id) {
      return fail('NotFound', 'SRET_BATCH', 'Batch not found.', 'Return was not created.');
    }
    if (l.qty <= 0 || l.qty > batch.onHand - batch.reserved) {
      return fail(
        'BusinessRule',
        'SRET_QTY',
        `Return qty exceeds available on-hand for batch ${batch.batchNumber}.`,
        'Return was not created.',
      );
    }
    if (!l.reason.trim()) return fail('Validation', 'SRET_REASON', 'Reason required.', 'Return was not created.');
    lines.push({ batchId: l.batchId, productId: batch.productId, qty: l.qty, reason: l.reason.trim() });
  }
  const ts = new Date().toISOString();
  const ret: SupplierReturn = {
    id: newId(),
    retNo: nextNumber('SRET'),
    stockistId: params.stockist.id,
    supplierId: params.supplierId,
    lines,
    status: 'Draft',
    createdAt: ts,
    updatedAt: ts,
  };
  await db.supplierReturns.add(ret);
  return ok(ret);
}

export async function sendSupplierReturn(params: {
  actor: User;
  stockist: Business;
  id: string;
}): Promise<Result<SupplierReturn>> {
  const perm = assertCan(params.actor, params.stockist, 'supplier.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Return was not sent.');
  const ret = await db.supplierReturns.get(params.id);
  if (!ret || ret.stockistId !== params.stockist.id) {
    return fail('NotFound', 'SRET_MISSING', 'Return not found.', 'Return was not sent.');
  }
  if (ret.status !== 'Draft') {
    return fail('StateConflict', 'SRET_STATE', 'Only Draft returns can be sent.', 'Return was not sent.');
  }
  const ts = new Date().toISOString();
  for (const line of ret.lines) {
    const batch = await db.batches.get(line.batchId);
    if (!batch) continue;
    const available = batch.onHand - batch.reserved;
    if (line.qty > available) {
      return fail('BusinessRule', 'SRET_QTY', `Insufficient stock for batch ${batch.batchNumber}.`, 'Return was not sent.');
    }
    const prev = batch.onHand;
    await db.batches.update(batch.id, { onHand: prev - line.qty, updatedAt: ts });
    await db.inventoryMovements.add({
      id: newId(),
      businessId: params.stockist.id,
      productId: batch.productId,
      batchId: batch.id,
      type: 'Adjustment',
      qty: -line.qty,
      reason: `Supplier return ${ret.retNo}: ${line.reason}`,
      sourceDocType: 'SupplierReturn',
      sourceDocId: ret.id,
      actorId: params.actor.id,
      prevQty: prev,
      newQty: prev - line.qty,
      at: ts,
    });
  }
  const next = { ...ret, status: 'Sent' as const, updatedAt: ts };
  await db.supplierReturns.put(next);
  return ok(next);
}

export async function settleSupplierReturn(params: {
  actor: User;
  stockist: Business;
  id: string;
  settledNote: string;
}): Promise<Result<SupplierReturn>> {
  const perm = assertCan(params.actor, params.stockist, 'supplier.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Return was not settled.');
  const ret = await db.supplierReturns.get(params.id);
  if (!ret || ret.stockistId !== params.stockist.id) {
    return fail('NotFound', 'SRET_MISSING', 'Return not found.', 'Return was not settled.');
  }
  if (ret.status !== 'Sent') {
    return fail('StateConflict', 'SRET_STATE', 'Only Sent returns can be settled.', 'Return was not settled.');
  }
  const next = {
    ...ret,
    status: 'Settled' as const,
    settledNote: params.settledNote.trim(),
    updatedAt: new Date().toISOString(),
  };
  await db.supplierReturns.put(next);
  return ok(next);
}

export async function listRequiredStock(stockistId: string): Promise<
  { productId: string; name: string; onHand: number; reorderLevel: number; suggestedQty: number }[]
> {
  const products = await db.products.where('stockistId').equals(stockistId).toArray();
  const batches = await db.batches.where('stockistId').equals(stockistId).toArray();
  const out = [];
  for (const p of products) {
    const reorderLevel = p.reorderLevel ?? 0;
    if (reorderLevel <= 0) continue;
    const onHand = batches.filter((b) => b.productId === p.id).reduce((s, b) => s + Math.max(0, b.onHand - b.reserved), 0);
    if (onHand > reorderLevel) continue;
    out.push({
      productId: p.id,
      name: p.name,
      onHand,
      reorderLevel,
      suggestedQty: Math.max(reorderLevel * 2 - onHand, reorderLevel),
    });
  }
  return out;
}

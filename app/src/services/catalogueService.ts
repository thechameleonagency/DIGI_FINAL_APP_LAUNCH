import type { Business, Catalogue, CatalogueStatus, Product, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { machines } from '../domain/machines/transitions';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';
import { notifyBusinessUsers } from './notifications';
import { priceForPlatformPharmacy } from './pricingService';

export async function upsertProduct(params: {
  actor: User;
  stockist: Business;
  product: Partial<Product> & {
    name: string;
    sku: string;
    brand: string;
    category: string;
    packSize: string;
    mrp: number;
    ptr: number;
    gstPercent: number;
    moq: number;
    pricingClass?: 'Generic' | 'Ethical';
  };
  productId?: string;
}): Promise<Result<Product>> {
  const perm = assertCan(params.actor, params.stockist, 'catalogue.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Product was not saved.');
  const name = params.product.name?.trim() ?? '';
  const sku = params.product.sku?.trim() ?? '';
  const brand = params.product.brand?.trim() ?? '';
  const category = params.product.category?.trim() ?? '';
  const packSize = params.product.packSize?.trim() ?? '';
  if (!name || !sku) {
    return fail('Validation', 'PROD_FIELDS', 'Name and SKU are required.', 'Product was not saved.');
  }
  if (!brand || !category || !packSize) {
    return fail(
      'Validation',
      'PROD_FIELDS',
      'Brand, category, and pack size are required.',
      'Product was not saved.',
    );
  }
  if (!(params.product.mrp > 0) || !(params.product.ptr > 0) || !(params.product.gstPercent > 0)) {
    return fail(
      'Validation',
      'PROD_PRICE',
      'MRP, PTR, and GST % must be greater than zero.',
      'Product was not saved.',
    );
  }
  if (params.product.ptr > params.product.mrp) {
    return fail('Validation', 'PROD_PTR_MRP', 'PTR cannot exceed MRP.', 'Product was not saved.');
  }
  if (!Number.isInteger(params.product.moq) || params.product.moq < 1) {
    return fail('Validation', 'PROD_MOQ', 'MOQ must be a whole number of at least 1.', 'Product was not saved.');
  }
  const cat = await db.catalogues.where('stockistId').equals(params.stockist.id).first();
  if (!cat) return fail('NotFound', 'CAT_MISSING', 'Catalogue not found.', 'Product was not saved.');
  const ts = new Date().toISOString();

  const skuDup = await db.products
    .where('stockistId')
    .equals(params.stockist.id)
    .filter(
      (p) =>
        p.sku.toLowerCase() === sku.toLowerCase() &&
        (!params.productId || p.id !== params.productId),
    )
    .first();
  if (skuDup) return fail('Duplicate', 'PROD_SKU_DUP', 'SKU already exists.', 'Product was not saved.');

  if (params.productId) {
    const existing = await db.products.get(params.productId);
    if (!existing || existing.stockistId !== params.stockist.id) {
      return fail('NotFound', 'PROD_MISSING', 'Product not found.', 'Product was not saved.');
    }
    await db.products.update(params.productId, {
      ...params.product,
      name,
      sku,
      brand,
      category,
      packSize,
      reorderLevel: params.product.reorderLevel,
      updatedAt: ts,
    });
    await writeAudit({
      actorId: params.actor.id,
      actorName: params.actor.name,
      businessId: params.stockist.id,
      entityType: 'Product',
      entityId: params.productId,
      action: 'product.update',
      after: { sku, name },
    });
    if (params.product.ptr !== existing.ptr || params.product.mrp !== existing.mrp) {
      await db.priceChanges.add({
        id: newId(),
        stockistId: params.stockist.id,
        productId: params.productId,
        oldPtr: existing.ptr,
        newPtr: params.product.ptr,
        oldMrp: existing.mrp,
        newMrp: params.product.mrp,
        source: 'manual',
        actorId: params.actor.id,
        at: ts,
      });
    }
    return ok((await db.products.get(params.productId))!);
  }

  const product: Product = {
    id: newId(),
    stockistId: params.stockist.id,
    catalogueId: cat.id,
    name,
    sku,
    brand,
    category,
    packSize,
    mrp: params.product.mrp,
    ptr: params.product.ptr,
    gstPercent: params.product.gstPercent,
    moq: params.product.moq,
    maxQty: params.product.maxQty,
    reorderLevel: params.product.reorderLevel,
    purchaseRate: params.product.purchaseRate,
    pricingClass: params.product.pricingClass ?? 'Generic',
    rxRequired: params.product.rxRequired,
    narcotic: params.product.narcotic,
    status: 'Active',
    hsn: params.product.hsn,
    manufacturer: params.product.manufacturer,
    genericName: params.product.genericName,
    composition: params.product.composition,
    description: params.product.description,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.products.add(product);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Product',
    entityId: product.id,
    action: 'product.create',
    after: { sku: product.sku, name: product.name },
  });
  return ok(product);
}

export async function importProductsCsv(params: {
  actor: User;
  stockist: Business;
  rows: {
    name: string;
    sku: string;
    brand: string;
    category: string;
    packSize: string;
    mrp: number;
    ptr: number;
    gstPercent: number;
    moq: number;
    pricingClass?: 'Generic' | 'Ethical';
  }[];
}): Promise<Result<{ succeeded: string[]; failed: { sku: string; reason: string }[] }>> {
  const perm = assertCan(params.actor, params.stockist, 'catalogue.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Import was not run.');
  const succeeded: string[] = [];
  const failed: { sku: string; reason: string }[] = [];
  const seenSku = new Set<string>();
  for (const row of params.rows) {
    const skuKey = row.sku.trim().toLowerCase();
    if (!skuKey) {
      failed.push({ sku: row.sku || '(blank)', reason: 'SKU is required.' });
      continue;
    }
    if (seenSku.has(skuKey)) {
      failed.push({ sku: row.sku, reason: 'Duplicate SKU in this CSV file.' });
      continue;
    }
    seenSku.add(skuKey);
    const existing = await db.products
      .where('stockistId')
      .equals(params.stockist.id)
      .filter((p) => p.sku.toLowerCase() === skuKey)
      .first();
    const res = await upsertProduct({
      actor: params.actor,
      stockist: params.stockist,
      product: row,
      productId: existing?.id,
    });
    if (res.ok) succeeded.push(row.sku.trim());
    else failed.push({ sku: row.sku.trim() || '(blank)', reason: res.message });
  }
  return ok({ succeeded, failed });
}

export async function getCart(pharmacyId: string, stockistId: string) {
  return (
    (await db.carts.where({ pharmacyId, stockistId }).first()) ?? {
      id: `${pharmacyId}-${stockistId}`,
      pharmacyId,
      stockistId,
      lines: [],
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function setCartLine(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  productId: string;
  qty: number;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Cart was not updated.');
  const platform = await db.platformSettings.get('platform');
  if (platform?.maintenanceMode) {
    return fail(
      'BusinessRule',
      'CART_MAINTENANCE',
      'Platform maintenance is on — cart updates are paused. Try again after the banner clears.',
      'Cart was not updated.',
    );
  }
  const conn = await db.connections.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (!conn || conn.status !== 'Active') {
    return fail('BusinessRule', 'CART_NO_CONN', 'Active connection required to cart products.', 'Cart was not updated.');
  }
  const product = await db.products.get(params.productId);
  if (!product || product.stockistId !== params.stockistId || product.status !== 'Active') {
    return fail('NotFound', 'CART_PROD', 'Product not available.', 'Cart was not updated.');
  }
  const cat = await db.catalogues.where('stockistId').equals(params.stockistId).first();
  if (!cat || cat.status !== 'Active') {
    return fail('BusinessRule', 'CART_CAT', 'Stockist catalogue is not available for ordering.', 'Cart was not updated.');
  }
  if (params.qty > 0 && params.qty < product.moq) {
    return fail('Validation', 'CART_MOQ', `Minimum order quantity is ${product.moq}.`, 'Cart was not updated.');
  }
  if (product.maxQty && params.qty > product.maxQty) {
    return fail('Validation', 'CART_MAX', `Maximum quantity is ${product.maxQty}.`, 'Cart was not updated.');
  }

  let cart = await db.carts.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (!cart) {
    cart = {
      id: newId(),
      pharmacyId: params.pharmacy.id,
      stockistId: params.stockistId,
      lines: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const lines = cart.lines.filter((l) => l.productId !== params.productId);
  if (params.qty > 0) {
    const settings = await db.platformSettings.get('platform');
    const inclusive = priceForPlatformPharmacy(product, settings).unitPrice;
    lines.push({
      productId: params.productId,
      stockistId: params.stockistId,
      qty: params.qty,
      unitPriceAtAdd: inclusive,
    });
  }
  cart = { ...cart, lines, updatedAt: new Date().toISOString() };
  await db.carts.put(cart);
  return ok(true);
}

/**
 * Bulk-path helper: if the line already exists, add `qty` on top of it;
 * if new, set to at least MOQ. Never silently replaces a higher cart qty with MOQ.
 */
export async function addOrIncrementCartLine(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
  productId: string;
  qty: number;
}): Promise<Result<{ previousQty: number; newQty: number; incremented: boolean }>> {
  const product = await db.products.get(params.productId);
  if (!product || product.stockistId !== params.stockistId || product.status !== 'Active') {
    return fail('NotFound', 'CART_PROD', 'Product not available.', 'Cart was not updated.');
  }
  const cart = await db.carts.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  const previousQty = cart?.lines.find((l) => l.productId === params.productId)?.qty ?? 0;
  const addQty = Math.max(0, Math.floor(params.qty));
  if (addQty <= 0) {
    return fail('Validation', 'CART_QTY', 'Quantity must be positive.', 'Cart was not updated.');
  }
  let newQty = previousQty > 0 ? previousQty + addQty : Math.max(addQty, product.moq);
  if (product.maxQty != null && newQty > product.maxQty) {
    if (previousQty >= product.maxQty) {
      return fail(
        'Validation',
        'CART_MAX',
        `Already at maximum quantity (${product.maxQty}).`,
        'Cart was not updated.',
      );
    }
    newQty = product.maxQty;
  }
  const res = await setCartLine({
    actor: params.actor,
    pharmacy: params.pharmacy,
    stockistId: params.stockistId,
    productId: params.productId,
    qty: newQty,
  });
  if (!res.ok) return res;
  return ok({ previousQty, newQty, incremented: previousQty > 0 });
}

export async function clearCart(params: {
  actor: User;
  pharmacy: Business;
  stockistId: string;
}): Promise<Result<true>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Cart was not cleared.');
  const cart = await db.carts.where({ pharmacyId: params.pharmacy.id, stockistId: params.stockistId }).first();
  if (cart) await db.carts.delete(cart.id);
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'Cart',
    entityId: `${params.pharmacy.id}-${params.stockistId}`,
    action: 'cart.clear',
  });
  return ok(true);
}

export async function reorderFromOrder(params: {
  actor: User;
  pharmacy: Business;
  orderId: string;
}): Promise<
  Result<{
    stockistId: string;
    added: number;
    incremented: number;
    skipped: { productName: string; reason: string }[];
    changes: { productName: string; previousQty: number; newQty: number }[];
  }>
> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Cart was not rebuilt.');
  const order = await db.orders.get(params.orderId);
  if (!order || order.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'ORD_MISSING', 'Order not found.', 'Cart was not rebuilt.');
  }
  const skipped: { productName: string; reason: string }[] = [];
  const changes: { productName: string; previousQty: number; newQty: number }[] = [];
  let added = 0;
  let incremented = 0;
  for (const line of order.lines) {
    const product = await db.products.get(line.productId);
    if (!product || product.status !== 'Active') {
      skipped.push({ productName: line.productName, reason: 'Product inactive or deleted' });
      continue;
    }
    if (product.stockistId !== order.stockistId) {
      skipped.push({ productName: line.productName, reason: 'Product moved to another stockist' });
      continue;
    }
    const qty = Math.max(line.qty, product.moq);
    const res = await addOrIncrementCartLine({
      actor: params.actor,
      pharmacy: params.pharmacy,
      stockistId: order.stockistId,
      productId: line.productId,
      qty,
    });
    if (!res.ok) skipped.push({ productName: line.productName, reason: res.message });
    else {
      changes.push({ productName: line.productName, previousQty: res.data.previousQty, newQty: res.data.newQty });
      if (res.data.incremented) incremented++;
      else added++;
    }
  }
  if (!added && !incremented) {
    return fail(
      'BusinessRule',
      'REORDER_EMPTY',
      skipped.length
        ? `No lines could be added. ${skipped.map((s) => `${s.productName}: ${s.reason}`).join('; ')}`
        : 'No lines to reorder.',
      'Cart was not rebuilt.',
    );
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.pharmacy.id,
    entityType: 'Order',
    entityId: order.id,
    action: 'order.reorder',
    after: { added, incremented, skipped: skipped.length, stockistId: order.stockistId },
  });
  return ok({ stockistId: order.stockistId, added, incremented, skipped, changes });
}

export async function toggleWishlist(params: {
  actor: User;
  pharmacy: Business;
  productId: string;
  stockistId: string;
}): Promise<Result<boolean>> {
  const perm = assertCan(params.actor, params.pharmacy, 'order.place');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Wishlist was not updated.');
  const existing = await db.wishlists.where({ pharmacyId: params.pharmacy.id, productId: params.productId }).first();
  if (existing) {
    await db.wishlists.delete(existing.id);
    return ok(false);
  }
  const product = await db.products.get(params.productId);
  if (!product || product.stockistId !== params.stockistId) {
    return fail('NotFound', 'WISH_PROD', 'Product not available.', 'Wishlist was not updated.');
  }
  if (product.status !== 'Active') {
    return fail('BusinessRule', 'WISH_INACTIVE', 'Only Active products can be wishlisted.', 'Wishlist was not updated.');
  }
  await db.wishlists.add({
    id: newId(),
    pharmacyId: params.pharmacy.id,
    productId: params.productId,
    stockistId: params.stockistId,
    addedAt: new Date().toISOString(),
  });
  return ok(true);
}

export async function setProductStatus(params: {
  actor: User;
  stockist: Business;
  productId: string;
  status: Product["status"];
}): Promise<Result<Product>> {
  const perm = assertCan(params.actor, params.stockist, "catalogue.manage");
  if (!perm.allow) return fail("Permission", "PERM_DENIED", perm.reason!, "Status was not changed.");
  const product = await db.products.get(params.productId);
  if (!product || product.stockistId !== params.stockist.id) {
    return fail("NotFound", "PROD_MISSING", "Product not found.", "Status was not changed.");
  }
  const t = machines.product(product.status, params.status);
  if (!t.ok) return fail("StateConflict", "PROD_BAD_STATE", t.reason!, "Status was not changed.");
  const ts = new Date().toISOString();
  await db.products.update(product.id, { status: params.status, updatedAt: ts });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: "Product",
    entityId: product.id,
    action: "product.status",
    after: { status: params.status, sku: product.sku },
  });
  return ok((await db.products.get(product.id))!);
}

export async function setCatalogueStatus(params: {
  actor: User;
  stockist: Business;
  status: CatalogueStatus;
}): Promise<Result<Catalogue>> {
  const perm = assertCan(params.actor, params.stockist, "catalogue.manage");
  if (!perm.allow) return fail("Permission", "PERM_DENIED", perm.reason!, "Catalogue status was not changed.");
  const cat = await db.catalogues.where("stockistId").equals(params.stockist.id).first();
  if (!cat) return fail("NotFound", "CAT_MISSING", "Catalogue not found.", "Catalogue status was not changed.");
  const t = machines.catalogue(cat.status, params.status);
  if (!t.ok) return fail("StateConflict", "CAT_BAD_STATE", t.reason!, "Catalogue status was not changed.");
  await db.catalogues.update(cat.id, { status: params.status, updatedAt: new Date().toISOString() });
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: "Catalogue",
    entityId: cat.id,
    action: "catalogue.status",
    after: { status: params.status },
  });
  await notifyBusinessUsers(params.stockist.id, "N-046", { stockist: params.stockist.name }, { type: "Catalogue", id: cat.id });
  // notify connected pharmacies
  const conns = await db.connections.where({ stockistId: params.stockist.id, status: "Active" }).toArray();
  for (const c of conns) {
    await notifyBusinessUsers(c.pharmacyId, "N-046", { stockist: params.stockist.name }, { type: "Catalogue", id: cat.id });
  }
  return ok((await db.catalogues.get(cat.id))!);
}

export async function bulkUpdatePrices(params: {
  actor: User;
  stockist: Business;
  productIds: string[];
  mode: "percent" | "absolute";
  value: number;
  field: "ptr" | "mrp";
}): Promise<Result<{ updated: number }>> {
  const perm = assertCan(params.actor, params.stockist, "catalogue.manage");
  if (!perm.allow) return fail("Permission", "PERM_DENIED", perm.reason!, "Prices were not updated.");
  if (!params.productIds.length) return fail("Validation", "PRICE_EMPTY", "Select at least one product.", "Prices were not updated.");
  if (!Number.isFinite(params.value)) {
    return fail("Validation", "PRICE_VALUE", "Price update value must be a finite number.", "Prices were not updated.");
  }
  const ts = new Date().toISOString();
  let updated = 0;
  for (const id of params.productIds) {
    const p = await db.products.get(id);
    if (!p || p.stockistId !== params.stockist.id) continue;
    const oldPtr = p.ptr;
    const oldMrp = p.mrp;
    let next = { ...p };
    if (params.field === "ptr") {
      next.ptr = params.mode === "percent" ? Math.round(p.ptr * (1 + params.value / 100) * 100) / 100 : params.value;
    } else {
      next.mrp = params.mode === "percent" ? Math.round(p.mrp * (1 + params.value / 100) * 100) / 100 : params.value;
    }
    if (!(next.ptr > 0) || !(next.mrp > 0) || next.ptr > next.mrp) {
      continue;
    }
    await db.products.update(p.id, { ptr: next.ptr, mrp: next.mrp, updatedAt: ts });
    await db.priceChanges.add({
      id: newId(),
      stockistId: params.stockist.id,
      productId: p.id,
      oldPtr,
      newPtr: next.ptr,
      oldMrp,
      newMrp: next.mrp,
      source: "bulk",
      actorId: params.actor.id,
      at: ts,
    });
    await notifyBusinessUsers(params.stockist.id, "N-047", { productName: p.name }, { type: "Product", id: p.id });
    const conns = await db.connections.where({ stockistId: params.stockist.id, status: "Active" }).toArray();
    for (const c of conns) {
      await notifyBusinessUsers(c.pharmacyId, "N-047", { productName: p.name }, { type: "Product", id: p.id });
    }
    updated++;
  }
  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: "Catalogue",
    entityId: params.stockist.id,
    action: "catalogue.bulkPrice",
    after: { updated, mode: params.mode, value: params.value, field: params.field },
  });
  return ok({ updated });
}

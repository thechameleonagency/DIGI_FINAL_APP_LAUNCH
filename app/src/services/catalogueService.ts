import type { Business, Product, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';
import { assertCan } from './authService';
import { writeAudit } from './audit';

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
  };
  productId?: string;
}): Promise<Result<Product>> {
  const perm = assertCan(params.actor, params.stockist, 'catalogue.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Product was not saved.');
  const cat = await db.catalogues.where('stockistId').equals(params.stockist.id).first();
  if (!cat) return fail('NotFound', 'CAT_MISSING', 'Catalogue not found.', 'Product was not saved.');
  const ts = new Date().toISOString();

  if (params.productId) {
    const existing = await db.products.get(params.productId);
    if (!existing || existing.stockistId !== params.stockist.id) {
      return fail('NotFound', 'PROD_MISSING', 'Product not found.', 'Product was not saved.');
    }
    await db.products.update(params.productId, { ...params.product, updatedAt: ts });
    return ok((await db.products.get(params.productId))!);
  }

  const skuDup = await db.products
    .where('stockistId')
    .equals(params.stockist.id)
    .filter((p) => p.sku.toLowerCase() === params.product.sku.toLowerCase())
    .first();
  if (skuDup) return fail('Duplicate', 'PROD_SKU_DUP', 'SKU already exists.', 'Product was not saved.');

  const product: Product = {
    id: newId(),
    stockistId: params.stockist.id,
    catalogueId: cat.id,
    name: params.product.name,
    sku: params.product.sku,
    brand: params.product.brand,
    category: params.product.category,
    packSize: params.product.packSize,
    mrp: params.product.mrp,
    ptr: params.product.ptr,
    gstPercent: params.product.gstPercent,
    moq: params.product.moq,
    maxQty: params.product.maxQty,
    status: 'Active',
    hsn: params.product.hsn,
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
  }[];
}): Promise<Result<{ succeeded: string[]; failed: { sku: string; reason: string }[] }>> {
  const succeeded: string[] = [];
  const failed: { sku: string; reason: string }[] = [];
  for (const row of params.rows) {
    const res = await upsertProduct({ actor: params.actor, stockist: params.stockist, product: row });
    if (res.ok) succeeded.push(row.sku);
    else failed.push({ sku: row.sku, reason: res.message });
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
  pharmacyId: string;
  stockistId: string;
  productId: string;
  qty: number;
}): Promise<Result<true>> {
  const conn = await db.connections.where({ pharmacyId: params.pharmacyId, stockistId: params.stockistId }).first();
  if (!conn || conn.status !== 'Active') {
    return fail('BusinessRule', 'CART_NO_CONN', 'Active connection required to cart products.', 'Cart was not updated.');
  }
  const product = await db.products.get(params.productId);
  if (!product || product.stockistId !== params.stockistId || product.status !== 'Active') {
    return fail('NotFound', 'CART_PROD', 'Product not available.', 'Cart was not updated.');
  }
  if (params.qty > 0 && params.qty < product.moq) {
    return fail('Validation', 'CART_MOQ', `Minimum order quantity is ${product.moq}.`, 'Cart was not updated.');
  }
  if (product.maxQty && params.qty > product.maxQty) {
    return fail('Validation', 'CART_MAX', `Maximum quantity is ${product.maxQty}.`, 'Cart was not updated.');
  }

  let cart = await db.carts.where({ pharmacyId: params.pharmacyId, stockistId: params.stockistId }).first();
  if (!cart) {
    cart = {
      id: newId(),
      pharmacyId: params.pharmacyId,
      stockistId: params.stockistId,
      lines: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const lines = cart.lines.filter((l) => l.productId !== params.productId);
  if (params.qty > 0) lines.push({ productId: params.productId, stockistId: params.stockistId, qty: params.qty });
  cart = { ...cart, lines, updatedAt: new Date().toISOString() };
  await db.carts.put(cart);
  return ok(true);
}

export async function toggleWishlist(pharmacyId: string, productId: string, stockistId: string): Promise<Result<boolean>> {
  const existing = await db.wishlists.where({ pharmacyId, productId }).first();
  if (existing) {
    await db.wishlists.delete(existing.id);
    return ok(false);
  }
  await db.wishlists.add({
    id: newId(),
    pharmacyId,
    productId,
    stockistId,
    addedAt: new Date().toISOString(),
  });
  return ok(true);
}

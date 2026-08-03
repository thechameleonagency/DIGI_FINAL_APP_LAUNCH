import type { Business, Product, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { nowIso } from '../domain/utils/clock';
import { newId, nextNumber } from '../domain/utils/ids';
import { roundMoney } from '../domain/utils/money';
import { db } from '../data/db';
import { writeAudit } from './audit';
import { assertCan } from './authService';
import { stockIn } from './inventoryService';

export type OcrParsedLine = {
  key: string;
  productName: string;
  qty: number;
  unitCost: number;
  mrp?: number;
  saleRate?: number;
  batchNumber?: string;
  expiryDate?: string;
  matchedProductId?: string;
  isNew: boolean;
  keepExistingRate?: boolean;
};

export type OcrParseResult = {
  fileName: string;
  supplierHint?: string;
  invoiceHint?: string;
  lines: OcrParsedLine[];
  /** Sum of qty × unitCost from the bill (offline rates) for savings compare. */
  billTotal: number;
};

/** Deterministic mock OCR — no external API. Seeded from filename + optional hint text. */
export function mockParseBillImage(params: {
  fileName: string;
  mime?: string;
  hintText?: string;
}): OcrParseResult {
  const seed = [...(params.fileName + (params.hintText ?? ''))].reduce((a, c) => a + c.charCodeAt(0), 0);
  const catalogue = [
    { name: 'Dolo 650 Tablet', unitCost: 28, mrp: 35, qty: 10 + (seed % 5) },
    { name: 'Augmentin 625 Duo', unitCost: 145, mrp: 189, qty: 5 + (seed % 3) },
    { name: 'Pantop 40 Tablet', unitCost: 72, mrp: 95, qty: 8 + (seed % 4) },
    { name: 'Azithral 500 Tablet', unitCost: 98, mrp: 119, qty: 6 + (seed % 2) },
    { name: 'Crocin Advance', unitCost: 22, mrp: 30, qty: 12 + (seed % 6) },
  ];
  const count = 3 + (seed % 3);
  const picked = catalogue.slice(0, count).map((row, i) => {
    const jitter = ((seed + i * 17) % 7) - 3;
    const unitCost = roundMoney(row.unitCost + jitter);
    return {
      key: `ocr-${i}`,
      productName: row.name,
      qty: row.qty,
      unitCost,
      mrp: row.mrp,
      saleRate: roundMoney(unitCost * 1.12),
      batchNumber: `B${2026}${(seed + i) % 90}`.padStart(6, '0'),
      expiryDate: `2027-${String(((seed + i) % 12) + 1).padStart(2, '0')}-28`,
      isNew: true,
      matchedProductId: undefined as string | undefined,
    };
  });
  const billTotal = roundMoney(picked.reduce((s, l) => s + l.qty * l.unitCost, 0));
  return {
    fileName: params.fileName || 'supplier-bill.jpg',
    supplierHint: seed % 2 === 0 ? 'Cipla Distributors' : 'Local Pharma Wholesale',
    invoiceHint: `INV-${1000 + (seed % 9000)}`,
    lines: picked,
    billTotal,
  };
}

/** Match OCR lines to stockist catalogue by fuzzy name. */
export async function matchOcrLinesToCatalogue(
  stockistId: string,
  lines: OcrParsedLine[],
): Promise<OcrParsedLine[]> {
  const products = await db.products.where('stockistId').equals(stockistId).toArray();
  return lines.map((line) => {
    const needle = line.productName.toLowerCase().trim();
    const hit = products.find((p) => {
      const n = p.name.toLowerCase();
      return n === needle || n.includes(needle) || needle.includes(n);
    });
    if (!hit) return { ...line, isNew: true };
    return {
      ...line,
      matchedProductId: hit.id,
      isNew: false,
      saleRate: hit.ptr,
      mrp: hit.mrp,
      keepExistingRate: true,
    };
  });
}

/**
 * Confirm stockist bill OCR → create/update products + stock-in batches.
 */
export async function confirmStockistBillOcr(params: {
  actor: User;
  stockist: Business;
  lines: OcrParsedLine[];
  marginPercent?: number;
  keepExistingRates?: boolean;
  fileName?: string;
}): Promise<Result<{ created: number; updated: number; stockValue: number }>> {
  const perm = assertCan(params.actor, params.stockist, 'catalogue.manage');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Bill was not imported.');
  if (!params.lines.length) {
    return fail('Validation', 'OCR_EMPTY', 'Add at least one line item.', 'Bill was not imported.');
  }

  const cat = await db.catalogues.where('stockistId').equals(params.stockist.id).first();
  if (!cat) return fail('NotFound', 'OCR_CAT', 'Catalogue missing.', 'Bill was not imported.');

  let created = 0;
  let updated = 0;
  let stockValue = 0;
  const margin = params.marginPercent ?? 12;
  const keep = params.keepExistingRates !== false;
  const ts = nowIso();

  for (const line of params.lines) {
    if (!line.productName.trim()) {
      return fail('Validation', 'OCR_NAME', 'Every line needs a product name.', 'Bill was not imported.');
    }
    let product: Product | undefined = line.matchedProductId
      ? await db.products.get(line.matchedProductId)
      : undefined;

    const saleRate =
      keep && product
        ? product.ptr
        : roundMoney(line.saleRate ?? line.unitCost * (1 + margin / 100));
    const mrp = line.mrp ?? roundMoney(saleRate * 1.25);

    if (!product) {
      const sku = `OCR-${Date.now().toString(36)}-${created}`.toUpperCase();
      product = {
        id: newId(),
        stockistId: params.stockist.id,
        catalogueId: cat.id,
        name: line.productName.trim(),
        sku,
        brand: 'Imported',
        category: 'General',
        packSize: '1',
        mrp,
        ptr: saleRate,
        gstPercent: 12,
        moq: 1,
        pricingClass: 'Generic',
        scheduleType: 'NONE',
        listedForSale: true,
        status: 'Active',
        purchaseRate: line.unitCost,
        createdAt: ts,
        updatedAt: ts,
      };
      await db.products.add(product);
      created += 1;
    } else {
      if (!keep) {
        await db.products.put({
          ...product,
          ptr: saleRate,
          mrp,
          purchaseRate: line.unitCost,
          listedForSale: product.listedForSale !== false,
          updatedAt: ts,
        });
      } else {
        await db.products.put({
          ...product,
          purchaseRate: line.unitCost,
          listedForSale: product.listedForSale !== false,
          updatedAt: ts,
        });
      }
      updated += 1;
    }

    const qty = Math.max(1, Math.floor(line.qty));
    stockValue = roundMoney(stockValue + qty * line.unitCost);
    const stockRes = await stockIn({
      actor: params.actor,
      stockist: params.stockist,
      productId: product.id,
      batchNumber: line.batchNumber || `OCR-${nextNumber('BAT').replace(/\D/g, '').slice(-6)}`,
      expiryDate: line.expiryDate || '2027-12-31',
      qty,
      cost: line.unitCost,
    });
    if (!stockRes.ok) {
      return fail(stockRes.category, stockRes.code, stockRes.message, 'Bill was not imported.');
    }
  }

  await writeAudit({
    actorId: params.actor.id,
    actorName: params.actor.name,
    businessId: params.stockist.id,
    entityType: 'Product',
    entityId: params.stockist.id,
    action: 'ocr.billImport',
    after: { created, updated, stockValue, fileName: params.fileName },
  });

  return ok({ created, updated, stockValue });
}

/**
 * Confirm pharmacy offline-supplier bill → pharmacy shelf inventory (no platform commission).
 */
export async function confirmPharmacySupplierBillOcr(params: {
  actor: User;
  pharmacy: Business;
  supplierId: string;
  lines: OcrParsedLine[];
  fileName?: string;
  billTotal?: number;
}): Promise<Result<{ billId: string; lines: number }>> {
  const perm = assertCan(params.actor, params.pharmacy, 'inventory.adjust');
  if (!perm.allow) return fail('Permission', 'PERM_DENIED', perm.reason!, 'Bill was not imported.');
  const supplier = await db.managedSuppliers.get(params.supplierId);
  if (!supplier || supplier.pharmacyId !== params.pharmacy.id) {
    return fail('NotFound', 'OCR_SUP', 'Supplier not found.', 'Bill was not imported.');
  }
  if (!params.lines.length) {
    return fail('Validation', 'OCR_EMPTY', 'Add at least one line.', 'Bill was not imported.');
  }

  const ts = nowIso();
  const amount = roundMoney(
    params.billTotal ?? params.lines.reduce((s, l) => s + l.qty * l.unitCost, 0),
  );
  const billId = newId();
  await db.managedSupplierBills.add({
    id: billId,
    billNo: nextNumber('PSB'),
    pharmacyId: params.pharmacy.id,
    supplierId: params.supplierId,
    date: ts.slice(0, 10),
    amount,
    lines: params.lines.map((l) => ({
      productName: l.productName,
      qty: l.qty,
      unitCost: l.unitCost,
      batchNumber: l.batchNumber,
      expiryDate: l.expiryDate,
      mrp: l.mrp,
    })),
    notes: params.fileName ? `OCR: ${params.fileName}` : undefined,
    createdAt: ts,
  });

  for (const line of params.lines) {
    const invId = newId();
    await db.pharmacyInventory.add({
      id: invId,
      pharmacyId: params.pharmacy.id,
      productId: `offline-${invId}`,
      productName: line.productName,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      mrp: line.mrp,
      onHand: Math.max(1, Math.floor(line.qty)),
      updatedAt: ts,
    });
  }

  return ok({ billId, lines: params.lines.length });
}

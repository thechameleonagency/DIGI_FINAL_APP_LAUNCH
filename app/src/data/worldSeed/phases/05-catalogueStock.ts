import { MEDICINE_REFERENCE } from '../../../content/medicineReference';
import { nowIso } from '../../../domain/utils/clock';
import {
  bulkUpdatePrices,
  importProductsCsv,
  setProductStatus,
  upsertProduct,
} from '../../../services/catalogueService';
import { adjustStock, setBatchStatus, stockIn } from '../../../services/inventoryService';
import { assertOk } from '../assert';
import { advanceBusinessDay, advanceDays } from '../chronology';
import { getWorldCtx, type TraderParty } from '../context';
import { db } from '../../db';

type SkuSpec = {
  name: string;
  sku: string;
  brand: string;
  category: string;
  packSize: string;
  mrp: number;
  ptr: number;
  gstPercent: number;
  moq: number;
  pricingClass: 'Generic' | 'Ethical';
  manufacturer?: string;
  genericName?: string;
  hsn?: string;
};

function buildSkuCatalog(stockistTag: string): SkuSpec[] {
  const specs: SkuSpec[] = [];
  const packs = ['10 Tab', '15 Tab', '20 Tab', '30 Tab', '5 Tab', '100 ml', '60 ml', 'Sachet'];
  let i = 0;
  while (specs.length < 45) {
    const ref = MEDICINE_REFERENCE[i % MEDICINE_REFERENCE.length]!;
    const n = specs.length + 1;
    const pack = packs[n % packs.length]!;
    const pricingClass: 'Generic' | 'Ethical' = n % 3 === 0 ? 'Ethical' : 'Generic';
    const mrp = Math.round((ref.typicalMrp * (0.85 + (n % 5) * 0.08)) * 100) / 100;
    const ptr = Math.round(mrp * (pricingClass === 'Ethical' ? 0.82 : 0.72) * 100) / 100;
    specs.push({
      name: `${ref.name} ${pack}`,
      sku: `${stockistTag}-SKU-${String(n).padStart(3, '0')}`,
      brand: ref.brand,
      category: ref.category,
      packSize: pack,
      mrp,
      ptr: Math.min(ptr, mrp - 0.01),
      gstPercent: ref.gstPercent,
      moq: 1 + (n % 5),
      pricingClass,
      manufacturer: ref.manufacturer,
      genericName: ref.genericName,
      hsn: ref.hsn,
    });
    i++;
  }
  return specs;
}

function csvExtraRows(stockistTag: string): SkuSpec[] {
  return [
    {
      name: 'World Seed Multivitamin',
      sku: `${stockistTag}-CSV-001`,
      brand: 'DigiCare',
      category: 'Supplement',
      packSize: '30 Tab',
      mrp: 199,
      ptr: 140,
      gstPercent: 12,
      moq: 2,
      pricingClass: 'Generic',
    },
    {
      name: 'World Seed Cough Syrup',
      sku: `${stockistTag}-CSV-002`,
      brand: 'DigiCare',
      category: 'Respiratory',
      packSize: '100 ml',
      mrp: 89,
      ptr: 62,
      gstPercent: 12,
      moq: 1,
      pricingClass: 'Ethical',
    },
    {
      name: 'World Seed Antacid',
      sku: `${stockistTag}-CSV-003`,
      brand: 'DigiCare',
      category: 'Gastro',
      packSize: '200 ml',
      mrp: 120,
      ptr: 85,
      gstPercent: 12,
      moq: 3,
      pricingClass: 'Generic',
    },
    {
      name: 'World Seed Calcium',
      sku: `${stockistTag}-CSV-004`,
      brand: 'DigiCare',
      category: 'Supplement',
      packSize: '60 Tab',
      mrp: 250,
      ptr: 175,
      gstPercent: 12,
      moq: 1,
      pricingClass: 'Generic',
    },
    {
      name: 'World Seed Insulin Syringe',
      sku: `${stockistTag}-CSV-005`,
      brand: 'DigiCare',
      category: 'Device',
      packSize: '10 pcs',
      mrp: 75,
      ptr: 48,
      gstPercent: 12,
      moq: 5,
      pricingClass: 'Ethical',
    },
  ];
}

function expiryRelative(daysFromToday: number): string {
  const d = new Date(nowIso());
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

async function seedStockistCatalogue(party: TraderParty, tag: string): Promise<string[]> {
  const productIds: string[] = [];
  const specs = buildSkuCatalog(tag);

  for (let i = 0; i < specs.length; i++) {
    if (i > 0 && i % 8 === 0) advanceBusinessDay();
    const spec = specs[i]!;
    const created = assertOk(
      `05-catalogue.upsert.${tag}.${spec.sku}`,
      await upsertProduct({
        actor: party.user,
        stockist: party.business,
        product: {
          name: spec.name,
          sku: spec.sku,
          brand: spec.brand,
          category: spec.category,
          packSize: spec.packSize,
          mrp: spec.mrp,
          ptr: spec.ptr,
          gstPercent: spec.gstPercent,
          moq: spec.moq,
          pricingClass: spec.pricingClass,
          manufacturer: spec.manufacturer,
          genericName: spec.genericName,
          hsn: spec.hsn,
          reorderLevel: 20 + (i % 10),
        },
      }),
    );
    productIds.push(created.data.id);
  }

  advanceBusinessDay();
  const csvRows = csvExtraRows(tag);
  const imported = assertOk(
    `05-catalogue.csv.${tag}`,
    await importProductsCsv({
      actor: party.user,
      stockist: party.business,
      rows: csvRows,
    }),
  );
  if (imported.data.failed.length) {
    throw new Error(
      `[worldSeed:05-catalogue.csv.${tag}] ${imported.data.failed.map((f) => `${f.sku}:${f.reason}`).join('; ')}`,
    );
  }
  for (const sku of imported.data.succeeded) {
    const p = await db.products
      .where('stockistId')
      .equals(party.business.id)
      .filter((row) => row.sku === sku)
      .first();
    if (p) productIds.push(p.id);
  }

  // Stock activity spread over ~30 days
  for (let i = 0; i < productIds.length; i++) {
    if (i > 0 && i % 5 === 0) advanceBusinessDay();
    const productId = productIds[i]!;
    const far = assertOk(
      `05-stock.far.${tag}.${i}`,
      await stockIn({
        actor: party.user,
        stockist: party.business,
        productId,
        batchNumber: `${tag}-FAR-${i + 1}`,
        expiryDate: expiryRelative(400 + (i % 200)),
        qty: 100 + (i % 40) * 5,
        cost: 10 + (i % 15),
        location: i % 2 === 0 ? 'Rack-A' : 'Rack-B',
      }),
    );

    if (i % 7 === 0) {
      assertOk(
        `05-stock.near.${tag}.${i}`,
        await stockIn({
          actor: party.user,
          stockist: party.business,
          productId,
          batchNumber: `${tag}-NEAR-${i + 1}`,
          expiryDate: expiryRelative(20 + (i % 40)),
          qty: 30 + (i % 10),
          location: 'Near-Expiry',
        }),
      );
    }

    if (i === 0) {
      // Past expiry → Expired status via stockIn
      assertOk(
        `05-stock.expired.${tag}`,
        await stockIn({
          actor: party.user,
          stockist: party.business,
          productId,
          batchNumber: `${tag}-EXPIRED-1`,
          expiryDate: expiryRelative(-30),
          qty: 12,
          location: 'Quarantine-Bay',
        }),
      );
      assertOk(
        `05-stock.quarantine.${tag}`,
        await setBatchStatus({
          actor: party.user,
          stockist: party.business,
          batchId: far.data.id,
          status: 'Quarantined',
          reason: 'Damaged outer carton — hold for inspection',
        }),
      );
      assertOk(
        `05-stock.adjust.${tag}`,
        await adjustStock({
          actor: party.user,
          stockist: party.business,
          batchId: far.data.id,
          delta: -2,
          reason: 'Sample units removed during quarantine check',
        }),
      );
    }
  }

  advanceBusinessDay();
  assertOk(
    `05-catalogue.bulkPrices.${tag}`,
    await bulkUpdatePrices({
      actor: party.user,
      stockist: party.business,
      productIds: productIds.slice(0, 10),
      mode: 'percent',
      value: 2,
      field: 'ptr',
    }),
  );

  const inactiveId = productIds[productIds.length - 1]!;
  assertOk(
    `05-catalogue.inactive.${tag}`,
    await setProductStatus({
      actor: party.user,
      stockist: party.business,
      productId: inactiveId,
      status: 'Inactive',
    }),
  );

  return productIds;
}

/** Phase 5 — Catalogue (~50 SKUs/stockist) and multi-day stock activity. */
export async function seedCatalogueStockPhase(): Promise<void> {
  const ctx = getWorldCtx();

  for (const party of ctx.stockists) {
    const tag = party.key === 'stockistA' ? 'SA' : 'SB';
    const ids = await seedStockistCatalogue(party, tag);
    ctx.productIdsByStockist.set(party.business.id, ids);
    // Spread remaining clock budget across stockists (~15 days each contribution toward ~30)
    advanceDays(2);
  }
}

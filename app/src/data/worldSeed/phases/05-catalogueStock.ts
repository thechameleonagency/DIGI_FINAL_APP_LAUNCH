import { addDays, formatISO } from 'date-fns';
import { MEDICINE_REFERENCE } from '../../../content/medicineReference';
import { defaultRulesFromPrefs } from '../../../domain/calc/deliveryCommerce';
import type { DeliveryDate, PinDeliverySetting, Scheme } from '../../../domain/entities/types';
import { nowIso } from '../../../domain/utils/clock';
import { newId } from '../../../domain/utils/ids';
import {
  bulkUpdatePrices,
  importProductsCsv,
  setProductStatus,
  upsertProduct,
} from '../../../services/catalogueService';
import { adjustStock, setBatchStatus, stockIn } from '../../../services/inventoryService';
import { assertOk } from '../assert';
import { advanceBusinessDay, advanceDays } from '../chronology';
import { getWorldCtx, pharmacyByKey, type TraderParty } from '../context';
import { db } from '../../db';

function wallDatePlus(days: number): string {
  return formatISO(addDays(new Date(), days), { representation: 'date' });
}

/** CF-18 prefs + Dexie delivery commerce samples (dates, rules, PIN, scheme, lat/lng). */
async function seedDeliveryCommerce(party: TraderParty, productIds: string[]): Promise<void> {
  const stockistId = party.business.id;
  const feeFlat = party.key === 'stockistA' ? 80 : 50;
  const feeFreeAbove = party.key === 'stockistA' ? 5000 : 3000;
  const isA = party.key === 'stockistA';

  await db.businesses.update(stockistId, {
    preferences: {
      ...party.business.preferences,
      deliveryFeeFlat: feeFlat,
      deliveryFeeFreeAbove: feeFreeAbove,
      ...(isA
        ? { dispatchLatitude: 18.9467, dispatchLongitude: 72.8417 }
        : {}),
    },
    holidayEntries: [
      {
        startDate: wallDatePlus(12),
        endDate: wallDatePlus(12),
        reason: 'Warehouse maintenance',
        allowPreorder: true,
      },
      {
        startDate: wallDatePlus(20),
        endDate: wallDatePlus(21),
        reason: 'Stockist holiday — no preorders',
        allowPreorder: false,
      },
    ],
    holidays: [wallDatePlus(12), `${wallDatePlus(20)}|Stockist holiday`],
    ...(isA ? { latitude: 18.9467, longitude: 72.8417 } : {}),
    updatedAt: nowIso(),
  });

  const dateRows: DeliveryDate[] = [1, 3, 5, 8, 12, 15].map((d) => ({
    id: newId(),
    stockistId,
    date: wallDatePlus(d),
    active: true,
  }));
  await db.deliveryDates.bulkPut(dateRows);

  const rules = defaultRulesFromPrefs(stockistId, {
    deliveryFeeFlat: feeFlat,
    deliveryFeeFreeAbove: feeFreeAbove,
  });
  if (isA) {
    rules.unshift({
      id: newId(),
      stockistId,
      ruleType: 'delivery_date',
      priority: 5,
      active: true,
      freeOnDeliveryDate: true,
    });
  }
  await db.deliveryRules.bulkPut(rules);

  const pinCode = party.business.servicePins?.[0] ?? party.business.pincode;
  const pinRow: PinDeliverySetting = {
    id: newId(),
    stockistId,
    pinCode,
    deliveryDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    deliveryCharge: Math.max(30, feeFlat - 20),
    freeAbove: feeFreeAbove,
    estimatedHours: 24,
  };
  await db.pinDeliverySettings.bulkPut([pinRow]);

  const schemeProductId = productIds[0];
  if (schemeProductId) {
    const product = await db.products.get(schemeProductId);
    const scheme: Scheme = {
      id: newId(),
      stockistId,
      title: isA ? 'Launch 5% off' : 'Category 3% promo',
      scope: isA ? 'product' : 'category',
      productId: isA ? schemeProductId : undefined,
      category: isA ? undefined : product?.category ?? 'Supplement',
      discountType: 'percent',
      discountValue: isA ? 5 : 3,
      startsOn: wallDatePlus(-7),
      endsOn: wallDatePlus(60),
      active: true,
      stackable: false,
    };
    await db.schemes.put(scheme);
  }

  party.business = (await db.businesses.get(stockistId))!;
}

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
    await seedDeliveryCommerce(party, ids);
    // Spread remaining clock budget across stockists (~15 days each contribution toward ~30)
    advanceDays(2);
  }

  // Optional lat/lng pair for distance / Maps optimize demos (stockistA ↔ pharmacyA).
  try {
    const pharmacyA = pharmacyByKey('pharmacyA');
    await db.businesses.update(pharmacyA.business.id, {
      latitude: 19.0596,
      longitude: 72.8295,
      updatedAt: nowIso(),
    });
    pharmacyA.business = (await db.businesses.get(pharmacyA.business.id))!;
  } catch {
    // pharmacyA may be missing in partial seeds — ignore
  }
}

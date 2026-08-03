import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import {
  bulkUpdatePrices,
  importProductsCsv,
  setCatalogueStatus,
  setProductStatus,
  upsertProduct,
} from './catalogueService';
import { nowIso } from '../domain/utils/clock';

async function seedStockist() {
  const owner = await makeActor({ id: 'u-cat', businessId: 'biz-cat', role: 'Stockist' });
  const biz = await makeBusiness({ id: 'biz-cat', type: 'Stockist', ownerUserId: owner.id });
  await db.catalogues.put({
    id: 'cat-biz-cat',
    stockistId: biz.id,
    status: 'Active',
    updatedAt: nowIso(),
  });
  return { owner, biz };
}

describe('catalogueService Wave 3', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('upsertProduct rejects SKU collision on update', async () => {
    const { owner, biz } = await seedStockist();
    await makeProduct(biz.id, 'prod-a');
    await makeProduct(biz.id, 'prod-b');
    const res = await upsertProduct({
      actor: owner,
      stockist: biz,
      productId: 'prod-b',
      product: {
        name: 'Other',
        sku: 'SKU-prod-a',
        brand: 'B',
        category: 'C',
        packSize: '10s',
        mrp: 20,
        ptr: 10,
        gstPercent: 12,
        moq: 1,
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('PROD_SKU_DUP');
  });

  it('bulkUpdatePrices skips updates that would make PTR > MRP', async () => {
    const { owner, biz } = await seedStockist();
    const p = await makeProduct(biz.id, 'prod-bulk');
    const res = await bulkUpdatePrices({
      actor: owner,
      stockist: biz,
      productIds: [p.id],
      mode: 'absolute',
      value: 100,
      field: 'ptr',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.updated).toBe(0);
    expect((await db.products.get(p.id))?.ptr).toBe(10);
  });

  it('setProductStatus and setCatalogueStatus honour machines', async () => {
    const { owner, biz } = await seedStockist();
    const p = await makeProduct(biz.id, 'prod-status');
    const inactive = await setProductStatus({
      actor: owner,
      stockist: biz,
      productId: p.id,
      status: 'Inactive',
    });
    expect(inactive.ok).toBe(true);
    const maint = await setCatalogueStatus({ actor: owner, stockist: biz, status: 'Maintenance' });
    expect(maint.ok).toBe(true);
    if (maint.ok) expect(maint.data.status).toBe('Maintenance');
    const delivery = await makeActor({ id: 'u-ds', businessId: biz.id, role: 'DeliveryStaff' });
    const denied = await setCatalogueStatus({ actor: delivery, stockist: biz, status: 'Active' });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('PERM_DENIED');
  });

  it('upsertProduct rejects empty fields, non-integer MOQ, and PTR > MRP', async () => {
    const { owner, biz } = await seedStockist();
    const blank = await upsertProduct({
      actor: owner,
      stockist: biz,
      product: {
        name: '  ',
        sku: 'X',
        brand: 'B',
        category: 'C',
        packSize: '10s',
        mrp: 20,
        ptr: 10,
        gstPercent: 12,
        moq: 1,
      },
    });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.code).toBe('PROD_FIELDS');

    const fractionalMoq = await upsertProduct({
      actor: owner,
      stockist: biz,
      product: {
        name: 'A',
        sku: 'SKU-FRAC',
        brand: 'B',
        category: 'C',
        packSize: '10s',
        mrp: 20,
        ptr: 10,
        gstPercent: 12,
        moq: 1.5,
      },
    });
    expect(fractionalMoq.ok).toBe(false);
    if (!fractionalMoq.ok) expect(fractionalMoq.code).toBe('PROD_MOQ');

    const ptrMrp = await upsertProduct({
      actor: owner,
      stockist: biz,
      product: {
        name: 'A',
        sku: 'SKU-PTR',
        brand: 'B',
        category: 'C',
        packSize: '10s',
        mrp: 10,
        ptr: 12,
        gstPercent: 12,
        moq: 1,
      },
    });
    expect(ptrMrp.ok).toBe(false);
    if (!ptrMrp.ok) expect(ptrMrp.code).toBe('PROD_PTR_MRP');
  });

  it('importProductsCsv updates by SKU, rejects in-file dups, and denies DeliveryStaff', async () => {
    const { owner, biz } = await seedStockist();
    await makeProduct(biz.id, 'prod-csv');
    const res = await importProductsCsv({
      actor: owner,
      stockist: biz,
      rows: [
        {
          name: 'Updated Dolo',
          sku: 'SKU-prod-csv',
          brand: 'Micro',
          category: 'Analgesic',
          packSize: '10s',
          mrp: 18,
          ptr: 12,
          gstPercent: 12,
          moq: 2,
        },
        {
          name: 'Dup row',
          sku: 'SKU-prod-csv',
          brand: 'Micro',
          category: 'Analgesic',
          packSize: '10s',
          mrp: 18,
          ptr: 12,
          gstPercent: 12,
          moq: 2,
        },
        {
          name: 'Bad PTR',
          sku: 'SKU-BAD-PTR',
          brand: 'B',
          category: 'C',
          packSize: '10s',
          mrp: 10,
          ptr: 20,
          gstPercent: 12,
          moq: 1,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.succeeded).toEqual(['SKU-prod-csv']);
      expect(res.data.failed).toHaveLength(2);
      expect(res.data.failed[0].reason).toMatch(/Duplicate SKU/i);
      expect(res.data.failed[1].reason).toMatch(/PTR/i);
    }
    expect((await db.products.get('prod-csv'))?.name).toBe('Updated Dolo');
    expect((await db.products.get('prod-csv'))?.ptr).toBe(12);

    const delivery = await makeActor({ id: 'u-ds-csv', businessId: biz.id, role: 'DeliveryStaff' });
    const denied = await importProductsCsv({
      actor: delivery,
      stockist: biz,
      rows: [
        {
          name: 'X',
          sku: 'SKU-DENY',
          brand: 'B',
          category: 'C',
          packSize: '10s',
          mrp: 10,
          ptr: 8,
          gstPercent: 12,
          moq: 1,
        },
      ],
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('PERM_DENIED');
  });
});

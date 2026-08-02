import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearDb, makeActor, makeBusiness, makeProduct } from '../test/fixtures';
import { transferStock } from './inventoryService';

describe('transferStock (CF-33)', () => {
  beforeEach(async () => {
    await clearDb();
    const owner = await makeActor({ id: 'u-st', businessId: 'biz-st', role: 'Stockist' });
    await makeBusiness({ id: 'biz-st', type: 'Stockist', ownerUserId: owner.id });
    await db.catalogues.put({
      id: 'cat-st',
      stockistId: 'biz-st',
      status: 'Active',
      updatedAt: new Date().toISOString(),
    });
    await makeProduct('biz-st', 'prod-1');
    const ts = new Date().toISOString();
    await db.batches.add({
      id: 'batch-1',
      productId: 'prod-1',
      stockistId: 'biz-st',
      batchNumber: 'B1',
      expiryDate: '2030-01-01',
      onHand: 100,
      reserved: 10,
      location: 'Main Warehouse',
      status: 'Available',
      createdAt: ts,
      updatedAt: ts,
    });
  });

  it('pairs TransferOut/TransferIn and keeps on-hand unchanged (AC-Q10)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await transferStock({
      actor,
      stockist,
      batchId: 'batch-1',
      fromLocation: 'Main Warehouse',
      toLocation: 'Branch Depot',
      qty: 90,
    });
    expect(res.ok).toBe(true);
    const batch = await db.batches.get('batch-1');
    expect(batch?.onHand).toBe(100);
    expect(batch?.location).toBe('Branch Depot');
    const movs = await db.inventoryMovements.where('batchId').equals('batch-1').toArray();
    expect(movs.some((m) => m.type === 'TransferOut')).toBe(true);
    expect(movs.some((m) => m.type === 'TransferIn')).toBe(true);
    const pair = movs[0]?.sourceDocId;
    expect(movs.every((m) => m.sourceDocId === pair)).toBe(true);
  });

  it('blocks partial qty because location transfer moves the whole batch', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await transferStock({
      actor,
      stockist,
      batchId: 'batch-1',
      fromLocation: 'Main Warehouse',
      toLocation: 'Branch Depot',
      qty: 40,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('XFER_PARTIAL');
  });

  it('blocks qty above un-reserved on-hand (E-CF-33a)', async () => {
    const actor = (await db.users.get('u-st'))!;
    const stockist = (await db.businesses.get('biz-st'))!;
    const res = await transferStock({
      actor,
      stockist,
      batchId: 'batch-1',
      fromLocation: 'Main Warehouse',
      toLocation: 'Branch Depot',
      qty: 95,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('XFER_PARTIAL');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb } from '../test/fixtures';
import { db } from './db';
import { EMPTY_STATE_VERSION, defaultPlatformSettings, ensureEmptyWorkspace } from './seed';

describe('empty workspace bootstrap (Wave 0)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('writes only default platformSettings — zero users/businesses/trade', async () => {
    await ensureEmptyWorkspace();
    expect(await db.users.count()).toBe(0);
    expect(await db.businesses.count()).toBe(0);
    expect(await db.orders.count()).toBe(0);
    expect(await db.invoices.count()).toBe(0);
    expect(await db.products.count()).toBe(0);
    const settings = await db.platformSettings.get('platform');
    expect(settings).toEqual(defaultPlatformSettings());
    const meta = await db.seedMeta.get('meta');
    expect(meta?.seedVersion).toBe(EMPTY_STATE_VERSION);
  });

  it('rehydrates missing platformSettings without creating accounts', async () => {
    await ensureEmptyWorkspace();
    await db.platformSettings.clear();
    await ensureEmptyWorkspace();
    expect(await db.users.count()).toBe(0);
    expect(await db.platformSettings.get('platform')).toEqual(defaultPlatformSettings());
  });
});

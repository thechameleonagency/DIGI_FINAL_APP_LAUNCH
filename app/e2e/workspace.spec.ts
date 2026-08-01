import { expect, test } from '@playwright/test';
import { login, signOut } from './helpers';

test.describe('Workspace export/import', () => {
  test('export then import round-trip keeps accounts after reload', async ({ page }) => {
    await login(page, 'admin@digiswasthya.in', 'Admin@2026');
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Platform settings' })).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export workspace' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    const json = await download.createReadStream().then(async (stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    });
    expect(json).toContain('seedMeta');
    expect(json).toContain('users');
    // v2 / canvas-derived tables must be present in every export (SW-1)
    for (const table of [
      'smartOrderRuns',
      'customerSales',
      'favourites',
      'counterfeitReports',
      'upgradeRequests',
      'suppliers',
      'purchaseOrders',
      'partnerInvites',
    ]) {
      expect(json).toContain(`"${table}"`);
    }

    await page.getByPlaceholder('Paste exported JSON').fill(json);
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByText(/Imported/i).first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Platform settings' })).toBeVisible({ timeout: 20_000 });
    await signOut(page);
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await expect(page).toHaveURL(/\/pharmacy/, { timeout: 15_000 });
  });
});

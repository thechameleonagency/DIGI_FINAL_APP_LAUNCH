import { expect, test } from '@playwright/test';
import { login, signOut } from './helpers';

test.describe('Admin role-gated nav', () => {
  test('admin can open verifications and settings (SuperAdmin seed)', async ({ page }) => {
    await login(page, 'admin@digiswasthya.in', 'Admin@2026');
    await page.goto('/admin/verifications');
    await expect(page.getByRole('heading', { name: /Verification queue/i })).toBeVisible({ timeout: 15_000 });
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /Platform settings/i })).toBeVisible({ timeout: 15_000 });
    await page.goto('/admin/staff');
    await expect(page.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible({ timeout: 15_000 });
    await signOut(page);
  });
});

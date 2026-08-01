import { expect, test } from '@playwright/test';
import { login, quickLogin, signOut } from './helpers';

test.describe('Zero-state boot', () => {
  test('login fields default blank; invalid login stays on auth', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByLabel('Email or phone')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Email or phone')).toHaveValue('');
    await expect(page.getByLabel('Password')).toHaveValue('');

    await page.getByLabel('Email or phone').fill('nobody@example.com');
    await page.getByLabel('Password').fill('bad-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('status')).toContainText(/Invalid|not signed|password/i, { timeout: 8_000 });
  });

  test('three quick-logins land in the right portals', async ({ page }) => {
    await quickLogin(page, 'Pharmacy');
    await expect(page).toHaveURL(/\/pharmacy/, { timeout: 15_000 });
    await signOut(page);

    await quickLogin(page, 'Stockist');
    await expect(page).toHaveURL(/\/stockist/, { timeout: 15_000 });
    await signOut(page);

    await quickLogin(page, 'Admin');
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
  });

  test('empty states render on key zero-data lists', async ({ page }) => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/returns');
    await expect(page.getByRole('heading', { name: 'No returns yet' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/pharmacy/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory empty' })).toBeVisible();
    await page.goto('/pharmacy/connections');
    await expect(page.getByRole('heading', { name: 'No connections yet' })).toBeVisible();
    await page.goto('/pharmacy/notifications');
    await expect(page.getByRole('heading', { name: 'No notifications' })).toBeVisible();
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/pharmacies');
    await expect(page.getByRole('heading', { name: /No .* connections/i })).toBeVisible({ timeout: 15_000 });
    await page.goto('/stockist/inventory');
    await expect(page.getByRole('heading', { name: 'No stock yet' })).toBeVisible();
    await page.goto('/stockist/payments');
    await expect(page.getByRole('heading', { name: 'No payments yet' })).toBeVisible();
    await signOut(page);

    await login(page, 'admin@digiswasthya.in', 'Admin@2026');
    await page.goto('/admin/support');
    await expect(page.getByRole('heading', { name: 'No tickets yet' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'No audit entries' })).toBeVisible();
  });
});

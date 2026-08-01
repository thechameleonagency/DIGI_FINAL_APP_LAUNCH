import { expect, test } from '@playwright/test';
import { login, quickLogin, signOut } from './helpers';

test.describe('Demo seed boot', () => {
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

  test('seeded demo data is present on key lists', async ({ page }) => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/connections');
    await expect(page.getByText('MedRoute Distributors').first()).toBeVisible({ timeout: 15_000 });
    await page.goto('/pharmacy/orders');
    await expect(page.getByText(/ORD-2026-/).first()).toBeVisible({ timeout: 15_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/pharmacies');
    await expect(page.getByRole('heading', { name: 'Pharmacies' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('CarePlus Chemists').first()).toBeVisible({ timeout: 15_000 });
    await page.goto('/stockist/catalogue');
    await expect(page.getByText('Dolo 650 Tablet').first()).toBeVisible({ timeout: 15_000 });
    await page.goto('/stockist/payments');
    await expect(page.getByText(/PAY-2026-/).first()).toBeVisible({ timeout: 15_000 });
    await signOut(page);

    await login(page, 'admin@digiswasthya.in', 'Admin@2026');
    await page.goto('/admin/support');
    await expect(page.getByText(/TKT-2026-|Payments/i).first()).toBeVisible({ timeout: 15_000 });
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /Platform settings/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Generic commission/i).first()).toBeVisible();
  });

  test('login page lists demo accounts for all seeded users', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText('Demo accounts').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Pharmacy —/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Stockist —/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Admin —/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sunita Menon/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Rohan Kulkarni/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Anita Desai/i })).toBeVisible();
  });
});

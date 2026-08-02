import { expect, test } from '@playwright/test';

test.describe('Empty workspace boot', () => {
  test('login fields default blank; no demo account panel', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByLabel('Email or phone')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Email or phone')).toHaveValue('');
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByText('Demo accounts')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Create SuperAdmin' })).toBeVisible();

    await page.getByLabel('Email or phone').fill('nobody@example.com');
    await page.getByLabel('Password').fill('bad-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('status')).toContainText(/Invalid|not signed|password/i, { timeout: 8_000 });
  });

  test('first SuperAdmin setup creates account without auto-login', async ({ page }) => {
    await page.goto('/auth/setup');
    await expect(page.getByRole('button', { name: 'Create SuperAdmin' })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Full name').fill('Ada Admin');
    await page.getByLabel('Email').fill('ada@platform.local');
    await page.getByLabel('Mobile phone').fill('9876543210');
    await page.getByLabel('Password', { exact: true }).fill('Admin@2026');
    await page.getByLabel('Confirm password').fill('Admin@2026');
    await page.getByRole('button', { name: 'Create SuperAdmin' }).click();
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
    await expect(page.getByLabel('Email or phone')).toHaveValue('');
    await page.getByLabel('Email or phone').fill('ada@platform.local');
    await page.getByLabel('Password').fill('Admin@2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
  });

  test('register entry points are available on empty state', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByRole('button', { name: /Register as Pharmacy/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Register as Stockist/i })).toBeVisible();
  });

  test('unknown credentials cannot enter any portal', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Email or phone').fill('neha@careplus.pune.in');
    await page.getByLabel('Password').fill('Pharmacy@2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  });
});

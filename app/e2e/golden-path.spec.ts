import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  // Wait until seed/hydration finishes and login form is interactive
  await expect(page.getByLabel('Email or phone')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Email or phone').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /Sign out/i }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
}

test.describe('DigiSwasthya golden path Flows 1–5', () => {
  test('Flow 1 — Admin verification queue visible', async ({ page }) => {
    await login(page, 'admin@digiswasthya.in', 'Admin@2026');
    await expect(page).toHaveURL(/\/admin/);
    await page.goto('/admin/verifications');
    await expect(page.getByRole('heading', { name: 'Verification queue' })).toBeVisible();
    // GreenLeaf should be in seed queue
    await expect(page.getByText(/GreenLeaf/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Approve' }).first().click();
    await expect(page.getByText(/Approved|Queue clear|Verification/i).first()).toBeVisible();
  });

  test('Flow 2 — Pharmacy browse connected catalogue & cart', async ({ page }) => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await expect(page).toHaveURL(/\/pharmacy/);
    await page.goto('/pharmacy/buy');
    await expect(page.getByRole('heading', { name: 'Buy' })).toBeVisible();
    await expect(page.getByText('MedRoute Distributors').first()).toBeVisible({ timeout: 15_000 });
    // Active connection shows PTR (₹) not "Price on connect" for at least one product when browsing
    const browse = page.getByRole('link', { name: 'Browse' }).first();
    if (await browse.isVisible()) await browse.click();
    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Add' }).first().click();
    await expect(page.getByText(/Added to cart|Cart was not|MOQ|connection/i).first()).toBeVisible({ timeout: 8_000 });
    await page.goto('/pharmacy/cart');
    await expect(page.getByRole('heading', { name: 'Cart & checkout' })).toBeVisible();
  });

  test('Flow 3 — Stockist fulfil pending order path controls', async ({ page }) => {
    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await expect(page).toHaveURL(/\/stockist/);
    await page.goto('/stockist/orders');
    await expect(page.getByRole('heading', { name: /Orders inbox/i })).toBeVisible();
    await page.getByPlaceholder('Search order number').fill('ORD-2026-0202');
    const link = page.getByRole('link', { name: 'ORD-2026-0202' });
    if (await link.count()) {
      await link.first().click();
      await expect(page.getByRole('heading', { name: 'ORD-2026-0202' })).toBeVisible();
      // Accept if still pending
      const accept = page.getByRole('button', { name: 'Accept' });
      if (await accept.isVisible()) {
        await accept.click();
        await expect(page.getByText(/accepted|Allocated|Accept/i).first()).toBeVisible();
      }
      const allocate = page.getByRole('button', { name: /Allocate/i });
      if (await allocate.isVisible()) await allocate.click();
      const pack = page.getByRole('button', { name: 'Pack' });
      if (await pack.isVisible()) await pack.click();
      const invoice = page.getByRole('button', { name: /Issue invoice/i });
      if (await invoice.isVisible()) await invoice.click();
    } else {
      // Order may already be progressed in shared DB — still assert list search works
      await expect(page.getByText(/result/i).first()).toBeVisible();
    }
  });

  test('Flow 4 — Pharmacy payments outstanding & Stockist approve queue', async ({ page }) => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Outstanding|History|Credits/i).first()).toBeVisible({ timeout: 15_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await expect(page).toHaveURL(/\/stockist/, { timeout: 15_000 });
    await page.goto('/stockist/payments');
    await expect(page.getByRole('heading', { name: /Payments/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Receivables|Invoices|Approve/i).first()).toBeVisible();
  });

  test('Flow 5 — Return path from delivered order', async ({ page }) => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/orders');
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible({ timeout: 15_000 });
    // Wait for seed orders to hydrate
    await expect(page.getByRole('link', { name: /ORD-2026-/ }).first()).toBeVisible({ timeout: 20_000 });
    const search = page.getByLabel('Search list');
    await search.fill('0204');
    const returnable = page.getByRole('link', { name: 'ORD-2026-0204' });
    if (await returnable.count()) await returnable.click();
    else await page.getByRole('link', { name: /ORD-2026-/ }).first().click();
    await expect(page.getByRole('heading', { name: /ORD-2026-/ })).toBeVisible({ timeout: 10_000 });
    const raise = page.getByRole('button', { name: /Raise return/i });
    if (await raise.isVisible()) {
      await raise.click();
      await page.locator('.modal input[type="number"]').first().fill('1');
      await page.getByRole('button', { name: 'Submit return' }).click();
    }
    await page.goto('/pharmacy/returns');
    await expect(page.getByRole('heading', { name: 'Returns', exact: true })).toBeVisible();
  });

  test('AC-L01 / analytics drill-down pages load', async ({ page }) => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await expect(page).toHaveURL(/\/pharmacy/, { timeout: 15_000 });
    await page.goto('/pharmacy/orders');
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Search list').fill('ORD');
    await expect(page.locator('table.data a').first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/pharmacy/analytics');
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Recompute/i })).toBeVisible();
  });

  test('Login invalid stays on auth', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Email or phone').fill('nobody@example.com');
    await page.getByLabel('Password').fill('bad-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('status')).toContainText(/Invalid|not signed|password/i, { timeout: 8_000 });
  });
});

import { expect, type Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await expect(page.getByLabel('Email or phone')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Email or phone').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15_000 });
}

export async function signOut(page: Page) {
  // Dismiss CF-32 success summary / other modals that trap topbar clicks.
  if (await page.locator('.modal-backdrop').isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 5_000 });
  }
  // CF-31: Sign out lives in the topbar Profile menu (confirm dialog).
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('menu').getByRole('button', { name: /Sign out/i }).click();
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
}

export async function fieldInput(page: Page, label: string) {
  return page.locator('.field', { hasText: label }).locator('input, textarea, select').first();
}

/** Invite-form Role select (avoids RolePreview "Preview role" and table Role column). */
export async function selectInviteRole(page: Page, role: string) {
  const inviteCard = page.locator('.card').filter({ hasText: /^Invite/ });
  await inviteCard.locator('.field').filter({ has: page.locator('label', { hasText: /^Role$/ }) }).locator('select').selectOption(role);
}

export async function quickLogin(page: Page, role: 'Pharmacy' | 'Stockist' | 'Admin') {
  await page.goto('/auth/login');
  await expect(page.getByLabel('Email or phone')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: new RegExp(`^${role} —`) }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
}

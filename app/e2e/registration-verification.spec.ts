import { expect, test, type Page } from '@playwright/test';
import { DEMO_OTP } from '../src/domain/utils/crypto';
import { fieldInput, login, signOut } from './helpers';

/** Valid GSTIN: 2 + 5 letters + 4 digits + letter + alnum + Z + alnum */
function gstin(letterCode: string, stamp: string) {
  const letters = letterCode.replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(5, 'A').slice(0, 5);
  const digits = stamp.replace(/\D/g, '').slice(0, 4).padStart(4, '0');
  return `27${letters}${digits}F1Z5`;
}

const tinyPdf = {
  name: 'doc.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
};

async function verifyPhone(page: Page) {
  await page.getByRole('button', { name: /Send OTP|Resend OTP/i }).click();
  await page.getByLabel('Phone OTP').fill(DEMO_OTP);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Phone verified ✓')).toBeVisible({ timeout: 5_000 });
}

async function uploadRequiredPharmacyDocs(page: Page, stamp: string) {
  for (const kind of ['DrugLicense', 'GstinCert', 'PharmacyCert'] as const) {
    await page.getByTestId(`lic-${kind}`).fill(`${kind}-${stamp}`);
    await page.getByTestId(`file-${kind}`).setInputFiles(tinyPdf);
  }
}

async function fillPharmacyWizard(
  page: Page,
  opts: {
    owner: string;
    email: string;
    phone: string;
    business: string;
    gst: string;
    dl: string;
    pan: string;
    address: string;
  },
) {
  await expect(page.getByText(/Register Pharmacy/i)).toBeVisible({ timeout: 30_000 });
  await (await fieldInput(page, 'Owner name')).fill(opts.owner);
  await (await fieldInput(page, 'Email')).fill(opts.email);
  await (await fieldInput(page, 'Phone')).fill(opts.phone);
  await verifyPhone(page);
  await (await fieldInput(page, 'Password')).fill('Pharmacy@2026');
  await page.getByRole('button', { name: 'Continue' }).click();

  await (await fieldInput(page, 'Business name')).fill(opts.business);
  await (await fieldInput(page, 'GSTIN')).fill(opts.gst);
  await (await fieldInput(page, 'Drug license number')).fill(opts.dl);
  await (await fieldInput(page, 'PAN')).fill(opts.pan);
  await page.locator('label', { hasText: 'State' }).locator('..').locator('select').selectOption('Maharashtra');
  await (await fieldInput(page, 'City')).fill('Pune');
  await (await fieldInput(page, 'Pincode')).fill('411001');
  await (await fieldInput(page, 'Address')).fill(opts.address);
  await page.getByRole('button', { name: 'Continue' }).click();

  await uploadRequiredPharmacyDocs(page, opts.phone.slice(-6));
  await page.getByRole('button', { name: 'Continue' }).click();

  // Bank optional for pharmacy
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('I agree to the Terms of Service').check();
  await page.getByLabel('I agree to the Privacy Policy').check();
  await page.getByRole('button', { name: /Submit for verification/i }).click();
}

test.describe('Registration, verification, forgot password', () => {
  test('register → pending → admin approve → portal; dup GST/email blocked; forgot-password OTP', async ({ page }) => {
    const stamp = Date.now().toString().slice(-8);
    const email = `e2e.pharm.${stamp}@example.in`;
    const gst = gstin('EZEAA', stamp);
    const pan = `EZEAA${stamp.slice(0, 4)}F`;

    await page.goto('/auth/register/pharmacy');
    await fillPharmacyWizard(page, {
      owner: 'E2E Owner',
      email,
      phone: `98${stamp.slice(0, 8)}`,
      business: `E2E Chemists ${stamp}`,
      gst,
      dl: `MH-E2E-${stamp}`,
      pan,
      address: '1 Test Road',
    });
    await expect(page).toHaveURL(/\/auth\/pending/, { timeout: 15_000 });
    await expect(page.getByText(/Submitted documents/i)).toBeVisible();
    await expect(page.getByText(/Drug license/i).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();

    // Duplicate GST blocked on business step
    await page.goto('/auth/register/pharmacy');
    await expect(page.getByText(/Register Pharmacy/i)).toBeVisible({ timeout: 30_000 });
    await (await fieldInput(page, 'Owner name')).fill('Dup Owner');
    await (await fieldInput(page, 'Email')).fill(`dup.${email}`);
    await (await fieldInput(page, 'Phone')).fill(`97${stamp.slice(0, 8)}`);
    await verifyPhone(page);
    await (await fieldInput(page, 'Password')).fill('Pharmacy@2026');
    await page.getByRole('button', { name: 'Continue' }).click();
    await (await fieldInput(page, 'Business name')).fill('Dup Shop');
    await (await fieldInput(page, 'GSTIN')).fill(gst);
    await (await fieldInput(page, 'Drug license number')).fill(`MH-DUP-${stamp}`);
    await (await fieldInput(page, 'PAN')).fill(`DUPZZ${stamp.slice(0, 4)}F`);
    await page.locator('label', { hasText: 'State' }).locator('..').locator('select').selectOption('Maharashtra');
    await (await fieldInput(page, 'City')).fill('Pune');
    await (await fieldInput(page, 'Pincode')).fill('411001');
    await (await fieldInput(page, 'Address')).fill('2 Test Road');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(/GSTIN already registered/i)).toBeVisible({ timeout: 10_000 });

    // Duplicate email blocked on account step
    await page.goto('/auth/register/pharmacy');
    await (await fieldInput(page, 'Owner name')).fill('Dup Email');
    await (await fieldInput(page, 'Email')).fill(email);
    await (await fieldInput(page, 'Phone')).fill(`96${stamp.slice(0, 8)}`);
    await verifyPhone(page);
    await (await fieldInput(page, 'Password')).fill('Pharmacy@2026');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(/Email already registered/i)).toBeVisible({ timeout: 10_000 });

    // Admin reviews then approves (Submitted → UnderReview → Approved) on detail page
    await login(page, 'admin@digiswasthya.in', 'Admin@2026');
    await page.goto('/admin/verifications');
    await expect(page.getByRole('link', { name: new RegExp(`E2E Chemists ${stamp}`, 'i') })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: new RegExp(`E2E Chemists ${stamp}`, 'i') }).click();
    await expect(page).toHaveURL(/\/admin\/verifications\//, { timeout: 10_000 });
    await expect(page.getByText(/Submitted documents/i)).toBeVisible();
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByText(/Marked under review/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Approved/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    // Newly approved pharmacy reaches portal
    await login(page, email, 'Pharmacy@2026');
    await expect(page).toHaveURL(/\/pharmacy/, { timeout: 15_000 });
    await signOut(page);

    // Forgot password OTP
    await page.goto('/auth/forgot');
    await (await fieldInput(page, 'Email')).fill('neha@careplus.pune.in');
    await (await fieldInput(page, 'OTP')).fill(DEMO_OTP);
    await (await fieldInput(page, 'New password')).fill('Pharmacy@2026');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await expect(page).toHaveURL(/\/pharmacy/, { timeout: 15_000 });
  });
});

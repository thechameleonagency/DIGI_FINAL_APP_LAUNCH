import { expect, test, type Page } from '@playwright/test';
import { DEMO_OTP } from '../src/domain/utils/crypto';
import { fieldInput } from './helpers';

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
    city: string;
    pincode: string;
    address: string;
  },
) {
  await page.goto('/auth/register/pharmacy');
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
  await (await fieldInput(page, 'City')).fill(opts.city);
  await (await fieldInput(page, 'Pincode')).fill(opts.pincode);
  await (await fieldInput(page, 'Address')).fill(opts.address);
  await page.getByRole('button', { name: 'Continue' }).click();
  const stamp = opts.email.replace(/\D/g, '').slice(-6) || '000001';
  await uploadRequiredPharmacyDocs(page, stamp);
  await page.getByRole('button', { name: /Submit|Register/i }).click();
}

test.describe('Registration on empty workspace', () => {
  test('pharmacy can register to pending; duplicates blocked', async ({ page }) => {
    const stamp = String(Date.now()).slice(-8);
    const email = `e2e.pharm.${stamp}@example.in`;
    const gst = gstin('E2EPH', stamp);

    await fillPharmacyWizard(page, {
      owner: 'E2E Owner',
      email,
      phone: `98${stamp.slice(0, 8)}`,
      business: `E2E Chemists ${stamp}`,
      gst,
      dl: `MH-E2E-${stamp}`,
      pan: `E2EZZ${stamp.slice(0, 4)}F`,
      city: 'Pune',
      pincode: '411001',
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
  });
});

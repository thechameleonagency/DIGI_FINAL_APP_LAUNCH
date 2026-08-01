import { expect, test, type Page } from '@playwright/test';
import { fieldInput, login, selectInviteRole, signOut } from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * T-2 long-tail AC: announcement targeting, partial accept, partial delivery, payment hold.
 * Builds its own data from zero state (isolated browser context).
 */
test.describe('Long-tail AC paths', () => {
  let page: Page;
  let orderNo = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('announcement targeting: Pharmacy Home only visible to pharmacy', async () => {
    const stamp = Date.now().toString().slice(-6);
    const title = `E2E Pharm Banner ${stamp}`;

    await login(page, 'admin@digiswasthya.in', 'Admin@2026');
    await page.goto('/admin/announcements');
    await (await fieldInput(page, 'Title')).fill(title);
    await (await fieldInput(page, 'Body')).fill('Pharmacy-only placement test');

    await page.getByRole('checkbox', { name: 'Stockist', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Admin', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Pharmacy', exact: true }).check();
    await page.getByRole('checkbox', { name: 'All Dashboards', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Pharmacy Home', exact: true }).check();

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText(/Announcement published/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy');
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist');
    await expect(page.getByText(title)).toHaveCount(0);
    await signOut(page);
  });

  test('stockist catalogue + inventory + delivery staff', async () => {
    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/catalogue');
    await (await fieldInput(page, 'name')).fill('E2E Partial Item');
    await (await fieldInput(page, 'sku')).fill('E2E-PARTIAL');
    await (await fieldInput(page, 'brand')).fill('E2E');
    await (await fieldInput(page, 'MRP')).fill('80');
    await (await fieldInput(page, 'PTR')).fill('55');
    await (await fieldInput(page, 'GST')).fill('12');
    await page.getByRole('button', { name: 'Save product' }).click();
    await expect(page.getByText(/Product added/i).first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/stockist/inventory');
    await page.locator('.field', { hasText: 'Product' }).locator('select').selectOption({ label: 'E2E Partial Item' });
    await (await fieldInput(page, 'Batch number')).fill('E2E-PBATCH');
    await (await fieldInput(page, 'Expiry')).fill('2029-06-30');
    await (await fieldInput(page, 'Qty')).fill('50');
    await page.getByRole('button', { name: 'Add stock' }).click();
    await expect(page.getByText(/Stock added/i).first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/stockist/staff');
    await (await fieldInput(page, 'Name')).fill('E2E Rider');
    await (await fieldInput(page, 'Email')).fill('rider.e2e@medroute.in');
    await (await fieldInput(page, 'Phone')).fill('9876500099');
    await selectInviteRole(page, 'DeliveryBoy');
    await page.getByRole('button', { name: 'Invite' }).click();
    await expect(page.getByText(/Invited/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);
  });

  test('connect pharmacy ↔ stockist', async () => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/buy');
    await page.getByRole('button', { name: 'Request connection' }).first().click();
    await expect(page.getByText(/Connection requested/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/pharmacies');
    await page.getByRole('button', { name: /Review \/ Approve/i }).first().click();
    await page.getByRole('button', { name: 'Approve & add' }).click();
    await expect(page.getByText(/Connection approved/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);
  });

  test('partial accept → fulfil → partial delivery → GRN → payment hold', async () => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/buy');
    await page.getByRole('link', { name: 'Browse' }).first().click();
    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Add' }).first().click();
    await expect(page.getByText(/Added to cart/i).first()).toBeVisible({ timeout: 8_000 });
    await page.goto('/pharmacy/cart');
    await page.locator('table.data tbody input[type="number"]').first().fill('10');
    await page.getByRole('button', { name: 'Place purchase order' }).click();
    await expect(page).toHaveURL(/\/pharmacy\/orders\/ORD-/, { timeout: 15_000 });
    orderNo = page.url().split('/').pop()!;
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto(`/stockist/orders/${orderNo}`);
    await expect(page.getByRole('heading', { name: orderNo })).toBeVisible({ timeout: 15_000 });
    await page.locator('table.data tbody input[type="number"]').first().fill('4');
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText(/Order accepted/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('PartiallyAccepted').first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Allocate (FEFO)' }).click();
    await expect(page.getByText(/Allocated/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Pack' }).click();
    await page.getByRole('button', { name: /Issue invoice/i }).click();
    await page.locator('select').filter({ hasText: /Assign delivery boy/i }).selectOption({ label: 'E2E Rider' });
    await page.getByRole('button', { name: 'Dispatch' }).click();
    await expect(page.getByText(/Dispatched/i).first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/stockist/delivery');
    await page.getByRole('button', { name: 'Out for delivery' }).first().click();
    await page.getByRole('button', { name: /Partial/i }).first().click();
    const partialQty = page.locator('.modal input[type="number"]').first();
    await expect(partialQty).toBeVisible({ timeout: 10_000 });
    await partialQty.fill('2');
    await page.getByRole('button', { name: 'Save partial' }).click();
    await expect(page.getByText(/PartiallyDelivered|Partial/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Mark delivered' }).first().click();
    await page.getByRole('button', { name: 'Confirm delivered' }).click();
    await expect(page.getByText(/Delivered/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto(`/pharmacy/orders/${orderNo}`);
    await page.getByRole('button', { name: 'Record GRN' }).click();
    await page.getByRole('button', { name: 'Save GRN' }).click();
    await expect(page.getByText(/GRN recorded|Goods receipt saved/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Record GRN' })).toHaveCount(0);

    await page.goto('/pharmacy/payments');
    const amountInput = page.locator('table.data tbody input[type="number"]').first();
    await expect(amountInput).toBeVisible({ timeout: 10_000 });
    await amountInput.fill('1');
    await (await fieldInput(page, 'Reference')).fill(`HOLD-UTR-${Date.now().toString().slice(-6)}`);
    await page.getByRole('button', { name: 'Submit payment' }).click();
    await expect(page.getByText(/Payment submitted/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/payments');
    await page.getByRole('button', { name: 'Details' }).first().click();
    await page.getByRole('button', { name: 'Hold' }).click();
    await (await fieldInput(page, 'Hold reason')).fill('E2E hold check');
    await page.getByRole('button', { name: 'Place on hold' }).click();
    await expect(page.getByText(/Payment on hold/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);
  });
});

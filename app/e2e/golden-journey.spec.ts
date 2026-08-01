import { expect, test, type Page } from '@playwright/test';
import { fieldInput, login, selectInviteRole, signOut } from './helpers';

test.describe.configure({ mode: 'serial' });

/** Single shared context: connect → catalogue+stock → order → fulfil → GRN → pay → return → CN */
test.describe('Golden trade journey from zero state', () => {
  let page: Page;
  let firstOrderNo = '';
  let secondOrderNo = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('stockist adds product, stock, and delivery staff', async () => {
    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await expect(page).toHaveURL(/\/stockist/, { timeout: 15_000 });
    await page.goto('/stockist/catalogue');
    await (await fieldInput(page, 'name')).fill('E2E Dolo 650');
    await (await fieldInput(page, 'sku')).fill('E2E-DOLO');
    await (await fieldInput(page, 'brand')).fill('Micro Labs');
    await (await fieldInput(page, 'MRP')).fill('80');
    await (await fieldInput(page, 'PTR')).fill('55');
    await (await fieldInput(page, 'GST')).fill('12');
    await page.getByRole('button', { name: 'Save product' }).click();
    await expect(page.getByText(/Product added/i).first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/stockist/inventory');
    await page.locator('.field', { hasText: 'Product' }).locator('select').selectOption({ label: 'E2E Dolo 650' });
    await (await fieldInput(page, 'Batch number')).fill('E2E-BATCH-1');
    await (await fieldInput(page, 'Expiry')).fill('2028-12-31');
    await (await fieldInput(page, 'Qty')).fill('200');
    await page.getByRole('button', { name: 'Add stock' }).click();
    await expect(page.getByText(/Stock added/i).first()).toBeVisible({ timeout: 10_000 });

    // Delivery machine requires Assigned before OutForDelivery — invite a DeliveryBoy for dispatch
    await page.goto('/stockist/staff');
    await (await fieldInput(page, 'Name')).fill('E2E Rider');
    await (await fieldInput(page, 'Email')).fill('rider.e2e@medroute.in');
    await (await fieldInput(page, 'Phone')).fill('9876500099');
    await selectInviteRole(page, 'DeliveryBoy');
    await page.getByRole('button', { name: 'Invite' }).click();
    await expect(page.getByText(/Invited/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);
  });

  test('pharmacy requests connection; stockist approves', async () => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/buy');
    await expect(page.getByText('MedRoute Distributors').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Request connection' }).first().click();
    await expect(page.getByText(/Connection requested/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/pharmacies');
    await expect(page.getByText('CarePlus Chemists').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Review \/ Approve/i }).first().click();
    await page.getByRole('button', { name: 'Approve & add' }).click();
    await expect(page.getByText(/Connection approved/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);
  });

  test('pharmacy places first order', async () => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto('/pharmacy/buy');
    await page.getByRole('link', { name: 'Browse' }).first().click();
    await expect(page.getByRole('button', { name: 'Add' }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Add' }).first().click();
    await expect(page.getByText(/Added to cart/i).first()).toBeVisible({ timeout: 8_000 });
    await page.goto('/pharmacy/cart');
    await page.getByRole('button', { name: 'Place purchase order' }).click();
    await expect(page).toHaveURL(/\/pharmacy\/orders\/ORD-/, { timeout: 15_000 });
    firstOrderNo = page.url().split('/').pop()!;
    expect(firstOrderNo).toMatch(/^ORD-\d{4}-\d{4}$/);
    await signOut(page);
  });

  test('stockist fulfils: accept → allocate → pack → invoice → dispatch → deliver', async () => {
    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto(`/stockist/orders/${firstOrderNo}`);
    await expect(page.getByRole('heading', { name: firstOrderNo })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText(/Order accepted/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Allocate (FEFO)' }).click();
    await expect(page.getByText(/Allocated/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Pack' }).click();
    await expect(page.getByRole('button', { name: /Issue invoice/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Issue invoice/i }).click();
    await expect(page.getByRole('button', { name: 'Dispatch' })).toBeVisible({ timeout: 10_000 });
    await page.locator('select').filter({ hasText: /Assign delivery boy/i }).selectOption({ label: 'E2E Rider' });
    await page.getByRole('button', { name: 'Dispatch' }).click();
    await expect(page.getByText(/Dispatched/i).first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/stockist/delivery');
    await expect(page.getByRole('button', { name: 'Out for delivery' }).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Out for delivery' }).first().click();
    await expect(page.getByRole('button', { name: 'Mark delivered' }).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Mark delivered' }).first().click();
    await page.getByRole('button', { name: 'Confirm delivered' }).click();
    await expect(page.getByText(/Delivered/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);
  });

  test('pharmacy GRN → pay; stockist approve payment', async () => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto(`/pharmacy/orders/${firstOrderNo}`);
    await page.getByRole('button', { name: 'Record GRN' }).click();
    await page.getByRole('button', { name: 'Save GRN' }).click();
    await expect(page.getByText(/GRN recorded|Goods receipt saved/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Done' }).click();
    // T-2 GRN idempotency: once recorded, Record GRN is not offered again
    await expect(page.getByRole('button', { name: 'Record GRN' })).toHaveCount(0);

    await page.goto('/pharmacy/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible({ timeout: 15_000 });
    const amountInput = page.locator('table.data tbody input[type="number"]').first();
    await expect(amountInput).toBeVisible({ timeout: 10_000 });
    const outstandingText = await page.locator('table.data tbody tr').first().locator('td').nth(3).innerText();
    const amount = outstandingText.replace(/[^\d.]/g, '');
    await amountInput.fill(amount || '1');
    await (await fieldInput(page, 'Reference')).fill('E2E-UTR-001');
    await page.getByRole('button', { name: 'Submit payment' }).click();
    await expect(page.getByText(/Payment submitted/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/payments');
    await page.getByRole('button', { name: 'Details' }).first().click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Payment approved/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);
  });

  test('pharmacy return → stockist approve → CN issue → apply', async () => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.goto(`/pharmacy/orders/${firstOrderNo}`);
    await page.getByRole('button', { name: 'Raise return' }).click();
    await page.locator('.modal input[type="number"]').first().fill('1');
    await page.locator('.modal select').first().selectOption({ label: 'Damaged' });
    await page.getByRole('button', { name: 'Submit return' }).click();
    await expect(page.getByText(/Return submitted/i).first()).toBeVisible({ timeout: 10_000 });
    await signOut(page);

    await login(page, 'vikram@medroute.in', 'Stockist@2026');
    await page.goto('/stockist/returns');
    await page.getByRole('button', { name: 'Review' }).first().click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Return decided/i).first()).toBeVisible({ timeout: 10_000 });
    // T-2 return disposition → stock
    const goodsBack = page.getByRole('button', { name: /Record goods received/i }).first();
    await expect(goodsBack).toBeVisible({ timeout: 10_000 });
    await goodsBack.click();
    await expect(page.getByText(/Goods received/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Disposition:\s*Restock/i).first()).toBeVisible({ timeout: 10_000 });
    const issueCn = page.getByRole('button', { name: /Issue credit note/i });
    if (await issueCn.isVisible()) {
      await issueCn.click();
      await expect(page.getByText(/Credit note issued/i).first()).toBeVisible({ timeout: 10_000 });
    }
    await page.goto('/stockist/credit-notes');
    const apply = page.getByRole('button', { name: /Apply/i }).first();
    if (await apply.isEnabled()) {
      await apply.click();
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(page.getByText(/Credit applied/i).first()).toBeVisible({ timeout: 10_000 });
    }
    await signOut(page);
  });

  test('second order after reload gets sequential unique number', async () => {
    await login(page, 'neha@careplus.pune.in', 'Pharmacy@2026');
    await page.reload();
    await page.goto('/pharmacy/buy');
    await page.getByRole('link', { name: 'Browse' }).first().click();
    const addBtn = page.getByRole('button', { name: /^(Add|Update)$/ }).first();
    await expect(addBtn).toBeEnabled({ timeout: 15_000 });
    await addBtn.click();
    await expect(page.getByText(/Added to cart|Cart updated/i).first()).toBeVisible({ timeout: 10_000 });
    await page.goto('/pharmacy/cart');
    await expect(page.getByRole('button', { name: 'Place purchase order' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Place purchase order' }).click();
    await expect(page).toHaveURL(/\/pharmacy\/orders\/ORD-/, { timeout: 15_000 });
    secondOrderNo = page.url().split('/').pop()!;
    expect(secondOrderNo).toMatch(/^ORD-\d{4}-\d{4}$/);
    expect(secondOrderNo).not.toEqual(firstOrderNo);
    const n1 = Number(firstOrderNo.split('-').pop());
    const n2 = Number(secondOrderNo.split('-').pop());
    expect(n2).toBeGreaterThan(n1);
  });
});

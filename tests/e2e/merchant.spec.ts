import { expect, test } from '@playwright/test';
import { closeContext, createLoggedInPage, expectToast, resetApp } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

test('keeps merchant admin routes protected and lets ops review a submitted buy order', async ({ browser }) => {
  const customer = await createLoggedInPage(browser, 'player1@example.com');
  const admin = await createLoggedInPage(browser, 'admin@example.com');

  try {
    await customer.page.goto('/merchant');
    await expect(customer.page).toHaveURL(/\/bank$/);

    await customer.page.getByRole('button', { name: /buy \/ sell via fiat/i }).click();
    await expect(customer.page.getByRole('tab', { name: /buy usdt/i })).toBeVisible();
    await customer.page.getByLabel(/amount to buy/i).fill('10');
    await customer.page.getByRole('button', { name: /i sent this payment/i }).click();
    await customer.page.getByLabel(/m-pesa transaction code/i).fill('QWE123ABC');
    await customer.page.locator('#merchant-proof').setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sYf6Y8AAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await expect(customer.page.getByText(/selected: proof\.png/i)).toBeVisible();
    const submitBuyOrder = customer.page.getByRole('button', { name: /submit buy order/i });
    await expect(submitBuyOrder).toBeEnabled();
    await Promise.all([
      customer.page.waitForResponse((response) => (
        response.url().includes('/api/orders')
        && response.request().method() === 'POST'
        && response.status() === 201
      )),
      submitBuyOrder.click(),
    ]);
    await expectToast(customer.page, /buy order submitted/i);
    await expect(customer.page.getByText(/buy usdt\s+10(?:\.0+)?\s+usdt/i)).toBeVisible();

    await admin.page.goto('/merchant');
    await expect(admin.page.getByRole('heading', { name: /treasury overview/i })).toBeVisible();
    await admin.page.getByRole('link', { name: /review queue/i }).click();
    await expect(admin.page).toHaveURL(/\/merchant\/orders$/);
    await expect(admin.page.getByRole('link', { name: 'player-one' })).toBeVisible();
    await admin.page.getByRole('button', { name: /approve/i }).click();
    await expectToast(admin.page, /order marked done/i);
    await expect(admin.page.getByRole('cell', { name: /no orders match the current filters/i })).toBeVisible();
  } finally {
    await closeContext(customer.context);
    await closeContext(admin.context);
  }
});

test('merchant buy submit ignores rapid duplicate clicks and sends one idempotency key', async ({ browser }) => {
  const customer = await createLoggedInPage(browser, 'player1@example.com');
  const orderIdempotencyKeys: Array<string | undefined> = [];

  await customer.page.route('**/api/orders', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      orderIdempotencyKeys.push(request.headers()['idempotency-key']);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await route.continue();
  });

  try {
    await customer.page.goto('/bank');
    await customer.page.getByRole('button', { name: /buy \/ sell via fiat/i }).click();
    await expect(customer.page.getByRole('tab', { name: /buy usdt/i })).toBeVisible();
    await customer.page.getByLabel(/amount to buy/i).fill('10');
    await customer.page.getByRole('button', { name: /i sent this payment/i }).click();
    await customer.page.getByLabel(/m-pesa transaction code/i).fill('QWE123ABC');
    await customer.page.locator('#merchant-proof').setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sYf6Y8AAAAASUVORK5CYII=',
        'base64',
      ),
    });

    const submitBuyOrder = customer.page.getByRole('button', { name: /submit buy order/i });
    await expect(submitBuyOrder).toBeEnabled();
    await submitBuyOrder.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await expectToast(customer.page, /buy order submitted/i);
    expect(orderIdempotencyKeys).toHaveLength(1);
    expect(orderIdempotencyKeys[0]).toBeTruthy();
  } finally {
    await closeContext(customer.context);
  }
});

import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const APP_URL = 'http://127.0.0.1:4317';
export const DEFAULT_PASSWORD = 'CorrectHorseBatteryStaple!';

export async function resetApp(request: APIRequestContext) {
  const response = await request.post(`${APP_URL}/__e2e__/reset`);
  expect(response.ok()).toBeTruthy();
}

export async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/__e2e__/session', {
    data: { email },
  });
  expect(response.ok()).toBeTruthy();

  const body = await response.json() as {
    cookies?: Record<string, string>;
  };

  const cookies = body.cookies ?? {};
  const parsedUrl = new URL(APP_URL);
  await page.context().addCookies(
    Object.entries(cookies).map(([name, value]) => ({
      name,
      value,
      domain: parsedUrl.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    })),
  );
}

export async function createLoggedInPage(browser: Browser, email: string) {
  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();
  await loginAs(page, email);
  return { context, page };
}

export async function expectToast(page: Page, message: RegExp | string) {
  const toastRegion = page.getByRole('region', { name: 'Notifications' });
  await expect(toastRegion).toContainText(message);
}

export async function closeContext(context: BrowserContext) {
  try {
    if (context.isClosed()) {
      return;
    }

    await context.close();
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes('Target page, context or browser has been closed')
    ) {
      return;
    }

    throw error;
  }
}

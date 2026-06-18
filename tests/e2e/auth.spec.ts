import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { APP_URL, DEFAULT_PASSWORD, expectToast, resetApp } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

async function installTurnstileStub(page: Page) {
  await page.addInitScript(() => {
    let latestOptions: { callback?: (token: string) => void } | undefined;
    const issueToken = () => window.setTimeout(() => latestOptions?.callback?.('e2e-turnstile-token'), 0);

    (window as unknown as {
      turnstile: {
        render: (_element: HTMLElement, options: { callback?: (token: string) => void }) => string;
        reset: () => void;
        remove: () => void;
      };
    }).turnstile = {
      render: (_element, options) => {
        latestOptions = options;
        issueToken();
        return 'e2e-turnstile-widget';
      },
      reset: issueToken,
      remove: () => {},
    };
  });
}

async function registerVerifiedUser(
  request: APIRequestContext,
  user: { email: string; username: string; password?: string },
) {
  const registerResponse = await request.post(`${APP_URL}/api/auth/register`, {
    data: {
      email: user.email,
      username: user.username,
      password: user.password ?? DEFAULT_PASSWORD,
    },
  });
  expect(registerResponse.status()).toBe(202);
  const registerBody = await registerResponse.json() as { previewUrl?: string };
  expect(registerBody.previewUrl).toBeTruthy();

  const verificationUrl = new URL(registerBody.previewUrl ?? '/', APP_URL);
  const token = verificationUrl.searchParams.get('token');
  expect(token).toBeTruthy();

  const verificationResponse = await request.post(`${APP_URL}/api/auth/email/verify/consume`, {
    data: { token },
  });
  expect(verificationResponse.ok()).toBeTruthy();
}

test('enforces auth, registers, verifies, logs out, and preserves the session', async ({ page }) => {
  test.setTimeout(75_000);

  const passwordInput = () => page.getByLabel('Password', { exact: true });
  await installTurnstileStub(page);

  const healthResponse = await page.request.get('/api/health');
  expect(healthResponse.ok()).toBeTruthy();

  await page.goto('/play');
  await expect(page).toHaveURL(/\/auth\/login$/);

  await page.getByRole('link', { name: /create your account/i }).click();
  await expect(page).toHaveURL(/\/auth\/register$/);

  await page.getByLabel('Public Username').fill('audit-user');
  await page.getByLabel('Email').fill('audit-user@example.com');
  await passwordInput().fill(DEFAULT_PASSWORD);
  await page.getByLabel('Confirm Password', { exact: true }).fill(DEFAULT_PASSWORD);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/auth\/verify-email\?email=audit-user%40example\.com/);
  const verificationLink = await page.getByRole('link', { name: /open verification link/i }).getAttribute('href');
  expect(verificationLink).toBeTruthy();
  await page.goto(verificationLink ?? '/auth/verify-email?error=missing');

  await expect(page).toHaveURL(/\/auth\/verified|\/play/);
  await expect(page.getByRole('heading', { name: /central lobby/i })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole('heading', { name: /central lobby/i })).toBeVisible();

  await page.goto('/auth/security');
  await expect(page.getByRole('heading', { name: /^security$/i })).toBeVisible();
  await page.getByRole('button', { name: /sign out of this device/i }).click();
  await expect(page.getByText(/sign out of this device\?/i)).toBeVisible();
  await Promise.all([
    page.waitForResponse((response) => (
      response.url().includes('/api/auth/logout')
      && response.request().method() === 'POST'
      && response.status() === 204
    )),
    page.getByRole('button', { name: /^sign out$/i }).click(),
  ]);
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test('shows invalid password feedback and signs in with a verified account', async ({ page, request }) => {
  const passwordInput = () => page.getByLabel('Password', { exact: true });
  await installTurnstileStub(page);
  await registerVerifiedUser(request, {
    email: 'login-user@example.com',
    username: 'login-user',
  });

  await page.goto('/auth/login');
  await page.getByLabel('Email or username').fill('login-user');
  await page.getByRole('button', { name: /continue with password/i }).click();
  const signInButton = page.getByRole('button', { name: /^sign in$/i });
  await expect(signInButton).toBeEnabled();
  await passwordInput().fill('WrongPassword123!');
  await signInButton.click();
  await expectToast(page, /invalid email or password/i);

  await expect(signInButton).toBeEnabled();
  await passwordInput().fill(DEFAULT_PASSWORD);
  await Promise.all([
    page.waitForResponse((response) => (
      response.url().includes('/api/auth/login/password')
      && response.request().method() === 'POST'
      && response.status() === 200
    )),
    signInButton.click(),
  ]);
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
});

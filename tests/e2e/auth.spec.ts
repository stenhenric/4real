import { expect, test } from '@playwright/test';
import { DEFAULT_PASSWORD, expectToast, resetApp } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

test('boots the app, enforces auth, supports register verify login logout, and preserves the session', async ({ page }) => {
  const passwordInput = () => page.getByLabel('Password', { exact: true });
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

  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await page.getByLabel('Email or username').fill('audit-user');
  await page.getByRole('button', { name: /continue with password/i }).click();
  const signInButton = page.getByRole('button', { name: /^sign in$/i });
  await expect(signInButton).toBeEnabled();
  await passwordInput().fill('WrongPassword123!');
  await signInButton.click();
  await expectToast(page, /invalid email or password/i);

  await expect(signInButton).toBeEnabled();
  await passwordInput().fill(DEFAULT_PASSWORD);
  await signInButton.click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
});

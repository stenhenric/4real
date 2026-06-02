import { expect, test, type Page } from '@playwright/test';
import { APP_URL, closeContext, createLoggedInPage, loginAs, resetApp } from './helpers';

type RouteExpectation = {
  path: string;
  heading?: RegExp;
  text?: RegExp;
  waitForSelector?: string;
  waitForResponse?: RegExp;
};

type MockUser = {
  id: string;
  username: string;
  email: string;
  balance: string;
  elo: number;
  isAdmin: boolean;
  stats: { wins: number; losses: number; draws: number };
  emailVerifiedAt?: string;
  hasPassword: boolean;
  mfaEnabled: boolean;
};

type MockSession = {
  id: string;
  deviceId: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
};

const MOCK_TON_WALLETS = [{
  app_name: 'mock-wallet',
  name: 'Mock Wallet',
  image: 'http://127.0.0.1:4317/tonconnect-icon.jpg',
  about_url: 'https://example.com/mock-wallet',
  universal_url: 'https://example.com/mock-wallet/connect',
  bridge: [{ type: 'sse', url: 'https://example.com/mock-wallet/bridge' }],
  platforms: ['ios', 'android', 'linux', 'macos', 'windows', 'chrome', 'firefox'],
  features: [
    { name: 'SendTransaction', maxMessages: 4 },
    { name: 'SignData', types: ['text', 'binary', 'cell'] },
  ],
}];

const DEFAULT_IGNORED_CONSOLE_ERRORS = [
  /downloadable font: .*Cabin Sketch/i,
  /WebSocket connection to 'ws:\/\/127\.0\.0\.1:4317\/socket\.io\/.*' failed: WebSocket is closed before the connection is established\./i,
  /Firefox can.t establish a connection to the server at ws:\/\/127\.0\.0\.1:4317\/socket\.io\/.*transport=websocket/i,
  /The connection to ws:\/\/127\.0\.0\.1:4317\/socket\.io\/.*transport=websocket was interrupted while the page was loading/i,
];

const currentSecuritySession: MockSession = {
  id: 'session-current',
  deviceId: 'device-current',
  current: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
  ipAddress: '127.0.0.1',
  createdAt: '2026-06-02T15:00:00.000Z',
  lastSeenAt: '2026-06-02T15:33:00.000Z',
  idleExpiresAt: '2026-06-03T15:33:00.000Z',
  absoluteExpiresAt: '2026-07-02T15:33:00.000Z',
};

const otherSecuritySession: MockSession = {
  id: 'session-other',
  deviceId: 'device-other',
  current: false,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  ipAddress: '127.0.0.2',
  createdAt: '2026-06-02T13:00:00.000Z',
  lastSeenAt: '2026-06-02T14:20:00.000Z',
  idleExpiresAt: '2026-06-03T14:20:00.000Z',
  absoluteExpiresAt: '2026-07-02T14:20:00.000Z',
};

const baseSecurityUser: MockUser = {
  id: 'user-security',
  username: 'security-user',
  email: 'security-user@example.com',
  balance: '42.000000',
  elo: 1200,
  isAdmin: false,
  stats: { wins: 1, losses: 0, draws: 0 },
  emailVerifiedAt: '2026-06-01T00:00:00.000Z',
  hasPassword: true,
  mfaEnabled: false,
};

function installErrorCollectors(page: Page, options?: { ignoreConsole?: RegExp[]; ignorePageErrors?: RegExp[] }) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const ignoreConsole = [...DEFAULT_IGNORED_CONSOLE_ERRORS, ...(options?.ignoreConsole ?? [])];
  const ignorePageErrors = options?.ignorePageErrors ?? [];

  page.on('pageerror', (error) => {
    if (!ignorePageErrors.some((pattern) => pattern.test(error.message))) {
      pageErrors.push(error.message);
    }
  });

  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !ignoreConsole.some((pattern) => pattern.test(message.text()))
    ) {
      consoleErrors.push(message.text());
    }
  });

  return {
    assertHealthy: async () => {
      expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
      expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
    },
  };
}

async function stubTonConnectWallets(page: Page) {
  await page.route(/https?:\/\/.*wallets-v2\.json(?:\?.*)?$/i, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TON_WALLETS),
    });
  });
}

async function installTurnstileStub(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as {
      turnstile: {
        render: (_element: HTMLElement, options: { callback?: (token: string) => void }) => string;
        reset: () => void;
        remove: () => void;
      };
    }).turnstile = {
      render: (_element, options) => {
        window.setTimeout(() => options.callback?.('e2e-turnstile-token'), 0);
        return 'e2e-turnstile-widget';
      },
      reset: () => {},
      remove: () => {},
    };
  });
}

function authResponse(user: MockUser, session: MockSession) {
  return {
    status: 'authenticated',
    user,
    session,
  };
}

async function installClipboardStub(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copiedText?: string }).__copiedText = text;
        },
      },
    });
  });
}

async function mockSecurityApi(page: Page, options?: { mfaEnabled?: boolean; includeOtherDevice?: boolean }) {
  let user = { ...baseSecurityUser, mfaEnabled: options?.mfaEnabled ?? false };
  let sessions = options?.includeOtherDevice === false
    ? [currentSecuritySession]
    : [currentSecuritySession, otherSecuritySession];
  let setupCalls = 0;

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(authResponse(user, currentSecuritySession)),
    });
  });

  await page.route('**/api/auth/sessions/revoke-others', async (route) => {
    sessions = sessions.filter((session) => session.current);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'sessions_revoked', sessions }),
    });
  });

  await page.route('**/api/auth/sessions/session-other', async (route) => {
    sessions = sessions.filter((session) => session.id !== 'session-other');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'sessions_revoked', sessions }),
    });
  });

  await page.route('**/api/auth/sessions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', sessions }),
    });
  });

  await page.route('**/api/auth/mfa/totp/setup', async (route) => {
    setupCalls += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        setupToken: 'setup-token-1',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/4real:security-user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=4real&algorithm=SHA1&digits=6&period=30',
      }),
    });
  });

  await page.route('**/api/auth/mfa/totp/verify', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { code?: string };
    if (body.code !== '123456') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'INVALID_TOTP_CODE',
          message: 'Invalid verification code',
        }),
      });
      return;
    }

    user = { ...user, mfaEnabled: true };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...authResponse(user, currentSecuritySession),
        status: 'mfa_enabled',
        recoveryCodes: ['ABCD-EFGH', 'JKLM-NPQR'],
      }),
    });
  });

  return {
    getSetupCalls: () => setupCalls,
  };
}

async function fillWithdrawalReview(page: Page) {
  await page.goto('/bank');
  await expect(page.getByRole('heading', { name: /the bank/i })).toBeVisible();
  await page.getByRole('button', { name: /withdraw usdt/i }).click();
  await page.getByLabel(/withdrawal amount/i).fill('5');
  await page.getByLabel(/destination ton address/i).fill('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
  await page.getByRole('button', { name: /review withdrawal/i }).click();
  await expect(page.getByText(/ready to review/i)).toBeVisible();
}

async function expectRouteToRender(page: Page, route: RouteExpectation) {
  const responsePromise = route.waitForResponse
    ? page.waitForResponse((response) => route.waitForResponse!.test(response.url()))
    : undefined;

  await page.goto(route.path);

  if (route.waitForSelector) {
    await page.locator(route.waitForSelector).waitFor({ state: 'visible' });
  }

  if (route.heading) {
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
  }

  if (route.text) {
    await expect(page.getByText(route.text).first()).toBeVisible();
  }

  await responsePromise;
}

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

test('public routes when opened anonymously render their primary surfaces without runtime errors', async ({ page }) => {
  await installTurnstileStub(page);
  await stubTonConnectWallets(page);
  const health = installErrorCollectors(page, {
    ignoreConsole: [/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i],
  });
  const routes: RouteExpectation[] = [
    { path: '/', heading: /get real\.\s*connect\s*4/i },
    { path: '/auth/login?error=session', heading: /welcome back/i },
    { path: '/auth/register', heading: /create your account/i },
    { path: '/auth/forgot-password', heading: /reset your password/i },
    { path: '/auth/reset-password?error=expired', heading: /choose a new password/i },
    { path: '/auth/verify-email?email=audit-user@example.com', heading: /verify your email/i },
    { path: '/auth/magic-link?email=audit-user@example.com', heading: /finish signing in/i },
    { path: '/auth/approve-login?email=audit-user@example.com', heading: /approve your sign-in/i },
    { path: '/auth/verified', heading: /welcome back/i },
  ];

  for (const route of routes) {
    await expectRouteToRender(page, route);
  }

  await health.assertHealthy();
});

test('player routes when a session is preloaded render the lobby leaderboard bank and profile surfaces', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  await stubTonConnectWallets(page);
  const health = installErrorCollectors(page, {
    ignorePageErrors: [/socket\.io\/.*due to access control checks\./i],
  });
  const routes: RouteExpectation[] = [
    { path: '/leaderboard', text: /leaderboard/i },
    { path: '/bank', heading: /the bank/i, waitForResponse: /\/api\/transactions\?page=1&pageSize=25$/ },
    { path: '/profile/user-player-one', heading: /player-one/i },
    { path: '/play', heading: /central lobby/i },
  ];

  try {
    for (const route of routes) {
      await expectRouteToRender(page, route);
    }

    await health.assertHealthy();
  } finally {
    await closeContext(context);
  }
});

test('security overview stays compact and opens a focused 2FA setup flow', async ({ page }) => {
  await installClipboardStub(page);
  const api = await mockSecurityApi(page);

  await page.goto('/auth/security');

  await expect(page.getByRole('heading', { name: /^security$/i })).toBeVisible();
  await expect(page.getByText(/protect your account/i)).toBeVisible();
  await expect(page.getByText('Account protection')).toBeVisible();
  await expect(page.getByText('Email')).toBeVisible();
  await expect(page.getByText('Verified')).toBeVisible();
  await expect(page.getByText('Password')).toBeVisible();
  await expect(page.getByText('Enabled')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^two-factor authentication$/i })).toBeVisible();
  await expect(page.getByText('Current device').first()).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /enable 2FA/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /manage devices/i })).toBeVisible();

  await expect(page.getByText(/OTP Auth URL/i)).toHaveCount(0);
  await expect(page.getByText(/\bsecret\b/i)).toHaveCount(0);
  await expect(page.getByLabel(/authenticator code/i)).toHaveCount(0);
  expect(api.getSetupCalls()).toBe(0);

  await page.getByRole('button', { name: /enable 2FA/i }).click();
  await expect(page.getByRole('heading', { name: /enable two-factor authentication/i })).toBeVisible();
  await expect(page.getByText(/Google Authenticator, 1Password, Authy, Microsoft Authenticator/i)).toBeVisible();
  expect(api.getSetupCalls()).toBe(0);

  await page.getByRole('button', { name: /start setup/i }).click();
  await expect(page.getByRole('heading', { name: /scan this QR code/i })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code for authenticator app/i })).toBeVisible();
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toHaveCount(0);
  await expect(page.getByText(/otpauth:\/\//i)).toHaveCount(0);
  expect(api.getSetupCalls()).toBe(1);

  await page.getByRole('button', { name: /show setup key/i }).click();
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
  await page.getByRole('button', { name: /copy setup key/i }).click();
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(/setup key copied/i);

  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: /enter the 6-digit code/i })).toBeVisible();
  const codeInput = page.getByLabel(/authenticator code/i);
  await codeInput.fill('12345');
  await expect(page.getByRole('button', { name: /enable 2FA/i })).toBeDisabled();
  await codeInput.fill('000000');
  await page.getByRole('button', { name: /enable 2FA/i }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/that code did not work/i);

  await codeInput.fill('123456');
  await page.getByRole('button', { name: /enable 2FA/i }).click();
  await expect(page.getByRole('heading', { name: /save your recovery codes/i })).toBeVisible();
  await expect(page.getByText('ABCD-EFGH')).toBeVisible();
  await page.getByRole('button', { name: /i've saved my codes/i }).click();
  await expect(page.getByText(/have you saved your recovery codes/i)).toBeVisible();
  await page.getByRole('button', { name: /yes, I saved them/i }).click();
  await expect(page.getByRole('heading', { name: /^security$/i })).toBeVisible();
  await expect(page.getByText('On', { exact: true }).first()).toBeVisible();
});

test('device management is focused and confirms destructive session actions', async ({ page }) => {
  await mockSecurityApi(page);

  await page.goto('/auth/security');
  await page.getByRole('button', { name: /manage devices/i }).click();

  await expect(page.getByRole('heading', { name: /^active devices$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^current device$/i })).toBeVisible();
  await expect(page.getByText('Chrome Mobile')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^other devices$/i })).toBeVisible();
  await expect(page.getByText('Chrome Desktop')).toBeVisible();

  await page.getByRole('button', { name: /^sign out$/i }).click();
  await expect(page.getByText(/sign out this device\?/i)).toHaveCount(0);
  await expect(page.getByText(/sign out other devices\?/i)).toBeVisible();
  await page.getByRole('button', { name: /cancel/i }).click();

  await page.getByRole('button', { name: /sign out all other devices/i }).click();
  await expect(page.getByText(/this will remove access from all devices except this one/i)).toBeVisible();
  await page.getByRole('button', { name: /^sign out other devices$/i }).click();
  await expect(page.getByText(/no other active devices found/i)).toBeVisible();
});

test('mobile bottom navigation contains destinations only', async ({ page }) => {
  await mockSecurityApi(page);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto('/auth/security');

  const mobileNav = page.getByRole('navigation', { name: /mobile navigation/i });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav).toContainText(/lobby/i);
  await expect(mobileNav).toContainText(/bank/i);
  await expect(mobileNav).toContainText(/profile/i);
  await expect(mobileNav).not.toContainText(/logout/i);
});

test('security surfaces have no horizontal overflow across supported widths', async ({ page }) => {
  await mockSecurityApi(page);

  for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/auth/security');
    await expect(page.getByRole('button', { name: /enable 2FA/i })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.getByRole('button', { name: /manage devices/i }).click();
    await expect(page.getByRole('heading', { name: /^active devices$/i })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('play lobby fetches leaderboard only after the leaderboard tab is opened', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  const requestedPaths: string[] = [];

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === APP_URL) {
      requestedPaths.push(url.pathname);
    }
    await route.continue();
  });

  try {
    await page.goto('/play');
    await expect(page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await page.waitForLoadState('networkidle');

    await expect.poll(
      () => requestedPaths.filter((path) => path === '/api/matches/active').length,
    ).toBeGreaterThanOrEqual(1);
    expect(requestedPaths.filter((path) => path === '/api/users/leaderboard')).toHaveLength(0);

    await page.getByRole('tab', { name: /leaderboard/i }).click();
    await expect(page.getByRole('heading', { name: /top sketchers/i })).toBeVisible();
    await expect.poll(
      () => requestedPaths.filter((path) => path === '/api/users/leaderboard').length,
    ).toBe(1);
  } finally {
    await closeContext(context);
  }
});

test('play lobby does not load TonConnect assets before wallet routes need them', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  const requestedAssetPaths: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === APP_URL) {
      requestedAssetPaths.push(url.pathname);
    }
  });

  try {
    await page.goto('/play');
    await expect(page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(requestedAssetPaths.some((path) => /\/assets\/tonconnect.*\.js/i.test(path))).toBe(false);

    await page.goto('/bank');
    await expect(page.getByRole('heading', { name: /the bank/i })).toBeVisible();
    await page.getByRole('button', { name: /deposit usdt/i }).click();
    await expect(page.getByLabel(/deposit amount/i)).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(requestedAssetPaths.some((path) => /\/assets\/tonconnect.*\.js/i.test(path))).toBe(true);
  } finally {
    await closeContext(context);
  }
});

test('bank USDT flows collect intent before payment details and show withdrawal status', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  await stubTonConnectWallets(page);
  const health = installErrorCollectors(page, {
    ignorePageErrors: [/socket\.io\/.*due to access control checks\./i],
  });

  try {
    await page.goto('/bank');
    await expect(page.getByRole('heading', { name: /the bank/i })).toBeVisible();

    await page.getByRole('button', { name: /deposit usdt/i }).click();
    await expect(page.getByLabel(/deposit amount/i)).toBeVisible();
    await expect(page.locator('#deposit-address')).toHaveCount(0);

    await page.getByLabel(/deposit amount/i).fill('0');
    await page.getByRole('button', { name: /review deposit/i }).click();
    await expect(page.getByText(/deposit amount must be greater than 0/i)).toBeVisible();

    await page.getByLabel(/deposit amount/i).fill('12.34');
    await page.getByRole('button', { name: /review deposit/i }).click();
    await expect(page.getByText(/review deposit/i)).toBeVisible();
    await expect(page.getByText(/12\.340000 usdt/i)).toBeVisible();

    await page.getByRole('button', { name: /generate payment details/i }).click();
    await expect(page.getByText('Payment details ready', { exact: true })).toBeVisible();
    await expect(page.locator('input[value="EQ-DEMO-WALLET"]')).toBeVisible();
    await expect(page.locator('input[value="memo-user-player-one"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: /send exactly 12\.34 usdt/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pay with tonconnect/i })).toBeDisabled();

    await page.getByRole('button', { name: /change amount/i }).click();
    await expect(page.getByLabel(/deposit amount/i)).toHaveValue('12.34');
    await expect(page.getByText('Payment details ready', { exact: true })).toHaveCount(0);
    await expect(page.locator('#deposit-address')).toHaveCount(0);

    await page.getByRole('button', { name: /back to bank/i }).click();
    await page.getByRole('button', { name: /withdraw usdt/i }).click();
    await expect(page.getByLabel(/withdrawal amount/i)).toBeVisible();

    await page.getByLabel(/withdrawal amount/i).fill('0');
    await page.getByLabel(/destination ton address/i).fill('not-a-ton-address');
    await page.getByRole('button', { name: /review withdrawal/i }).click();
    await expect(page.getByText(/withdrawal amount must be greater than 0/i)).toBeVisible();
    await expect(page.getByText(/enter a valid ton address/i)).toBeVisible();

    await page.getByLabel(/withdrawal amount/i).fill('5');
    await page.getByLabel(/destination ton address/i).fill('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    await page.getByRole('button', { name: /review withdrawal/i }).click();
    await expect(page.getByText(/ready to review/i)).toBeVisible();
    await expect(page.getByText('5 USDT', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/network fee/i)).toBeVisible();
    await expect(page.getByText(/covered by platform/i)).toBeVisible();

    await page.getByRole('button', { name: /confirm withdrawal/i }).click();
    await expect(page.getByRole('heading', { name: /withdrawal queued/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /refresh status/i })).toBeVisible();
    await expect(page.getByText(/balance has been reserved/i)).toBeVisible();

    await health.assertHealthy();
  } finally {
    await closeContext(context);
  }
});

test('withdrawal MFA success returns to the interrupted review and queues through the backend', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  await stubTonConnectWallets(page);
  const withdrawalRequests: Array<{ idempotencyKey: string | null; body: unknown }> = [];

  await page.route('**/api/transactions/withdraw', async (route) => {
    const request = route.request();
    withdrawalRequests.push({
      idempotencyKey: request.headers()['idempotency-key'] ?? null,
      body: request.postDataJSON(),
    });

    if (withdrawalRequests.length === 1) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'MFA_REQUIRED',
          message: 'Additional verification required',
          details: {
            challengeId: 'challenge-withdrawal-success',
            withdrawalIntentId: 'intent-withdrawal-success',
            challengeReason: 'sensitive_action',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'Withdrawal queued successfully',
        status: 'queued',
        withdrawalId: 'wd-mfa-success',
        statusUrl: '/api/transactions/withdrawals/wd-mfa-success',
      }),
    });
  });

  await page.route('**/api/auth/mfa/challenge', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        message: 'Verification complete.',
        withdrawalIntentId: 'intent-withdrawal-success',
        session: {
          id: 'session-player-one',
          deviceId: '',
          current: true,
          userAgent: null,
          ipAddress: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          absoluteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    });
  });

  try {
    await fillWithdrawalReview(page);
    await page.getByRole('button', { name: /confirm withdrawal/i }).click();
    await expect(page).toHaveURL(/\/auth\/withdrawal-mfa\?.*challenge-withdrawal-success/);

    await page.getByLabel(/authenticator code/i).fill('123456');
    await page.getByRole('button', { name: /authorize & submit/i }).click();

    await expect(page.getByRole('heading', { name: /withdrawal queued/i })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('mfa')).toBeNull();
    expect(withdrawalRequests).toHaveLength(2);
    expect(withdrawalRequests[1]?.body).toEqual({
      amountUsdt: '5.000000',
      toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      withdrawalIntentId: 'intent-withdrawal-success',
    });
    expect(withdrawalRequests[1]?.idempotencyKey).toBe(withdrawalRequests[0]?.idempotencyKey);
  } finally {
    await closeContext(context);
  }
});

test('withdrawal confirm ignores rapid duplicate clicks and reuses one idempotency key', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  await stubTonConnectWallets(page);
  const withdrawalRequests: Array<{ idempotencyKey: string | null; body: unknown }> = [];

  await page.route('**/api/transactions/withdraw', async (route) => {
    const request = route.request();
    withdrawalRequests.push({
      idempotencyKey: request.headers()['idempotency-key'] ?? null,
      body: request.postDataJSON(),
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'Withdrawal queued successfully',
        status: 'queued',
        withdrawalId: 'wd-duplicate-click',
        statusUrl: '/api/transactions/withdrawals/wd-duplicate-click',
      }),
    });
  });

  try {
    await fillWithdrawalReview(page);
    const confirmWithdrawal = page.getByRole('button', { name: /confirm withdrawal/i });
    await confirmWithdrawal.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await expect(page.getByRole('heading', { name: /withdrawal queued/i })).toBeVisible();
    expect(withdrawalRequests).toHaveLength(1);
    expect(withdrawalRequests[0]?.idempotencyKey).toBeTruthy();
  } finally {
    await closeContext(context);
  }
});

test('withdrawal MFA cancellation and failure return with inputs preserved', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  await stubTonConnectWallets(page);
  let challengeShouldFail = false;
  let withdrawalCalls = 0;

  await page.route('**/api/transactions/withdraw', async (route) => {
    withdrawalCalls += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'MFA_REQUIRED',
        message: 'Additional verification required',
        details: {
          challengeId: `challenge-withdrawal-${withdrawalCalls}`,
          withdrawalIntentId: `intent-withdrawal-${withdrawalCalls}`,
          challengeReason: 'sensitive_action',
        },
      }),
    });
  });

  await page.route('**/api/auth/mfa/challenge', async (route) => {
    await route.fulfill({
      status: challengeShouldFail ? 400 : 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'INVALID_MFA_CODE',
        message: 'Unable to complete verification.',
      }),
    });
  });

  try {
    await fillWithdrawalReview(page);
    await page.getByRole('button', { name: /confirm withdrawal/i }).click();
    await expect(page).toHaveURL(/\/auth\/withdrawal-mfa\?.*challenge-withdrawal-1/);
    await page.getByRole('button', { name: /cancel transaction/i }).click();
    await expect(page.getByRole('main').getByText(/verification was cancelled/i)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('mfa')).toBeNull();
    await expect(page.getByText(/ready to review/i)).toBeVisible();
    await expect(page.locator('#withdraw-destination-review')).toHaveValue('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    expect(withdrawalCalls).toBe(1);

    challengeShouldFail = true;
    await page.getByRole('button', { name: /confirm withdrawal/i }).click();
    await expect(page).toHaveURL(/\/auth\/withdrawal-mfa\?.*challenge-withdrawal-2/);
    await page.getByLabel(/authenticator code/i).fill('000000');
    await page.getByRole('button', { name: /authorize & submit/i }).click();
    await expect(page.getByRole('main').getByText(/verification failed/i)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('mfa')).toBeNull();
    await expect(page.getByText(/ready to review/i)).toBeVisible();
    await expect(page.locator('#withdraw-destination-review')).toHaveValue('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    expect(withdrawalCalls).toBe(2);
  } finally {
    await closeContext(context);
  }
});

test('manual withdrawal MFA return URL cannot queue without backend step-up', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  await stubTonConnectWallets(page);
  let withdrawalCalls = 0;

  await page.route('**/api/transactions/withdraw', async (route) => {
    withdrawalCalls += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'MFA_REQUIRED',
        message: 'Additional verification required',
        details: {
          challengeId: 'challenge-manual-return',
          withdrawalIntentId: 'intent-manual-return',
          challengeReason: 'sensitive_action',
        },
      }),
    });
  });

  try {
    await page.goto('/bank');
    await page.evaluate(() => {
      window.sessionStorage.setItem('4real:withdrawal-resume-draft', JSON.stringify({
        version: 1,
        flow: 'withdrawal',
        asset: 'USDT',
        network: 'TON',
        step: 'review',
        amountUsdt: '5.000000',
        toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
        idempotencyKey: 'manual-return-idempotency',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        resumeAfterMfa: true,
      }));
    });

    await page.goto('/bank?view=withdraw&flow=withdrawal&mfa=verified');
    await expect(page).toHaveURL(/\/auth\/withdrawal-mfa\?.*challenge-manual-return/);
    await expect(page.getByRole('heading', { name: /confirm withdrawal/i })).toBeVisible();
    expect(withdrawalCalls).toBe(1);
  } finally {
    await closeContext(context);
  }
});

test.describe('mobile merchant shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('merchant routes on a narrow viewport render the operator surfaces and mobile navigation', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4317', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await stubTonConnectWallets(page);
    const health = installErrorCollectors(page);
    const routes: RouteExpectation[] = [
      { path: '/merchant', heading: /treasury overview/i },
      {
        path: '/merchant/orders',
        heading: /order desk/i,
        waitForResponse: /\/admin\/merchant\/orders\?page=1&pageSize=25&status=PENDING&type=ALL$/,
      },
      {
        path: '/merchant/deposits',
        heading: /deposit reconciliation/i,
        waitForResponse: /\/admin\/merchant\/deposits\?status=open&limit=100$/,
      },
      { path: '/merchant/liquidity', heading: /liquidity & wallets/i },
      { path: '/merchant/alerts', heading: /alerts & risk/i },
    ];

    try {
      await loginAs(page, 'admin@example.com');

      for (const route of routes) {
        await expectRouteToRender(page, route);
        await expect(page.getByRole('navigation', { name: /merchant sections/i })).toBeVisible();
      }

      await health.assertHealthy();
    } finally {
      await closeContext(context);
    }
  });
});

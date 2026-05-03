import { expect, test, type Page } from '@playwright/test';
import { closeContext, createLoggedInPage, loginAs, resetApp } from './helpers';

type RouteExpectation = {
  path: string;
  heading?: RegExp;
  text?: RegExp;
  waitForSelector?: string;
};

const MOCK_TON_WALLETS = [{
  app_name: 'mock-wallet',
  name: 'Mock Wallet',
  image: 'https://example.com/mock-wallet.png',
  about_url: 'https://example.com/mock-wallet',
  universal_url: 'https://example.com/mock-wallet/connect',
  bridge: [{ type: 'sse', url: 'https://example.com/mock-wallet/bridge' }],
  platforms: ['ios', 'android', 'linux', 'macos', 'windows', 'chrome'],
}];

function installErrorCollectors(page: Page, options?: { ignoreConsole?: RegExp[] }) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const ignoreConsole = options?.ignoreConsole ?? [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
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

async function expectRouteToRender(page: Page, route: RouteExpectation) {
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
}

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

test('public routes when opened anonymously render their primary surfaces without runtime errors', async ({ page }) => {
  await stubTonConnectWallets(page);
  const health = installErrorCollectors(page, {
    ignoreConsole: [/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/i],
  });
  const routes: RouteExpectation[] = [
    { path: '/', heading: /real competition, clean settlement, visible security/i },
    { path: '/auth/login?error=session', heading: /sign in without friction/i },
    { path: '/auth/register', heading: /enter with a verified identity/i },
    { path: '/auth/forgot-password', heading: /reset access without exposing account state/i },
    { path: '/auth/reset-password?error=expired', heading: /replace your password and revoke old sessions/i },
    { path: '/auth/verify-email?email=audit-user@example.com', heading: /activate your account before you play/i },
    { path: '/auth/magic-link?email=audit-user@example.com', heading: /finish sign-in in this browser/i },
    { path: '/auth/approve-login?email=audit-user@example.com', heading: /approve the blocked sign-in/i },
    { path: '/auth/verified', heading: /your account is active/i },
  ];

  for (const route of routes) {
    await expectRouteToRender(page, route);
  }

  await health.assertHealthy();
});

test('player routes when a session is preloaded render the lobby leaderboard bank and profile surfaces', async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, 'player1@example.com');
  await stubTonConnectWallets(page);
  const health = installErrorCollectors(page);
  const routes: RouteExpectation[] = [
    { path: '/play', heading: /central lobby/i },
    { path: '/leaderboard', text: /leaderboard/i },
    { path: '/bank', heading: /the bank/i },
    { path: '/profile/user-player-one', heading: /player-one/i },
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

test.describe('mobile merchant shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('merchant routes on a narrow viewport render the operator surfaces and mobile navigation', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4317', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await stubTonConnectWallets(page);
    const health = installErrorCollectors(page);
    const routes: RouteExpectation[] = [
      { path: '/merchant', heading: /treasury overview/i },
      { path: '/merchant/orders', heading: /order desk/i },
      { path: '/merchant/deposits', heading: /deposit reconciliation/i },
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

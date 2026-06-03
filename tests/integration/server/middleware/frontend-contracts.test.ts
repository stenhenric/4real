import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test, { mock } from 'node:test';

import {
  TOAST_AUTO_DISMISS_MS,
  TOAST_MESSAGE_TARGET_LENGTH,
  compactToastQueue,
  type ToastQueueItem,
} from '../../../../src/app/toast-rules.ts';
import { scrubSensitiveTokenFromCurrentUrl } from '../../../../src/features/auth/url-token.ts';
import { getTransactionAccentClass, isCreditTransaction } from '../../../../src/features/bank/transactionPresentation.ts';
import { formatDateTime, formatMoney } from '../../../../src/features/merchant/format.ts';
import { isAbortError } from '../../../../src/utils/isAbortError.ts';
import {
  consumeMagicLink,
  consumeSuspiciousLogin,
  consumeVerificationEmail,
  loginPassword,
  logout,
} from '../../../../src/services/auth.service.ts';
import { shouldClearAuthAfterRefreshError } from '../../../../src/features/auth/refresh-error.ts';
import request, { ApiClientError } from '../../../../src/services/api/apiClient.ts';
import { getMatch, getUserMatches, joinMatch } from '../../../../src/services/matches.service.ts';
import { updateOrderStatus } from '../../../../src/services/orders.service.ts';
import { getUserProfile } from '../../../../src/services/users.service.ts';
import { shouldOpenTotpSetupFlow } from '../../../../src/pages/auth/security-page-content.ts';
import { normalizeFixedScaleAmount } from '../../../../src/utils/exact-money.ts';

function createJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null;
      },
    },
    async json() {
      return data;
    },
    async text() {
      return typeof data === 'string' ? data : JSON.stringify(data);
    },
  } as Response;
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return collectSourceFiles(path);
    }

    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

test('frontend toast strings stay within the guideline target', () => {
  const toastCallPattern = /(?<![.\w])(?:addToast|success|showError|error|warning|info)\((.*)/g;
  const stringLiteralPattern = /(['"`])((?:(?!\1).)*)\1/g;
  const offenders: string[] = [];

  for (const filePath of collectSourceFiles('src')) {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      let callMatch: RegExpExecArray | null;
      while ((callMatch = toastCallPattern.exec(line))) {
        const callSource = callMatch[1] ?? '';
        for (const literalMatch of callSource.matchAll(stringLiteralPattern)) {
          const message = literalMatch[2] ?? '';
          if (message.length > TOAST_MESSAGE_TARGET_LENGTH) {
            offenders.push(`${filePath}:${index + 1} (${message.length}) ${message}`);
          }
        }
      }

      toastCallPattern.lastIndex = 0;
    });
  }

  assert.deepEqual(offenders, []);
});

test('frontend toast queue replaces rapid duplicate messages', () => {
  const existingToast: ToastQueueItem = {
    id: 'existing',
    message: 'Copied to clipboard.',
    rotation: 0.25,
    type: 'success',
  };
  const duplicateToast: ToastQueueItem = {
    id: 'duplicate',
    message: 'Copied to clipboard.',
    rotation: -0.25,
    type: 'success',
  };

  assert.deepEqual(compactToastQueue([existingToast], duplicateToast), {
    replacedIds: ['existing'],
    toasts: [duplicateToast],
  });
});

test('frontend toast timing follows the auto-dismiss guideline', () => {
  assert.equal(TOAST_AUTO_DISMISS_MS, 5000);
});

test('frontend buttons render through SketchyButton', () => {
  const rawButtons: string[] = [];

  for (const filePath of collectSourceFiles('src')) {
    if (!filePath.endsWith('.tsx') || filePath.endsWith(join('components', 'SketchyButton.tsx'))) {
      continue;
    }

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/<button\b/.test(line)) {
        rawButtons.push(`${filePath}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(rawButtons, []);
});

test('frontend styles load and apply Cabin Sketch globally', () => {
  const stylesheet = readFileSync(join('src', 'index.css'), 'utf8');

  assert.match(stylesheet, /font-family:\s*["']Cabin Sketch["'];[^}]*font-weight:\s*400;[^}]*url\(["']\/fonts\/cabin-sketch-400\.woff2["']\)[^}]*format\(["']woff2["']\)/s);
  assert.match(stylesheet, /font-family:\s*["']Cabin Sketch["'];[^}]*font-weight:\s*700;[^}]*url\(["']\/fonts\/cabin-sketch-700\.woff2["']\)[^}]*format\(["']woff2["']\)/s);
  assert.match(stylesheet, /font-display:\s*swap/);
  assert.match(
    stylesheet,
    /html,\s*body,\s*#root\s*{[^}]*font-family:\s*["']Cabin Sketch["'],\s*system-ui,\s*sans-serif;/s,
  );
  assert.match(stylesheet, /--font-sans:\s*["']Cabin Sketch["'],\s*system-ui,\s*sans-serif;/);
  assert.equal(/fonts\.(?:googleapis|gstatic)\.com/i.test(stylesheet), false);
});

test('index preloads only the critical Cabin Sketch font weight', () => {
  const indexHtml = readFileSync('index.html', 'utf8');

  assert.match(indexHtml, /rel="preload"[^>]+href="\/fonts\/cabin-sketch-700\.woff2"[^>]+as="font"[^>]+type="font\/woff2"[^>]+crossorigin/s);
  assert.doesNotMatch(indexHtml, /rel="preload"[^>]+href="\/fonts\/cabin-sketch-400\.woff2"/s);
});

test('TonConnect code is scoped away from the global app shell', () => {
  const appProviderSource = readFileSync(join('src', 'app', 'AppProviders.tsx'), 'utf8');
  const navbarSource = readFileSync(join('src', 'components', 'Navbar.tsx'), 'utf8');
  const bankPageSource = readFileSync(join('src', 'pages', 'BankPage.tsx'), 'utf8');

  assert.doesNotMatch(appProviderSource, /@tonconnect\/ui-react|TonConnectUIProvider/);
  assert.doesNotMatch(navbarSource, /@tonconnect\/ui-react|TonConnectButton/);
  assert.match(bankPageSource, /TonConnectRouteProvider/);
});

test('dashboard page defers leaderboard fetch until the leaderboard tab is active', () => {
  const pageSource = readFileSync(join('src', 'pages', 'DashboardPage.tsx'), 'utf8');

  assert.doesNotMatch(pageSource, /Promise\.all\(\[\s*refreshActiveMatches/);
  assert.match(pageSource, /activeTab !== 'leaderboard'/);
  assert.match(pageSource, /setLeaderboardLoaded\(true\)/);
});

test('game board surface masks the rough container border behind the canvas', () => {
  const gamePageSource = readFileSync(join('src', 'pages', 'GamePage.tsx'), 'utf8');

  assert.match(
    gamePageSource,
    /className="[^"]*relative group[^"]*bg-white[^"]*"/,
  );
});

test('merchant layout coalesces dashboard polls and pauses background-tab polling', () => {
  const layoutSource = readFileSync(join('src', 'components', 'merchant', 'MerchantLayout.tsx'), 'utf8');

  assert.match(layoutSource, /dashboardRequestRef/);
  assert.match(layoutSource, /document\.visibilityState === 'hidden'/);
  assert.match(layoutSource, /!activeRequest\.signal\.aborted/);
  assert.match(layoutSource, /mode === 'manual' && activeRequest\.mode === 'poll'/);
  assert.match(layoutSource, /activeRequest\.controller\.abort\(\)/);
  assert.match(layoutSource, /useMemo/);
  assert.match(layoutSource, /refreshDashboard/);
});

test('merchant order and deposit reloads ignore stale filter responses', () => {
  const orderDeskSource = readFileSync(join('src', 'pages', 'merchant', 'OrderDeskPage.tsx'), 'utf8');
  const depositsSource = readFileSync(join('src', 'pages', 'merchant', 'DepositsPage.tsx'), 'utf8');

  assert.match(orderDeskSource, /ordersRequestRef/);
  assert.match(orderDeskSource, /ordersQueryRef/);
  assert.match(orderDeskSource, /rowActions/);
  assert.match(orderDeskSource, /getRowActionKey/);
  assert.match(depositsSource, /depositsRequestRef/);
  assert.match(depositsSource, /depositsFilterRef/);
  assert.match(depositsSource, /requestedStatus/);
});

test('ApiClientError preserves status, code, and details from backend responses', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => createJsonResponse({
    code: 'MATCH_NOT_FOUND',
    message: 'Match not found',
    details: { roomId: 'room-404' },
  }, 404));
  t.after(() => fetchMock.mock.restore());

  await assert.rejects(
    request('/matches/room-404'),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 404);
      assert.equal(error.code, 'MATCH_NOT_FOUND');
      assert.deepEqual(error.details, { roomId: 'room-404' });
      assert.equal(error.message, 'Match not found');
      return true;
    },
  );
});

test('frontend match service encodes route params and forwards invite tokens', async (t) => {
  const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({
      roomId: 'room/1',
      p1Username: 'host',
      player1Id: 'p1',
      status: 'waiting',
      wager: 0,
      isPrivate: true,
      moveHistory: [],
    });
  });
  t.after(() => fetchMock.mock.restore());

  await getUserMatches('user/id?x=1');
  await getUserProfile('profile/id?x=1');
  await getMatch('room/1', undefined, 'invite token');
  await joinMatch('room/1', 'invite token');
  await updateOrderStatus('order/id?x=1', 'DONE');

  assert.equal(calls[0]?.input, '/api/matches/user/user%2Fid%3Fx%3D1');
  assert.equal(calls[1]?.input, '/api/users/profile%2Fid%3Fx%3D1');
  assert.equal(calls[2]?.input, '/api/matches/room%2F1?invite=invite%20token');
  assert.equal(calls[3]?.input, '/api/matches/room%2F1/join');
  assert.equal(calls[4]?.input, '/api/orders/order%2Fid%3Fx%3D1');
  const joinHeaders = new Headers(calls[3]?.init?.headers);
  assert.equal(joinHeaders.get('X-Match-Invite'), 'invite token');
  assert.ok(joinHeaders.get('Idempotency-Key'));
});

test('frontend bank presentation treats refund credits as positive incoming funds', () => {
  assert.equal(isCreditTransaction({
    type: 'WITHDRAW_REFUND',
    amount: '12.000000',
  }), true);
  assert.equal(isCreditTransaction({
    type: 'SELL_P2P_REFUND',
    amount: '7.000000',
  }), true);
  assert.equal(getTransactionAccentClass({
    type: 'WITHDRAW_REFUND',
    amount: '12.000000',
  }), 'bg-success-border');
  assert.equal(getTransactionAccentClass({
    type: 'SELL_P2P_REFUND',
    amount: '7.000000',
  }), 'bg-success-border');
});

test('merchant formatters use unavailable fallback for missing money and invalid dates', () => {
  assert.equal(formatMoney(null), 'Unavailable');
  assert.equal(formatMoney(undefined), 'Unavailable');
  assert.equal(formatMoney('not-a-number'), 'Unavailable');
  assert.equal(formatMoney('0.200000'), '0.2');
  assert.equal(formatMoney('1.234500'), '1.235');
  assert.equal(formatDateTime(undefined), 'Unavailable');
  assert.equal(formatDateTime(''), 'Unavailable');
  assert.equal(formatDateTime('not-a-date'), 'Unavailable');
});

test('bank merchant panel keeps the trade form off SketchyContainer and stages screenshot proof', () => {
  const panelSource = readFileSync(join('src', 'features', 'bank', 'MerchantPanel.tsx'), 'utf8');

  assert.doesNotMatch(
    panelSource,
    /<SketchyContainer[^>]*className="bg-white\/80 shadow-xl"[^>]*>/,
  );
  assert.match(panelSource, /Step 2: Share proof/);
  assert.match(panelSource, /Upload payment screenshot/);
  assert.match(panelSource, /Upload M-Pesa payment screenshot/);
  assert.match(panelSource, /Please verify the M-Pesa screenshot matches the transaction details before approving/);
  assert.doesNotMatch(
    panelSource,
    /ADMIN NODE ACTIVE: ENSURE BUY PROOFS AND SELL PAYOUTS ARE VERIFIED BEFORE RELEASE\./,
  );
});

test('bank deposit and withdraw panels keep form surfaces off SketchyContainer', () => {
  const depositSource = readFileSync(join('src', 'features', 'bank', 'DepositPanel.tsx'), 'utf8');
  const withdrawSource = readFileSync(join('src', 'features', 'bank', 'WithdrawPanel.tsx'), 'utf8');

  for (const source of [depositSource, withdrawSource]) {
    assert.doesNotMatch(
      source,
      /<SketchyContainer[^>]*className="bg-white\/90 p-8 shadow-2xl relative overflow-hidden"[^>]*>/,
    );
    assert.match(source, /<div className="bg-white\/90 p-8 shadow-2xl relative overflow-hidden">/);
  }
});

test('bank deposit panel renders the TonConnect wallet button inside the provider route', () => {
  const depositSource = readFileSync(join('src', 'features', 'bank', 'DepositPanel.tsx'), 'utf8');
  const bankPageSource = readFileSync(join('src', 'pages', 'BankPage.tsx'), 'utf8');

  assert.match(bankPageSource, /<TonConnectRouteProvider>\{activePanel\}<\/TonConnectRouteProvider>/s);
  assert.match(depositSource, /import \{[^}]*TonConnectButton[^}]*\} from '@tonconnect\/ui-react';/s);
  assert.match(depositSource, /<TonConnectButton\b/);
});

test('bank withdraw panel renders the TonConnect wallet button for connected-wallet autofill', () => {
  const withdrawSource = readFileSync(join('src', 'features', 'bank', 'WithdrawPanel.tsx'), 'utf8');

  assert.match(withdrawSource, /import \{[^}]*TonConnectButton[^}]*\} from '@tonconnect\/ui-react';/s);
  assert.match(withdrawSource, /<TonConnectButton\b/);
});

test('bank USDT panels use intent-first copy and expose withdrawal status support', () => {
  const depositSource = readFileSync(join('src', 'features', 'bank', 'DepositPanel.tsx'), 'utf8');
  const withdrawSource = readFileSync(join('src', 'features', 'bank', 'WithdrawPanel.tsx'), 'utf8');
  const transactionServiceSource = readFileSync(join('src', 'services', 'transactions.service.ts'), 'utf8');

  assert.doesNotMatch(depositSource, /USDT jetton comments/i);
  assert.doesNotMatch(depositSource, /funds will be lost/i);
  assert.match(depositSource, /required memo\/comment/i);
  assert.match(depositSource, /Change amount/);
  assert.match(withdrawSource, /Network fee/);
  assert.match(withdrawSource, /Covered by platform/);
  assert.match(withdrawSource, /Refresh status/);
  assert.doesNotMatch(withdrawSource, /href=\{acceptedWithdrawal\.statusUrl\}/);
  assert.match(transactionServiceSource, /getWithdrawalStatus/);
});

test('element size hook measures the border box so SketchyContainer borders fit padded cards', () => {
  const hookSource = readFileSync(join('src', 'hooks', 'useElementSize.ts'), 'utf8');

  assert.match(hookSource, /borderBoxSize|getBoundingClientRect/);
  assert.doesNotMatch(hookSource, /entry\.contentRect\.(?:width|height)/);
});

test('frontend UI avoids rounded card badge input and button corners', () => {
  const allowedRoundedSources = [
    join('src', 'canvas', 'drawConnectFourBoard.ts'),
    join('src', 'components', 'ui', 'MiniMatchCard.tsx'),
    join('src', 'pages', 'LandingPage.tsx'),
  ];
  const allowedRoundedLinePatterns = [
    /border-radius:\s*255px/,
    /border-radius:\s*15px/,
    /border-radius:\s*225px/,
    /border-radius:\s*50%/,
    /w-4 h-4 rounded-full/,
    /h-2 w-2 rounded-full/,
    /w-3 h-3 rounded-full/,
  ];
  const sourceFiles: string[] = [];
  const collectSourceFiles = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const fullPath = join(directory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        collectSourceFiles(fullPath);
      } else if (/\.(?:tsx|ts|css)$/.test(entry)) {
        sourceFiles.push(fullPath);
      }
    }
  };
  collectSourceFiles('src');

  const roundedFindings: string[] = [];

  for (const filePath of sourceFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (allowedRoundedSources.some((allowedPath) => normalizedPath.endsWith(allowedPath.replace(/\\/g, '/')))) {
      continue;
    }

    readFileSync(filePath, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (
          /(?:\brounded(?:-[a-z0-9/[\]._-]+)?\b|border-radius)/.test(line)
          && !allowedRoundedLinePatterns.some((pattern) => pattern.test(line))
        ) {
          roundedFindings.push(`${normalizedPath}:${index + 1}: ${line.trim()}`);
        }
      });
  }

  assert.deepEqual(roundedFindings, []);
});

test('frontend auth service consumes emailed auth tokens with POST requests', async (t) => {
  const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({ status: 'authenticated', redirectTo: '/play' });
  });
  t.after(() => fetchMock.mock.restore());

  await consumeMagicLink({ token: 'magic-token' });
  await consumeVerificationEmail({ token: 'verify-token' });
  await consumeSuspiciousLogin({ token: 'suspicious-token' });

  assert.deepEqual(
    calls.map((entry) => ({ input: entry.input, method: entry.init?.method, body: entry.init?.body })),
    [
      {
        input: '/api/auth/login/magic-link/consume',
        method: 'POST',
        body: JSON.stringify({ token: 'magic-token' }),
      },
      {
        input: '/api/auth/email/verify/consume',
        method: 'POST',
        body: JSON.stringify({ token: 'verify-token' }),
      },
      {
        input: '/api/auth/login/suspicious/consume',
        method: 'POST',
        body: JSON.stringify({ token: 'suspicious-token' }),
      },
    ],
  );
});

test('frontend auth service sends password login identifiers with sanitized redirects', async (t) => {
  const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({ status: 'authenticated' });
  });
  t.after(() => fetchMock.mock.restore());

  await loginPassword({
    identifier: 'SketchMaster',
    password: 'paper-lobby-stakes-2026',
    redirectTo: '/merchant/orders?status=PENDING',
  });

  assert.deepEqual(
    calls.map((entry) => ({ input: entry.input, method: entry.init?.method, body: entry.init?.body })),
    [
      {
        input: '/api/auth/login/password',
        method: 'POST',
        body: JSON.stringify({
          identifier: 'SketchMaster',
          password: 'paper-lobby-stakes-2026',
          redirectTo: '/merchant/orders?status=PENDING',
        }),
      },
    ],
  );
});

test('frontend public auth token endpoints do not refresh or dispatch session-expired events', async (t) => {
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const dispatchedEvents: string[] = [];
  (globalThis as typeof globalThis & { window?: unknown }).window = {
    dispatchEvent(event: Event) {
      dispatchedEvents.push(event.type);
      return true;
    },
  } as Partial<Window> as Window & typeof globalThis;

  const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({
      code: 'TOKEN_INVALID',
      message: 'Invalid token',
    }, 401);
  });
  t.after(() => {
    fetchMock.mock.restore();
    if (previousWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as typeof globalThis & { window?: unknown }).window = previousWindow;
    }
  });

  await assert.rejects(consumeMagicLink({ token: 'bad' }), ApiClientError);
  await assert.rejects(consumeVerificationEmail({ token: 'bad' }), ApiClientError);
  await assert.rejects(consumeSuspiciousLogin({ token: 'bad' }), ApiClientError);

  assert.deepEqual(calls.map((entry) => entry.input), [
    '/api/auth/login/magic-link/consume',
    '/api/auth/email/verify/consume',
    '/api/auth/login/suspicious/consume',
  ]);
  assert.deepEqual(dispatchedEvents, []);
});

test('frontend money normalization rejects unsupported precision without number rounding', () => {
  assert.equal(normalizeFixedScaleAmount('10', { scale: 6 }), '10.000000');
  assert.equal(normalizeFixedScaleAmount('10.25', { scale: 6 }), '10.250000');
  assert.equal(normalizeFixedScaleAmount('00010.250000', { scale: 6 }), '10.250000');
  assert.throws(
    () => normalizeFixedScaleAmount('0.0000009', { scale: 6 }),
    /at most 6 decimal places/,
  );
  assert.throws(
    () => normalizeFixedScaleAmount('1e-7', { scale: 6 }),
    /plain decimal/,
  );
});

test('frontend abort helper treats WebKit aborted fetch errors as aborts only when the signal is aborted', () => {
  const controller = new AbortController();
  const webKitAbort = new TypeError('Load failed');

  assert.equal(isAbortError(webKitAbort, controller.signal), false);
  controller.abort();
  assert.equal(isAbortError(webKitAbort, controller.signal), true);
  assert.equal(isAbortError(new TypeError('Load failed')), false);
  assert.equal(isAbortError(new TypeError('Load failed'), undefined, { pageUnloading: true }), true);
});

test('frontend auth helper removes only sensitive token query parameters from the current URL', () => {
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const replaceCalls: Array<{ state: unknown; title: string; url: string | URL | null | undefined }> = [];

  (globalThis as typeof globalThis & { window?: unknown }).window = {
    location: {
      href: 'https://app.example.com/auth/reset-password?token=secret-token&email=alice%40example.com#form',
    } as Location,
    history: {
      state: { from: 'test' },
      replaceState(state: unknown, title: string, url?: string | URL | null) {
        replaceCalls.push({ state, title, url });
      },
    } as History,
  } as Partial<Window> as Window & typeof globalThis;

  try {
    scrubSensitiveTokenFromCurrentUrl();
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as typeof globalThis & { window?: unknown }).window = previousWindow;
    }
  }

  assert.deepEqual(replaceCalls, [
    {
      state: { from: 'test' },
      title: '',
      url: '/auth/reset-password?email=alice%40example.com#form',
    },
  ]);
});

test('frontend logout bypasses automatic session refresh on 401', async (t) => {
  const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({
      code: 'UNAUTHENTICATED',
      message: 'Unauthenticated',
    }, 401);
  });
  t.after(() => fetchMock.mock.restore());

  await assert.rejects(
    logout(),
    (error: unknown) => error instanceof ApiClientError && error.status === 401,
  );

  assert.deepEqual(calls.map((entry) => entry.input), ['/api/auth/logout']);
});

test('frontend navigation exposes community and keeps logout only on security', () => {
  const appSource = readFileSync(join('src', 'app', 'App.tsx'), 'utf8');
  const navbarSource = readFileSync(join('src', 'components', 'Navbar.tsx'), 'utf8');
  const securitySource = readFileSync(join('src', 'pages', 'auth', 'SecuritySettingsPage.tsx'), 'utf8');
  const communitySource = readFileSync(join('src', 'pages', 'CommunityPage.tsx'), 'utf8');
  const envExampleSource = readFileSync('.env.example', 'utf8');
  const publicConfigServiceSource = existsSync(join('src', 'services', 'public-config.service.ts'))
    ? readFileSync(join('src', 'services', 'public-config.service.ts'), 'utf8')
    : '';
  const passwordMeterSource = readFileSync(join('src', 'features', 'auth', 'components', 'PasswordStrengthMeter.tsx'), 'utf8');
  const registerSource = readFileSync(join('src', 'pages', 'auth', 'RegisterPage.tsx'), 'utf8');
  const turnstileSource = readFileSync(join('src', 'features', 'auth', 'AuthTurnstile.tsx'), 'utf8');

  assert.match(appSource, /CommunityPage/);
  assert.match(appSource, /path="\/community"/);
  assert.match(appSource, /path="\/auth\/security"[\s\S]*allowIncompleteProfile=\{true\}/);
  assert.match(navbarSource, /to="\/community"/);
  assert.match(navbarSource, /Community/);
  assert.doesNotMatch(navbarSource, /logout/);
  assert.doesNotMatch(navbarSource, /LogOut/);
  assert.match(securitySource, /LogOut/);
  assert.match(communitySource, /Telegram Community/);
  assert.match(communitySource, /Telegram Support/);
  assert.match(communitySource, /target="_blank"/);
  assert.match(communitySource, /rel="noopener noreferrer"/);
  assert.match(communitySource, /getPublicConfig/);
  assert.match(publicConfigServiceSource, /\/public-config/);
  assert.doesNotMatch(communitySource, /import\.meta\.env\.VITE_TELEGRAM_/);
  assert.doesNotMatch(communitySource, /https:\/\/t\.me\/4real(?:community|support)/);
  assert.match(envExampleSource, /^TELEGRAM_COMMUNITY_URL=$/m);
  assert.match(envExampleSource, /^TELEGRAM_SUPPORT_URL=$/m);
  assert.doesNotMatch(envExampleSource, /^VITE_TELEGRAM_(?:COMMUNITY|SUPPORT)_URL=/m);
  assert.match(passwordMeterSource, /12 to 128 characters/);
  assert.doesNotMatch(passwordMeterSource, /Upper & lowercase|Number or special|\\\[A-Z\\\]|\\\[a-z\\\]/);
  assert.match(registerSource, /Password must be 12 to 128 characters\./);
  assert.match(turnstileSource, /import\.meta\.env\.DEV[\s\S]*console\.error/);
});

test('frontend auth refresh clears state only after explicit unauthenticated responses', () => {
  assert.equal(shouldClearAuthAfterRefreshError(new ApiClientError({
    status: 401,
    message: 'Access token required',
    code: 'UNAUTHENTICATED',
  })), true);

  assert.equal(shouldClearAuthAfterRefreshError(new ApiClientError({
    status: 503,
    message: 'Service unavailable',
    code: 'SERVICE_UNAVAILABLE',
  })), false);

  assert.equal(shouldClearAuthAfterRefreshError(new TypeError('Failed to fetch')), false);
});

test('auth provider ignores stale refreshes after newer auth state changes', () => {
  const authProviderSource = readFileSync(join('src', 'app', 'AuthProvider.tsx'), 'utf8');

  assert.match(authProviderSource, /authGenerationRef/);
  assert.match(authProviderSource, /requestGeneration/);
  assert.match(authProviderSource, /authGenerationRef\.current !== requestGeneration/);
  assert.match(authProviderSource, /authStatus === 'authenticated'/);
});

test('security page copy uses focused settings-oriented MFA guidance', () => {
  const pageSource = readFileSync(join('src', 'pages', 'auth', 'SecuritySettingsPage.tsx'), 'utf8');
  const contentSource = readFileSync(join('src', 'pages', 'auth', 'security-page-content.ts'), 'utf8');

  assert.match(contentSource, /title: 'Security'/);
  assert.match(contentSource, /Manage sign-in protection, recovery options, and active devices\./);
  assert.match(contentSource, /Start setup/);
  assert.match(contentSource, /Save your recovery codes/);
  assert.match(contentSource, /Active devices/);
  assert.match(contentSource, /Turn off 2FA/);
  assert.doesNotMatch(contentSource, /OTP Auth URL/);
  assert.doesNotMatch(contentSource, /Control access from one place\./);
  assert.doesNotMatch(contentSource, /Device sessions/);
  assert.match(pageSource, /SECURITY_PAGE_COPY/);
});

test('security page setup helper opens the focused flow without starting setup', () => {
  const helperPath = join(process.cwd(), 'src', 'pages', 'auth', 'security-page-content.ts');

  assert.equal(existsSync(helperPath), true, 'Expected security page helper module to exist');

  assert.equal(shouldOpenTotpSetupFlow({
    setupRequested: true,
    mfaEnabled: false,
  }), true);

  assert.equal(shouldOpenTotpSetupFlow({
    setupRequested: false,
    mfaEnabled: false,
  }), false);

  assert.equal(shouldOpenTotpSetupFlow({
    setupRequested: true,
    mfaEnabled: true,
  }), false);
});

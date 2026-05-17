import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { mock } from 'node:test';

import {
  TOAST_AUTO_DISMISS_MS,
  TOAST_MESSAGE_TARGET_LENGTH,
  compactToastQueue,
  type ToastQueueItem,
} from '../../src/app/toast-rules.ts';
import { getTransactionAccentClass, isCreditTransaction } from '../../src/features/bank/transactionPresentation.ts';
import { isAbortError } from '../../src/utils/isAbortError.ts';
import {
  consumeMagicLink,
  consumeSuspiciousLogin,
  consumeVerificationEmail,
  loginPassword,
  logout,
} from '../../src/services/auth.service.ts';
import { shouldClearAuthAfterRefreshError } from '../../src/features/auth/refresh-error.ts';
import request, { ApiClientError } from '../../src/services/api/apiClient.ts';
import { getMatch, joinMatch } from '../../src/services/matches.service.ts';

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
  const rawButtons = collectSourceFiles('src')
    .filter((filePath) => filePath.endsWith('.tsx') && !filePath.endsWith(join('components', 'SketchyButton.tsx')))
    .flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return source
        .split(/\r?\n/)
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => /<button\b/.test(line))
        .map(({ lineNumber }) => `${filePath}:${lineNumber}`);
    });

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
  const appSource = readFileSync(join('src', 'app', 'App.tsx'), 'utf8');

  assert.doesNotMatch(appProviderSource, /@tonconnect\/ui-react|TonConnectUIProvider/);
  assert.doesNotMatch(navbarSource, /@tonconnect\/ui-react|TonConnectButton/);
  assert.match(appSource, /TonConnectRouteProvider/);
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
  assert.match(layoutSource, /!activeRequest\.signal\?\.aborted/);
  assert.match(layoutSource, /useMemo/);
  assert.match(layoutSource, /refreshDashboard/);
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

test('frontend match service forwards invite tokens into preview and join requests', async (t) => {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({
      roomId: 'room-1',
      p1Username: 'host',
      player1Id: 'p1',
      status: 'waiting',
      wager: 0,
      isPrivate: true,
      moveHistory: [],
    });
  });
  t.after(() => fetchMock.mock.restore());

  await getMatch('room-1', undefined, 'invite token');
  await joinMatch('room-1', 'invite token');

  assert.equal(calls[0]?.input, '/api/matches/room-1?invite=invite%20token');
  assert.equal(calls[1]?.input, '/api/matches/room-1/join');
  const joinHeaders = new Headers(calls[1]?.init?.headers);
  assert.equal(joinHeaders.get('X-Match-Invite'), 'invite token');
  assert.ok(joinHeaders.get('Idempotency-Key'));
});

test('frontend bank presentation treats refund credits as positive incoming funds', () => {
  assert.equal(isCreditTransaction({
    type: 'WITHDRAW_REFUND',
    amount: 12,
  }), true);
  assert.equal(isCreditTransaction({
    type: 'SELL_P2P_REFUND',
    amount: 7,
  }), true);
  assert.equal(getTransactionAccentClass({
    type: 'WITHDRAW_REFUND',
    amount: 12,
  }), 'bg-green-600');
  assert.equal(getTransactionAccentClass({
    type: 'SELL_P2P_REFUND',
    amount: 7,
  }), 'bg-green-600');
});

test('frontend auth service consumes emailed auth tokens with POST requests', async (t) => {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
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

test('frontend auth service sends password login identifiers', async (t) => {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({ status: 'authenticated' });
  });
  t.after(() => fetchMock.mock.restore());

  await loginPassword({ identifier: 'SketchMaster', password: 'paper-lobby-stakes-2026' });

  assert.deepEqual(
    calls.map((entry) => ({ input: entry.input, method: entry.init?.method, body: entry.init?.body })),
    [
      {
        input: '/api/auth/login/password',
        method: 'POST',
        body: JSON.stringify({ identifier: 'SketchMaster', password: 'paper-lobby-stakes-2026' }),
      },
    ],
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

test('frontend auth helper removes only sensitive token query parameters from the current URL', async () => {
  const helperPath = join(process.cwd(), 'src', 'features', 'auth', 'url-token.ts');
  const { scrubSensitiveTokenFromCurrentUrl } = await import(pathToFileURL(helperPath).href);
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const replaceCalls: Array<{ state: unknown; title: string; url?: string | URL | null }> = [];

  (globalThis as typeof globalThis & { window?: unknown }).window = {
    location: {
      href: 'https://app.example.com/auth/reset-password?token=secret-token&email=alice%40example.com#form',
    },
    history: {
      state: { from: 'test' },
      replaceState(state: unknown, title: string, url?: string | URL | null) {
        replaceCalls.push({ state, title, url });
      },
    },
  };

  try {
    scrubSensitiveTokenFromCurrentUrl();
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
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
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
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

test('security page copy uses settings-oriented MFA guidance', () => {
  const pageSource = readFileSync(join('src', 'pages', 'auth', 'SecuritySettingsPage.tsx'), 'utf8');
  const contentSource = readFileSync(join('src', 'pages', 'auth', 'security-page-content.ts'), 'utf8');

  assert.match(contentSource, /Protect your account\./);
  assert.match(contentSource, /Set up your authenticator/);
  assert.match(contentSource, /Recovery codes/);
  assert.match(contentSource, /Active devices/);
  assert.match(contentSource, /Turn off MFA/);
  assert.doesNotMatch(contentSource, /Control access from one place\./);
  assert.doesNotMatch(contentSource, /Device sessions/);
  assert.match(pageSource, /SECURITY_PAGE_COPY/);
});

test('security page auto-start helper only runs when setup is required and idle', async () => {
  const helperPath = join(process.cwd(), 'src', 'pages', 'auth', 'security-page-content.ts');

  assert.equal(existsSync(helperPath), true, 'Expected security page helper module to exist');

  const { shouldAutoStartTotpSetup } = await import(pathToFileURL(helperPath).href);

  assert.equal(shouldAutoStartTotpSetup({
    setupRequested: true,
    mfaEnabled: false,
    hasSetup: false,
    setupBusy: false,
    autoStartAttempted: false,
  }), true);

  assert.equal(shouldAutoStartTotpSetup({
    setupRequested: false,
    mfaEnabled: false,
    hasSetup: false,
    setupBusy: false,
    autoStartAttempted: false,
  }), false);

  assert.equal(shouldAutoStartTotpSetup({
    setupRequested: true,
    mfaEnabled: true,
    hasSetup: false,
    setupBusy: false,
    autoStartAttempted: false,
  }), false);

  assert.equal(shouldAutoStartTotpSetup({
    setupRequested: true,
    mfaEnabled: false,
    hasSetup: true,
    setupBusy: false,
    autoStartAttempted: false,
  }), false);

  assert.equal(shouldAutoStartTotpSetup({
    setupRequested: true,
    mfaEnabled: false,
    hasSetup: false,
    setupBusy: true,
    autoStartAttempted: false,
  }), false);

  assert.equal(shouldAutoStartTotpSetup({
    setupRequested: true,
    mfaEnabled: false,
    hasSetup: false,
    setupBusy: false,
    autoStartAttempted: true,
  }), false);

  assert.equal(shouldAutoStartTotpSetup({
    setupRequested: true,
    mfaEnabled: false,
    hasSetup: false,
    setupBusy: true,
    autoStartAttempted: true,
  }), false);
});

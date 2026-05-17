# Frontend Performance Review

## Scope

Inspected React/Vite source, route entry points, API service usage, roughjs/canvas usage, and Vite build output. Staging browser LCP values came from `staging-performance-results.md`; the follow-up verification in this pass used Playwright route/network smoke tests, not fresh staging LCP recordings.

References used for issue framing:

- React render and commit: https://react.dev/learn/render-and-commit
- React memo: https://react.dev/reference/react/memo
- React useMemo: https://react.dev/reference/react/useMemo
- React useCallback: https://react.dev/reference/react/useCallback
- React Profiler: https://react.dev/reference/react/Profiler
- web.dev performance: https://web.dev/performance/
- Core Web Vitals: https://web.dev/vitals/
- TON Connect requests/responses: https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md

## Route and Bundle Inventory

Routes inspected:

- `/`, auth pages, `/play`, `/leaderboard`, `/bank`, `/profile/:username`, `/game/:roomId`
- Merchant routes: `/merchant`, `/merchant/orders`, `/merchant/deposits`, `/merchant/liquidity`, `/merchant/alerts`

Build output highlights from the post-fix `npm run build`:

- `tonconnect-Bzu3GTk3.js`: 431.57 kB raw, 129.36 kB gzip
- `react-vendor-CXlRCVJL.js`: 424.68 kB raw, 129.34 kB gzip
- `index-BSsmf23s.js`: 87.26 kB raw, 22.95 kB gzip
- `canvas-Pp9lFNoN.js`: 38.51 kB raw, 13.44 kB gzip
- `socket-Baqj61N_.js`: 47.93 kB raw, 15.51 kB gzip
- Route chunks: `DashboardPage` 33.18 kB raw/5.06 kB gzip, `MerchantLayout` 21.79/4.32, `OrderDeskPage` 18.57/3.31, `GamePage` 22.24/4.95, `BankPage` 15.64/3.59, `TonConnectRouteProvider` 0.45/0.32

The app uses route-level splitting and separate TonConnect/socket/canvas chunks. The TonConnect chunk remains large, but it is no longer in the global app shell and is loaded by `/bank` wallet routes instead of `/play` and merchant routes.

## Confirmed Findings

### PERF-FE-001: Dashboard initial load fetched leaderboard unnecessarily

- File: `src/pages/DashboardPage.tsx`
- Component/function: `DashboardPage`, mount effects
- Observed pattern: initial mount fetched active matches and leaderboard together.
- Evidence: source inspection showed `Promise.all([refreshActiveMatches, refreshLeaderboard])`; contract test now asserts this pattern is absent and leaderboard loading waits for `activeTab === 'leaderboard'`.
- Impact: opening `/play` paid for leaderboard API and state update even when the default tab is lobby.
- Reference: React render work should be driven by needed UI state; web.dev recommends reducing unnecessary network and main-thread work.
- Fix applied: initial effect now fetches active matches only. A separate effect fetches leaderboard only when the leaderboard tab becomes active and has not loaded yet.
- Regression risk: leaderboard tab could show stale/empty state if fetch never triggers. Mitigated by contract test and E2E player route smoke test.
- Confidence: High.

### PERF-FE-002: Merchant dashboard polling could duplicate work and rerender children

- File: `src/components/merchant/MerchantLayout.tsx`
- Component/function: `MerchantLayout`, `loadDashboard`, outlet context
- Observed pattern: polling had no in-flight guard, ran while the tab was hidden, and the outlet context object/function was recreated on every render.
- Evidence: source inspection; contract test asserts `dashboardRequestRef`, hidden-tab guard, aborted-load handling, `useMemo`, and `refreshDashboard`; E2E caught an initial abort edge case and the final rerun passed 21/21.
- Impact: repeated `/api/merchant/dashboard` calls can overlap when a request takes longer than the 30 second interval or manual refresh overlaps with a poll. New context identity can cause route child updates after unrelated shell renders.
- Reference: React `useMemo`/`useCallback` are appropriate when stable values prevent meaningful child work; do not apply broadly.
- Fix applied: coalesced live dashboard requests, skipped background-tab polls, memoized `refreshDashboard` and route context, and allowed new initial loads after an aborted request.
- Regression risk: request coalescing can accidentally suppress needed reloads. Mitigated by contract test, focused test, and full E2E.
- Confidence: High.

### PERF-FE-003: TonConnect was loaded by the global app shell

- File: `src/app/AppProviders.tsx`, `src/app/TonConnectRouteProvider.tsx`, `src/app/App.tsx`, `src/components/Navbar.tsx`
- Observed pattern: `tonconnect` is isolated but large: 431.58 kB raw, 129.37 kB gzip.
- Evidence: staging browser profile showed the TonConnect asset on routes that did not use wallet actions. Source inspection showed `TonConnectUIProvider` wrapping the full app and `TonConnectButton` imported by global navigation.
- Impact: if loaded on routes that do not need wallet interaction, it can increase parse/evaluate cost and perceived startup time.
- Reference: web.dev performance guidance recommends reducing and deferring unnecessary JavaScript. The TON Connect spec requires a publicly accessible `tonconnect-manifest.json` and wallet request/response session semantics, so provider placement changes must preserve manifest discovery and wallet session behavior.
- Fix applied: moved `TonConnectUIProvider` into lazy `TonConnectRouteProvider` around `/bank` and removed the global navigation `TonConnectButton`.
- Verification: Playwright confirms `/play` does not request `/assets/tonconnect*.js`; navigating to `/bank` does request the TonConnect chunk. `/bank` render smoke still passes with mocked wallet metadata.
- Regression risk: wallet connect UI is no longer globally visible in the navbar; wallet/deposit surfaces remain on `/bank`.
- Confidence: High for route asset scoping; wallet app connect/decline still needs manual staging verification with a real wallet.

### PERF-FE-006: Cabin Sketch loading was not preloaded selectively

- File: `index.html`, `src/index.css`
- Observed pattern: both Cabin Sketch font files were recurring large assets in staging. `font-display: swap` was already present, but no critical-weight preload existed.
- Fix applied: preloaded only `/fonts/cabin-sketch-700.woff2`, the dominant brand/header weight, and did not preload the 400 weight.
- Verification: frontend contract test asserts `font-display: swap` and the single 700-weight preload.
- Regression risk: low; 400 remains available through CSS and can load on demand.

### PERF-FE-005: TON Connect manifest availability is performance and UX critical

- File: `src/app/AppProviders.tsx`, `server/app.ts`, `public/tonconnect-manifest.json`
- Observed pattern: the frontend defaults `manifestUrl` to `${window.location.origin}/tonconnect-manifest.json`; the backend serves that path with public app origin metadata.
- Evidence: source inspection and TON Connect spec. The spec says the manifest should be at a stable public URL, GET-able by wallets, and accessible without CORS restrictions.
- Impact: if the manifest is unreachable or CORS-blocked in Render/staging, wallet connection can fail or feel slow while wallets retry/fallback.
- Fix direction: add a deployment smoke check for `GET /tonconnect-manifest.json`, `iconUrl`, terms, and privacy links from the public Render hostname. Keep it outside auth/rate limiting.
- Regression risk: changing manifest URL/app URL can affect wallet app identity. No code change applied.
- Confidence: High for checklist value; no local production URL measurement was available.

### PERF-FE-004: roughjs/canvas redraws need browser/React Profiler evidence before changes

- Files: `src/components/SketchyButton.tsx`, `SketchyContainer`, game board drawing helpers, roughjs utility imports
- Observed pattern: roughjs/canvas styling is used heavily in repeated UI components.
- Evidence: source inspection and `canvas-Pp9lFNoN.js` build chunk size.
- Impact: possible main-thread cost during dense merchant/game screens.
- Reference: React Profiler docs recommend measuring commit cost before memoizing or restructuring.
- Fix direction: run React Profiler and Performance recordings on `/play`, `/game/:roomId`, `/merchant/orders`, and `/bank`.
- Regression risk: memoizing indiscriminately can add complexity without reducing user-visible work. No code change applied.
- Confidence: Low until profiled.

## API/Network Findings

- `/play`: fixed one unnecessary initial leaderboard request. Playwright network smoke verifies `/api/matches/active` is fetched initially, `/api/users/leaderboard` is not fetched before tab click, and exactly one leaderboard request occurs after clicking the leaderboard tab.
- `/merchant`: fixed overlapping dashboard request risk and hidden-tab polling.
- Bank/merchant panels: TonConnect JS is deferred away from `/play` and merchant routes; `/bank` remains the wallet route.
- Turnstile widget: frontend appears lazy-route scoped to auth pages; backend timeout fixed separately.
- Google OAuth/Turnstile browser costs should be measured manually on login/register only.

## Frontend Tests

- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts`: passed, 20/20
- `npm run build`: passed
- `npx playwright test tests/e2e/page-smoke.spec.ts`: passed, 15/15 across Chromium, Firefox, and WebKit

# Performance Fix Log

## Fix Plan

Only proven and targeted issues were changed:

1. Remove duplicate/unneeded initial frontend API work.
2. Coalesce duplicate merchant dashboard polling without weakening auth or authorization.
3. Bound external Turnstile latency while preserving fail-closed verification.
4. Add MongoDB indexes that directly match observed query patterns.
5. Add tests that fail before the fixes and pass after.

No security controls were removed or weakened. No money-flow semantics were changed.

## Applied Fixes

### FIX-FE-001: Defer leaderboard fetch on `/play`

- Finding ID: `PERF-FE-001`
- Files changed: `src/pages/DashboardPage.tsx`, `server/middleware/frontend-contracts.test.ts`
- Exact change: removed initial `Promise.all` that fetched active matches and leaderboard together. Added `leaderboardLoaded` state and an effect that fetches leaderboard only when `activeTab === 'leaderboard'`.
- Evidence: source inspection found eager initial request; new contract test verifies the deferred pattern.
- Reference: React render/commit and web.dev performance guidance to avoid unnecessary render/network work.
- Expected impact: less initial `/play` API work and less state churn. Not browser-measured.
- Security/correctness risk: low; leaderboard is public-ish display data and still loads when selected.
- Rollback risk: low; restore the previous initial `refreshLeaderboard` call if needed.
- Tests run: targeted red/green suite, frontend contracts, integration, build, unit, E2E.

### FIX-FE-002: Coalesce merchant dashboard loads and pause hidden-tab polling

- Finding ID: `PERF-FE-002`
- Files changed: `src/components/merchant/MerchantLayout.tsx`, `server/middleware/frontend-contracts.test.ts`
- Exact change: added a tracked dashboard request ref, skipped poll mode while `document.visibilityState === 'hidden'`, awaited an active non-aborted request instead of starting a duplicate, memoized `refreshDashboard`, and memoized outlet context.
- Evidence: source inspection found no in-flight guard/background pause and unstable context. First E2E rerun exposed an aborted-initial-load edge case; fixed by tracking `signal` and ignoring already-aborted active requests.
- Reference: React `useMemo`/`useCallback` docs support stable values when they prevent meaningful child work.
- Expected impact: fewer overlapping `/api/merchant/dashboard` calls and fewer unnecessary child updates. Not browser-measured.
- Security/correctness risk: medium initially because request coalescing can suppress reloads; mitigated by aborted-request fix and E2E.
- Rollback risk: low/medium; revert to non-coalesced loading if unexpected dashboard freshness issues appear.
- Tests run: frontend contract test, full integration, full E2E across Chromium/Firefox/WebKit.

### FIX-BE-001: Bound Turnstile verification latency

- Finding ID: `PERF-BE-001`
- Files changed: `server/services/auth-turnstile.service.ts`, `server/middleware/auth-security.test.ts`
- Exact change: added `TURNSTILE_VERIFY_TIMEOUT_MS = 5_000` and passed `signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS)` to the Cloudflare verification fetch.
- Evidence: fetch call had no explicit timeout; test verifies an `AbortSignal` is sent.
- Reference: Node/Express production guidance supports bounding external dependency behavior; security best practices require keeping verification.
- Expected impact: auth requests fail closed instead of waiting indefinitely on provider stalls.
- Security/correctness risk: low; timeout preserves fail-closed behavior and does not bypass Turnstile.
- Rollback risk: low; remove signal if provider incompatibility appears.
- Tests run: auth security test, integration, build, E2E.

### FIX-DB-001: Add merchant order desk indexes

- Finding ID: `PERF-DB-001`
- Files changed: `server/models/Order.ts`, `server/middleware/merchant-dashboard.test.ts`
- Exact change: added `{ createdAt: -1 }`, `{ type: 1, createdAt: -1 }`, and `{ status: 1, type: 1, createdAt: -1 }`.
- Evidence: order desk filters by `status` and/or `type`, sorts by `createdAt`, and pages results.
- Reference: MongoDB index/query optimization docs.
- Expected impact: fewer scans/sorts for merchant order review. Not measured with live `explain`.
- Security/correctness risk: low; indexes do not alter query semantics.
- Rollback risk: low/medium due index migration/storage; drop indexes if write overhead is unacceptable.
- Tests run: schema index test, integration, build.

### FIX-DB-002: Add admin transaction chronology index

- Finding ID: `PERF-DB-002`
- Files changed: `server/models/Transaction.ts`, `server/middleware/transaction-controller.test.ts`
- Exact change: added `{ createdAt: -1, _id: -1 }`.
- Evidence: admin listing is chronological and bounded.
- Reference: MongoDB index/query optimization docs.
- Expected impact: lower sort cost for admin transaction listing. Not measured with live `explain`.
- Security/correctness risk: low.
- Rollback risk: low/medium due index storage/write overhead.
- Tests run: schema index test, integration, build.

### FIX-DB-003: Add stale withdrawal recovery index

- Finding ID: `PERF-DB-003`
- Files changed: `server/repositories/withdrawal.repository.ts`, `server/middleware/repository-indexes.test.ts`
- Exact change: added `{ status: 1, startedAt: 1 }` to `ensureIndexes()`.
- Evidence: `findStaleProcessing(startedBefore)` filters on `status` and ranges on `startedAt`.
- Reference: MongoDB compound index ordering guidance.
- Expected impact: lower worker scan cost for stuck processing recovery. Not measured with live `explain`.
- Security/correctness risk: low; query semantics unchanged.
- Rollback risk: low/medium due index storage/write overhead.
- Tests run: repository index test, integration.

### FIX-DB-004: Add failed deposit retry indexes

- Finding ID: `PERF-DB-004`
- Files changed: `server/repositories/failed-deposit-ingestion.repository.ts`, `server/middleware/repository-indexes.test.ts`
- Exact change: added `{ status: 1, resolvedAt: 1, 'transferData.transaction_now': 1 }` and `{ status: 1, resolvedAt: 1, failedAt: 1, nextRetryAt: 1, retryCount: 1 }`.
- Evidence: repository retry/pending scans use status/resolved equality with time/range fields.
- Reference: MongoDB compound index ordering guidance.
- Expected impact: lower failed deposit retry/pending scan cost. Not measured with live `explain`.
- Security/correctness risk: low; query semantics unchanged.
- Rollback risk: low/medium due index storage/write overhead.
- Tests run: repository index test, integration.

## Verification Summary

- Targeted red phase failed as expected before fixes: 46/53 passed, 7 failed for the missing performance contracts.
- Targeted green phase passed after fixes: 53/53.
- `npx tsc --project tsconfig.server.json --noEmit`: passed.
- `npx tsc --project tsconfig.json --noEmit`: passed.
- `npm run build`: passed.
- `npm run test:unit`: passed, 132/132.
- `npm run test:integration`: passed, 189/189.
- First `npm run test:e2e`: failed because FIX-FE-002 initially suppressed a replacement initial dashboard load after abort.
- After correcting FIX-FE-002, focused frontend contract test passed 17/17 and final `npm run test:e2e` passed 21/21.

## Post-Staging Follow-up Fixes 2026-05-16

These changes address only the staging-measured gaps in `staging-performance-results.md`.

### FIX-FE-003: Add browser-level `/play` leaderboard lazy-load proof

- Finding: staging still requested `/api/users/leaderboard` on initial `/play`.
- Files changed: `tests/e2e/page-smoke.spec.ts`.
- Exact change: added a Playwright network smoke test that records `/api/*` requests on `/play`, verifies `/api/matches/active` is requested initially, verifies zero `/api/users/leaderboard` requests before the tab click, and verifies exactly one after opening the leaderboard tab.
- Evidence: local source already had the lazy effect; this was likely deploy drift or insufficient browser-level coverage.
- Tests run: frontend contracts, full page-smoke across Chromium/Firefox/WebKit.

### FIX-DB-005: Verify required MongoDB indexes during startup/deploy

- Finding: staging initially lacked the expected order, transaction, withdrawal, and failed-deposit indexes.
- Files changed: `server/lib/setup-db.ts`, `server/scripts/verify-indexes.ts`, `package.json`, `server/middleware/repository-indexes.test.ts`.
- Exact change: `setupIndexes()` now verifies the required index names after creation and throws if any are missing. Added `npm run db:verify-indexes` for staging deploy/manual verification.
- Safety: no destructive index operations; existing `createIndexes()` calls remain additive and verification uses `indexes()` readback.
- Tests run: repository/index tests, integration suite, server TypeScript, build.

### FIX-DB-006: Correct failed-deposit retry index recommendation

- Finding: staging explain showed retry-due query used `status_1_resolvedAt_1_nextRetryAt_1_failedAt_1`; the newer failedAt-first index was redundant for the actual query.
- Files changed: `server/repositories/failed-deposit-ingestion.repository.ts`, `server/middleware/repository-indexes.test.ts`, `performance-review/database-performance.md`.
- Exact change: exposed `FailedDepositIngestionRepository.collectionName = 'failed_deposit_ingestions'`, kept the retry index ordered as `{ status, resolvedAt, nextRetryAt, failedAt }`, removed the failedAt-first retry index, and corrected docs to use `failed_deposit_ingestions`.
- Tests run: repository/index tests and integration suite.

### FIX-FE-004: Defer TonConnect JS away from non-wallet routes and preload only critical font weight

- Finding: staging LCP remained high on `/play`, `/merchant/orders`, and redirected `/game`; TonConnect and Cabin Sketch were recurring large assets.
- Files changed: `src/app/AppProviders.tsx`, `src/app/TonConnectRouteProvider.tsx`, `src/app/App.tsx`, `src/components/Navbar.tsx`, `index.html`, `server/middleware/frontend-contracts.test.ts`, `tests/e2e/page-smoke.spec.ts`.
- Exact change: moved `TonConnectUIProvider` into a lazy `/bank` route provider, removed the global navbar `TonConnectButton`, and preloaded only `/fonts/cabin-sketch-700.woff2`.
- Safety: wallet/deposit UI remains on `/bank`; manifest URL logic is unchanged inside the route provider.
- Tests run: frontend contracts, build, page-smoke across Chromium/Firefox/WebKit.

### FIX-OBS-001: Add Render-side dependency timing visibility

- Finding: workstation Redis timings were WAN measurements and Render-side dependency timing was missing.
- Files changed: `server/services/metrics.service.ts`, `server/services/redis.service.ts`, `server/app.ts`, `server/services/auth-turnstile.service.ts`, `server/services/deposit-ingestion.service.ts`, `server/services/withdrawal-engine.ts`, `server/middleware/logging-and-schemas.test.ts`, `server/middleware/app-health.test.ts`.
- Exact change: added Redis, external-provider, and readiness dependency duration histograms. `/api/health/ready` includes dependency timing details outside production and records timing metrics in all environments; production response still redacts detailed internals.
- Safety: metric labels contain only dependency/provider/operation/outcome names and no tokens, cookies, wallet proofs, BOCs, wallet addresses, or transaction hashes.
- Tests run: logging/schema tests, app-health tests, unit, integration.

## Post-Staging Verification Summary

- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts`: passed, 20/20.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/repository-indexes.test.ts`: passed, 4/4.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/logging-and-schemas.test.ts`: passed, 9/9.
- `npx tsc --project tsconfig.server.json --noEmit`: passed.
- `npx tsc --project tsconfig.json --noEmit`: first run timed out, retry passed.
- `npm run build`: passed.
- `npm run test:unit`: passed, 138/138.
- `npm run test:integration`: passed, 201/201.
- `npx playwright test tests/e2e/page-smoke.spec.ts`: passed, 15/15.

Staging was not redeployed from this workspace, so live staging LCP/explain measurements still need to be repeated after deploy.

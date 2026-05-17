# Performance Diagnosis Report

## 1. Executive Summary

Top confirmed bottlenecks:

1. `DashboardPage` fetched active matches and leaderboard together on initial lobby load. Evidence: source inspection showed `Promise.all([refreshActiveMatches, refreshLeaderboard])` on mount; fixed and guarded by `frontend-contracts.test.ts`.
2. `MerchantLayout` polled the shared merchant dashboard without an in-flight guard or background-tab pause, and recreated outlet context every render. Evidence: source inspection and new contract test; fixed with request coalescing, visibility pause, and memoized context.
3. Cloudflare Turnstile verification had no explicit outbound timeout. Evidence: `auth-turnstile.service.ts` fetch call had no `signal`; fixed with `AbortSignal.timeout(5000)` while preserving fail-closed behavior.
4. Merchant order desk query patterns sort by `createdAt` with optional `type` and `status` filters, but `Order` lacked matching compound indexes for `{}`, `{ type }`, and `{ status, type }`. Evidence: `MerchantDashboardService.getOrderDesk` query/sort and `Order.schema.indexes()`; fixed with schema indexes and tests.
5. Recovery and retry workers had query/index mismatches for stale withdrawals and failed deposit retry/pending-time scans. Evidence: repository query patterns and `ensureIndexes()`; fixed with equality-first supporting indexes.

Top fixes applied:

1. Deferred leaderboard fetch until the leaderboard tab is opened.
2. Coalesced merchant dashboard loads, skipped polling in hidden tabs, memoized merchant route context, and fixed the aborted-initial-load edge case found by E2E.
3. Added a 5 second Cloudflare Turnstile verification timeout.
4. Added targeted MongoDB indexes for order desk, admin transaction chronology, stale withdrawal recovery, and failed deposit retry scans.
5. Added regression tests that prove the performance contracts and index declarations.

Top remaining recommendations:

1. Deploy the post-staging fixes and repeat `/play`, `/merchant/orders`, and redirected `/game` browser measurements on staging.
2. Run `npm run db:verify-indexes` during staging verification and repeat MongoDB `explain` commands against the real `failed_deposit_ingestions` collection.
3. Review Render-side metrics/logs for route p95, Redis, MongoDB, readiness dependencies, Turnstile, Toncenter, and wallet RPC.
4. Move non-critical email and Telegram notifications out of synchronous request paths where product semantics allow.
5. Manually verify wallet connect/deposit behavior with a real wallet after TonConnect was moved to `/bank` route scope.

Whether the app is faster: Partially measured on staging before this follow-up. Local browser smoke now verifies the `/play` lazy-load behavior and TonConnect route scoping, but live staging LCP and `explain` measurements still need to be repeated after deploy.

Biggest remaining risks: staging has not yet been redeployed/reprofiled with these follow-up changes, Render logs were not available from this workspace, hidden-tab polling and wallet app connect/decline need manual browser verification, and several external provider latencies can still block request paths.

## 1.1 Staging Measurements 2026-05-16

Results are recorded in `performance-review/staging-performance-results.md`.

Measured results:

- MongoDB `explain("executionStats")` was run against the staging test database. Before intervention, the new order, transaction, withdrawal, and failed-deposit indexes were missing. Because this was a test database, the expected indexes were created and explains were rerun.
- After index creation, order chronology/type/status+type queries, admin transaction chronology, and stale withdrawal recovery used the expected indexes with no in-memory sort.
- The exact failed-deposit commands from `database-performance.md` did not target the real collection. The repository collection is `failed_deposit_ingestions`, not `faileddepositingestions`.
- On the real failed-deposit collection, the pending transaction-time query used the new equality-first index, but the retry-due query still chose the older `status_1_resolvedAt_1_nextRetryAt_1_failedAt_1` index.
- Authenticated staging route timing from this workstation showed p50/p95: `/api/matches/active` 537/1973 ms, `/api/transactions` 950/1025 ms, `/api/admin/merchant/dashboard` 662/1534 ms, `/api/admin/merchant/orders` 836/1262 ms, `/api/health/ready` 408/970 ms.
- Redis direct WAN latency from this workstation was high: `PING` p50 429 ms and p95 3414 ms.
- Browser profiling showed high LCP on `/play` 8840 ms, `/merchant/orders` 9504 ms, and redirected `/game/c3448c` 9992 ms. Fonts and the globally loaded TonConnect chunk were recurring large assets.
- `/play` failed the lazy-loading verification: initial `/play` load made one `/api/users/leaderboard` request before the leaderboard tab was clicked.
- Merchant rapid refresh coalescing verified: 5 rapid refresh clicks created only one additional `/api/admin/merchant/dashboard` request after the initial dashboard request.
- Hidden-tab merchant polling could not be verified in headless Chromium because `document.visibilityState` stayed `visible`.
- `/tonconnect-manifest.json` was public and returned 200 with p50 359 ms and p95 521 ms.
- Invalid Turnstile requests failed closed with `TURNSTILE_FAILED`; provider-stall timeout behavior was not directly simulated.

## 1.2 Post-Staging Follow-up 2026-05-16

Follow-up changes made after the staging measurements:

- Added browser-level route smoke coverage proving `/play` fetches active matches initially, does not fetch `/api/users/leaderboard` before tab click, and fetches it exactly once after opening the leaderboard tab.
- Added startup/deploy verification for required MongoDB indexes in `setupIndexes()` and a staging command, `npm run db:verify-indexes`.
- Corrected failed-deposit collection naming from `faileddepositingestions` to `failed_deposit_ingestions` in the explain guidance and aligned the retained retry index with the actual winning query/index: `status_1_resolvedAt_1_nextRetryAt_1_failedAt_1`.
- Deferred TonConnect JavaScript away from `/play`, `/merchant/orders`, and redirected `/game` by moving `TonConnectUIProvider` into lazy `/bank` route scope. The TonConnect manifest URL logic remains unchanged for wallet routes.
- Added a selective preload for the critical Cabin Sketch 700 weight while keeping `font-display: swap`.
- Added Redis, external provider, and readiness dependency duration metrics for Render-side visibility. Existing request and MongoDB repository histograms remain in place.

Local verification after these changes:

- `npm run build`: passed.
- `npm run test:unit`: passed, 138/138.
- `npm run test:integration`: passed, 201/201.
- `npx playwright test tests/e2e/page-smoke.spec.ts`: passed, 15/15 across Chromium, Firefox, and WebKit.
- `npx tsc --project tsconfig.server.json --noEmit`: passed.
- `npx tsc --project tsconfig.json --noEmit`: passed on retry after an earlier timeout.

Staging was not redeployed or remeasured from this workspace. Production readiness still depends on repeating the staging browser measurements, Render-side logs/metrics review, and MongoDB explains after deploy.

## 2. Scope and Environment

Environment:

- Workspace: `C:\Users\Sten.DESKTOP-JT1I9N4\OneDrive\Desktop\4realmain`
- Local shell: PowerShell
- Node: `v24.15.0`
- npm: `11.14.0`
- Package manager: npm, `package-lock.json`
- Frontend: React 19, Vite 6, TypeScript, roughjs, TonConnect UI
- Backend: Express 5, Node.js, Mongoose, Socket.IO, Redis/ioredis/BullMQ
- Database access: no live MongoDB used for `explain`; code/index analysis only
- Redis access: no live Redis latency measurement; code/config analysis only
- Browser profiling: Chrome DevTools MCP was not used; no LCP/CLS/INP metrics were fabricated

Prior report constraints carried forward:

- Single-instance Render is the safe default unless distributed mode is explicitly enabled and tested.
- Redis internal URL behavior, readiness behavior, auth/session protections, money-flow protections, Cloudflare Turnstile, Google OAuth, and TON/wallet verification must not be weakened for speed.
- Previously fixed high-severity money/session/readiness work in the current working tree was treated as existing scope and was not reverted.
- There were many pre-existing modified files before this pass; this report only claims the targeted performance edits listed in `fix-log.md`.

## 3. Architecture Performance Map

Frontend route map:

- Public/auth routes: `/`, `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/magic-link`, `/auth/approve-login`, `/auth/verified`
- Authenticated player routes: `/play`, `/leaderboard`, `/bank`, `/profile/:username`, `/game/:roomId`
- Merchant/admin routes: `/merchant`, `/merchant/orders`, `/merchant/deposits`, `/merchant/liquidity`, `/merchant/alerts`
- Route-level lazy loading exists for most major pages. Build artifacts confirm separate chunks for `DashboardPage`, `BankPage`, merchant pages, `GamePage`, `socket`, `canvas`, and `tonconnect`.

Backend route map:

- Auth: password login, register, verification, magic-link, OAuth, MFA, session/logout/revoke
- Game/match: active matches, match create/join, room state, Socket.IO realtime
- Bank/transactions: user transaction feed, admin transaction listing, deposits, withdrawals
- Merchant: dashboard, order desk, deposit reconciliation, liquidity/alerts
- Health/ops: health, liveness, readiness, optional metrics

Database map:

- Core models: `User`, `AuthSession`, `Match`, `Order`, `Transaction`
- Repository collections: deposit memos, failed deposit ingestion, withdrawals, idempotency/mutation records
- Hot query families: auth/session lookup, match lists/history, transaction feed, merchant order desk, dashboard aggregations, failed deposit retry, withdrawal recovery.

Redis/cache map:

- Session/token state, rate limiting, OAuth/MFA state, distributed locks, optional BullMQ, Socket.IO adapter, cached leaderboard/active match slices, merchant dashboard cache invalidation.

External integration map:

- Cloudflare Turnstile verification during protected auth flows.
- Google OAuth token/profile exchange.
- Gmail/email notifications.
- Toncenter polling and wallet RPC for deposit/withdrawal/merchant liquidity flows.
- TON Connect UI in the frontend, including public manifest discovery, wallet connect events, optional `ton_proof`, and `sendTransaction` deposits.

## 4. Findings Table

| ID | Severity | Area | File | Issue | Evidence | Fix | Status | Measured or expected impact |
|---|---|---|---|---|---|---|---|---|
| PERF-FE-001 | Medium | Frontend/API | `src/pages/DashboardPage.tsx` | Lobby mount fetched leaderboard before user opened leaderboard tab | Source inspection and contract test | Deferred leaderboard fetch until `activeTab === 'leaderboard'` | Fixed | Expected lower initial `/play` API work |
| PERF-FE-002 | Medium | Frontend/API | `src/components/merchant/MerchantLayout.tsx` | Merchant dashboard polls could overlap and run in hidden tabs; context recreated each render | Source inspection, tests, E2E regression/fix | Coalesced live requests, skipped hidden-tab polls, memoized context, handled aborted initial loads | Fixed | Expected lower duplicate dashboard API work and fewer child rerenders |
| PERF-BE-001 | Medium | External API | `server/services/auth-turnstile.service.ts` | Turnstile verification lacked explicit timeout | Source inspection | Added 5s `AbortSignal.timeout` | Fixed | Expected bounded auth latency on provider stalls |
| PERF-DB-001 | High | MongoDB | `server/models/Order.ts` | Merchant order desk sort/filter combinations lacked matching indexes | Query/index inspection | Added `{createdAt}`, `{type, createdAt}`, `{status, type, createdAt}` indexes | Fixed | Expected lower order desk scan/sort cost |
| PERF-DB-002 | Medium | MongoDB | `server/models/Transaction.ts` | Admin chronological transaction listing lacked createdAt-only sort index | Query/index inspection | Added `{createdAt:-1,_id:-1}` | Fixed | Expected lower admin listing sort cost |
| PERF-DB-003 | Medium | MongoDB | `server/repositories/withdrawal.repository.ts` | Stale processing recovery scans by `status` and `startedAt` without matching index | Repository inspection | Added `{status:1, startedAt:1}` | Fixed | Expected lower recovery scan cost |
| PERF-DB-004 | Medium | MongoDB | `server/repositories/failed-deposit-ingestion.repository.ts` | Failed deposit retry/pending-time scans had less selective index order | Repository inspection | Added equality-first supporting indexes | Fixed | Expected lower retry worker scan cost |
| PERF-BE-002 | High | Backend/API | `server/controllers/transaction.controller.ts`, transaction service | Unified feed fetches bounded pages from multiple sources and merges in memory | Source inspection | Documented only | Open | Potential latency grows with page number |
| PERF-BE-003 | Medium | Backend/API | auth/order/user notification flows | Some email/Telegram calls are awaited in request paths | Source inspection; tests log delivery fallback | Documented only | Open | Provider latency can affect perceived speed |
| PERF-FE-003 | Medium | Bundle/loading | Vite build output | `tonconnect` and `react-vendor` chunks are each about 129 kB gzip | Build output | Documented manual profiling | Open | Needs route-level browser measurement before changing provider placement |
| PERF-FE-005 | Medium | TON Connect | `src/app/AppProviders.tsx`, `server/app.ts` | Wallet connect depends on a public manifest and protocol session behavior | TON Connect spec and source inspection | Documented smoke checks/observability | Open | Prevents wallet-connect failures that appear as slowness |
| PERF-FE-004 | Low/Medium | Rendering | roughjs/Sketchy components | roughjs/canvas draw helpers can redraw with component churn | Source inspection | Documented manual profiling | Open | Needs React Profiler/Performance evidence |
| PERF-REDIS-001 | Medium | Redis | Redis/BullMQ/session/cache code | Redis latency and retry behavior can affect hot request paths | Source inspection | Documented observability/caching plan | Open | Needs staging latency data |
| PERF-OBS-001 | Medium | Observability | cross-cutting | No dependency-level timing for DB/Redis/external calls, no frontend Web Vitals reporting | Source inspection | Documented plan | Open | Makes future slowness harder to localize |

## 5. Applied Fixes

See `fix-log.md` for full detail. Applied files:

- `src/pages/DashboardPage.tsx`
- `src/components/merchant/MerchantLayout.tsx`
- `server/services/auth-turnstile.service.ts`
- `server/models/Order.ts`
- `server/models/Transaction.ts`
- `server/repositories/withdrawal.repository.ts`
- `server/repositories/failed-deposit-ingestion.repository.ts`
- Tests: `server/middleware/frontend-contracts.test.ts`, `server/middleware/auth-security.test.ts`, `server/middleware/merchant-dashboard.test.ts`, `server/middleware/transaction-controller.test.ts`, `server/middleware/repository-indexes.test.ts`

## 6. Backend Route Performance Map

Detailed backend route map is in `backend-performance.md`.

## 7. Frontend Performance Map

Detailed frontend route/render/bundle/API findings are in `frontend-performance.md`.

## 8. Database Performance Map

Detailed MongoDB query/index findings and staging `explain` commands are in `database-performance.md`.

## 9. Redis/Cache Performance Map

Detailed Redis/cache/session/rate-limit findings are in `cache-redis-performance.md`.

## 10. Manual Profiling Checklist

Manual Chrome DevTools, React Profiler, Lighthouse, and Web Vitals steps are in `manual-profiling-checklist.md`.

## 11. Observability Plan

Logging, tracing, metrics, Web Vitals, route timing, and slow-query plan are in `observability-plan.md`.

## 12. Commands Run

Full command history and outcomes are in `commands-run.md`.

Key verification:

- `npx tsc --project tsconfig.server.json --noEmit`: passed
- `npx tsc --project tsconfig.json --noEmit`: passed
- `npm run build`: passed
- `npm run test:unit`: passed, 138/138 in the post-staging follow-up
- `npm run test:integration`: passed, 201/201 in the post-staging follow-up
- `npx playwright test tests/e2e/page-smoke.spec.ts`: passed, 15/15 across Chromium, Firefox, and WebKit
- `git diff --check`: passed with CRLF warnings only
- `npm run lint`: timed out after 304s with no output; direct TypeScript project checks were used as fallback
- TON Connect requests/responses spec reviewed and added to frontend/backend/observability follow-up notes: https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md

## 13. Remaining Risks and Follow-up Checklist

MongoDB explain examples:

```javascript
db.orders.find({}).sort({ createdAt: -1 }).limit(25).explain("executionStats")
db.orders.find({ type: "BUY" }).sort({ createdAt: -1 }).limit(25).explain("executionStats")
db.orders.find({ status: "PENDING", type: "SELL" }).sort({ createdAt: -1 }).limit(25).explain("executionStats")
db.transactions.find({}).sort({ createdAt: -1, _id: -1 }).limit(50).explain("executionStats")
db.withdrawals.find({ status: "processing", startedAt: { $lte: ISODate("2026-05-16T00:00:00.000Z") } }).explain("executionStats")
db.failed_deposit_ingestions.find({ status: "pending", resolvedAt: null }).sort({ "transferData.transaction_now": 1 }).limit(100).explain("executionStats")
db.failed_deposit_ingestions.find({ status: "pending", resolvedAt: null, retryCount: { $lt: 5 }, nextRetryAt: { $lte: new Date() } }).sort({ failedAt: 1 }).limit(100).explain("executionStats")
```

React Profiler:

- Profile `/play`, `/leaderboard`, `/merchant`, `/merchant/orders`, `/bank`, and `/game/:roomId`.
- Verify merchant dashboard refresh updates do not commit unrelated route trees repeatedly.
- Verify roughjs-heavy UI interactions do not produce expensive repeated commits.

Chrome DevTools profiling:

- Run the exact route checklist in `manual-profiling-checklist.md`.
- Record LCP/CLS/INP manually; no browser metrics were collected by this pass.

Backend load testing:

- Run staging-only load tests against `/api/matches/active`, `/api/transactions`, `/api/merchant/dashboard`, `/api/merchant/orders`, `/api/health/ready`.
- Track p50/p95/p99 route latency, DB duration, Redis duration, external API duration, error rate, and memory.

Render staging checks:

- Confirm internal Redis URL, readiness behavior, single-instance mode, health checks, and build/start command match the prior production-readiness reports.
- Watch logs for slow route, external API timeout, and worker recovery events after deploy.

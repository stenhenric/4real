# Latency and Performance Report

Generated: 2026-05-16

## Findings

### PERF-001: Unified transaction feed overfetches per page depth

- Severity: High
- File: `server/services/transaction.service.ts`
- Function: `TransactionService.getUnifiedTransactionsByUser`
- Evidence: `fetchLimit = normalizedPage * normalizedPageSize`, then ledger transactions, deposits, and withdrawals are fetched to that same limit, merged in memory, sorted, and sliced. Page 100 at page size 100 can request up to 10,000 rows from each source before returning 100 rows.
- Impact: latency and memory grow with page depth and number of transaction sources.
- Safe fix direction: use a persisted ledger/read model or keyset cursors per source with a stable merge cursor. This is a correctness-sensitive money history change, so it was documented but not changed in this pass.
- Reference: MongoDB query optimization and index guidance: https://www.mongodb.com/docs/manual/core/query-optimization/
- Tests needed: feed ordering, cursor pagination, deposit/withdrawal/ledger interleaving, and no missing/duplicate rows across page boundaries.
- Confidence: High.

### PERF-002: Merchant dashboard cold cache can perform unbounded pending-order work

- Severity: Medium
- File: `server/services/merchant-dashboard.service.ts`
- Function: `MerchantDashboardService.getDashboard`
- Evidence: dashboard calls `fetchOrders({ filter: { status: 'PENDING' } })` without page or limit, then computes risk/summaries/action queue in memory.
- Impact: cold-cache merchant dashboard latency grows with pending order count; risk evaluation also triggers user stats aggregation for all fetched user IDs.
- Safe fix direction: split count/volume/action-queue queries, aggregate pending totals in MongoDB, and fetch only the action queue slice for detailed risk display.
- Reference: MongoDB performance analysis: https://www.mongodb.com/docs/manual/administration/analyzing-mongodb-performance/
- Tests needed: dashboard summary parity, action queue ordering, high-risk count correctness.
- Confidence: High.

### PERF-003: Request paths still await non-critical notification delivery

- Severity: Medium
- Files: `server/controllers/order.controller.ts`, `server/controllers/transaction.controller.ts`
- Evidence: order creation/finalization and withdrawal request call `ProductEmailNotificationService` after committing state, before sending the response.
- Impact: Gmail/provider latency can delay completed DB mutations from returning to users.
- Safe fix direction: move non-critical notifications to a background queue with audit/retry semantics; keep security-critical auth email semantics intact.
- Reference: Express production performance guidance recommends avoiding blocking work in request handlers: https://expressjs.com/en/advanced/best-practice-performance.html
- Tests needed: response succeeds when notification enqueue fails safely, notification job receives expected redacted payload, no duplicate sends on idempotency replay.
- Confidence: Medium.

### PERF-004: TonConnect and React vendor chunks remain large startup candidates

- Severity: Medium
- Files: `src/app/AppProviders.tsx`, `src/components/Navbar.tsx`, Vite build output
- Evidence from prior performance run: TonConnect and React vendor chunks were each about 129 kB gzip. TonConnect provider wraps the app globally.
- Impact: parse/evaluate cost may affect routes that do not need wallet actions.
- Safe fix direction: profile route load before moving provider placement. Wallet connect/deposit must still work with the stable manifest and session behavior.
- Reference: web.dev performance guidance: https://web.dev/performance/
- Tests needed: browser route waterfall, wallet connect/deposit smoke after any provider placement change.
- Confidence: Medium.

### PERF-005: Redis and external provider latency lacks per-dependency timing

- Severity: Medium
- Files: Redis/session/cache/rate-limit services and external provider services
- Evidence: Redis is used across sessions, rate limiting, OAuth/MFA, cache, locks, queues, and Socket.IO; external providers include Turnstile, Google OAuth, Gmail, Toncenter, Telegram, and wallet RPC.
- Impact: route logs can show slowness without identifying which dependency caused it.
- Safe fix direction: add low-cardinality timing around high-level dependency helpers, not verbose raw command logging.
- Reference: Redis latency guidance: https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/
- Tests needed: logger emits bounded labels, no secrets in timing metadata.
- Confidence: Medium.

### PERF-006: Readiness and merchant admin route show cold/slow-path latency

- Severity: Medium
- Files: `server/routes/health.routes.ts`, merchant dashboard route stack and `tests/e2e/merchant.spec.ts`
- Evidence: first `/api/health/ready` request timed out at 30s, while retry returned `200` in about 3.96s. WebKit E2E repeatedly timed out waiting for the merchant admin dashboard heading, but a manual WebKit harness script rendered the dashboard after about 12s.
- Impact: production health checks and browser flows can fail under cold or slow dependency paths even when the eventual result is correct.
- Safe fix direction: instrument readiness sub-check durations and merchant dashboard dependency timings, then separate mandatory readiness from expensive diagnostics. For the merchant dashboard, reduce cold-cache work before broadening test timeouts.
- References: Express production performance guidance: https://expressjs.com/en/advanced/best-practice-performance.html and OpenTelemetry guidance: https://opentelemetry.io/docs/
- Tests needed: readiness timeout behavior, merchant dashboard API timing budget, and E2E assertion that waits on the route's stable API response rather than only a short heading timeout.
- Confidence: Medium.
- Current status: E2E synchronization was fixed and final E2E passed 24/24. The cold-path instrumentation recommendation remains open.

## Build Size Observations

Final `npm run build` passed. Largest notable chunks remained:

- TonConnect chunk: about 431 kB raw / 129 kB gzip.
- React vendor chunk: about 425 kB raw / 129 kB gzip.
- Main index chunk: about 88 kB raw / 23 kB gzip.

No provider-placement change was made because wallet/session behavior is sensitive and needs route waterfall evidence before changing.

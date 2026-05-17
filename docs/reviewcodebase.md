# Codebase Review Report

## 1. Executive Summary

This repository shows solid effort around backend test coverage, schema validation, and money-flow accounting, but it is not production-ready in its current state. I found 15 meaningful issues: 0 Critical, 5 High, 9 Medium, and 1 Low.

The riskiest areas are deposit replay/reconciliation, withdrawal recovery, merchant SELL-order execution, multi-instance production topology, and readiness/reporting of background-job health.

Top 5 issues to fix first:
- ISSUE-001: Replayed deposits are judged against wall-clock memo expiry instead of the transfer event time.
- ISSUE-002: Stuck withdrawals have no supported terminal resolution path after user funds are already held.
- ISSUE-003: SELL-order payout details are dropped from serialized/admin responses, breaking merchant execution context.
- ISSUE-004: Production defaults still assume a single-process deployment for workers, wallet sending, sockets, and room state.
- ISSUE-005: `/api/health/ready` can report ready after withdrawal/background-job initialization has already failed.

High-severity fix pass update: ISSUE-001 through ISSUE-005 are now fixed in the local working tree and covered by targeted regression tests. Remaining production readiness is still limited by lower-priority open findings and broad-suite failures documented below.

Production-ready: No

The application can build and many happy-path tests pass, but the current code still has high-severity money-movement recovery gaps, unsafe horizontal-scaling defaults, misleading readiness signaling, incomplete merchant SELL execution contracts, and multiple failing verification suites. Those are production blockers, not polish items.

## 2. Review Method

The review followed the requested read-only audit flow:
- Mapped the repository structure, scripts, entry points, route trees, and major flows from `package.json`, `main.ts`, `server/runtime.ts`, `server/app.ts`, `server/routes/*.ts`, `src/app/App.tsx`, and related service/config files.
- Used four read-only subagents for non-overlapping scopes:
  - Frontend routes/pages/state/API integration
  - Backend auth/session/security
  - Backend domain/data/payment flows
  - Runtime/config/deployment/production readiness
- Independently re-checked subagent findings before including them. One proposed finding about a tracked `.env` file was rejected because `git ls-files .env .env.example` showed only `.env.example` is tracked.
- Traced major flows end-to-end through frontend handlers, API clients, routes, controllers, services, repositories/models, and tests.
- Ran safe verification commands only.

Commands run and verified:
- Repository mapping and route enumeration with `Get-ChildItem`, `rg --files`, and `rg -n`.
- `git rev-parse --is-inside-work-tree`
- `git status --short`
- `git ls-files .env .env.example`
- `node -v`
- `npm audit --omit=dev --json`
- `npm run lint` (timed out twice)
- `npx tsc --project tsconfig.server.json --noEmit`
- `npx tsc --project tsconfig.json --noEmit`
- `npm run test:unit`
- `npm run test:integration`
- `npm run build`
- `npm run test:e2e`
- A targeted Firefox Playwright harness repro to try to localize the protected-route runtime error

Verified by code inspection:
- Route protection and auth/session flows
- Merchant BUY/SELL order flow contracts
- Deposit memo lifecycle and replay logic
- Withdrawal queue/send/confirm/stuck handling
- Readiness, health, metrics, proxy, and deployment assumptions
- Frontend protected-route behavior and state bootstrap

Verified by tests/build/typecheck:
- Both TypeScript projects compile directly with `npx tsc ... --noEmit`
- Production build succeeds
- Unit and integration suites run, but both fail
- E2E suite runs, but Firefox player-route smoke fails

Could not be fully verified:
- Real Google OAuth, Gmail delivery, Cloudflare Turnstile, Redis HA/persistence, Mongo deployment behavior, Toncenter/TON chain behavior, or actual Render/proxy topology
- Real multi-instance deployment behavior outside the code assumptions and tests

## 3. Scope Reviewed

Folders reviewed:
- `src/`
- `server/`
- `shared/`
- `tests/e2e/`
- `scripts/`
- root config/docs files relevant to runtime and verification

Important files reviewed:
- `package.json`
- `main.ts`
- `playwright.config.ts`
- `tsconfig.json`
- `tsconfig.server.json`
- `.env.example`
- `server/runtime.ts`
- `server/app.ts`
- `server/config/env.ts`
- `server/routes/*.ts`
- `server/controllers/*.ts`
- `server/services/auth-*.ts`
- `server/services/{order,transaction,match,deposit-ingestion,withdrawal-*.ts}`
- `server/repositories/{deposit,deposit-memo,withdrawal}.repository.ts`
- `server/serializers/api.ts`
- `src/app/{App,AppLayout,AuthProvider}.tsx`
- `src/components/Navbar.tsx`
- `src/pages/{DashboardPage,BankPage,GamePage,ProfilePage}.tsx`
- `src/pages/auth/*.tsx`
- `src/features/bank/MerchantPanel.tsx`

Frontend routes reviewed:
- `/`
- `/privacy`
- `/terms`
- `/auth`
- `/auth/login`
- `/auth/register`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/verify-email`
- `/auth/magic-link`
- `/auth/approve-login`
- `/auth/verified`
- `/auth/mfa`
- `/auth/complete-profile`
- `/auth/security`
- `/merchant`
- `/merchant/orders`
- `/merchant/deposits`
- `/merchant/liquidity`
- `/merchant/alerts`
- `/play`
- `/leaderboard`
- `/bank`
- `/game/:roomId`
- `/profile/:userId`

Backend endpoints reviewed:
- `/api/health`
- `/api/health/live`
- `/api/health/ready`
- `/api/metrics`
- `/api/auth/*`
- `/api/users/*`
- `/api/matches/*`
- `/api/orders/*`
- `/api/transactions/*`
- `/api/admin/merchant/*`

Database models reviewed:
- `server/models/User.ts`
- `server/models/AuthSession.ts`
- `server/models/OneTimeToken.ts`
- `server/models/Order.ts`
- `server/models/Transaction.ts`
- `server/models/Match.ts`
- `server/models/MerchantConfig.ts`

Config/env files reviewed:
- `.env.example`
- `.gitignore`
- `tsconfig.json`
- `tsconfig.server.json`
- `playwright.config.ts`
- `vite.config.ts`
- `server/config/{env,cors,cookies,db}.ts`

Tests reviewed:
- `server/config/env.test.ts`
- `server/services/*.test.ts`
- `server/middleware/*.test.ts`
- `tests/e2e/auth.spec.ts`
- `tests/e2e/merchant.spec.ts`
- `tests/e2e/match.spec.ts`
- `tests/e2e/page-smoke.spec.ts`

Flows traced:
- Registration
- Password login
- Session bootstrap and refresh
- Logout
- Email verification
- Magic-link login
- MFA setup/challenge/recovery-code flows
- Protected-route access
- Public match creation/join/resign
- BUY/SELL merchant orders
- Deposit memo generation and deposit replay
- Withdrawal queue/send/confirm flow
- Merchant dashboard/deposit reconciliation flow

Areas not reviewed and why:
- `node_modules/`, `dist/`, `.generated/`, and `.worktrees/`: generated/vendor content, not source of truth
- Real external service dashboards and live infrastructure: not available from the local repository
- A complete line-by-line review of every static/legal page: low risk relative to the core product/runtime surfaces

## 4. Architecture Overview

Frontend architecture:
- Vite + React 19 SPA using `react-router-dom`
- Route protection is handled by `ProtectedRoute`, `PublicOnlyRoute`, and `AuthProvider`
- Shared authenticated shell renders `Navbar`, which also mounts `TonConnectButton`
- Fetch-based API layer in `src/services/api/apiClient.ts` retries 401s with `/api/auth/refresh`

Backend architecture:
- Express app created in `server/app.ts`, bootstrapped by `server/runtime.ts`
- HTTP routes are grouped by auth, users, matches, orders, transactions, and admin/merchant
- Controllers are thin; most logic lives in services and repositories
- Socket.IO is used for realtime match play, optionally scaled via Redis adapter

API structure:
- Cookie-based auth/session model
- JSON endpoints for most routes, multipart form upload for BUY order proof submission
- Health and metrics endpoints are mounted directly in `server/app.ts`

Database structure:
- Mongoose models for users, auth sessions, orders, matches, transactions, merchant config, and one-time tokens
- Raw Mongo collections/repositories for deposits, deposit memos, withdrawals, processed transaction hashes, unmatched deposits, poller state, idempotency keys, and locks
- Money movements use a mix of domain documents plus `user_balances`

Auth/session architecture:
- Access and refresh cookies
- Mongo-backed session records plus Redis-backed access-token state and replay detection
- MFA setup/challenges use Redis; recovery-code hashes live on the user model
- Google OAuth uses browser-bound state cookies plus Redis state/nonce records

External services:
- Redis
- MongoDB
- Socket.IO + Redis adapter
- BullMQ
- Cloudflare Turnstile
- Google OAuth / Gmail API
- TON / Toncenter

Deployment assumptions:
- A single Node process can host HTTP, Socket.IO, and background job scheduling
- The production start path is `node ./dist/server/main.js`
- Multi-instance safety depends on feature flags that are off by default in `.env.example`

## 5. Issue Severity Definitions

Critical:
Can break production, expose sensitive data, bypass auth, lose money/data, corrupt data, or block core flows.

High:
Serious bug/security/logic issue affecting important features or production reliability.

Medium:
Important quality, reliability, maintainability, security-hardening, or UX issue that should be fixed soon.

Low:
Cleanup, consistency, minor UX, documentation, non-critical test gap, or maintainability issue.

## 6. Findings

### ISSUE-001: Replayed deposits use wall-clock memo expiry instead of the transfer event time

**Severity:** High

**Category:** Database

**Status:** Fixed in high-severity pass

**Location:**
- File: `server/services/deposit-ingestion.service.ts`
- Function/component/route: `resolveMemoStatus`, `buildTransferPreview`, `replayDepositWindow`
- Lines: `136-155`, `369`, `771-806`

**What I found:**
Deposit replay logic decides whether a memo is still valid by comparing `expiresAt` to the current processing time, not to the on-chain transaction timestamp being replayed.

**Why this is a problem:**
If TON polling is delayed or replay happens after 24 hours, a deposit that arrived while its memo was valid can be reclassified as inactive/unmatched and never auto-credited.

**Evidence from code:**
`resolveMemoStatus()` marks memos inactive when `memoDoc.expiresAt <= now`. `buildTransferPreview()` passes `new Date()`, and `DepositMemoRepository.claimActiveMemo()` separately requires `expiresAt > new Date()`. `replayDepositWindow()` reprocesses historical transfers but never switches this validation to `tx.transaction_now`.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
Historical replay should validate memo eligibility against the transfer event time, while still preserving single-use memo claiming.

**Suggested fix direction, without editing code:**
Pass the transfer timestamp through preview and claim logic, and add replay-safe memo validation based on event time rather than current wall-clock time.

**Regression risk if fixed incorrectly:**
Incorrect event-time handling could reopen double-credit paths or start crediting genuinely expired/reused memos.

**Suggested tests:**
- Add an integration test where a transfer lands before memo expiry but replay happens after expiry.
- Add a replay test that proves a previously valid memo is still claimable exactly once.

**Confidence:** High

---

### ISSUE-002: Stuck withdrawals can hold user funds indefinitely with no supported terminal resolution path

**Severity:** High

**Category:** Production Readiness

**Status:** Fixed in high-severity pass

**Location:**
- File: `server/workers/withdrawal-worker.ts`
- Function/component/route: `runWithdrawalWorker`, `confirmSentWithdrawals`, `recoverStuckWithdrawals`
- Lines: `67-99`, `202-289`, `292-409`, `500-635`

**What I found:**
Once a withdrawal is sent or suspected sent, the system can mark it `stuck`, but there is no operator-facing route or in-code terminal refund/reconcile flow for that state.

**Why this is a problem:**
User balance is already held at that point. A seqno timeout, post-send persistence failure, or long-term missing confirmation can leave funds unavailable indefinitely.

**Evidence from code:**
Refund logic exists only in the pre-send failure path. Seqno timeouts and post-send errors call `markStuck()`. `findPendingConfirmation()` keeps polling `sent` and `stuck` records, but `server/routes/admin.routes.ts` exposes no withdrawal recovery action route.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
There should be a deterministic operator-safe end state for stuck withdrawals: confirmed on-chain or atomically refunded/reconciled.

**Suggested fix direction, without editing code:**
Add an authenticated admin workflow for stuck withdrawals that re-checks chain state idempotently and then either confirms or refunds within an auditable transaction.

**Regression risk if fixed incorrectly:**
Refunding a transfer that later confirms would create a double spend; confirmation/refund logic must stay idempotent and chain-aware.

**Suggested tests:**
- Add admin-action tests for stuck-withdrawal confirm vs refund outcomes.
- Add idempotency tests for repeated operator resolution attempts.

**Confidence:** High

---

### ISSUE-003: SELL-order payout details are dropped from serialized and merchant-admin responses

**Severity:** High

**Category:** API

**Status:** Fixed in high-severity pass

**Location:**
- File: `server/serializers/api.ts`
- Function/component/route: `serializeOrder`
- Lines: `182-205`

**What I found:**
The shared DTOs declare `mpesaNumber` and `mpesaName`, the SELL frontend submits them, but normal order serialization omits them and the merchant admin dashboard query never selects them.

**Why this is a problem:**
SELL orders need payout destination details to be executed. The backend accepts and stores those fields, but the views used to inspect/process orders lose them.

**Evidence from code:**
`shared/types/api.ts` includes `mpesaNumber` and `mpesaName` on `OrderDTO` and `MerchantOrderDeskItemDTO`. `src/features/bank/MerchantPanel.tsx` sends them for SELL orders. `serializeOrder()` omits them entirely, and `server/services/merchant-dashboard.service.ts` tries to emit them without selecting them in the query projection.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
Order serializers and merchant review payloads should preserve payout details needed to complete SELL orders, scoped to the correct audience.

**Suggested fix direction, without editing code:**
Add `mpesaNumber` and `mpesaName` to the serializer and admin projection, then verify that they are only exposed on authorized order surfaces.

**Regression risk if fixed incorrectly:**
Over-exposing payout data to the wrong user-facing views would create a privacy issue.

**Suggested tests:**
- Add serializer tests for SELL orders.
- Add merchant-dashboard tests asserting payout fields are present for SELL items.
- Add an end-to-end SELL order review test.

**Confidence:** High

---

### ISSUE-004: Production defaults still assume a single-process deployment for workers, wallet sending, sockets, and room state

**Severity:** High

**Category:** Config

**Status:** Fixed in high-severity pass

**Location:**
- File: `.env.example`
- Function/component/route: `FEATURE_*` defaults
- Lines: `64-67`

**What I found:**
The default environment contract disables distributed locking, BullMQ-backed job scheduling, and the Socket.IO Redis adapter, while the runtime still starts local background schedulers and in-memory room state.

**Why this is a problem:**
Running multiple web instances with these defaults can duplicate jobs, race hot-wallet sends, and split realtime/game state across nodes.

**Evidence from code:**
`.env.example` sets `FEATURE_DISTRIBUTED_LOCK=false`, `FEATURE_BULLMQ_JOBS=false`, and `FEATURE_REDIS_SOCKET_ADAPTER=false`. `server/services/background-jobs.service.ts` falls back to local `setInterval` schedulers. `server/workers/withdrawal-worker.ts` only serializes sends across instances when distributed locking is enabled. `server/runtime.ts` only installs the Socket.IO Redis adapter when the feature flag is on.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
Production topology should either explicitly enforce singleton deployment or enable the distributed coordination paths by default.

**Suggested fix direction, without editing code:**
Document and enforce the intended production topology, or flip production defaults so Redis/BullMQ/socket coordination is on when the service is horizontally scaled.

**Regression risk if fixed incorrectly:**
Changing coordination mode without a controlled rollout can cause duplicate processing, stuck queues, or websocket regressions.

**Suggested tests:**
- Add configuration-level tests for production defaults.
- Add integration tests around distributed withdrawal sending and multi-node socket behavior where feasible.

**Confidence:** High

---

### ISSUE-005: `/api/health/ready` can report ready after withdrawal/background-job initialization already failed

**Severity:** High

**Category:** Production Readiness

**Status:** Fixed in high-severity pass

**Location:**
- File: `server/services/background-jobs.service.ts`
- Function/component/route: `startBackgroundJobs`
- Lines: `111-121`

**What I found:**
Withdrawal worker initialization and stuck-withdrawal recovery errors disable several background-job states, but startup continues and readiness does not factor those disabled states into `isReady`.

**Why this is a problem:**
The instance can be admitted into traffic while money-moving or monitoring subsystems are already unavailable.

**Evidence from code:**
`startBackgroundJobs()` catches `initWorker()` and `recoverStuckWithdrawals()` failures, marks withdrawal-related jobs disabled, logs the error, and still returns a controller. `server/app.ts` includes `backgroundJobs` in the readiness payload but calculates readiness only from DB/Redis/BullMQ/shutdown/hotWalletRuntime checks.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
If required background jobs fail to initialize, startup should fail or readiness should stay red until the dependency is healthy.

**Suggested fix direction, without editing code:**
Define which background jobs are mandatory for the web tier and incorporate that status into startup/readiness decisions.

**Regression risk if fixed incorrectly:**
A stricter readiness gate can cause rollout flapping if job initialization remains nondeterministic.

**Suggested tests:**
- Add readiness tests that simulate worker init failure.
- Add startup tests that assert required job failures block readiness.

**Confidence:** High

---

### ISSUE-006: Recovery-code lifecycle is weak: single-use enforcement is raceable and regeneration is silent

**Severity:** Medium

**Category:** Auth

**Status:** Confirmed

**Location:**
- File: `server/services/auth-mfa.service.ts`
- Function/component/route: `verifyUserFactor`, `regenerateRecoveryCodes`
- Lines: `128-156`, `168-180`

**What I found:**
Recovery-code consumption reads and rewrites the entire array non-atomically, and recovery-code regeneration replaces the stored backup factors without sending any out-of-band notification.

**Why this is a problem:**
Single-use backup factors can be reused under concurrency, and a compromised stepped-up session can silently replace the user’s fallback MFA material without alerting the account owner.

**Evidence from code:**
`verifyUserFactor()` checks `existingHashes.includes(recoveryHash)` and then writes `nextHashes` through `UserService.updateMfaState()`, which is an unconditional `findByIdAndUpdate()`. `AuthController.regenerateRecoveryCodes()` returns a fresh set of codes immediately after `AuthMfaService.regenerateRecoveryCodes()` with no notification or audit hook.

**Best-practice reference:**
- [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)

**Expected behavior:**
Recovery codes should be consumed atomically and any replacement of backup factors should produce an auditable, user-visible security notification.

**Suggested fix direction, without editing code:**
Consume a specific recovery-code hash with an atomic conditional update and add a non-blocking notification/audit event when codes are regenerated.

**Regression risk if fixed incorrectly:**
Over-broad updates can invalidate multiple codes at once or still fail open when no code was actually consumed.

**Suggested tests:**
- Add a concurrency test that attempts to redeem the same recovery code twice in parallel.
- Add a test that verifies regeneration emits the required audit/notification side effect.

**Confidence:** High

---

### ISSUE-007: Auth bootstrap clears client session state on any `/auth/me` failure

**Severity:** Medium

**Category:** UX

**Status:** Confirmed

**Location:**
- File: `src/app/AuthProvider.tsx`
- Function/component/route: `refreshUser`
- Lines: `72-94`

**What I found:**
The initial auth bootstrap clears local auth state not only on 401s but also on every other thrown error.

**Why this is a problem:**
A transient network failure or temporary backend 5xx during bootstrap logs the user out locally even if the cookie-backed session is still valid.

**Evidence from code:**
`refreshUser()` explicitly clears auth on 401, but then also calls `clearAuth()` for all other exceptions before setting `loading` false.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
Client auth state should only be invalidated on authoritative auth failures, while transport/service failures should surface retry/offline behavior.

**Suggested fix direction, without editing code:**
Preserve last-known auth state for non-401 failures and introduce an explicit retry/offline path for bootstrap errors.

**Regression risk if fixed incorrectly:**
Keeping stale user state after a true revoke/logout would create confusing access drift.

**Suggested tests:**
- Add a frontend test where `/auth/me` returns 500 and auth state is preserved.
- Add a regression test for a real 401 still clearing auth immediately.

**Confidence:** High

---

### ISSUE-008: The “Paid Public” draft flow accepts a zero wager and silently creates a free public room

**Severity:** Medium

**Category:** Bug

**Status:** Confirmed

**Location:**
- File: `src/pages/DashboardPage.tsx`
- Function/component/route: `createGameHandler`
- Lines: `104-130`

**What I found:**
The frontend copy says a paid public draft requires a wager, but the UI only rejects negative values and the backend schema accepts zero.

**Why this is a problem:**
Users can choose the paid flow, enter `0`, and create a normal free public lobby instead of the promised paid-public room.

**Evidence from code:**
`createGameHandler()` only rejects `parsedWager < 0`. The backend `createMatchRequestSchema` uses `nonNegativeUsdtSchema`, and the service only locks funds when the wager is positive.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
The paid-public branch should require `wager > 0` consistently on both client and server, or the API should use an explicit match-type contract.

**Suggested fix direction, without editing code:**
Make the public draft type explicit and validate it end-to-end so contradictory inputs are rejected instead of silently downgraded.

**Regression risk if fixed incorrectly:**
Tightening validation can break existing callers that currently depend on zero-wager public creation.

**Suggested tests:**
- Add frontend and API tests for zero-wager paid-public creation.
- Add a regression test that free-public creation still works intentionally.

**Confidence:** High

---

### ISSUE-009: Bank history exposes only the first page of transactions

**Severity:** Medium

**Category:** UX

**Status:** Confirmed

**Location:**
- File: `src/pages/BankPage.tsx`
- Function/component/route: `BankPage`
- Lines: `42-67`

**What I found:**
The transaction API supports `page`, `pageSize`, and `total`, but the Bank page fetches once and stores only `data.items` with no pagination or “recent only” label.

**Why this is a problem:**
Users lose access to older deposits, withdrawals, match entries, refunds, and P2P transactions as soon as the first page fills up.

**Evidence from code:**
`getTransactions()` supports pagination query params and `TransactionFeedDTO` includes `page`, `pageSize`, and `total`. `BankPage` fetches once, stores `data.items`, and never keeps or renders the feed metadata.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
Financial history should either support paging/load-more or clearly state that the view is limited to recent activity.

**Suggested fix direction, without editing code:**
Persist the returned pagination metadata in state and expose pagination/load-more controls, or intentionally relabel the page as a recent-activity surface.

**Regression risk if fixed incorrectly:**
Layering pagination on top of a merged multi-source feed can create duplicates or skipped rows if ordering is not stabilized first.

**Suggested tests:**
- Add frontend tests for load-more/pagination behavior.
- Add API/feed tests that prove deterministic ordering across pages.

**Confidence:** High

---

### ISSUE-010: Production trust-proxy configuration is ignored

**Severity:** Medium

**Category:** Config

**Status:** Confirmed

**Location:**
- File: `server/app.ts`
- Function/component/route: `createApp`
- Lines: `65-69`

**What I found:**
`TRUST_PROXY` is parsed in `server/config/env.ts`, but production mode hardcodes `app.set('trust proxy', 1)` and ignores the configured value.

**Why this is a problem:**
Client IP detection, rate limiting, audit logging, and forwarded-header trust all depend on the real proxy chain. Hardcoding one hop is only correct for one deployment shape.

**Evidence from code:**
`getTrustProxySetting()` parses `TRUST_PROXY`, but `createApp()` uses `1` whenever `NODE_ENV === 'production'` and only honors `TRUST_PROXY` outside production.

**Best-practice reference:**
- [Express: Behind Proxies](https://expressjs.com/en/guide/behind-proxies.html)

**Expected behavior:**
Production should honor an explicit `TRUST_PROXY` setting instead of assuming a fixed ingress topology.

**Suggested fix direction, without editing code:**
Use `TRUST_PROXY` in production and fail closed when it is missing or invalid for deployed environments.

**Regression risk if fixed incorrectly:**
A wrong trust setting can either break client IP detection or trust spoofed forwarded headers.

**Suggested tests:**
- Add production-mode tests that verify `TRUST_PROXY` is applied.
- Add rate-limit/logging tests under different proxy configurations.

**Confidence:** High

---

### ISSUE-011: Health and metrics endpoints are public and mounted before the general API rate limiter

**Severity:** Medium

**Category:** Security

**Status:** Confirmed

**Location:**
- File: `server/app.ts`
- Function/component/route: `/api/health`, `/api/health/live`, `/api/health/ready`, `/api/metrics`
- Lines: `104-166`

**What I found:**
Operational endpoints are mounted before `app.use('/api', appDependencies.createGeneralRateLimiter())` and before any auth middleware.

**Why this is a problem:**
They expose build metadata, dependency state, uptime, and metrics to unauthenticated callers and can be scraped without the normal API rate limit.

**Evidence from code:**
The health and metrics routes are defined at lines `104-152`. The general API rate limiter is only attached at line `164`, after those endpoints.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
Operational endpoints should be deliberately protected at the ingress/app level or at minimum isolated from the public surface and rate-limited appropriately.

**Suggested fix direction, without editing code:**
Restrict these endpoints via auth, network policy, or internal-only routing, and decide explicitly whether any public health endpoint is required.

**Regression risk if fixed incorrectly:**
Over-tightening can break orchestration probes or monitoring collectors if they are not updated first.

**Suggested tests:**
- Add tests for public vs internal access policy on health/metrics.
- Add a rate-limit/access test for metrics scraping behavior.

**Confidence:** High

---

### ISSUE-012: Match reconnect failures hard-redirect users out of active rooms with no resume path

**Severity:** Medium

**Category:** UX

**Status:** Confirmed

**Location:**
- File: `src/pages/GamePage.tsx`
- Function/component/route: `GamePage`
- Lines: `37-45`, `63-95`

**What I found:**
Any room-load error or Socket.IO connect error sends the user back to `/play`, and there is no “my active matches” recovery path in the app.

**Why this is a problem:**
A user in an active wagered room can be stranded outside the game by a transient reconnect issue or navigation failure, with no in-app way to reopen the match unless they still have the URL.

**Evidence from code:**
`GamePage` handles `onRoomError` by showing a toast and navigating to `/play`. `useGameRoom()` forwards `connect_error` into that callback. The lobby/history flows do not provide a dedicated active-match resume surface.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
Realtime game flows should tolerate reconnect issues and provide a deterministic resume path for authorized participants.

**Suggested fix direction, without editing code:**
Keep users on the game route in a reconnecting/error state and add a dedicated backend/frontend contract for listing or restoring active matches.

**Regression risk if fixed incorrectly:**
Resume logic can accidentally expose private rooms or stale matches to unauthorized users if access checks drift.

**Suggested tests:**
- Add frontend tests for reconnect failure states.
- Add E2E coverage for active-match resume after socket interruption.

**Confidence:** High

---

### ISSUE-013: Firefox still throws a runtime error on protected player routes

**Severity:** Medium

**Category:** Bug

**Status:** Confirmed

**Location:**
- File: `tests/e2e/page-smoke.spec.ts`
- Function/component/route: `player routes when a session is preloaded render the lobby leaderboard bank and profile surfaces`
- Lines: `129-147`

**What I found:**
The Playwright E2E suite fails in Firefox with `can't access property "filter", h is null` while rendering protected player routes.

**Why this is a problem:**
Core authenticated surfaces are not cross-browser stable across the project’s own supported Playwright matrix.

**Evidence from code:**
`npm run test:e2e` produced 20 passing tests and 1 failing Firefox smoke test for `/leaderboard`, `/bank`, `/profile/user-player-one`, and `/play`. Those routes share `AppLayout`, `Navbar`, and the `TonConnectUIProvider`/`TonConnectButton` surfaces.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
All supported browser projects should pass the protected-route smoke suite without page errors.

**Suggested fix direction, without editing code:**
Instrument the failing route group with source-level error attribution, then isolate shared authenticated-shell dependencies first, especially the TonConnect surface rendered from `AppProviders` and `Navbar`.

**Regression risk if fixed incorrectly:**
A superficial browser-specific workaround can hide the error without fixing the underlying shared-shell dependency issue.

**Suggested tests:**
- Add route-by-route pageerror attribution in the smoke suite.
- Add targeted cross-browser tests for the authenticated shell and TonConnect surface.

**Confidence:** Medium

---

### ISSUE-014: The default verification surface is misleading, and the deeper suites are currently red

**Severity:** Medium

**Category:** Testing

**Status:** Confirmed

**Location:**
- File: `package.json`
- Function/component/route: `scripts.test`, `scripts.test:unit`, `scripts.test:e2e`
- Lines: `11-15`

**What I found:**
`npm test` runs only `test:integration`, while `test:unit` and `test:e2e` are separate. In the current working tree, both unit and integration suites fail, and E2E still has one Firefox failure.

**Why this is a problem:**
A developer relying on the default test command does not exercise the full verification surface, and the deeper suites already expose real contract/runtime drift.

**Evidence from code:**
`package.json` maps `test` to `npm run test:integration`. `npm run test:unit` failed on `frontend-contracts.test.ts` (toast-length and raw-button contract failures). `npm run test:integration` failed on the same contract checks plus `server/middleware/order-service.test.ts`. `npm run test:e2e` failed the Firefox protected-route smoke case.

**Best-practice reference:**
Code-flow evidence only.

**Expected behavior:**
The default verification path should represent the project’s intended baseline, and the baseline should be green or clearly documented as narrower.

**Suggested fix direction, without editing code:**
Decide whether `npm test` should remain intentionally narrow or be widened, then either align the failing suites or make the narrower contract explicit in CI/docs.

**Regression risk if fixed incorrectly:**
Promoting more suites into the default path without first stabilizing them can block development; leaving the split implicit hides breakage.

**Suggested tests:**
- Align CI/default commands with the intended baseline.
- Add targeted tests for the specific failing areas: SELL order contract, protected-route Firefox runtime, raw-button policy, and toast-copy policy.

**Confidence:** High

---

### ISSUE-015: Registration still enumerates existing verified emails and usernames

**Severity:** Low

**Category:** Security

**Status:** Confirmed

**Location:**
- File: `server/controllers/auth.controller.ts`
- Function/component/route: `AuthController.register`
- Lines: `202-236`

**What I found:**
The registration endpoint returns distinct duplicate errors for existing verified emails and usernames.

**Why this is a problem:**
It lets unauthenticated callers confirm whether specific credentials already exist, even though other auth flows were intentionally normalized to avoid that signal.

**Evidence from code:**
The controller explicitly throws `EMAIL_ALREADY_EXISTS` for verified emails and `USERNAME_ALREADY_EXISTS` for username collisions. Duplicate-key handling in `UserService.createUser()` preserves the same distinctions.

**Best-practice reference:**
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

**Expected behavior:**
Public registration should avoid exposing whether a given email/username is already registered unless that information is deliberately gated.

**Suggested fix direction, without editing code:**
Return a generic success/pending response or defer precise duplicate disclosure until a verified ownership step.

**Regression risk if fixed incorrectly:**
More generic responses can degrade signup UX if the product currently depends on immediate duplicate feedback.

**Suggested tests:**
- Add enumeration tests asserting equivalent public responses for existing and non-existing identities.
- Add UI tests for the intended duplicate-account UX.

**Confidence:** High

---

## 7. End-to-End Flow Review

### Flow: Registration

**Status:** Partially working

**Files involved:**
- `src/pages/auth/RegisterPage.tsx`
- `src/services/auth.service.ts`
- `server/routes/auth.routes.ts`
- `server/controllers/auth.controller.ts`
- `server/services/auth-email.service.ts`
- `server/services/user.service.ts`

**Steps traced:**
1. User submits registration form.
2. Frontend sends `POST /api/auth/register`.
3. Backend validates body, Turnstile, password, and duplicate identity state.
4. User is created and verification email is triggered.
5. Frontend redirects to pending verification state.
6. E2E happy path passes.

**Issues found:**
- ISSUE-015

### Flow: Login

**Status:** Working

**Files involved:**
- `src/pages/auth/LoginPage.tsx`
- `src/services/auth.service.ts`
- `server/routes/auth.routes.ts`
- `server/controllers/auth.controller.ts`
- `server/services/auth-session.service.ts`

**Steps traced:**
1. User enters identifier and password.
2. Frontend sends `POST /api/auth/login/password`.
3. Backend validates Turnstile, checks password, and may branch to MFA/pending verification/session issuance.
4. Cookies are issued.
5. Frontend stores auth state and redirects.
6. E2E happy path passes.

**Issues found:**
- None promoted from this flow

### Flow: Logout

**Status:** Working

**Files involved:**
- `src/app/AuthProvider.tsx`
- `src/services/auth.service.ts`
- `server/controllers/auth.controller.ts`

**Steps traced:**
1. User clicks logout.
2. Frontend calls `POST /api/auth/logout`.
3. Backend clears auth cookies and site data headers.
4. Frontend clears local auth state.

**Issues found:**
- None promoted from this flow

### Flow: Auth / Session Refresh

**Status:** Partially working

**Files involved:**
- `src/app/AuthProvider.tsx`
- `src/services/api/apiClient.ts`
- `server/routes/auth.routes.ts`
- `server/controllers/auth.controller.ts`
- `server/services/auth-session.service.ts`

**Steps traced:**
1. App bootstraps by calling `GET /api/auth/me`.
2. `apiClient` retries 401s via `POST /api/auth/refresh`.
3. `AuthProvider` updates or clears session state.
4. Protected routes render based on the resulting auth state.

**Issues found:**
- ISSUE-007

### Flow: Password Reset

**Status:** Unknown

**Files involved:**
- `src/pages/auth/ForgotPasswordPage.tsx`
- `src/pages/auth/ResetPasswordPage.tsx`
- `server/controllers/auth.controller.ts`
- `server/services/one-time-token.service.ts`

**Steps traced:**
1. Public pages and service calls were inspected.
2. Unit/integration coverage exists around token/email behavior.
3. No end-to-end proof of the full browser flow was run.

**Issues found:**
- None promoted from this flow

### Flow: Email Verification

**Status:** Working

**Files involved:**
- `src/pages/auth/VerifyEmailPage.tsx`
- `src/services/auth.service.ts`
- `server/controllers/auth.controller.ts`
- `server/services/auth-email.service.ts`

**Steps traced:**
1. User opens verification page.
2. Frontend consumes verification token via POST.
3. Backend marks email verified and issues session.
4. Frontend redirects to verified/authenticated state.
5. Happy-path auth E2E passes.

**Issues found:**
- None promoted from this flow

### Flow: OAuth Login

**Status:** Unknown

**Files involved:**
- `src/pages/auth/LoginPage.tsx`
- `server/controllers/auth.controller.ts`
- `server/services/google-oauth.service.ts`

**Steps traced:**
1. Code and tests show state-cookie and nonce validation.
2. No live browser/OAuth-provider verification was run.

**Issues found:**
- None promoted from this flow

### Flow: Protected Route Access

**Status:** Partially working

**Files involved:**
- `src/app/ProtectedRoute.tsx`
- `src/app/AuthProvider.tsx`
- `src/app/AppLayout.tsx`
- `src/components/Navbar.tsx`
- `tests/e2e/page-smoke.spec.ts`

**Steps traced:**
1. Protected routes depend on `AuthProvider`.
2. Authenticated shell renders shared navbar and TonConnect surfaces.
3. Chromium/WebKit smoke passes.
4. Firefox smoke fails on player routes.

**Issues found:**
- ISSUE-007
- ISSUE-013

### Flow: Admin / Merchant / User Role Flow

**Status:** Partially working

**Files involved:**
- `src/features/bank/MerchantPanel.tsx`
- `server/routes/orders.routes.ts`
- `server/routes/admin.routes.ts`
- `server/services/merchant-dashboard.service.ts`
- `server/serializers/api.ts`

**Steps traced:**
1. Normal users create BUY/SELL orders.
2. Merchant/admin routes require auth, verified account, admin role, and MFA step-up.
3. Merchant dashboard aggregates pending orders and reviews.
4. BUY happy path is covered by E2E.
5. SELL execution context is incomplete.

**Issues found:**
- ISSUE-003
- ISSUE-014

### Flow: Order / Payment / Transaction Flow

**Status:** Partially working

**Files involved:**
- `src/features/bank/MerchantPanel.tsx`
- `server/controllers/order.controller.ts`
- `server/services/order.service.ts`
- `server/services/transaction.service.ts`
- `server/serializers/api.ts`

**Steps traced:**
1. User submits BUY or SELL order from the Merchant panel.
2. Frontend sends multipart or form-based order payload.
3. Backend validates, persists order, and writes a pending ledger transaction.
4. Merchant/admin dashboards inspect and update order state.
5. User transaction history is returned by unified feed endpoints.

**Issues found:**
- ISSUE-003
- ISSUE-009
- ISSUE-014

### Flow: Email Sending Flow

**Status:** Partially working

**Files involved:**
- `server/services/auth-email.service.ts`
- `server/services/product-email-notification.service.ts`
- `server/services/email/gmailService.ts`

**Steps traced:**
1. Verification/reset/magic-link/security notifications are triggered from controllers/services.
2. Tests verify several fallback/error-handling branches.
3. Real provider behavior was not exercised.

**Issues found:**
- ISSUE-006

### Flow: Turnstile Verification

**Status:** Working

**Files involved:**
- `src/features/auth/AuthTurnstile.tsx`
- `server/services/auth-turnstile.service.ts`
- `server/controllers/auth.controller.ts`

**Steps traced:**
1. Frontend captures Turnstile token where configured.
2. Backend verifies token before sensitive public auth actions.
3. Tests verify fail-closed behavior in production when the secret is missing.

**Issues found:**
- None promoted from this flow

### Flow: Match Creation / Join / Realtime Play

**Status:** Partially working

**Files involved:**
- `src/pages/DashboardPage.tsx`
- `src/pages/GamePage.tsx`
- `src/features/game/useGameRoom.ts`
- `server/controllers/match.controller.ts`
- `server/services/match.service.ts`

**Steps traced:**
1. User creates free/private/paid public match.
2. Frontend sends `POST /api/matches`.
3. Match preview/join uses REST + socket room sync.
4. Realtime play runs over Socket.IO.
5. Paid-public and reconnect/resume behavior drift from intended UX.

**Issues found:**
- ISSUE-008
- ISSUE-012

## 8. Endpoint Review

| Endpoint | Method | Auth required | Role required | Handler | Status | Issues |
|---|---:|---|---|---|---|---|
| `/api/health` | GET | No | None | `server/app.ts` | Security concern | ISSUE-011 |
| `/api/health/live` | GET | No | None | `server/app.ts` | Security concern | ISSUE-011 |
| `/api/health/ready` | GET | No | None | `server/app.ts` | Fixed for background-job readiness; partially working for public exposure | ISSUE-011 |
| `/api/metrics` | GET | No | None | `server/app.ts` | Security concern | ISSUE-011 |
| `/api/auth/register` | POST | No | None | `AuthController.register` | Partially working | ISSUE-015 |
| `/api/auth/login/password` | POST | No | None | `AuthController.loginPassword` | OK |  |
| `/api/auth/login/magic-link/request` | POST | No | None | `AuthController.requestMagicLink` | OK |  |
| `/api/auth/login/magic-link/consume` | POST | No | None | `AuthController.consumeMagicLink` | OK |  |
| `/api/auth/login/suspicious/consume` | POST | No | None | `AuthController.consumeSuspiciousLogin` | OK |  |
| `/api/auth/oauth/google/start` | GET | No | None | `AuthController.startGoogleOAuth` | Unknown |  |
| `/api/auth/oauth/google/callback` | GET | No | None | `AuthController.handleGoogleCallback` | Unknown |  |
| `/api/auth/email/verify/resend` | POST | No | None | `AuthController.resendVerificationEmail` | OK |  |
| `/api/auth/email/verify/consume` | POST | No | None | `AuthController.consumeVerificationEmail` | OK |  |
| `/api/auth/password/forgot` | POST | No | None | `AuthController.requestPasswordReset` | OK |  |
| `/api/auth/password/reset` | POST | No | None | `AuthController.resetPassword` | OK |  |
| `/api/auth/mfa/challenge` | POST | No | None | `AuthController.completeMfaChallenge` | Partially working | ISSUE-006 |
| `/api/auth/refresh` | POST | No | None | `AuthController.refreshSession` | OK |  |
| `/api/auth/me` | GET | Yes | User | `AuthController.me` | Partially working | ISSUE-007 |
| `/api/auth/logout` | POST | Cookie session | User | `AuthController.logout` | OK |  |
| `/api/auth/sessions` | GET | Yes | User | `AuthController.listSessions` | OK |  |
| `/api/auth/sessions/:sessionId` | DELETE | Yes | MFA step-up | `AuthController.revokeSession` | OK |  |
| `/api/auth/sessions/revoke-others` | POST | Yes | MFA step-up | `AuthController.revokeOtherSessions` | OK |  |
| `/api/auth/mfa/totp/setup` | POST | Yes | User / step-up if replacing | `AuthController.startTotpSetup` | OK |  |
| `/api/auth/mfa/totp/verify` | POST | Yes | User | `AuthController.verifyTotpSetup` | Partially working | ISSUE-006 |
| `/api/auth/mfa/disable` | POST | Yes | MFA step-up | `AuthController.disableMfa` | Partially working | ISSUE-006 |
| `/api/auth/mfa/recovery-codes/regenerate` | POST | Yes | MFA step-up | `AuthController.regenerateRecoveryCodes` | Partially working | ISSUE-006 |
| `/api/auth/profile/complete` | POST | Yes | User | `AuthController.completeProfile` | OK |  |
| `/api/users/leaderboard` | GET | No | None | `UserController.getLeaderboard` | OK |  |
| `/api/users/:userId` | GET | No | None | `UserController.getProfile` | OK |  |
| `/api/matches/active` | GET | No | None | `MatchController.getActiveMatches` | OK |  |
| `/api/matches` | POST | Yes | Verified user | `MatchController.createMatch` | Partially working | ISSUE-008 |
| `/api/matches/:roomId/join` | POST | Yes | Verified user | `MatchController.joinMatch` | Partially working | ISSUE-012 |
| `/api/matches/:roomId/resign` | POST | Yes | Verified user | `MatchController.resignMatch` | Partially working | ISSUE-012 |
| `/api/matches/user/:userId` | GET | Yes | Verified user | `MatchController.getUserHistory` | OK |  |
| `/api/matches/:roomId` | GET | Yes | Verified user | `MatchController.getMatch` | Partially working | ISSUE-012 |
| `/api/orders/config` | GET | Yes | Verified user | `OrderController.getMerchantConfig` | OK |  |
| `/api/orders` | GET | Yes | Verified user | `OrderController.getOrders` | OK |  |
| `/api/orders` | POST | Yes | Verified user | `OrderController.createOrder` | OK |  |
| `/api/orders/:id` | PATCH | Yes | Admin + MFA step-up | `OrderController.updateOrder` | OK |  |
| `/api/transactions` | GET | Yes | Verified user | `getUserTransactions` | OK |  |
| `/api/transactions/all` | GET | Yes | Admin + MFA step-up | `getAllTransactions` | OK |  |
| `/api/transactions/withdrawals/:withdrawalId` | GET | Yes | Verified user | `getWithdrawalStatusHandler` | OK |  |
| `/api/transactions/deposit/memo` | POST | Yes | Verified user | `generateDepositMemoHandler` | OK |  |
| `/api/transactions/deposit/prepare` | POST | Yes | Verified user | `prepareTonConnectDepositHandler` | OK |  |
| `/api/transactions/withdraw` | POST | Yes | Verified user + MFA step-up | `requestWithdrawalHandler` | OK |  |
| `/api/admin/merchant/config` | GET | Yes | Admin + MFA step-up | `MerchantAdminController.getConfig` | OK |  |
| `/api/admin/merchant/config` | PATCH | Yes | Admin + MFA step-up | `MerchantAdminController.updateConfig` | OK |  |
| `/api/admin/merchant/dashboard` | GET | Yes | Admin + MFA step-up | `MerchantAdminController.getDashboard` | OK |  |
| `/api/admin/merchant/orders` | GET | Yes | Admin + MFA step-up | `MerchantAdminController.getOrders` | OK |  |
| `/api/admin/merchant/deposits` | GET | Yes | Admin + MFA step-up | `MerchantAdminController.getDeposits` | OK |  |
| `/api/admin/merchant/deposits/replay-window` | POST | Yes | Admin + MFA step-up | `MerchantAdminController.replayDepositWindow` | OK |  |
| `/api/admin/merchant/deposits/:txHash/reconcile` | POST | Yes | Admin + MFA step-up | `MerchantAdminController.reconcileDeposit` | OK |  |
| `/api/admin/withdrawals/:withdrawalId/recover` | POST | Yes | Admin + MFA step-up | `WithdrawalRecoveryController.recover` | OK |  |

## 9. Frontend Review

Route issues:
- Protected player routes are not fully resilient across the supported browser matrix because the Firefox smoke suite still throws a runtime error. Related: ISSUE-013.
- The active game screen exits to `/play` on reconnect/load errors instead of keeping players in a resumable state. Related: ISSUE-012.
- The paid-public draft flow is semantically inconsistent with its own UI copy. Related: ISSUE-008.

Component issues:
- `Navbar` and the authenticated shell are part of the failing protected-route smoke path. Related: ISSUE-013.
- The bank portal fetches only one page of transaction history even though the API returns feed metadata. Related: ISSUE-009.

State management issues:
- `AuthProvider` collapses network/service failures into a local logout. Related: ISSUE-007.

Form issues:
- Merchant SELL form collects payout details correctly, but the downstream review/serialization path loses them. Related: ISSUE-003.
- Paid-public draft validation does not enforce the business meaning of “paid.” Related: ISSUE-008.

API client issues:
- The frontend ignores returned transaction pagination metadata. Related: ISSUE-009.

UX loading/error issues:
- Active-match users can lose the only accessible path back into a live game. Related: ISSUE-012.
- Firefox still hits a protected-route runtime error that the smoke suite catches. Related: ISSUE-013.

Unused/duplicate frontend code:
- `ProfilePage` contains a disabled “Avatar Editing Coming Soon” stub, indicating a partial feature surface rather than a complete flow.

Frontend security concerns:
- Client auth bootstrap is too eager to treat transient failures as logout events. Related: ISSUE-007.

## 10. Backend Review

Route/controller issues:
- Health and metrics endpoints are mounted before the general API rate limiter and auth surfaces. Related: ISSUE-011.
- Merchant order/admin responses do not preserve SELL payout details needed for fulfillment. Related: ISSUE-003.

Service logic issues:
- Deposit replay logic uses processing time instead of event time for memo validity. Related: ISSUE-001.
- Withdrawal worker can move records into `stuck` without any terminal operator path. Related: ISSUE-002.
- Background-job startup failures are swallowed into state while the app keeps booting. Related: ISSUE-005.

Middleware issues:
- Production proxy behavior is hardcoded rather than configuration-driven. Related: ISSUE-010.

Validation issues:
- Match creation allows zero-wager “paid” rooms. Related: ISSUE-008.
- Recovery-code lifecycle is not atomic and regeneration has no secondary notification. Related: ISSUE-006.

Error handling issues:
- Frontend-impacting runtime failures still surface in Firefox protected-route E2E. Related: ISSUE-013.

Auth/authorization issues:
- Registration still provides duplicate-account signals. Related: ISSUE-015.

Logging issues:
- Readiness and public operational surfaces disclose build/runtime state to unauthenticated callers. Related: ISSUE-011.

External service issues:
- Safe production deployment still depends on enabling the right Redis/BullMQ/socket coordination flags. Related: ISSUE-004.

## 11. Database and Data Consistency Review

Schema issues:
- Order DTOs and merchant review DTOs declare SELL payout fields that serialization/projection do not actually deliver. Related: ISSUE-003.

Index issues:
- Deposit history is paged on `createdAt` in the repository while displayed/sorted on `txTime` in the feed layer, which makes the current index strategy inconsistent with user-visible ordering. Related: ISSUE-009.

Query issues:
- Historical deposit replay uses `new Date()` rather than transfer event time to decide memo validity. Related: ISSUE-001.

Transaction/race-condition risks:
- Recovery-code redemption is non-atomic. Related: ISSUE-006.
- Stuck withdrawals can remain in limbo after user funds were already deducted/held. Related: ISSUE-002.

Cleanup/TTL issues:
- Memo TTL behavior is correct for cleanup, but replay logic currently turns TTL into a false-negative credit decision for historical transfers. Related: ISSUE-001.

Migration/setup issues:
- Production topology depends on feature flags that are off by default, which makes multi-instance setup fragile. Related: ISSUE-004.

Data integrity risks:
- SELL orders can lose payout execution context after creation. Related: ISSUE-003.

## 12. Security Review

OWASP-related risks:
- Registration endpoint still provides account-enumeration signals. Related: ISSUE-015.
- Operational metadata and metrics are available before the normal API limiter/auth surface. Related: ISSUE-011.

Auth/session risks:
- Client bootstrap can treat transient outages as logout state, causing inconsistent auth UX. Related: ISSUE-007.
- Recovery-code lifecycle is weaker than intended for backup MFA. Related: ISSUE-006.

Authorization risks:
- No direct authz bypass was confirmed in the reviewed flows.

XSS/CSRF/injection risks:
- No strong XSS or injection finding survived validation in this review.
- CSRF/origin checks had positive test coverage and no promoted flaw from this pass.

CORS/cookie/header risks:
- Production proxy/header trust is deployment-shape sensitive because `TRUST_PROXY` is ignored in production. Related: ISSUE-010.

Secret handling risks:
- No tracked-secret repository finding was promoted. `.env` exists locally but was not tracked by git in this workspace audit.

Dependency risks:
- `npm audit --omit=dev --json` returned zero production dependency vulnerabilities at review time.

Logging/privacy risks:
- Public health/metrics exposure increases observability leakage risk. Related: ISSUE-011.

## 13. Dead Code and Duplicate Code

- `scripts/start-production.mjs`
  - Location: `scripts/start-production.mjs`
  - Why it appears unused or duplicated: only the generated architecture doc references it; package scripts use `main.ts` for dev and `dist/server/main.js` for start.
  - Confidence: Medium
  - Safe removal risk: Low to Medium if out-of-band ops docs or local habits still rely on it

- `tsconfig.tests.json`
  - Location: `tsconfig.tests.json`
  - Why it appears unused or duplicated: no package script or test command references it; only the generated architecture doc does.
  - Confidence: Medium
  - Safe removal risk: Low if no external tooling depends on it

- Disabled avatar-editing placeholder
  - Location: `src/pages/ProfilePage.tsx`
  - Why it appears unused or duplicated: the page renders a disabled `SketchyButton` labeled `Avatar Editing Coming Soon`, which is a stub rather than a connected feature.
  - Confidence: High
  - Safe removal risk: Low if product does not intentionally want the placeholder visible

- Duplicated SELL-order validation logic
  - Location: `server/validation/request-schemas.ts`, `server/controllers/order.controller.ts`, `server/services/order.service.ts`, `src/features/bank/MerchantPanel.tsx`
  - Why it appears unused or duplicated: M-Pesa SELL requirements are enforced across multiple layers, and the validation has already drifted: schema fields remain optional while controller/service/frontend require them.
  - Confidence: High
  - Safe removal risk: Medium because consolidation must preserve current API behavior and error messaging

## 14. Missing or Weak Tests

Unit tests:
- Recovery-code concurrency should be tested with parallel redemption attempts. Why it matters: single-use MFA claims are currently raceable. Related issue: ISSUE-006.
- Recovery-code regeneration should assert audit/notification side effects. Why it matters: silent backup-factor replacement is currently allowed. Related issue: ISSUE-006.
- SELL-order serializer tests should assert `mpesaNumber` and `mpesaName` survive response serialization. Why it matters: merchant fulfillment context is currently lost. Related issue: ISSUE-003.

Integration tests:
- Deposit replay should cover “transfer valid at event time, replayed after memo expiry.” Why it matters: outage recovery can miss valid deposits. Related issue: ISSUE-001.
- Stuck-withdrawal resolution should be tested once an operator path exists. Why it matters: the current system has no terminal recovery flow. Related issue: ISSUE-002.
- Production readiness tests should assert worker-init failure affects readiness. Why it matters: readiness is currently overly optimistic. Related issue: ISSUE-005.

API tests:
- Public access policy for health/metrics endpoints should be tested explicitly. Why it matters: current exposure is a security/ops concern. Related issue: ISSUE-011.
- Production `TRUST_PROXY` behavior should be tested under production mode. Why it matters: proxy trust is deployment-sensitive. Related issue: ISSUE-010.

Frontend tests:
- Auth bootstrap should be tested under network failure and 5xx responses. Why it matters: the UI currently treats all failures like logout. Related issue: ISSUE-007.
- Paid-public draft should reject zero-wager creation. Why it matters: UI and backend semantics currently drift. Related issue: ISSUE-008.
- Bank page should test pagination/load-more or explicitly recent-only behavior. Why it matters: older history is inaccessible today. Related issue: ISSUE-009.
- Active-match reconnect/resume behavior should be tested. Why it matters: players can be bounced out of live games. Related issue: ISSUE-012.

Security tests:
- Registration should have discrepancy/enumeration tests. Why it matters: duplicate identity signals are still public. Related issue: ISSUE-015.
- Recovery-code lifecycle needs security-oriented race and replacement tests. Why it matters: backup MFA factors are security controls, not simple preferences. Related issue: ISSUE-006.

End-to-end tests:
- SELL order creation through merchant review/fulfillment needs end-to-end coverage. Why it matters: the current E2E merchant flow only proves BUY review. Related issue: ISSUE-003.
- Protected-route smoke needs route-level error attribution in Firefox. Why it matters: the suite currently proves a browser-specific runtime problem without identifying the exact component. Related issue: ISSUE-013.

## 15. Production Readiness Risks

- Production topology is now explicit: default production mode is `PRODUCTION_TOPOLOGY=single-instance`, which requires one Render web instance and `WEB_CONCURRENCY=1`. Distributed mode is blocked unless Redis locking, BullMQ jobs, and the Socket.IO Redis adapter are all enabled. Related: ISSUE-004 fixed.
- Readiness now includes mandatory background-job status and returns 503 when required jobs are disabled or report errors. Related: ISSUE-005 fixed.
- Stuck withdrawals now have an admin + MFA recovery route that re-checks chain state before confirming or refunding. Related: ISSUE-002 fixed.
- Deposit replay now evaluates memo expiry at transfer event time and keeps processed-hash/memo-claim idempotency. Related: ISSUE-001 fixed.
- Public health/metrics exposure increases information leakage and scrape pressure. Related: ISSUE-011.
- Production proxy trust is deployment-shape sensitive and currently hardcoded. Related: ISSUE-010.
- The protected-route Firefox failure means the supported browser matrix is not fully green. Related: ISSUE-013.
- The default verification command does not represent the full suite, and deeper suites are currently failing. Related: ISSUE-014.
- Additional lower-priority operational note: request metrics currently record the raw logged path as the `route` label, which can create high-cardinality time-series if left unchanged.

## 16. Commands Run

| Command | Result | Notes |
|---|---|---|
| `Get-ChildItem -Force` | Passed | Used to map top-level repository structure |
| `Get-Content package.json` | Passed | Reviewed scripts and dependencies before any verification commands |
| `rg --files ...` and `rg -n ...` route/file searches | Passed | Used to map source files, frontend routes, backend endpoints, and targeted evidence |
| `git rev-parse --is-inside-work-tree` | Passed | Confirmed this is a git repository |
| `git status --short` | Passed | Confirmed the working tree was already dirty and that the review must cover local changes too |
| `git ls-files .env .env.example` | Passed | Only `.env.example` is tracked; `.env` is not tracked |
| `node -v` | Passed | `v24.15.0` |
| `npm audit --omit=dev --json` | Passed | Reported 0 production dependency vulnerabilities |
| `npm run lint` | Failed | Timed out twice with no useful output in this environment; later equivalent direct `npx tsc` commands both passed, so this may be command-wrapper/tooling behavior rather than a type error |
| `npx tsc --project tsconfig.server.json --noEmit` | Passed | Server TypeScript project compiled successfully |
| `npx tsc --project tsconfig.json --noEmit` | Passed | Frontend/shared TypeScript project compiled successfully |
| `npm run test:unit` | Failed | 115 passed, 2 failed: `frontend-contracts.test.ts` toast-length and raw-button contract failures |
| `npm run test:integration` | Failed | 154 passed, 3 failed: same frontend-contract failures plus `order-service.test.ts` SELL-order transaction test |
| `npm run build` | Passed | Vite production build and server TypeScript build both succeeded |
| `npm run test:e2e` | Failed | 20 passed, 1 failed: Firefox protected player-route smoke runtime error |
| Targeted Firefox Playwright harness repro | Passed | Did not reproduce a pageerror outside the full suite, so the Firefox route failure remains confirmed but not fully localized |

## 17. Recommended Fix Order

1. ISSUE-010, ISSUE-011
   - Reason for priority: The first five high-severity blockers are fixed. Remaining production-readiness work should focus on proxy trust and public operational exposure.
   - Suggested fix owner/scope: Platform/runtime owner with backend support.
   - Regression risk: Medium to High

2. ISSUE-004 distributed-mode follow-up, if horizontal scaling is required
   - Reason for priority: Single-instance mode is now enforced/documented. True horizontal scaling still requires an intentional distributed rollout and load testing.
   - Suggested fix owner/scope: Platform/runtime owner with backend support.
   - Regression risk: High

3. ISSUE-006, ISSUE-015
   - Reason for priority: Auth hardening issues around backup-factor lifecycle and account enumeration should be addressed before wider production exposure.
   - Suggested fix owner/scope: Auth/security owner.
   - Regression risk: Medium

4. ISSUE-007, ISSUE-012, ISSUE-013
   - Reason for priority: These affect protected-route reliability and core gameplay continuity for authenticated users.
   - Suggested fix owner/scope: Frontend owner with socket/auth backend coordination.
   - Regression risk: Medium

5. ISSUE-008, ISSUE-009
   - Reason for priority: These are contract/UX correctness issues in core user flows that can create confusing or incomplete outcomes.
   - Suggested fix owner/scope: Frontend + API contract owner.
   - Regression risk: Medium

6. ISSUE-014
   - Reason for priority: Verification needs to reflect the real health of the codebase before the repository can be trusted during future fixes.
   - Suggested fix owner/scope: Repo maintainers / CI owners.
   - Regression risk: Low to Medium

## 18. Final Notes

Assumptions:
- The audit was performed against the current local working tree, including uncommitted changes already present in the repository.
- This high-severity pass edited targeted backend/config/test/report files only for ISSUE-001 through ISSUE-005.

Uncertainty:
- The Firefox protected-route runtime error is confirmed by the E2E suite but was not fully localized to a single component from a standalone repro script.
- Live provider behavior for Google OAuth, Gmail, Turnstile, Redis HA, Mongo deployment topology, and TON infrastructure was not directly exercised.

Areas requiring manual verification:
- Render production service settings: exactly one web instance and `WEB_CONCURRENCY=1` for `PRODUCTION_TOPOLOGY=single-instance`, or all distributed flags enabled before horizontal scaling.
- Real withdrawal recovery operator runbook and chain-verification responsibilities
- Real external service credentials, quotas, and delivery behavior
- Browser/device coverage beyond the existing Playwright matrix

Areas requiring product decisions:
- Whether paid-public matches should be modeled as a distinct contract instead of zero-vs-positive wager inference
- Whether registration should preserve explicit duplicate feedback or move to fully generic public responses
- Whether public health endpoints are intentionally exposed or should be internal-only

Reviewed areas that looked healthy:
- Direct TypeScript compilation for both projects succeeds
- Production build succeeds
- `npm audit --omit=dev` is clean
- Auth/session tests are comparatively strong around OAuth state binding, cookie naming, rate limiting, and session rotation
- BUY order and paid public match happy paths have meaningful E2E coverage

Risks to monitor after fixes:
- Deposit replay correctness after outages
- Withdrawal confirmation/recovery idempotency
- Multi-instance coordination under Redis/BullMQ/socket scaling if `PRODUCTION_TOPOLOGY=distributed` is later enabled
- Protected-route stability across all supported browsers

## 19. High-Severity Fix Pass

Issues fixed:
- ISSUE-001: Deposit replay/memo eligibility now uses the transfer event timestamp (`transaction_now`) for both preview classification and atomic memo claiming. Single-use memo claiming still requires `used != true`; processed transaction hashes are still honored and duplicate replay is not credited twice.
- ISSUE-002: Added admin stuck-withdrawal recovery at `POST /api/admin/withdrawals/:withdrawalId/recover` with `{ "action": "confirm" | "refund" }`. The route is behind existing authenticated, verified, admin, and MFA step-up middleware. Recovery re-checks TON chain state before resolution, confirms if found on-chain, and refunds only after no matching chain transfer is found.
- ISSUE-003: SELL payout details are now available only on authorized merchant/admin review surfaces. Default user-facing `serializeOrder()` omits `mpesaNumber`/`mpesaName`; admin serialization can opt in, and merchant dashboard/order desk selects and returns the fields for SELL review.
- ISSUE-004: Production topology is now explicit. Default mode is `PRODUCTION_TOPOLOGY=single-instance`; Render must run one web instance with `WEB_CONCURRENCY=1`. Distributed mode requires `FEATURE_DISTRIBUTED_LOCK=true`, `FEATURE_BULLMQ_JOBS=true`, and `FEATURE_REDIS_SOCKET_ADAPTER=true`.
- ISSUE-005: `/api/health/ready` now includes `mandatoryBackgroundJobs` and returns 503 when required jobs are disabled or report errors. `/api/health/live` remains process-liveness only.

Files changed:
- `.env.example`
- `server/app.ts`
- `server/config/env.ts`
- `server/config/env.test.ts`
- `server/controllers/order.controller.ts`
- `server/controllers/withdrawal-recovery.controller.ts`
- `server/middleware/app-health.test.ts`
- `server/middleware/deposit-reconciliation.test.ts`
- `server/middleware/merchant-dashboard.test.ts`
- `server/middleware/migration-services.test.ts`
- `server/middleware/order-service.test.ts`
- `server/middleware/withdrawal-recovery.test.ts`
- `server/repositories/deposit-memo.repository.ts`
- `server/repositories/withdrawal.repository.ts`
- `server/routes/admin.routes.ts`
- `server/serializers/api.ts`
- `server/services/audit.service.ts`
- `server/services/background-jobs.service.ts`
- `server/services/deposit-ingestion.service.ts`
- `server/services/merchant-dashboard.service.ts`
- `server/services/withdrawal-recovery.service.ts`
- `server/validation/request-schemas.ts`

Tests added:
- Deposit replay event-time memo tests for valid historical replay, true post-expiry rejection, single-use claim, duplicate replay idempotency, and unmatched expired memo behavior.
- Withdrawal recovery service/admin route tests for confirm, refund, idempotent repeated terminal actions, refund-after-confirm prevention, confirm-after-refund prevention, non-admin rejection, and MFA step-up rejection.
- SELL payout serializer/dashboard tests for authorized inclusion and default user-facing omission.
- Production topology env tests for single-instance default, distributed flag enforcement, Render instance-count enforcement, and Render internal Redis URL handling.
- Readiness tests for healthy mandatory jobs, failed worker initialization, failed recovery/hot-wallet monitor state, and liveness independence.

Commands run:
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/deposit-reconciliation.test.ts`
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/withdrawal-recovery.test.ts`
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/migration-services.test.ts`
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/merchant-dashboard.test.ts`
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/config/env.test.ts`
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/app-health.test.ts`
- Targeted combined payment/recovery tests: 47 passed, 0 failed.
- Targeted combined order/merchant tests: 26 passed, 0 failed.
- Targeted combined env/readiness tests: 15 passed, 0 failed.
- `npx tsc --project tsconfig.server.json --noEmit`: passed.
- `npx tsc --project tsconfig.json --noEmit`: passed.
- `npm run build`: passed.
- `npx playwright test tests/e2e/merchant.spec.ts`: passed, 3/3 browsers.

Failed commands:
- `npm run test:unit`: failed with 121 passed, 2 failed. Failures are the pre-existing `frontend-contracts.test.ts` toast-length and raw-button contract failures.
- `npm run test:integration`: failed with 169 passed, 3 failed. Failures are the two pre-existing frontend contract failures plus `distributed-lock.test.ts` heartbeat renewal behavior. The prior `order-service.test.ts` SELL fixture failure is fixed.

Remaining risks:
- Admin refund safety depends on the existing `findWithdrawalTransferOnChain` matching logic and the operator choosing refund only after the route reports no matching chain transfer.
- Single-instance production mode is safe only if Render is actually configured for one web instance and one Node process. Horizontal scaling remains blocked unless distributed mode is deliberately configured and tested.
- Render internal Redis `redis://` is allowed only for same-workspace/same-region private networking assumptions; external Redis must use `rediss://`.
- Manual reconciliation can still credit unmatched deposits by operator action; idempotency protections remain, but operator review quality is still a procedural control.

Manual checks still needed:
- Confirm Render service instance count is 1 and `WEB_CONCURRENCY=1` for staging/production.
- Confirm `/api/health/ready` is the Render health check endpoint and `/api/health/live` is not used for readiness gating.
- Exercise stuck-withdrawal recovery against a real TON testnet/mainnet transaction before enabling operator use in production.
- Verify merchant admins can see SELL payout fields in the deployed UI and normal users cannot see those fields in their order list.

Production rollout notes for Render:
- For staging now: use `PRODUCTION_TOPOLOGY=single-instance`, `RENDER_INSTANCE_COUNT=1`, `WEB_CONCURRENCY=1`, `FEATURE_DISTRIBUTED_LOCK=false`, `FEATURE_BULLMQ_JOBS=false`, and `FEATURE_REDIS_SOCKET_ADAPTER=false`.
- If using Render Key Value internal URL in the same workspace/region, `redis://` is accepted. External Redis URLs must be `rediss://`.
- Do not scale web instances horizontally until distributed topology is configured and tested with Redis locks, BullMQ scheduling, Socket.IO Redis adapter, and wallet-send serialization.
- Set Render health check path to `/api/health/ready` so failed mandatory background jobs keep the instance out of service.

## 20. Medium-Severity Production Readiness Pass

Issues fixed:
- ISSUE-010: Production now honors explicit `TRUST_PROXY` instead of hardcoding one hop. Production requires a bounded value, rejects `TRUST_PROXY=true`, and `.env.example` documents `TRUST_PROXY=1` as the normal Render proxy-hop default.
- ISSUE-011: Production health responses are redacted. `/api/health/live` remains public and minimal, `/api/health/ready` remains public for Render readiness checks but no longer exposes detailed build/runtime internals, and `/api/metrics` is unavailable in production unless `METRICS_TOKEN` is set. When enabled, metrics require `Authorization: Bearer <token>` and run through an explicit rate limiter.
- ISSUE-006: MFA recovery-code redemption is now atomic, so the same backup code cannot be consumed twice under concurrent requests. Recovery-code regeneration records an audit event and sends a user-visible security alert while returning the newly generated codes only in the regeneration response.
- ISSUE-014: The default `npm test` command now runs unit and integration suites. The frontend toast-length/raw-button contract failures and distributed-lock heartbeat failure are green in the current working tree.
- ISSUE-013: The Firefox protected-route runtime error is fixed by making the Playwright TonConnect wallet fixture match the SDK's expected wallet metadata. During full E2E verification, a separate WebKit route-cancellation issue was found and fixed with signal/page-unload scoped abort handling for merchant route loaders.

Files changed in this pass:
- `.env.example`
- `package.json`
- `server/app.ts`
- `server/config/env.ts`
- `server/config/env.test.ts`
- `server/controllers/auth.controller.ts`
- `server/middleware/app-health.test.ts`
- `server/middleware/auth-security.test.ts`
- `server/middleware/frontend-contracts.test.ts`
- `server/services/audit.service.ts`
- `server/services/auth-mfa.service.ts`
- `server/services/product-email-notification.service.ts`
- `server/services/user.service.ts`
- `src/components/Navbar.tsx`
- `src/components/merchant/MerchantLayout.tsx`
- `src/features/bank/DepositPanel.tsx`
- `src/features/bank/MerchantPanel.tsx`
- `src/features/bank/WithdrawPanel.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/auth/CompleteProfilePage.tsx`
- `src/pages/auth/ForgotPasswordPage.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/RegisterPage.tsx`
- `src/pages/auth/ResetPasswordPage.tsx`
- `src/pages/auth/SecuritySettingsPage.tsx`
- `src/pages/auth/VerifyEmailPage.tsx`
- `src/pages/merchant/DepositsPage.tsx`
- `src/pages/merchant/OrderDeskPage.tsx`
- `src/utils/isAbortError.ts`
- `tests/e2e/page-smoke.spec.ts`
- `reviewcodebase.md`

Tests added or updated:
- Production `TRUST_PROXY` tests for configured proxy use, required explicit production value, and rejection of arbitrary forwarded-header trust.
- Production health/metrics tests for redacted health payloads, Render-compatible readiness, disabled metrics without `METRICS_TOKEN`, bearer-token enforcement, and metrics rate-limit policy.
- MFA tests for concurrent recovery-code redemption, duplicate recovery-code rejection, unchanged TOTP verification, recovery-code regeneration output, audit emission, and security notification.
- Frontend contract tests for toast copy limits, raw button usage, and WebKit aborted-fetch classification.
- E2E fixture coverage for TonConnect wallet metadata across Chromium, Firefox, and WebKit.

Commands run:
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/app-health.test.ts`: passed, 11 tests.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/config/env.test.ts`: passed, 11 tests.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts`: passed, 21 tests.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts`: passed, 15 tests.
- `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/distributed-lock.test.ts`: passed, 4 tests.
- `npx playwright test tests/e2e/page-smoke.spec.ts --project=firefox`: passed, 3 tests.
- `npx playwright test tests/e2e/page-smoke.spec.ts --project=webkit -g "mobile merchant shell"`: passed, 1 test.
- `npx playwright test`: passed, 21 tests across Chromium, Firefox, and WebKit.
- `npx tsc --project tsconfig.server.json --noEmit`: passed.
- `npx tsc --project tsconfig.json --noEmit`: passed.
- `npm run build`: passed.
- `npm test`: passed, 128 unit tests and 182 integration tests.

Failed commands during this pass:
- An earlier `npx playwright test` run failed before the final WebKit route-cancellation fix: 20 passed, 1 failed on WebKit mobile merchant shell with `[getApiErrorMessage] TypeError: Load failed`. After the scoped abort handling change, the targeted WebKit regression and full Playwright suite both passed.
- One parallel verification attempt running both TypeScript projects, build, and `npm test` together timed out in this Windows workspace. The same commands passed when rerun sequentially.
- One targeted Firefox Playwright run timed out earlier at the shorter timeout, then passed when rerun with enough time for the full browser startup path.

Remaining risks:
- `/api/health/ready` remains public for Render readiness compatibility, but production responses are redacted. Ingress or network policy should still restrict health routes if the deployment permits it.
- `/api/metrics` is intentionally disabled in production unless `METRICS_TOKEN` is configured. Monitoring collectors must keep the token secret and send it as a bearer token.
- Recovery-code security notification delivery depends on the configured Gmail/product-email path. The audit event is the durable fallback signal.
- `TRUST_PROXY=1` is correct only for the normal single Render proxy hop. A different ingress chain needs an explicit topology-specific value.
- Live Google OAuth, Gmail delivery, Turnstile, Redis HA, Mongo, TON/Toncenter, and real Render proxy behavior still require environment-level verification.
- Open findings still not fixed in this pass: ISSUE-007, ISSUE-008, ISSUE-009, ISSUE-012, and ISSUE-015.

Render deployment notes:
- For normal Render web services, set `TRUST_PROXY=1`. Do not set `TRUST_PROXY=true`.
- Keep Render's health check path at `/api/health/ready`; `/api/health/live` should not be used as readiness because it only proves process liveness.
- Set `METRICS_TOKEN` only when a trusted monitoring collector needs `/api/metrics`; otherwise leave it unset so metrics are unavailable in production.
- Keep single-instance staging on `PRODUCTION_TOPOLOGY=single-instance`, `RENDER_INSTANCE_COUNT=1`, and `WEB_CONCURRENCY=1`.
- Do not scale horizontally until distributed topology is configured and tested with Redis locks, BullMQ scheduling, Socket.IO Redis adapter, and wallet-send serialization.

Staging safety:
- Staging is now safe enough for a single-instance Render smoke deploy with the documented settings, redacted readiness, and disabled or token-protected metrics. It is still not production-ready until the remaining open findings, live provider checks, and Render/TON operational runbooks are completed.

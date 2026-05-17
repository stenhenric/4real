# Architecture Map

Generated: 2026-05-16

## Carried-Forward Constraints

- Existing reports reviewed first: `reviewcodebase.md`, `auth-session-review.md`, and the `performance-review/` reports.
- The current worktree was already heavily modified before this pass; those edits are treated as existing user-owned work and were not reverted.
- Single-instance Render mode remains the safe production assumption unless distributed mode is explicitly configured and tested.
- Render internal `redis://` URLs may be valid for same-workspace/same-region private networking; production still rejects arbitrary cleartext Redis URLs.
- Auth/session, CSRF, CORS, Turnstile, Google OAuth state binding, MFA step-up, email verification, TON proof/wallet verification, money movement, health/readiness, audit logs, and rate limits must not be weakened for performance.
- Money-flow state transitions must remain backend-authoritative and idempotent.
- The provided MongoDB URI is treated as a test database only.

## Package and Runtime

- Package manager: npm (`package-lock.json` present).
- Node: `v24.15.0`.
- npm: `11.14.0`.
- Main scripts:
  - `dev`: `tsx main.ts`
  - `start`: `node ./dist/server/main.js`
  - `build`: `vite build && tsc --project tsconfig.server.json`
  - `lint`: `tsc --noEmit && tsc --project tsconfig.server.json --noEmit`
  - `test`: unit plus integration
  - `test:unit`: selected Node test files
  - `test:integration`: `server/middleware/*.test.ts`
  - `test:e2e`: build plus Playwright

## Frontend

- Entry points: `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/app/AppProviders.tsx`.
- Framework: React 19, Vite 6, TypeScript, roughjs/canvas helpers, Socket.IO client, TonConnect UI.
- App shell:
  - `AuthProvider` fetches `/api/auth/me`, owns in-memory auth state, refreshes user state after money/game actions, and dispatches logout/redirect helpers.
  - `ProtectedRoute` and `PublicOnlyRoute` provide UX routing only; backend route guards are still authoritative.
  - `AppProviders` wraps the app with auth/toast/TonConnect context.
- Public routes: `/`, `/privacy`, `/terms`, `/auth`, `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/magic-link`, `/auth/approve-login`, `/auth/verified`, `/auth/mfa`.
- Protected routes: `/auth/complete-profile`, `/auth/security`, `/play`, `/leaderboard`, `/bank`, `/game/:roomId`, `/profile/:userId`.
- Merchant/admin routes: `/merchant`, `/merchant/orders`, `/merchant/deposits`, `/merchant/liquidity`, `/merchant/alerts`.
- Frontend service layer: `src/services/*` wraps backend endpoints through `src/services/api/apiClient.ts`, which sends cookies, JSON headers, one shared refresh request, and auth redirect events.

## Backend

- Entry points: `main.ts`, `server/runtime.ts`, `server/app.ts`.
- Runtime startup sequence:
  - load env
  - ping Redis when configured
  - connect MongoDB
  - run `setupIndexes`
  - ensure system commission account
  - start background jobs
  - start game room registry
  - create Express app
  - attach Socket.IO and optional Redis adapter
- Global middleware chain:
  - dotpath blocker
  - request context
  - Helmet
  - CORS
  - compression
  - JSON body parser
  - cookie parser
  - public health/readiness/metrics/manifest
  - `/api/auth/me` missing-cookie fast path
  - `/api` general rate limiter
  - no-store API headers
  - CSRF protection
  - API route groups
  - API 404
  - frontend middleware
  - error handler

## Backend Routes

- `/api/auth`: register, password login, magic link, suspicious-login consume, Google OAuth, verification resend/consume, password forgot/reset, MFA challenge/setup/verify/disable/recovery codes, refresh, me, logout, sessions, profile completion.
- `/api/users`: leaderboard, user profile.
- `/api/matches`: public active list, authenticated create/join/resign/history/room access.
- `/api/orders`: merchant config, user orders, create order, admin status update.
- `/api/transactions`: authenticated transaction feed, admin all transactions, withdrawal status, deposit memo, TonConnect deposit preparation, withdrawal request.
- `/api/admin`: merchant config/dashboard/orders/deposits, deposit replay/reconcile, withdrawal recovery.
- `/api/health`, `/api/health/live`, `/api/health/ready`: public operational checks with production redaction.
- `/api/metrics`: public in development, bearer-token protected or 404 in production.
- `/tonconnect-manifest.json`: public wallet manifest.

## Route Guards

- `authenticateToken`: validates auth cookie through `AuthSessionService`.
- `requireVerifiedAccount`: requires email verification and profile completion.
- `requireAdmin`: checks backend principal `isAdmin`.
- `requireMfaStepUp`: requires enabled MFA and fresh step-up challenge for sensitive actions.
- `requireMfaStepUpIfEnabled`: requires step-up only when MFA is already enabled.
- `validateBody`: applies zod request schemas.
- State-changing frontend API routes pass through CSRF middleware after the general API limiter.

## Controllers and Services

- Auth: `auth.controller.ts`, `auth-session.service.ts`, `auth-mfa.service.ts`, `auth-email.service.ts`, `one-time-token.service.ts`, `google-oauth.service.ts`, `auth-turnstile.service.ts`.
- Game/matches: `match.controller.ts`, `match.service.ts`, `match-payout.service.ts`, `game-room.service.ts`, `game-room-registry.service.ts`, `realtime-match.service.ts`, Socket.IO handlers.
- Transactions/bank: `transaction.controller.ts`, `transaction.service.ts`, `deposit-service.ts`, `deposit-tonconnect.service.ts`, `withdrawal-service.ts`, `withdrawal-engine.ts`, withdrawal and deposit repositories.
- Merchant/admin: `merchant-admin.controller.ts`, `merchant-dashboard.service.ts`, `merchant-config.service.ts`, `order.controller.ts`, `order.service.ts`, `order-proof-relay.service.ts`.
- Ops/observability: `metrics.service.ts`, `background-jobs.service.ts`, `bullmq-jobs.service.ts`, `redis.service.ts`, request context/logger/build info.

## Database Models and Repositories

- Mongoose models: `User`, `AuthSession`, `OneTimeToken`, `Match`, `Order`, `Transaction`, `MerchantConfig`.
- Raw Mongo repositories: user balances, deposit memos, deposits, unmatched deposits, withdrawals, failed deposit ingestion, processed transactions, idempotency keys, distributed locks, poller state, order proof relay, audit events, jetton wallet cache.
- Hot query families:
  - auth/session token hashes and TTL cleanup
  - user leaderboard/profile
  - active match list and room lookup
  - user transaction feed across ledger/deposits/withdrawals
  - merchant order desk filters and risk summary
  - withdrawal queue/recovery/confirmation
  - failed deposit retry and memo reconciliation

## Redis, Cache, Queues, and Realtime

- Redis backs sessions/token caches, MFA/OAuth transient state, rate limiting, general cache helpers, locks, Socket.IO adapter when enabled, and BullMQ when enabled.
- Cache helper coalesces concurrent cache fills and applies TTL jitter.
- Cached surfaces include active matches, merchant dashboard, merchant config, hot-wallet balance snapshot, and likely leaderboard slices.
- Single-instance mode remains the safer default; distributed mode requires Redis locks, BullMQ jobs, and Redis Socket.IO adapter together.

## Auth and Session Flow

- Password/register routes validate body, apply auth/email rate limiters, and require Turnstile where configured.
- Successful auth creates session documents and access/refresh cookies.
- `/api/auth/refresh` rotates refresh tokens through `AuthSessionService`.
- `/api/auth/me` validates current access token and returns serialized auth state without password hash.
- MFA step-up is stored server-side and enforced on sensitive routes.
- Logout clears cookies/state and should remain terminal.

## OAuth, Turnstile, and Email

- Google OAuth start/callback uses `google-oauth.service.ts` and Redis-backed state.
- Turnstile server-side validation happens in `auth-turnstile.service.ts`; prior performance pass added an outbound timeout while preserving fail-closed behavior.
- Product/auth email delivery uses Gmail service and product-email notification service. Some delivery attempts remain in request paths.

## TON, Deposits, Withdrawals, and Merchant Orders

- TonConnect deposit preparation validates wallet address server-side and binds memo/user/amount in backend service code.
- Deposit polling ingests Toncenter transfer data through external schemas and memo repositories.
- Withdrawals require auth, verified profile, MFA step-up, idempotency key, backend address parsing, balance deduction, audit event, queue insertion, and worker processing.
- Merchant BUY/SELL orders compute rates and fiat totals server-side from merchant config; proof image validation is backend-side for BUY orders.
- SELL payout fields are serialized only where server endpoints include them for admin/merchant flows.

## Game and Realtime Flow

- Public active matches are cached and served without auth.
- Create/join/resign require auth, verified profile, idempotency, and backend match service state transitions.
- Game room state is held in `GameRoomRegistry`, mirrored to Redis where configured, and accessed through Socket.IO handlers with server-side room participation checks.

## Health, Readiness, Metrics

- Liveness is cheap and public.
- Readiness checks Mongo connection state, Redis probe, BullMQ probe, hot-wallet runtime config, shutdown state, and mandatory background job status.
- Production readiness response redacts detailed job internals.
- Metrics are bearer-token protected in production when `METRICS_TOKEN` is configured; absent token config returns 404 in production.

## Environment Variables

- Key groups: MongoDB pool/timeouts, auth/session TTLs, TOTP key, Google OAuth/Gmail, Turnstile, TON/hot wallet/Toncenter, Telegram proof relay, Redis/retry, topology feature flags, merchant config, public origin/CORS, rate limits, request/server timeouts, room TTLs, withdrawal limits, trust proxy.
- `.env` was inspected only for key names, not secret values.

## Deployment Assumptions

- Render-compatible process listens on `0.0.0.0:${PORT}`.
- Production requires explicit MongoDB URI with database name and TLS, explicit Redis URL, explicit trust proxy, non-local origin, and either single-instance constraints or full distributed feature flags.
- `/tonconnect-manifest.json` must stay public, stable, and fast for wallet discovery.

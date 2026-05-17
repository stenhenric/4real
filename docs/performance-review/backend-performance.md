# Backend Performance Review

## Scope

Inspected Express app setup, route groups, middleware tests, controllers, services, database calls, Redis/cache usage, external integrations, and worker paths. No production traffic or live provider timings were available.

References:

- Express production performance: https://expressjs.com/en/advanced/best-practice-performance.html
- Express security best practices: https://expressjs.com/en/advanced/best-practice-security.html
- Node.js diagnostics: https://nodejs.org/en/learn/diagnostics
- Node.js flame graphs: https://nodejs.org/en/learn/diagnostics/flame-graphs
- TON Connect requests/responses: https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md

## Route Group Maps

Route group: App/global middleware

- Routes: all `/api/*`, static frontend, health/metrics
- Middleware chain: trust proxy/env checks, request IDs, logging, compression, body parsers, CORS/CSRF/rate limits by route class, static fallback
- Controller/service path: `server/app.ts`
- DB calls: route dependent
- Redis calls: rate limiting/session dependent
- External calls: route dependent
- Likely latency sources: broad middleware on every request, logging, rate-limit Redis calls, body parsing for write routes
- Findings: compression and request duration logs exist. Rate-limit tests prove auth/general limiter do not double-count one auth request.
- Safe optimizations: keep security middleware; add per-dependency timing before changing ordering.
- Tests needed: keep integration coverage for auth/rate-limit/CSRF/health.

Route group: Auth/password/register/email/session

- Routes: login, register, verify/resend, magic link consume, logout, session revoke, MFA setup/verify
- Middleware chain: body validation, rate limits, Turnstile for protected flows, auth/session guards, CSRF on state-changing browser requests
- Controller/service path: `auth.controller.ts`, auth services, user/session services
- DB calls: user lookup/update, session create/revoke, token consume, MFA state updates
- Redis calls: rate limiting, session/token state depending config
- External calls: Turnstile, email delivery, Google OAuth where applicable
- Likely latency sources: external Turnstile and email provider calls
- Findings: Turnstile fetch had no explicit timeout; fixed. Email delivery remains awaited in some request paths but tests show failure is handled without failing registration/resend response.
- Safe optimizations: move non-critical email into background job only if product accepts eventual notification; preserve email verification/security semantics.
- Tests needed: auth security integration, provider timeout tests, email failure tests.

Route group: Match/game/realtime

- Routes: active matches, create/join match, match preview, room state, Socket.IO game events
- Middleware chain: auth/session, verified user, validation, idempotency where relevant
- Controller/service path: match controller/services, realtime service, game room registry
- DB calls: match lists/history, create/join/update, user balance/ledger for paid games
- Redis calls: active room/cache/Socket.IO adapter/locks where distributed mode enabled
- External calls: none on normal gameplay hot path
- Likely latency sources: Socket.IO Redis adapter in distributed mode, room cache refresh, game board client rendering
- Findings: route-level tests cover private match hiding and cached room refresh. No safe code change made.
- Safe optimizations: add room-event timing and queue/adapter latency logs before distributed mode.
- Tests needed: E2E realtime match smoke, load tests for active match listing.

Route group: Bank/transactions/withdrawals/deposits

- Routes: transaction feed, admin transactions, deposit memo, withdrawal request/status, deposit polling/worker
- Middleware chain: auth/session, verified user, MFA step-up for withdrawals, validation, idempotency
- Controller/service path: `transaction.controller.ts`, deposit/withdrawal services/repositories
- DB calls: user transactions, match/order/ledger merges, withdrawal queue, failed deposit ingestion
- Redis calls: locks, cache invalidation, queues depending mode
- External calls: Toncenter, wallet RPC for deposits/withdrawals
- Likely latency sources: unified transaction feed in-memory merge, Toncenter/wallet provider calls, worker scans
- Findings: admin transaction chronology index added; withdrawal stale-processing index added; failed deposit retry indexes added. Unified user transaction feed remains an open high-impact candidate.
- Safe optimizations: redesign feed around a persisted ledger/read model or keyset pagination; do not change money movement semantics casually.
- Tests needed: transaction feed bounds tests, repository index tests, withdrawal/deposit worker integration.

Route group: Merchant dashboard/order desk/deposits/liquidity/alerts

- Routes: `/api/merchant/dashboard`, `/api/merchant/orders`, deposit reconciliation, liquidity, alerts
- Middleware chain: auth/session, verified user, admin/merchant authorization, MFA step-up where configured, validation
- Controller/service path: merchant controllers and `MerchantDashboardService`
- DB calls: order list/count/aggregates, user joins, deposit/withdrawal/liquidity summaries
- Redis calls: merchant dashboard cache and invalidation
- External calls: Toncenter/on-chain balance calls for liquidity/dashboard cold cache
- Likely latency sources: dashboard cold cache, order desk filters/sorts, aggregate over user history, on-chain calls
- Findings: order desk indexes added. Dashboard cold-cache external calls and unbounded pending order summary remain open.
- Safe optimizations: add dependency timing; consider moving slow on-chain fields to stale-while-revalidate cache if correctness is documented.
- Tests needed: merchant dashboard/order desk integration, E2E merchant routes.

Route group: Health/readiness/metrics

- Routes: `/api/health`, `/api/health/live`, `/api/health/ready`, `/api/metrics`
- Middleware chain: public health, token-protected metrics when configured
- Controller/service path: app health checks, background job status
- DB calls: readiness dependent
- Redis calls: readiness/cache dependent
- External calls: none expected
- Likely latency sources: readiness checks can block if dependencies hang
- Findings: prior reports fixed redaction and readiness behavior. Current integration output showed readiness route durations up to about 2.6s in tests, which is acceptable for tests but worth monitoring in staging.
- Safe optimizations: add readiness reason timing and dependency deadlines.
- Tests needed: app-health integration.

## Open Backend Findings

### PERF-BE-002: Unified transaction feed overfetches and merges in memory

- Evidence: controller tests bound page/pageSize, but service design fetches data from multiple sources before merging.
- Impact: page number can multiply source fetch count and sorting work.
- Safe direction: move toward a single ledger/read model or keyset-pagination query per source with merge cursor.
- Risk: high correctness risk in money/history display; no change applied.

### PERF-BE-003: Email/notification provider calls in request path

- Evidence: auth and order tests/logs show delivery can be attempted during user-facing flows; delivery failure is handled.
- Impact: provider latency can delay responses even when the core DB state is already committed.
- Safe direction: background queue for non-critical notifications, with audit logs and retries.
- Risk: email verification and security notification semantics must remain intact.

### PERF-BE-004: External TON/Toncenter latency in admin/liquidity paths

- Evidence: service inspection shows Toncenter/wallet RPC in deposit/withdrawal/liquidity flows.
- Impact: cold dashboard/liquidity routes can be provider-bound.
- TON Connect reference point: the spec states `ton_addr` wallet data is untrusted unless `ton_proof` is requested and verified, and it recommends extracting public keys locally from `walletStateInit` before falling back to on-chain `get_public_key` to reduce unnecessary blockchain calls.
- Safe direction: timeout/circuit metrics and stale-safe cached public/admin summaries; do not cache balances unless correctness and invalidation are proven. For any TON proof verification path, prefer local `walletStateInit` parsing before on-chain fallback and instrument fallback frequency/duration.

### PERF-BE-005: TON Connect manifest route should stay public and cheap

- Evidence: `server/app.ts` serves `/tonconnect-manifest.json` before `/api` rate limiting/CSRF. The TON Connect spec requires this manifest and linked icon/policy URLs to be publicly accessible by wallets.
- Impact: manifest failures can make wallet connect look slow or broken before any app API request is visible.
- Safe direction: keep this route unauthenticated, cacheable where safe, and covered by a Render smoke check. Do not put it behind auth, CSRF, or API rate limiting.

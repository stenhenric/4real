# Observability Plan

## Current Evidence

The app already emits request completion logs with request IDs, trace IDs, method/path/status/duration, and selected health/worker events. Tests show health/readiness/metrics redaction behavior and many worker/audit logs.

Remaining gap: route duration exists, but dependency duration is not consistently broken down into MongoDB, Redis, external API, wallet RPC, email, and background job spans. Frontend Web Vitals and route interaction timings are not collected.

References:

- OpenTelemetry docs: https://opentelemetry.io/docs/
- Node diagnostics: https://nodejs.org/en/learn/diagnostics
- Render health checks: https://render.com/docs/deploys#health-checks
- Web performance: https://web.dev/performance/
- TON Connect requests/responses: https://github.com/ton-blockchain/ton-connect/blob/main/requests-responses.md

## Backend Plan

Add or improve:

- Per-route request duration logs: already present; keep request IDs.
- Slow route threshold logs: emit structured warning above a chosen threshold, for example 1000 ms for normal API and 3000 ms for provider-heavy admin paths.
- MongoDB timing: wrap repository/service query helpers with collection/query name, duration, row count where safe, and slow threshold.
- Redis timing: log cache name, hit/miss/fill/error, operation duration bucket, and lock acquire/hold timings.
- External API timing:
  - Cloudflare Turnstile verification duration and timeout count.
  - Google OAuth token/profile duration and failure reason class.
  - Gmail/email send duration and circuit state.
  - Toncenter/wallet RPC duration, timeout, retry count, and circuit state.
- TON Connect protocol timing:
  - Manifest request availability from the public app origin.
  - Wallet connect success/error event counts by wallet app and platform, without logging addresses or proof payloads.
  - `ton_proof` verification duration, local `walletStateInit` parse success rate, on-chain public-key fallback count/duration, and failure reason class.
  - `sendTransaction` request duration, wallet error code class, and client-side cancellation/decline rate.
- Background job duration: pollers, withdrawal worker, reconciliation, recovery, queue job duration.
- Queue depth/lag metrics for BullMQ mode.
- Readiness reason fields with dependency timing and deadline outcomes.
- Error rate by route and dependency.

Implementation guidance:

- Prefer small wrappers around existing service boundaries over invasive tracing rewrites.
- Avoid logging secrets, tokens, wallet private material, Turnstile tokens, OAuth payloads, or private user data.
- Avoid logging TON proof payloads, wallet signatures, raw addresses in public logs, or transaction BOCs. Use hashed/session-scoped identifiers where correlation is necessary.
- Sample high-volume success logs if volume becomes expensive.

## Frontend Plan

Add:

- Web Vitals reporting for LCP, CLS, INP, FCP, TTFB with route and build version.
- Route transition timing around React Router navigation.
- API request timing in the shared API client, with route/method/status/duration/error class.
- Long task detection through `PerformanceObserver` where supported.
- Error boundary reporting with route/build/user role only, no secrets.
- Interaction timing for key flows:
  - leaderboard tab open
  - merchant dashboard refresh
  - order filter change
  - game move
  - bank panel switch
  - TonConnect wallet connect
  - TonConnect deposit `sendTransaction`

## Optional OpenTelemetry

Use OpenTelemetry if the app already has or will add a collector:

- Span: HTTP request
- Child spans: auth/session lookup, MongoDB query, Redis command group, external provider call, email send, wallet RPC
- Attributes: route template, status code, dependency name, sanitized operation name, cache hit/miss
- Export: Render-friendly logs or external collector

## Dashboards and Alerts

Suggested panels:

- API p50/p95/p99 by route
- 5xx and 4xx rate by route
- MongoDB slow query count by operation
- Redis latency and error count by operation group
- External provider latency and timeout count
- Background job duration and failure count
- Queue depth and oldest job age
- Frontend Web Vitals by route/device

Suggested alerts:

- `/api/health/ready` failing for 2 consecutive checks
- route p95 over threshold for 10 minutes
- Turnstile/Gmail/Google/Toncenter timeout spike
- Redis unavailable or high latency
- withdrawal/deposit worker failure
- failed deposit retry backlog growth

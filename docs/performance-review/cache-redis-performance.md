# Redis and Cache Performance Review

## Scope

Inspected Redis usage for sessions, rate limiting, OAuth/MFA state, locks, queues, Socket.IO adapter, dashboard/list caches, and cache invalidation patterns. No live Redis latency measurement was available.

References:

- Redis caching: https://redis.io/learn/howtos/caching/
- Redis performance optimization: https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/
- Redis latency: https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/
- Render Key Value: https://render.com/docs/key-value

## Redis Usage Map

- Rate limiting: general/auth/identifier limits with tests verifying no duplicate counting on one auth request.
- Session/token/OAuth/MFA state: security-sensitive, must keep short TTL and scoped keys.
- Locks: deposit/withdrawal/game-room/critical sections.
- Queues: BullMQ mode for background jobs when enabled; local intervals otherwise.
- Socket.IO adapter: distributed mode candidate, not assumed safe by default.
- Caches: active matches, leaderboard, merchant dashboard cache, invalidation after relevant writes.

## Findings

### PERF-REDIS-001: Redis dependency latency needs explicit visibility

- Evidence: source inspection shows Redis in rate limits, sessions, locks, queues, cache, and Socket.IO. Existing request logs do not break out Redis duration by command/path.
- Impact: slow Redis can look like generic route slowness.
- Safe direction: add lightweight timing around high-level Redis helpers and cache helpers, not raw verbose per-command logs in hot production paths.
- Status: documented; no code change.

### PERF-REDIS-002: Cache candidates must stay correctness-safe

- Safe candidates:
  - Public/static-ish config values.
  - Public leaderboard slices with short TTL and invalidation after score-changing events.
  - Active public match summaries with short TTL and invalidation after create/join/finish.
  - Merchant dashboard summaries with scoped admin access and explicit invalidation.
- Unsafe candidates without more proof:
  - Auth/session authorization decisions.
  - Private user data beyond scoped, short-lived, invalidated keys.
  - Money balances unless correctness and invalidation are proven.
  - Wallet/payment authorization state.
- Status: documented; no new cache added.

### PERF-REDIS-003: Distributed mode remains a separate test target

- Evidence: prior reports and current source distinguish single-instance Render from queue/adapter/distributed modes.
- Impact: Socket.IO adapter, locks, BullMQ, and local caches have different behavior under distributed mode.
- Safe direction: keep single-instance as operational default until distributed mode has dedicated staging tests.
- Status: documented.

## Tests and Evidence

- `npm run test:integration` includes rate limiter tests and cache helper tests:
  - Redis-backed general/auth rate limiters do not double-count one auth request.
  - `getOrPopulateJson` coalesces concurrent cache misses and serves cache hits.
  - cache invalidation removes cached values before recompute.

## Recommended Redis Observability

- Log cache hit/miss/fill/error counts by cache name.
- Log Redis operation duration buckets for rate limit, session, lock, queue, and cache helpers.
- Log lock acquire timeout count and hold duration for wallet/game/deposit locks.
- Track BullMQ queue depth, delayed jobs, failed jobs, and job duration when queue mode is enabled.
- Add startup/readiness deadlines around Redis ping/adapter readiness so Render probes cannot hang indefinitely.


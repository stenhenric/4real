# Caching Strategy Report

Date: 2026-05-17

## Summary

Implemented a conservative layered caching strategy:

- API default: `Cache-Control: no-store, max-age=0` through `apiNoStoreMiddleware`.
- Sensitive/auth/session/payment/wallet/admin/user-specific responses: `no-store`.
- Static hashed assets: long immutable browser/CDN cache.
- Public anonymous read-heavy APIs: short shared-cache headers plus Redis cache-aside only where data is public and invalidation is controlled.
- Redis cache-aside: loader fallback on Redis read/write/delete failures, in-process request coalescing for hot keys, namespaced/versioned/deterministic keys.
- Removed Redis caching from admin dashboard wallet-balance state.
- Public cacheable responses explicitly include `Vary: Accept-Encoding`; CORS may also append `Origin` where applicable.
- Cache observability is exposed through `cache_events_total{event,namespace}` metrics plus structured warning logs for Redis failures.
- Final production-hardening verification confirmed that Cloudflare must be configured as an allow-list cache, not a broad `/api/*` cache.

## Final Route Verification Status

- Verified from implementation that `/api` traffic receives `Cache-Control: no-store, max-age=0` before API routes are mounted, except the two controllers that intentionally override it for public anonymous GET responses: `GET /api/users/leaderboard` and `GET /api/matches/active`.
- Verified auth, session, password reset, MFA, OAuth, admin, order, transaction, wallet, withdrawal, user-specific, mutation, and API error responses are no-store.
- Verified SPA shell routes, auth/token-bearing frontend URLs, dotfile probes, scanner/probe paths, and unknown frontend routes are no-store.
- Verified cacheable surfaces remain limited to `/assets/*`, `/fonts/*`, `/tonconnect-icon.svg`, `/tonconnect-manifest.json`, `GET /api/users/leaderboard`, and `GET /api/matches/active`.
- Verified public cacheable responses/assets include `Vary: Accept-Encoding`. `Vary: Origin` can also appear when CORS handles an allowed origin; the two public API payloads do not include user-specific data, so this does not create a privacy leak. Cloudflare should still bypass requests with `Cookie` or `Authorization`.

## References Used

- MDN Cache-Control: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
- MDN HTTP caching: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
- web.dev HTTP cache: https://web.dev/articles/http-cache
- web.dev stale-while-revalidate: https://web.dev/articles/stale-while-revalidate
- AWS Redis database caching strategies: https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html
- Cloudflare cache concepts: https://developers.cloudflare.com/cache/concepts/
- Cloudflare cache rules: https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## Redis Cache Keys

All Redis cache keys are built as `4real:cache:<namespace>:v<version>:<encoded-parts>`.

- `leaderboard`: `4real:cache:leaderboard:v1:top:<limit>`, TTL 30s.
- `activeMatches`: `4real:cache:activeMatches:v1:public`, TTL 5s.
- `merchantConfig`: `4real:cache:merchantConfig:v1:default`, TTL 60s.
- `jettonWallet`: `4real:cache:jettonWallet:v1:<owner>:<master>`, TTL 86400s. This caches derived wallet-address mapping, not balances.

Legacy constants for `merchantDashboard` and `merchantBalanceSnapshot` remain in code only for explicit invalidation/backward cleanup paths. No normal cache population stores admin dashboard snapshots or wallet balances.

## Redis Failure Behavior

- Read failure: `getOrPopulateJson` records `cache_events_total{event="read_failed"}`, logs `cache.read_failed`, and continues to the loader.
- Write failure: the response path continues after local in-process cache population; Redis errors record `cache_events_total{event="write_failed"}` and log `cache.write_failed`.
- Invalidation failure: local entries are removed first; Redis delete failures record `cache_events_total{event="invalidate_failed"}` and log `cache.invalidate_failed`.
- Loader failure: in-flight state is cleared in `finally`, `cache_events_total{event="loader_failed"}` is recorded, and the original loader error is propagated.
- Request coalescing: concurrent misses for the same key share one promise and record `cache_events_total{event="coalesced"}`.

## Route Review

| Route | Classification | Cache-Control | Redis | TTL | Invalidation Triggers | Risks / Mitigations |
|---|---|---|---|---:|---|---|
| `/.*/dotfile paths` | sensitive probe/blocked path | `no-store, max-age=0` | No | N/A | N/A | Blocks dotfile leakage; no cacheable error body. |
| `/assets/*` | static asset | `public, max-age=31536000, immutable`; `Vary: Accept-Encoding` | No | 1 year | filename/content hash via build | Safe only for bundled immutable assets. |
| `/fonts/*`, `/tonconnect-icon.svg`, other non-HTML dist files | static asset | `public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600, stale-if-error=86400`; `Vary: Accept-Encoding` | No | 1 day | deploy/version replacement | Shorter TTL because names may not be content-hashed. |
| `/`, `/privacy`, `/terms`, `/auth`, `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/magic-link`, `/auth/approve-login`, `/auth/verified`, `/auth/mfa`, `/auth/complete-profile`, `/auth/security`, `/play`, `/leaderboard`, `/bank`, `/merchant`, `/merchant/orders`, `/merchant/deposits`, `/merchant/liquidity`, `/merchant/alerts`, `/game/:roomId`, `/profile/:id` | SPA shell | `no-store, max-age=0` | No | N/A | N/A | Prevents stale app shell and token-bearing auth URLs from being stored. |
| Scanner/probe frontend paths | sensitive probe/blocked path | `no-store, max-age=0` | No | N/A | N/A | Prevents caching of negative probe responses. |
| `/api/health` | public GET | `no-store, max-age=0` | No | N/A | N/A | Health state changes frequently; production payload is redacted. |
| `/api/health/live` | public GET | `no-store, max-age=0` | No | N/A | N/A | Liveness is current state, not cacheable. |
| `/api/health/ready` | public GET | `no-store, max-age=0` | No | N/A | N/A | Readiness reflects DB/Redis/BullMQ/hot-wallet/background-job state. |
| `/api/metrics` | sensitive/admin operational route | `no-store, max-age=0` | No | N/A | N/A | Production requires bearer token; response is not cached. |
| `/tonconnect-manifest.json` | public GET | `public, max-age=300, s-maxage=300, stale-while-revalidate=60, stale-if-error=300`; `Vary: Accept-Encoding` plus CORS `Origin` where applicable | No | 5 min | deploy/config change | Public metadata only; short TTL limits stale manifest risk. |
| `/api/auth/register` | sensitive auth mutation | `no-store, max-age=0` | No | N/A | N/A | No auth/token response caching. |
| `/api/auth/login/password` | sensitive auth mutation | `no-store, max-age=0` | No | N/A | N/A | No credential/token response caching. |
| `/api/auth/login/magic-link/request` | sensitive verification mutation | `no-store, max-age=0` | No | N/A | N/A | No email/token flow caching. |
| `/api/auth/login/magic-link/consume` | sensitive token mutation | `no-store, max-age=0` | No | N/A | N/A | Token consumption result is never stored. |
| `/api/auth/login/suspicious/consume` | sensitive token mutation | `no-store, max-age=0` | No | N/A | N/A | Token consumption result is never stored. |
| `/api/auth/oauth/google/start` | sensitive auth redirect GET | `no-store, max-age=0` | No | N/A | N/A | OAuth state/redirects must not be cached. |
| `/api/auth/oauth/google/callback` | sensitive auth callback GET | `no-store, max-age=0` | No | N/A | N/A | OAuth code/session response must not be cached. |
| `/api/auth/email/verify/resend` | sensitive verification mutation | `no-store, max-age=0` | No | N/A | N/A | Verification flow is never cached. |
| `/api/auth/email/verify/consume` | sensitive token mutation | `no-store, max-age=0` | No | N/A | N/A | Token response is never cached. |
| `/api/auth/password/forgot` | sensitive reset mutation | `no-store, max-age=0` | No | N/A | N/A | Password reset response is never cached. |
| `/api/auth/password/reset` | sensitive reset mutation | `no-store, max-age=0` | No | N/A | N/A | Password reset response is never cached. |
| `/api/auth/mfa/challenge` | sensitive MFA mutation | `no-store, max-age=0` | No | N/A | N/A | MFA/session state is never cached. |
| `/api/auth/refresh` | sensitive session mutation | `no-store, max-age=0` | No | N/A | N/A | Session/token response is never cached. |
| `/api/auth/me` | authenticated GET | `no-store, max-age=0` | No | N/A | N/A | User-specific response; missing-cookie path bypasses Redis-backed limiter and is no-store. |
| `/api/auth/logout` | sensitive session mutation | `no-store, max-age=0` | No | N/A | N/A | Session mutation is never cached. |
| `/api/auth/sessions` | authenticated session GET | `no-store, max-age=0` | No | N/A | N/A | Session list is sensitive personal data. |
| `/api/auth/sessions/:sessionId` | sensitive session mutation | `no-store, max-age=0` | No | N/A | N/A | Session revocation is never cached. |
| `/api/auth/sessions/revoke-others` | sensitive session mutation | `no-store, max-age=0` | No | N/A | N/A | Session revocation is never cached. |
| `/api/auth/mfa/totp/setup` | sensitive MFA mutation | `no-store, max-age=0` | No | N/A | N/A | Secret setup response is never cached. |
| `/api/auth/mfa/totp/verify` | sensitive MFA mutation | `no-store, max-age=0` | No | N/A | N/A | MFA verification response is never cached. |
| `/api/auth/mfa/disable` | sensitive MFA mutation | `no-store, max-age=0` | No | N/A | N/A | MFA state mutation is never cached. |
| `/api/auth/mfa/recovery-codes/regenerate` | sensitive MFA mutation | `no-store, max-age=0` | No | N/A | N/A | Recovery codes are never cached. |
| `/api/auth/profile/complete` | authenticated mutation | `no-store, max-age=0` | No | N/A | N/A | User-specific mutation is never cached. |
| `/api/users/leaderboard` | public GET | `public, max-age=30, s-maxage=30, stale-while-revalidate=30, stale-if-error=60`; `Vary: Accept-Encoding` | Yes: `4real:cache:leaderboard:v1:top:10` | 30s | match settlement, active/waiting expiry, cache TTL | Public only; serializer returns `id`, `username`, `elo`; Redis fallback to DB/source on outage; coalesced hot-key loads. |
| `/api/users/:userId` | public GET | `no-store, max-age=0` | No | N/A | N/A | Public profile is not shared-cached to avoid stale stats/identity bugs. |
| `/api/matches/active` | public GET | `public, max-age=5, s-maxage=5, stale-while-revalidate=10, stale-if-error=30`; `Vary: Accept-Encoding` | Yes: `4real:cache:activeMatches:v1:public` | 5s | create, join, resign, waiting expiry, match-service invalidation | Only public waiting matches; private matches excluded by query; serializer does not expose invite token hashes. |
| `/api/matches` | mutation/write route | `no-store, max-age=0` | No | N/A | Invalidates `activeMatches` | Idempotent mutation; no POST response caching. |
| `/api/matches/:roomId/join` | mutation/write route | `no-store, max-age=0` | No | N/A | Invalidates `activeMatches` | Auth/wallet balance effects; no response caching. |
| `/api/matches/:roomId/resign` | mutation/write route | `no-store, max-age=0` | No | N/A | Invalidates `activeMatches` and `leaderboard` | Settlement may update balance/stats; response is not cached. |
| `/api/matches/user/:userId` | authenticated GET | `no-store, max-age=0` | No | N/A | N/A | User match history remains private to authenticated verified users. |
| `/api/matches/:roomId` | authenticated GET | `no-store, max-age=0` | No | N/A | N/A | Authorization/invite decision and match state are not cached. |
| `/api/orders/config` | authenticated GET | `no-store, max-age=0` | Yes: `4real:cache:merchantConfig:v1:default` | 60s | admin config update | Redis value is global merchant config, not user-specific; HTTP response is not CDN/browser cached. Verified Redis outage falls back to the source loader. |
| `/api/orders` GET | authenticated GET | `no-store, max-age=0` | No | N/A | N/A | User-specific order list. |
| `/api/orders` POST | mutation/write route | `no-store, max-age=0` | No | N/A | Existing dashboard/config invalidations retained | Payment/order mutation with proof metadata; no response caching. |
| `/api/orders/:id` PATCH | admin mutation/write route | `no-store, max-age=0` | No | N/A | Existing dashboard invalidation retained | Admin payment state mutation; no response caching. |
| `/api/transactions` GET | authenticated GET | `no-store, max-age=0` | No | N/A | N/A | User ledger data is private. |
| `/api/transactions/all` GET | admin route | `no-store, max-age=0` | No | N/A | N/A | Admin ledger data is sensitive. |
| `/api/transactions/withdrawals/:withdrawalId` GET | sensitive wallet/payment GET | `no-store, max-age=0` | No | N/A | N/A | Withdrawal status is never cached. |
| `/api/transactions/deposit/memo` POST | sensitive wallet/payment mutation | `no-store, max-age=0` | No | N/A | N/A | Deposit memo/session response is never cached. |
| `/api/transactions/deposit/prepare` POST | sensitive TON Connect/payment mutation | `no-store, max-age=0` | No | N/A | N/A | TON Connect preparation is never cached. |
| `/api/transactions/withdraw` POST | sensitive wallet/payment mutation | `no-store, max-age=0` | No | N/A | Existing dashboard invalidation retained | Withdrawal request is never cached. |
| `/api/admin/merchant/config` GET | admin route | `no-store, max-age=0` | Yes: `4real:cache:merchantConfig:v1:default` | 60s | admin config update | Redis value is global config; HTTP admin response is no-store. Verified Redis outage falls back to the source loader. |
| `/api/admin/merchant/config` PATCH | admin mutation/write route | `no-store, max-age=0` | No | N/A | Invalidates `merchantConfig` and stale dashboard keys | Config mutation is never cached. |
| `/api/admin/merchant/dashboard` GET | admin route | `no-store, max-age=0` | No | N/A | N/A | Wallet balances/payment state are not Redis-cached. |
| `/api/admin/merchant/orders` GET | admin route | `no-store, max-age=0` | No | N/A | N/A | Admin payment/order data includes payout details and is not cached. |
| `/api/admin/merchant/deposits` GET | admin route | `no-store, max-age=0` | No | N/A | N/A | Deposit review data is sensitive. |
| `/api/admin/merchant/deposits/replay-window` POST | admin mutation/write route | `no-store, max-age=0` | No | N/A | Existing dashboard invalidation retained by ingestion paths | Replay operation is never cached. |
| `/api/admin/merchant/deposits/:txHash/reconcile` POST | admin mutation/write route | `no-store, max-age=0` | No | N/A | Existing dashboard invalidation retained by ingestion paths | Reconciliation/payment state is never cached. |
| `/api/admin/withdrawals/:withdrawalId/recover` POST | admin mutation/write route | `no-store, max-age=0` | No | N/A | N/A | Withdrawal recovery is never cached. |
| `/api/*` not found | API error response | `no-store, max-age=0` | No | N/A | N/A | API errors inherit no-store default. |

## Query and Index Checks

- `UserService.getLeaderboard(10)` sorts by `{ elo: -1 }`; `UserSchema.index({ elo: -1 })` exists.
- `MatchService.getActiveMatches()` filters `{ status: 'waiting', isPrivate: false }`, sorts `{ createdAt: -1 }`, limits 20; `MatchSchema.index({ status: 1, isPrivate: 1, createdAt: -1 })` exists.
- `getMerchantConfig()` reads singleton merchant config; `MerchantConfigSchema.singletonKey` is unique/indexed.
- Merchant order desk queries already have tests asserting sort/filter indexes on `Order`.

## Dangerous Redis Pattern Review

- No broad Redis `KEYS` use was found in the application cache layer.
- No wildcard cache deletes or unbounded pattern invalidation were found in the application cache layer.
- Application cache writes use Redis `SET ... EX <ttl>`, so every cache-aside key has a TTL.
- Invalidation uses explicit key deletion.
- User-controlled cache key parts are normalized with `encodeURIComponent`.
- The cache layer does not store sessions, token responses, wallet balances, payment statuses, withdrawal statuses, escrow state, or admin dashboard snapshots as normal cache data.

## Merchant Config Safety

The cached `merchantConfig` payload contains only:

- `mpesaNumber`
- `walletAddress`
- `instructions`
- `fiatCurrency`
- `buyRateKesPerUsdt`
- `sellRateKesPerUsdt`

It does not include private keys, seeds, provider credentials, payout secrets, hidden operational flags, sessions, or user-specific config.

## Cloudflare Production Rules

Configure Cloudflare as an explicit allow-list cache. Cloudflare should respect origin `Cache-Control` headers and must not use an edge rule that overrides `no-store` on sensitive responses.

Allow cache only:

- Cache `/assets/*` using origin `Cache-Control`.
- Cache `/fonts/*` using origin `Cache-Control`.
- Cache `/tonconnect-icon.svg` using origin `Cache-Control`.
- Cache `/tonconnect-manifest.json` using origin `Cache-Control`.
- Cache only `GET /api/users/leaderboard`.
- Cache only `GET /api/matches/active`.

Bypass cache for:

- Bypass `/api/auth/*`.
- Bypass `/api/admin/*`.
- Bypass `/api/orders*`.
- Bypass `/api/transactions*`.
- Bypass any request with `Authorization`.
- Bypass any request with `Cookie`.
- Bypass all `POST`, `PATCH`, `PUT`, and `DELETE` methods.
- Bypass wallet routes.
- Bypass payment routes.
- Bypass session routes.
- Bypass password reset routes.
- Bypass MFA routes.
- Bypass OAuth routes.
- Bypass security routes.
- Bypass withdrawal routes.

Explicit warnings:

- Do not use a broad Cloudflare "cache everything" rule for `/api/*`.
- Do not set an Edge Cache TTL rule that overrides origin `Cache-Control` for `/api/*`.
- Authenticated, cookie-bearing, authorization-bearing, and mutation traffic must always bypass edge cache.
- Stale-while-revalidate and stale-if-error are acceptable only on the public allow-listed routes/static assets documented above.

Suggested rule order:

1. Bypass if request method is not `GET` or `HEAD`.
2. Bypass if `Authorization` exists.
3. Bypass if `Cookie` exists.
4. Bypass sensitive path families: `/api/auth/*`, `/api/admin/*`, `/api/orders*`, `/api/transactions*`, wallet, payment, session, password reset, MFA, OAuth, security, and withdrawal routes.
5. Allow origin-cache-control caching only for `/assets/*`, `/fonts/*`, `/tonconnect-icon.svg`, `/tonconnect-manifest.json`, `GET /api/users/leaderboard`, and `GET /api/matches/active`.
6. Bypass everything else under `/api/*`.

## Tests Added / Updated

- Cache hit, miss, coalescing, invalidation: `server/middleware/logging-and-schemas.test.ts`.
- Redis failure fallback: `server/middleware/logging-and-schemas.test.ts`.
- Key namespace/version/unsafe input encoding: `server/middleware/logging-and-schemas.test.ts`.
- Cache event observability for hit, miss, write, invalidate, read/write/invalidate failures, coalesced loads, and loader failure: `server/middleware/logging-and-schemas.test.ts`.
- Redis invalidation failure logging: `server/middleware/logging-and-schemas.test.ts`.
- Sensitive/pre-API routes not cached: `server/middleware/app-health.test.ts`.
- Mutation route no-store inheritance: `server/middleware/app-health.test.ts`.
- Sensitive API route-family no-store inheritance for auth sessions, admin dashboard, orders, transactions, withdrawal, POST, PATCH, and DELETE requests: `server/middleware/app-health.test.ts`.
- API not-found and dotfile probe no-store behavior: `server/middleware/app-health.test.ts`.
- `Vary: Accept-Encoding` on public cacheable routes/assets: `server/middleware/app-health.test.ts`, `server/middleware/static-files.test.ts`.
- Static asset and SPA shell cache policies: `server/middleware/static-files.test.ts`.
- Scanner/debug probe no-store headers: `server/middleware/static-files.test.ts`.
- Wallet balance snapshots are not Redis-cached: `server/middleware/merchant-dashboard.test.ts`.
- Route-specific Redis outage fallback tests for `GET /api/users/leaderboard`, `GET /api/matches/active`, `GET /api/orders/config`, `GET /api/admin/merchant/config`, and jetton wallet derived-address lookup: `server/middleware/cache-strategy.test.ts`.
- Public cached route leak checks for leaderboard and active matches: `server/middleware/cache-strategy.test.ts`.

## Latest Verification

- Cache-focused regression suite: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/logging-and-schemas.test.ts server/middleware/app-health.test.ts server/middleware/static-files.test.ts server/middleware/cache-strategy.test.ts server/middleware/merchant-dashboard.test.ts` passed with 49 tests.
- TypeScript/lint gate: `npm run lint` passed.
- Full test suite: `npm test` passed with 215 tests.

## Production Risks

- Cloudflare broad cache rules are the biggest remaining risk. A broad "cache everything" or API-wide Edge Cache TTL rule could override the app's conservative origin headers.
- Redis invalidation failure may leave stale public data until TTL expiry. TTLs are intentionally short for public mutable data: 30s for leaderboard and 5s for active matches.
- Merchant config is server-side cached and must remain free of secrets. Do not add private keys, wallet seeds, provider credentials, payout secrets, hidden operational flags, or user-specific fields to that cached DTO.
- Non-hashed static files may remain stale for up to one day unless Cloudflare is purged or filenames are versioned.
- Future public-profile caching must not be added without explicit invalidation for username, ELO, stats, and identity changes.

## Remaining Recommendations

- Add Cloudflare cache rules exactly as recommended above; bypass authenticated, cookie-bearing, authorization-bearing, and mutation traffic.
- Keep Redis disabled/failing as a supported operating mode for public cache-aside reads; alert on repeated `cache.read_failed`, `cache.write_failed`, and `cache.invalidate_failed` logs.
- If public profiles need CDN caching later, add explicit invalidation for username/stats/ELO writes first.
- Avoid adding generic global caching middleware; route-level classification should remain the source of truth.

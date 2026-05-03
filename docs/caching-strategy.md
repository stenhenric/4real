# Production Caching Strategy

This document describes the cache contract implemented for `4REAL`.

References:
- AWS caching best practices: https://aws.amazon.com/caching/best-practices/
- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## Goals

- Cache only safe, read-heavy responses.
- Keep private and money-moving flows out of shared caches.
- Bound staleness with short TTLs and explicit invalidation.
- Prevent cache stampede with single-flight loading and TTL jitter.
- Prevent cache poisoning by using typed keys and backend-owned cache writes only.

## Cache Layers

### Server-side cache

- Primary store: Redis in production.
- Test and no-Redis fallback: in-process memory only.
- Shared utility: [server/services/cache.service.ts](/C:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/4realmain/server/services/cache.service.ts)
- Key format: `4real:cache:<namespace>:v<version>:<parts...>`
- Key construction is restricted to typed builders in `CacheKeys`.
- TTL jitter: subtract up to 10% from the declared TTL to avoid synchronized expiry.
- Stampede control: `getOrPopulateJson` coalesces concurrent misses with a per-key in-flight promise.

### HTTP cache

- API responses default to `Cache-Control: no-store, max-age=0` under `/api`.
- Auth and session responses also carry `Pragma: no-cache` and `Expires: 0`.
- Logout and forced session termination emit `Clear-Site-Data: "cache", "cookies", "storage"`.
- Static assets under `/assets` are served with `Cache-Control: public, max-age=31536000, immutable`.
- SPA `index.html` is always `no-store`.
- Express strong ETags are enabled globally in [server/app.ts](/C:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/4realmain/server/app.ts:28).

## Cacheable Domains

### Safe read models

- Leaderboard
  - Key: `CacheKeys.leaderboard(limit)`
  - TTL: 30 seconds
  - Invalidate on write: not required; short TTL is sufficient for this public summary
- Public active matches
  - Key: `CacheKeys.activeMatches()`
  - TTL: 5 seconds
  - Invalidate on write: match create, join, resign
- Merchant config
  - Key: `CacheKeys.merchantConfig()`
  - TTL: 60 seconds
  - Invalidate on write: merchant config update
- Merchant dashboard summary
  - Key: `CacheKeys.merchantDashboard()`
  - TTL: 5 seconds
  - Invalidate on write: merchant config update, order create/update, withdrawal request, deposit credit, unmatched deposit creation, deposit review reconciliation
- Derived jetton wallet address
  - Key: `CacheKeys.jettonWallet(ownerAddress, jettonMaster)`
  - TTL: 24 hours
  - Invalidate on write: namespace version bump if the derivation strategy changes

## Do Not Cache

The following must remain `no-store` and must never be written into Redis:

- Auth responses
- Any response carrying `Set-Cookie`
- Sessions, MFA state, password reset state, magic-link state, suspicious-login approvals
- User balances
- Orders
- Deposits
- Withdrawals
- Replay and reconciliation results
- Any personalized response with money movement or sensitive account data

## Invalidation Rules

- Prefer write-triggered invalidation over long TTLs for operational dashboards.
- Invalidate the smallest affected key set.
- Use namespace version bumps only for broad schema or serialization changes.
- If a cache decode fails, delete the corrupted key and recompute from source.

## Poisoning and Staleness Controls

- Only backend code constructs cache keys.
- Key parts are normalized and URL-encoded before joining.
- Cached payloads are JSON-decoded on read; malformed entries are evicted immediately.
- Private endpoints use `no-store` regardless of request method.
- Cached models are all derived from server-owned serializers, not raw user-supplied payloads.
- Short TTLs and write-side invalidation bound stale reads without serving indefinitely stale data.

## Operational Rules

- Redis is a required production dependency because sessions, rate limits, idempotency, and locks all depend on it.
- MongoDB production URIs must use TLS before the app starts.
- Cache changes must include:
  - typed key builder updates
  - TTL selection
  - invalidation points
  - focused tests for hit, miss, and invalidation behavior

## Verification

- Cache utility tests: [server/middleware/logging-and-schemas.test.ts](/C:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/4realmain/server/middleware/logging-and-schemas.test.ts)
- Deposit batching and invalidation regressions: [server/middleware/deposit-reconciliation.test.ts](/C:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/4realmain/server/middleware/deposit-reconciliation.test.ts)
- Merchant dashboard caching behavior: [server/middleware/merchant-dashboard.test.ts](/C:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/4realmain/server/middleware/merchant-dashboard.test.ts)

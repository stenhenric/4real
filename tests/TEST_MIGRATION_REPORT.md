# Test Migration Report

**Date**: 2026-05-23  
**Migration**: Reorganized all repository tests into `tests/unit/`, `tests/integration/`, and `tests/e2e/`  
**Test runner**: `node:test` (via `node --experimental-strip-types --test`) + `@playwright/test`

---

## Summary

| Category | Files Moved | Tests |
|---|---|---|
| `tests/unit/` | 13 | 112 |
| `tests/integration/` | 30 | 264 |
| `tests/e2e/` | 0 (already in place) | 4 Playwright spec files |
| **Total** | **43** | **376** |

---

## File Mapping

### Unit Tests → `tests/unit/`

| Original Path | New Path | Import Rewrites |
|---|---|---|
| `server/config/env.test.ts` | `tests/unit/server/config/env.test.ts` | 1 |
| `server/repositories/processed-transaction.repository.test.ts` | `tests/unit/server/repositories/processed-transaction.repository.test.ts` | 1 |
| `server/services/email/gmail-service.test.ts` | `tests/unit/server/services/email/gmail-service.test.ts` | 1 |
| `server/services/email/product-email-templates.test.ts` | `tests/unit/server/services/email/product-email-templates.test.ts` | 1 |
| `server/services/auth-email.service.test.ts` | `tests/unit/server/services/auth-email.service.test.ts` | 3 |
| `server/services/one-time-token.service.test.ts` | `tests/unit/server/services/one-time-token.service.test.ts` | 2 |
| `server/services/google-oauth.service.test.ts` | `tests/unit/server/services/google-oauth.service.test.ts` | 2 |
| `server/services/product-email-notification.service.test.ts` | `tests/unit/server/services/product-email-notification.service.test.ts` | 4 |
| `server/services/auth-session.service.test.ts` | `tests/unit/server/services/auth-session.service.test.ts` | 6 |
| `src/features/auth/AuthTurnstile.test.ts` | `tests/unit/src/features/auth/AuthTurnstile.test.ts` | 1 |
| `src/pages/auth/session-device-label.test.ts` | `tests/unit/src/pages/auth/session-device-label.test.ts` | 1 |
| `src/services/api/apiClient.test.ts` | `tests/unit/src/services/api/apiClient.test.ts` | 1 |
| `src/utils/idempotency.test.ts` | `tests/unit/src/utils/idempotency.test.ts` | 1 |

**Classification rationale**: All use dependency-injection helpers (`setXForTests`/`resetXForTests`) or `t.mock.method` to replace every external dependency. No real DB connections, no real HTTP servers, no real network I/O.

---

### Integration Tests → `tests/integration/`

| Original Path | New Path | Import Rewrites |
|---|---|---|
| `server/middleware/app-health.test.ts` | `tests/integration/server/middleware/app-health.test.ts` | 6 |
| `server/middleware/auth-email-flows.test.ts` | `tests/integration/server/middleware/auth-email-flows.test.ts` | 4 |
| `server/middleware/auth-security.test.ts` | `tests/integration/server/middleware/auth-security.test.ts` | 20 |
| `server/middleware/authz-guard-parity.test.ts` | `tests/integration/server/middleware/authz-guard-parity.test.ts` | 9 |
| `server/middleware/background-jobs.service.test.ts` | `tests/integration/server/middleware/background-jobs.service.test.ts` | 6 |
| `server/middleware/cache-strategy.test.ts` | `tests/integration/server/middleware/cache-strategy.test.ts` | 12 |
| `server/middleware/deposit-reconciliation.test.ts` | `tests/integration/server/middleware/deposit-reconciliation.test.ts` | 13 |
| `server/middleware/distributed-lock.test.ts` | `tests/integration/server/middleware/distributed-lock.test.ts` | 1 |
| `server/middleware/dotfiles-block.test.ts` | `tests/integration/server/middleware/dotfiles-block.test.ts` | 3 |
| `server/middleware/frontend-contracts.test.ts` | `tests/integration/server/middleware/frontend-contracts.test.ts` | 13 |
| `server/middleware/game-room-registry.test.ts` | `tests/integration/server/middleware/game-room-registry.test.ts` | 1 |
| `server/middleware/idempotency-key.repository.test.ts` | `tests/integration/server/middleware/idempotency-key.repository.test.ts` | 1 |
| `server/middleware/idempotency.service.test.ts` | `tests/integration/server/middleware/idempotency.service.test.ts` | 6 |
| `server/middleware/logging-and-schemas.test.ts` | `tests/integration/server/middleware/logging-and-schemas.test.ts` | 8 |
| `server/middleware/match-access.test.ts` | `tests/integration/server/middleware/match-access.test.ts` | 3 |
| `server/middleware/match-controller-context.test.ts` | `tests/integration/server/middleware/match-controller-context.test.ts` | 2 |
| `server/middleware/match-service.test.ts` | `tests/integration/server/middleware/match-service.test.ts` | 6 |
| `server/middleware/merchant-dashboard.test.ts` | `tests/integration/server/middleware/merchant-dashboard.test.ts` | 10 |
| `server/middleware/migration-services.test.ts` | `tests/integration/server/middleware/migration-services.test.ts` | 9 |
| `server/middleware/order-service.test.ts` | `tests/integration/server/middleware/order-service.test.ts` | 7 |
| `server/middleware/query-sanitization.test.ts` | `tests/integration/server/middleware/query-sanitization.test.ts` | 7 |
| `server/middleware/rate-limit.middleware.test.ts` | `tests/integration/server/middleware/rate-limit.middleware.test.ts` | 3 |
| `server/middleware/realtime-match.service.test.ts` | `tests/integration/server/middleware/realtime-match.service.test.ts` | 8 |
| `server/middleware/repository-indexes.test.ts` | `tests/integration/server/middleware/repository-indexes.test.ts` | 3 |
| `server/middleware/security.middleware.test.ts` | `tests/integration/server/middleware/security.middleware.test.ts` | 4 |
| `server/middleware/static-files.test.ts` | `tests/integration/server/middleware/static-files.test.ts` | 2 |
| `server/middleware/ton-payments.test.ts` | `tests/integration/server/middleware/ton-payments.test.ts` | 27 |
| `server/middleware/transaction-controller.test.ts` | `tests/integration/server/middleware/transaction-controller.test.ts` | 4 |
| `server/middleware/user-balance.repository.test.ts` | `tests/integration/server/middleware/user-balance.repository.test.ts` | 3 |
| `server/middleware/withdrawal-recovery.test.ts` | `tests/integration/server/middleware/withdrawal-recovery.test.ts` | 19 |

**Classification rationale**: These tests either spin up a real Express app with `createServer()` and issue HTTP requests, or they exercise multiple service layers together (controller + service + repository), or they read actual source files from disk for contract testing. External providers (Redis, MongoDB, TonClient) may be mocked but the Express/module wiring is real.

---

### E2E Tests → `tests/e2e/` (no movement)

| Path | Status |
|---|---|
| `tests/e2e/auth.spec.ts` | ✅ Already in place |
| `tests/e2e/match.spec.ts` | ✅ Already in place |
| `tests/e2e/merchant.spec.ts` | ✅ Already in place |
| `tests/e2e/page-smoke.spec.ts` | ✅ Already in place |
| `tests/e2e/helpers.ts` | ✅ Already in place |
| `tests/e2e/harness/server.mjs` | ✅ Already in place |

---

### Setup File

| Original Path | New Path |
|---|---|
| `server/test/setup-env.js` | `tests/setup/setup-env.js` |

---

## Config Changes

### `package.json`

| Script | Before | After |
|---|---|---|
| `test:unit` | `--import ./server/test/setup-env.js ... server/config/env.test.ts ... src/**/*.test.ts` | `--import ./tests/setup/setup-env.js ... tests/unit/**/*.test.ts` (explicit list) |
| `test:integration` | `--import ./server/test/setup-env.js ... server/middleware/*.test.ts` | `--import ./tests/setup/setup-env.js ... tests/integration/server/middleware/*.test.ts` |
| `test:coverage` | _(did not exist)_ | Added, covers all unit + integration files |

### `tsconfig.tests.json`

| Before | After |
|---|---|
| Included `server/middleware/frontend-contracts.test.ts` and `src/**/*.test.ts` | Includes `tests/integration/server/middleware/frontend-contracts.test.ts` and `tests/unit/src/**/*.test.ts` |

> **Note**: The scope of `tsconfig.tests.json` was intentionally kept identical to the original — only the `frontend-contracts.test.ts` integration test and the `src/` unit tests are type-checked. The remaining server-side test files have pre-existing TypeScript errors (documented below) that were never part of the type-check gate.

### `playwright.config.ts`

No changes needed. `testDir: './tests/e2e'` was already correct.

### `tsconfig.json`

No changes needed. Already excluded `"tests/**"` from the main compilation.

---

## Ambiguous Classifications

| File | Classification | Uncertainty |
|---|---|---|
| `frontend-contracts.test.ts` | **integration** | It's not a pure unit test (reads real files on disk, crosses server/client boundary), but it doesn't start an HTTP server. Placed at integration as it exercises cross-module contracts across real compiled artifacts. |
| `game-room-registry.test.ts` | **integration** | Tests a single class, but verifies async concurrency and error propagation requiring real event loop timing. Borderline unit. Placed at integration due to timing sensitivity. |
| `auth-session.service.test.ts` | **unit** | Uses `setAuthSessionDependenciesForTests`. Despite importing mongoose models, no real DB connection is made. |

---

## Pre-Existing TypeScript Errors (Newly Discovered)

These test files were previously excluded from `tsconfig.tests.json` and ran via `--experimental-strip-types` only. Now that they're visible to TypeScript, the following errors were discovered. **These are not migration-caused regressions** — the tests pass at runtime unchanged.

| File | Error Types | Count |
|---|---|---|
| `auth-session.service.test.ts` | TS2339 (property doesn't exist on mock type), TS7031 (implicit any in destructure) | 5 |
| `gmail-service.test.ts` | TS2345 (number→string argument mismatch) | 1 |
| `one-time-token.service.test.ts` | TS7031 (implicit any in destructure) | 2 |
| `product-email-notification.service.test.ts` | TS2379 (exactOptionalPropertyTypes on LogEntry mock) | 6 |
| `deposit-reconciliation.test.ts` | TS2532 (object possibly undefined) | 14 |
| `distributed-lock.test.ts` | TS2349 (never is not callable) | 1 |
| `idempotency.service.test.ts` | TS7006 (implicit any), TS2379, TS2322 (number→string) | 14 |
| `logging-and-schemas.test.ts` | TS2532 (object possibly undefined) | 1 |
| `match-service.test.ts` | TS2339, TS7031 | 3 |
| `ton-payments.test.ts` | TS2532 (object possibly undefined) | 8 |
| `transaction-controller.test.ts` | TS7031 (implicit any) | 2 |
| `user-balance.repository.test.ts` | TS2532 (object possibly undefined) | 2 |
| `withdrawal-recovery.test.ts` | TS7006, TS2353, TS2352 | 9 |

**Recommendation**: Fix these TypeScript errors in a separate PR. They represent legitimate type gaps in test mocks that do not affect runtime behavior but should be corrected for type safety.

---

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck:tests` | ✅ PASS (0 errors) |
| `npm run test:unit` | ✅ PASS — 112 tests, 112 pass, 0 fail |
| `npm run test:integration` | ✅ PASS — 264 tests, 264 pass, 0 fail |
| `npm run lint` | ✅ PASS (0 errors) |
| Old test files remain in `server/` or `src/` | ✅ None found |
| Import paths resolve correctly | ✅ Spot-checked across all file groups |

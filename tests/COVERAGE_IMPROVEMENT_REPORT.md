# Coverage Improvement Report

Date: 2026-05-23

## Testing References Used

- Google Testing Blog, [Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)
- Martin Fowler, [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- Martin Fowler, [Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html)
- Testing Library, [Guiding Principles](https://testing-library.com/docs/guiding-principles/)
- Playwright, [Best Practices](https://playwright.dev/docs/best-practices)
- Vitest, [Documentation](https://vitest.dev/) - reviewed as a required reference; this repository does not use Vitest.
- Jest and Cypress were not applied because this repository does not use those runners.

The changes follow the pyramid shape from Google and Fowler: fast unit tests for deterministic logic, integration tests for server/auth/cache/payment-like flows, and a focused Playwright E2E suite for critical user journeys. UI/E2E assertions were adjusted toward Playwright and Testing Library-style user-visible behavior: roles, accessible names, visible text, and observable page outcomes instead of implementation details.

## Test Stack And Commands

Detected test stack:

- Unit and integration runner: Node built-in `node:test` with `--experimental-strip-types`.
- E2E runner: Playwright.
- Package manager: npm.
- Coverage: Node's experimental test coverage.
- No Vitest, Jest, or Cypress runner is configured.

Current commands:

- `npm run typecheck:tests`
- `npm run test`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run test:coverage`
- `npm run lint`

## Baseline Findings

Initial state while inspecting the migrated `tests/` structure:

- `typecheck:tests` did not include every test under `tests/**`, so many migrated tests were not typechecked.
- Expanding test typechecking to all `tests/**/*.ts` and `tests/**/*.tsx` exposed stale imports, DTO shape mismatches, callback typing problems, and test-only mock shape errors.
- `test:integration` timed out. The rate-limit and Redis-sensitive middleware tests were not the only issue: `dotfiles-block.test.ts` created an app using the default public cacheable API route registration, which opened Redis-backed limiter handles in a test that did not need Redis.
- `test:e2e` initially failed 13 tests across Chromium, Firefox, and WebKit due to stale page copy, strict text locators matching duplicated desktop/mobile content, a TonConnect lazy-load assertion that did not open a wallet route, and a session regression when access cookies expired before match settlement.
- First successful post-improvement coverage baseline before final auth-session fix: all files 71.31% line, 70.90% branch, 67.42% functions.

## Improvements Made

Typechecking:

- Updated `tsconfig.tests.json` so every test under `tests/**` is typechecked.
- Fixed migrated test type errors rather than narrowing the typecheck include list.
- Added `@types/compression` for server test type coverage.

Unit coverage:

- Added `tests/unit/server/utils/money.test.ts` for fixed-scale USDT/KES/rate parsing, formatting, rounding, rejection of ambiguous input, negative rounding, zero divisor behavior, and blockchain display formatting.
- Added `tests/unit/src/utils/exact-money.test.ts` for frontend money normalization, invalid input rejection, positive-only zero checks, and fail-closed display helpers.
- Improved `tests/unit/src/services/api/apiClient.test.ts` to cover session refresh retry behavior for `/auth/me` when the access cookie is stale and the refresh cookie is valid.

Integration quality:

- Fixed `tests/integration/server/middleware/dotfiles-block.test.ts` so scanner/dotfile middleware tests do not create unrelated Redis-backed public cache limiters or leave hanging HTTP response bodies.
- Updated frontend contract tests for the current Bank/TonConnect route provider location and current security/merchant copy.
- Preserved integration coverage for auth/session, authorization parity, rate limiting, query sanitization, cache behavior, order flows, merchant review, TON/deposit/withdrawal flows, and recovery paths.

E2E quality:

- Fixed stale auth-page route expectations to match current accessible headings.
- Replaced brittle merchant `getByText` assertions with role-based locators for duplicated responsive content.
- Updated the TonConnect lazy-load journey to verify that `/play` does not load wallet assets, then opens the bank deposit panel before asserting TonConnect assets load.
- Kept the expired-access-cookie match flow as a regression test and fixed the real app issue: `/auth/me` now participates in refresh retry when a refresh cookie is still valid.

Coverage configuration:

- `test:coverage` now includes `server/**/*.ts`, `src/**/*.ts`, `src/**/*.tsx`, and `shared/**/*.ts`.
- Coverage excludes `tests/**`, `node_modules/**`, `dist/**`, `build/**`, and `coverage/**`.
- No thresholds were enforced yet. The current coverage profile still has important uneven areas; enforcing thresholds now would risk incentivizing shallow tests.

## Final Coverage

Final `npm run test:coverage` result:

- Tests: 337 passed, 0 failed, 0 skipped.
- All files: 71.44% line, 70.99% branch, 67.56% functions.

Selected improved/high-signal areas:

- `server/utils/money.ts`: 85.64% line, 84.21% branch, 78.95% functions.
- `src/utils/exact-money.ts`: 100.00% line, 95.00% branch, 100.00% functions.
- `server/middleware/rate-limit.middleware.ts`: 84.98% line, 74.19% branch, 90.00% functions.
- `server/services/order.service.ts`: 93.64% line, 48.72% branch, 100.00% functions.
- `server/services/deposit-ingestion.service.ts`: 89.43% line, 67.03% branch, 93.62% functions.

## Final Validation Results

- `npm run typecheck:tests`: passed.
- `npm run test:unit`: passed, 74 tests.
- `npm run test:integration`: passed, 263 tests.
- `npm run test:e2e`: passed, 33 Playwright tests across Chromium, Firefox, and WebKit.
- `npm run test:coverage`: passed, 337 tests, final coverage listed above.
- `npm run lint`: passed.
- `npm run test`: passed.

No tests were skipped.

## Risk Areas Now Covered Better

- All tests under `tests/**` are typechecked.
- Fixed-scale money parsing and display behavior now has edge-case unit coverage.
- Frontend exact-money normalization now rejects dangerous/ambiguous money input.
- Session refresh behavior now has both unit and E2E regression coverage.
- E2E merchant review assertions are less brittle across responsive desktop/mobile markup.
- TonConnect lazy loading is verified through the actual user journey that opens a wallet-dependent bank panel.
- Dotfile/static fallback tests no longer open unrelated Redis handles.

## Remaining Coverage Gaps

High-priority areas that still deserve focused tests:

- `server/services/transaction.service.ts`: 32.00% line, 0.00% functions.
- `server/services/user.service.ts`: 32.94% line, 18.18% functions.
- `server/services/deposit-tonconnect.service.ts`: 25.89% line, 0.00% functions.
- Repository classes with low function coverage, especially `distributed-lock.repository.ts`, `order-proof-relay.repository.ts`, `unmatched-deposit.repository.ts`, and `withdrawal.repository.ts`.
- `server/controllers/match.controller.ts` and `server/controllers/withdrawal-recovery.controller.ts` still need more route/controller-level behavior tests.
- Branch coverage remains low in several money-sensitive services because many unhappy paths are covered through higher-level integration tests but not isolated branch tests.

## Recommended Next Steps

- Add focused unit tests for `deposit-tonconnect.service.ts` with TON SDK/RPC mocked at the boundary and app validation/business behavior left real.
- Add repository-focused integration tests for withdrawal and unmatched-deposit persistence paths using the existing test DB/mocking patterns.
- Add controller-level tests for match and withdrawal recovery permission/error mappings.
- Consider moderate thresholds only after the low-coverage money/session/persistence services are improved, for example starting with per-file thresholds on mature utility modules rather than broad global enforcement.

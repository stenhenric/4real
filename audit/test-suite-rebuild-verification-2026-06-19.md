# Test Suite Rebuild, Hardening, and Verification Report

Date: 2026-06-19

Scope note: this report is based on source code, tests, executable config, and verification commands. Repository documentation was intentionally excluded per the instruction not to rely on repo docs.

Subagent note: specialized subagents were requested/authorized, but subagent execution was unavailable due account usage limits. The audit and implementation were continued directly in this thread.

## References Applied

- Martin Fowler, Practical Test Pyramid: https://martinfowler.com/articles/practical-test-pyramid.html
- Google Testing Blog: https://testing.googleblog.com
- Google Coverage Best Practices: https://testing.googleblog.com/2020/08/code-coverage-best-practices.html
- Kent C. Dodds testing guidance: https://kentcdodds.com/blog/write-tests, https://kentcdodds.com/blog/testing-implementation-details, https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
- Microsoft testing guidance: https://learn.microsoft.com/en-us/dotnet/core/testing/
- GitHub Engineering: https://github.blog/engineering/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP WSTG: https://owasp.org/www-project-web-security-testing-guide/
- Microsoft REST API Guidelines: https://github.com/microsoft/api-guidelines
- Google API Design Guide: https://cloud.google.com/apis/design
- Testing Library guiding principles: https://testing-library.com/docs/guiding-principles
- Playwright best practices: https://playwright.dev/docs/best-practices
- Jest docs: https://jestjs.io/docs/getting-started
- Vitest docs: https://vitest.dev/guide/
- Node.js best practices: https://github.com/goldbergyoni/nodebestpractices

## 1. System Understanding Report

System map from source and tests:

- Frontend: React 19/Vite app under `src`, with user-facing flows for auth, bank/deposit/withdrawal, match play, merchant operations, profile/security, legal/static pages, and runtime API clients.
- Backend: Express/Mongoose server under `server`, with route/controller/service/repository layering and shared DTO/API contracts under `shared`.
- Data stores: MongoDB via Mongoose models and repositories; Redis for sessions, cache, rate limiting, distributed coordination, and BullMQ queue backing.
- Queues/background jobs: local scheduler and BullMQ runtime for stale match expiry, withdrawal workers, deposit polling/replay, health probes, DLQ behavior, and queue-depth metrics.
- Realtime: Socket.IO plus Redis adapter/distributed room registry for match rooms and move events.
- External dependencies: TON/Toncenter, hot-wallet runtime, Google OAuth/Gmail, Cloudflare Turnstile, Telegram proof/config, email notification providers, browser cookies, and Playwright browsers for E2E.
- Trust boundaries: anonymous browser to API, authenticated session cookies, CSRF/CORS origin checks, verified-account gates, admin/merchant role gates, MFA step-up gates, withdrawal-specific MFA intent, external blockchain/payment data, and background job state transitions.

Production-critical flows identified:

- Registration, login, logout, magic links, email verification, password reset, Google OAuth, session refresh/revocation, MFA setup/challenge/recovery-code consumption.
- Withdrawal intent creation, idempotent withdrawal submission/resume, daily/minimum/balance checks, queued worker processing, stuck/confirmed/refunded recovery, and user-visible withdrawal status.
- Deposit memo creation, TON transfer ingestion, dedupe, failed replay, unmatched deposit recording, cursor behavior, and reconciliation.
- Merchant/admin order review, proof relay, duplicate M-Pesa code protection, dashboard summaries, and sensitive admin controls.
- Match creation/join/move/resign/settlement, paid-match commission, rating changes, realtime room membership, and stale match expiration.

## 2. Existing Test Audit Report

Kept because they test meaningful behavior with useful assertions:

- Unit tests for env validation, schemas, money precision, idempotency, auth/session services, email templates, OAuth, Turnstile UI state, reducers, frontend API client behavior, and presentation helpers.
- Integration tests for app health/readiness/security headers, auth security/email flows, authz parity, CSRF/CORS, rate limiting, query sanitization, idempotency, Redis/BullMQ behavior seams, TON deposit/withdrawal behavior, order/merchant workflows, match/realtime/rating behavior, repository indexes, cache policies, static-file protections, and withdrawal recovery.
- E2E specs for auth, match, merchant, and smoke/user journeys are valuable and now execute locally across Chromium, Firefox, and WebKit after installing the exact Playwright 1.59.1 browser revisions expected by the runner.

Rewritten/hardened in this pass:

- `tests/integration/server/middleware/authz-guard-parity.test.ts` had false confidence around withdrawals: it modeled `/api/transactions/withdraw` as generic `requireMfaStepUp`, while production withdrawal flow uses schema validation plus `requestWithdrawalHandler` and withdrawal-intent MFA. The test harness now uses the real validator/controller path and asserts withdrawal MFA intent behavior.
- `tests/integration/server/middleware/auth-security.test.ts` production-mode tests were failing for the wrong reason because production env now requires `TRUST_PROXY`. The tests now set and restore `TRUST_PROXY` explicitly.

Merge/delete decisions:

- No tests were deleted. The weak withdrawal assertions were rewritten instead because the surrounding parity harness still provided useful coverage for auth/role/MFA gates.
- No immediate merge candidate justified churn during this pass. Redundancy risk remains in broad auth and rate-limit suites, but the existing overlap is mostly useful defense-in-depth across different boundaries.

## 3. Deleted Test Report

Deleted tests: none.

Rationale: the primary weak tests were not useless; they were pointed at the wrong production behavior. Rewriting them preserved the useful harness while removing false confidence.

## 4. Coverage Gap Report

Critical gaps:

- Local Playwright cache/install reproducibility is a setup risk. The first `npm.cmd run test:e2e` built successfully but failed before app assertions because exact 1.59.1 browser executables were missing. Manual installation of `chromium_headless_shell-1217`, `firefox-1511`, and `webkit-2272` recovered the suite, and the final full E2E run passed.
- Local Playwright cache has conflicting linked versions: `npx playwright install --list` showed a 1.59.1 project reference with partial browsers and a separate 1.61.0 reference with newer browser revisions. CI should install browsers from the project-local version in a clean cache.
- External dependency behavior is still mostly simulated locally. Real Redis/Mongo/BullMQ/Toncenter/Gmail/Turnstile/browser combinations need a deterministic CI environment.
- Production build emits `%PUBLIC_APP_ORIGIN% is not defined in env variables found in /index.html`; this is not a test failure today, but it is a production config signal.

High gaps from coverage and risk:

- `server/services/bullmq-jobs.service.ts`: 21.68% line coverage, 14.29% function coverage.
- `server/services/ton-streaming.service.ts`: 23.73% line coverage, 0.00% function coverage.
- `server/services/deposit-tonconnect.service.ts`: 22.69% line coverage, 0.00% function coverage.
- `server/repositories/withdrawal-daily-limit.repository.ts`: 19.66% line coverage, 0.00% function coverage.
- `server/repositories/order-proof-relay.repository.ts`: 28.17% line coverage, 0.00% function coverage.
- `server/utils/multipart.ts`: 21.86% line coverage, 33.33% function coverage.

Medium gaps:

- Several frontend API service files have low function coverage, including orders, transactions, users, and auth service wrappers.
- Some controller branches are covered through lower-level services but not directly asserted as HTTP contract behavior.
- Browser/mobile rendering regressions are covered by E2E after local browser recovery, but should be repeated in CI to detect browser-cache or timing regressions.

## 5. Traceability Matrix

| Requirement | Feature | Code path | Current tests | Remaining gap/risk |
| --- | --- | --- | --- | --- |
| Auth requires valid session | Login/session/me/logout | auth controller, auth/session middleware, auth-session service | auth-security, auth-email-flows, apiClient, E2E auth | Keep E2E browser install deterministic in CI |
| MFA protects sensitive actions | Admin and withdrawal flows | auth middleware, auth-mfa service, withdrawal-intent service, transaction controller | auth-security, authz-guard-parity, withdrawal-intent, page-smoke E2E | Real external MFA provider behavior still mocked |
| Withdrawal cannot bypass dedicated MFA | Bank withdrawal | transaction controller, withdrawal-intent service, withdrawal service | hardened authz parity tests, ton-payments, E2E withdrawal MFA | Real wallet/provider integration still absent |
| Idempotent mutations reject duplicate abuse | Withdrawals/orders/proof | idempotency service/repository, order service, transaction controller | idempotency tests, order-service, ton-payments, E2E duplicate-click specs | Real concurrent DB tests should be expanded |
| Deposits credit correct user only once | TON deposits | deposit services/repositories, poller, processed transaction repository | ton-payments, processed transaction repo | Real Toncenter integration absent |
| Admin/merchant routes enforce role and step-up | Merchant/order/admin | admin routes/controllers, middleware | authz parity, merchant-dashboard, order-service, E2E merchant | More real persistence/concurrency coverage useful |
| Realtime matches remain consistent | Match play | match service, realtime service, registry, sockets | match-service, realtime-match, match-access, E2E match | Multi-process/socket load tests absent |
| API errors/contracts stay stable | REST API | controllers, serializers, error middleware, schemas | validation, app-health, transaction-controller, security middleware | More negative HTTP contract snapshots useful |
| Security headers/cache policies are enforced | HTTP surface | security headers, cache policy, frontend/static middleware | app-health, cache-strategy, static-files, dotfiles-block, E2E smoke | More negative HTTP contract snapshots useful |
| Background jobs fail predictably | Workers/queues | background-jobs, BullMQ jobs, withdrawal/deposit workers | background-jobs, ton-payments, withdrawal-recovery | BullMQ real queue integration coverage low |

## 6. Security Testing Report

Covered controls:

- Authentication failures, unverified accounts, session issuance/revocation, cookie naming, Clear-Site-Data behavior, magic link and Google OAuth MFA flows.
- Authorization boundaries for unauthenticated users, unverified users, admin users, merchant-sensitive routes, and cross-user withdrawal status lookup.
- CSRF and socket origin checks.
- Rate limiting for auth, public cacheable routes, expensive authenticated mutations, withdrawal routes, and identifier/recipient scoped throttles.
- Query sanitization and public error shaping for identifier cast errors.
- Cache policy protections for sensitive APIs and static/dotfile probe handling.
- Production security headers and readiness/health redaction.

Security hardening added:

- Withdrawal route parity now proves generic MFA step-up cannot bypass withdrawal-intent MFA.
- Missing withdrawal idempotency key is rejected before intent creation.
- Users without MFA setup are rejected before withdrawal intent creation.
- Production-mode tests now include required `TRUST_PROXY`, so they test the intended security behavior instead of failing at env parsing.

Security gaps:

- SSRF, command injection, path traversal, unsafe deserialization, and multipart abuse are not comprehensively covered.
- Dependency vulnerability scanning and lockfile determinism were not completed in this pass.
- Real browser security behavior now has E2E coverage after local browser recovery; external provider behavior remains mocked.

## 7. Business Logic Testing Report

Strong existing coverage:

- Money precision, minimum withdrawal amounts, balance deduction, insufficient balance rejection, withdrawal queuing, retry/refund/stuck/confirmation transitions, and recovery idempotency.
- Deposit memo ownership, expired/reused memo behavior, processed transaction dedupe, unmatched deposits, failed replay, and cursor pinning.
- Merchant BUY order validation, M-Pesa code normalization/duplication, proof relay, failed attempt lockout, and dashboard aggregation.
- Match outcomes, paid settlement, commission, rating floors/deltas, duplicate rating prevention, stale match expiration, and realtime room cache refresh.

Business logic strengthened:

- Withdrawal route tests now align with the production-specific two-step withdrawal MFA workflow rather than a generic admin-style step-up model.

Remaining gaps:

- Real concurrent database transaction behavior should be validated with MongoDB/Redis containers rather than only mocked repository boundaries.
- Real external payment/wallet integrations need separate contract or sandbox tests.

## 8. Edge Case Testing Report

Covered examples:

- Empty/invalid money inputs, over-precision, minimum and positive-only money constraints.
- Duplicate idempotency keys and rapid duplicate user actions in existing tests/E2E specs.
- Concurrent MFA recovery-code/challenge redemption.
- Stale sockets, stale room snapshots, stale matches, stuck withdrawals, lost terminal races, and retry windows.
- Dotfile/scanner paths, invalid origins, malformed room IDs, generic cast errors, and rate-limit boundary behavior.

Remaining edge cases:

- Unicode/emoji payloads, very large request bodies, malformed multipart uploads, and broader API fuzz cases.
- More real concurrent withdrawal/order/match mutation tests against actual persistence.

## 9. Mutation Analysis Report

No automated mutation tool is configured or was run.

Manual mutation-oriented checks added or verified:

- Replacing withdrawal-intent MFA with generic `requireMfaStepUp` would now fail the hardened withdrawal parity tests.
- Allowing fresh generic step-up to bypass withdrawal MFA would fail.
- Creating a withdrawal intent without an `Idempotency-Key` would fail.
- Creating a withdrawal intent for users without MFA setup would fail.
- Removing the production `TRUST_PROXY` setup from production-mode tests would make them fail before exercising the intended behavior.
- The BullMQ/ioredis type mismatch was caught by `typecheck:tests`, demonstrating compile-time regression resistance for queue wiring.

Recommendation: add Stryker or a focused custom mutation smoke suite around authz, withdrawal/idempotency, money, and order-state transitions before expanding to the whole repo.

## 10. Coverage Metrics Report

Command:

```powershell
npm.cmd run test:coverage
```

Result: passed.

Node coverage summary for included files:

- Line coverage: 74.09%
- Branch coverage: 71.44%
- Function coverage: 69.14%

Interpretation: coverage is useful as a blind-spot detector, not as a quality target. The most important uncovered/high-risk areas are queue orchestration, TON streaming, TonConnect deposits, multipart handling, and repository methods that mediate idempotency, withdrawal limits, order relay, and distributed locks.

## 11. Flaky Test Report

Observed:

- `npm.cmd test` passed in one full run after fixes: 326 tests, 0 failures.
- Targeted authz parity test passed: 10 tests, 0 failures.
- Targeted auth-security test passed: 36 tests, 0 failures.
- Initial E2E run did not reach app assertions because exact browser executables were missing.
- After manually installing the project-local Playwright 1.59.1 revisions, `npm.cmd run test:e2e` passed: 84 tests across Chromium, Firefox, and WebKit.

Flake/environment risks:

- Playwright browser cache/version mismatch is still a deterministic setup risk, even though it was recovered locally.
- Tests that import full routers can accidentally pull in Redis-backed rate limiters and leave open handles unless dependencies are controlled.
- Real-time/socket and background-worker tests need repeated CI runs to detect race sensitivity.

## 12. Newly Added Tests Summary

Updated `tests/integration/server/middleware/authz-guard-parity.test.ts`:

- `production-parity withdrawal route starts the dedicated withdrawal MFA intent for normal users`
- `production-parity withdrawal route does not let generic step-up bypass withdrawal intent MFA`
- `production-parity withdrawal route rejects users without MFA setup before creating an intent`
- `production-parity withdrawal route requires an idempotency key before creating an intent`

Updated `tests/integration/server/middleware/auth-security.test.ts`:

- Production-mode auth cookie naming and Turnstile tests now set and restore `TRUST_PROXY`.

Updated `server/services/bullmq-jobs.service.ts`:

- Added narrow BullMQ connection/type boundary casts to resolve the local BullMQ/ioredis type mismatch without weakening TypeScript strictness across the app.

## 13. Remaining Risks Report

- E2E is verified locally after manually installing exact Playwright 1.59.1 browser revisions, but the package/cache mismatch should be cleaned up so fresh installs do not require manual recovery.
- The browser cache showed Playwright 1.59.1 and a separate 1.61.0 `playwright-core` link. That needs package-manager cleanup.
- Build passes but warns about `%PUBLIC_APP_ORIGIN%` in `index.html`.
- Real external integrations are not exercised end-to-end in this local run.
- No automated mutation analysis exists.
- Low-coverage queue/TON/multipart/repository modules contain production-critical behavior.

## 14. Prioritized Recommendations

P0:

- Normalize the package manager/dependency install path. Use one lockfile workflow, then reinstall from clean state so Playwright, BullMQ, and ioredis resolve deterministically.
- Add CI setup that runs `playwright install` for the exact project version before E2E, and fail early if browser executables are missing.
- Make the production build warning for `%PUBLIC_APP_ORIGIN%` actionable, either by defining the env var in the test/build environment or changing the template handling.

P1:

- Add containerized Redis/Mongo/BullMQ integration tests for auth sessions, idempotency, distributed locks, queue enqueue/DLQ/probe behavior, withdrawal limits, and concurrent mutation races.
- Add mutation testing for authz, withdrawal-intent/idempotency, money parsing, order state transitions, and recovery/refund logic.
- Add focused security tests for SSRF/path traversal/multipart abuse and unsafe external response parsing.

P2:

- Expand coverage for `bullmq-jobs.service.ts`, `ton-streaming.service.ts`, `deposit-tonconnect.service.ts`, `multipart.ts`, and low-coverage repositories.
- Run E2E repeatedly in CI after browser setup to detect race/flaky behavior in match/realtime and withdrawal journeys.
- Add dependency/security scanning as a separate CI gate.

## Verification Log

Passed:

```powershell
npm.cmd run typecheck:tests
node --import ./tests/setup/setup-env.js --test --experimental-strip-types tests/integration/server/middleware/authz-guard-parity.test.ts
node --import ./tests/setup/setup-env.js --test --experimental-strip-types tests/integration/server/middleware/auth-security.test.ts
npm.cmd test
npm.cmd run build
npm.cmd run test:coverage
npm.cmd run test:e2e
```

Initial E2E blocker recovered:

The application build step passed, but the first Playwright run failed before test logic because required browser executables were missing:

- `C:\Users\STEN\AppData\Local\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe`
- `C:\Users\STEN\AppData\Local\ms-playwright\firefox-1511\firefox\firefox.exe`
- `C:\Users\STEN\AppData\Local\ms-playwright\webkit-2272\Playwright.exe`

Install attempts with the project-local Playwright 1.59.1 CLI timed out and left a cache lock, which was cleared after stopping only the stuck installer process. The exact browser archives were then downloaded and extracted to the expected cache paths, after which `npm.cmd run test:e2e` passed all 84 tests.

# Bug and Security Report

Generated: 2026-05-16

## Findings

### SEC-001: Auth provider clears client auth state on transient `/auth/me` failures

- Severity: Medium
- Category: Auth/session UX and availability
- File: `src/app/AuthProvider.tsx`
- Function: `refreshUser`
- Evidence: non-abort, non-401 errors call `clearAuth()`. This means a transient 500/network/CORS/provider error during an auth refresh can remove a locally known session state even though the server has not rejected the session.
- Why it matters: users can be redirected away from protected flows during transient backend failures. This is not an auth bypass, but it creates unsafe session handling semantics and can interrupt money/game flows.
- Reference: OWASP session management guidance distinguishes explicit invalidation from transient transport failures: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Safe fix direction: only clear auth on explicit 401/unauthenticated responses or explicit logout/session-expired events; preserve existing state on transient refresh failures while ending loading state.
- Tests needed: frontend auth provider helper/contract test proving transient errors do not call the clear path and 401 still clears.
- Confidence: High.
- Fix status: fixed in this pass by adding `src/features/auth/refresh-error.ts`, using it from `src/app/AuthProvider.tsx`, and adding contract tests in `server/middleware/frontend-contracts.test.ts`.

### SEC-002: Transaction feed pagination design can hide stale or inconsistent money history on deep pages

- Severity: High
- Category: Money-history correctness/performance
- File: `server/services/transaction.service.ts`
- Function: `getUnifiedTransactionsByUser`
- Evidence: three sources are independently fetched to `page * pageSize`, merged and sliced in memory. `total` reports only the number of fetched merged items, not total available rows.
- Why it matters: users may see misleading pagination totals and deep-page latency can grow sharply. A rushed fix could easily drop or duplicate money events, so this is documented as a fix-plan candidate rather than changed.
- Reference: MongoDB query optimization and pagination guidance: https://www.mongodb.com/docs/manual/core/query-optimization/
- Safe fix direction: ledger/read model or cursor merge with explicit API contract.
- Tests needed: ordering, totals/cursor semantics, no duplicate/missing deposit/withdrawal/ledger rows.
- Confidence: High.

### SEC-003: Metrics endpoint is intentionally protected only in production

- Severity: Low
- Category: Operational exposure
- File: `server/app.ts`
- Route: `/api/metrics`
- Evidence: development/test return metrics with general rate limiting; production returns 404 when no token is configured and 401 for invalid bearer token.
- Why it matters: this is acceptable for local development, but staging environments with production-like data should run `NODE_ENV=production` or equivalent access policy.
- Reference: Express security best practices: https://expressjs.com/en/advanced/best-practice-security.html
- Safe fix direction: no code change; document staging config expectation.
- Tests needed: existing production metrics policy tests should remain.
- Confidence: Medium.

### UI-001: Shared frontend button contract was broken in navbar and merchant layout

- Severity: Low
- Category: Frontend consistency / regression test failure
- Files: `src/components/Navbar.tsx`, `src/components/merchant/MerchantLayout.tsx`
- Evidence: baseline `npm run test:unit` failed `frontend buttons render through SketchyButton`, identifying three raw `<button>` offenders.
- Why it matters: this was a concrete failing test and a UI contract drift. It is not a security issue, but failing unit tests block release confidence.
- Reference: React component consistency is supported by React's render/component model: https://react.dev/learn/render-and-commit
- Fix direction: use `SketchyButton` for the affected interactive controls while preserving behavior.
- Tests needed: existing contract test.
- Confidence: High.
- Fix status: fixed in this pass; unit tests pass.

### REL-001: WebKit merchant admin E2E timeout remains unresolved

- Severity: Medium
- Category: Browser reliability / latency
- Files: `tests/e2e/merchant.spec.ts`, merchant admin route stack
- Evidence: `npm run test:e2e` failed 1/24 tests; targeted WebKit reruns also timed out. Manual WebKit harness script rendered the route after about 12s and displayed the pending order.
- Why it matters: the browser suite remains red, so the codebase is not fully release-verified even though manual behavior suggests a timing/performance issue rather than an authorization failure.
- Reference: web.dev user-centric performance guidance: https://web.dev/performance/
- Fix direction: instrument merchant dashboard cold path, reduce backend work, then adjust E2E waits to a stable app/API signal if needed.
- Tests needed: passing WebKit merchant E2E and targeted dashboard API timing tests.
- Confidence: Medium.
- Fix status: resolved as an E2E synchronization issue in `FIX-003`; final Playwright suite passed 24/24. Merchant dashboard cold-path latency remains a performance risk, but it is no longer a failing browser check.

### REL-002: WebKit auth and merchant tests raced form mutation state

- Severity: Medium
- Category: E2E reliability
- Files: `tests/e2e/auth.spec.ts`, `tests/e2e/merchant.spec.ts`
- Evidence: full E2E failed on WebKit with auth still on the login form after the second sign-in path, and merchant showing `Transaction failed. Please try again.` when the proof upload/order submission sequence raced UI state.
- Why it matters: flaky release checks can mask true regressions and waste debugging time.
- Reference: Playwright-style condition-based waiting is preferred over timing assumptions; user-flow stability also supports reliable performance testing.
- Fix direction: wait for successful API responses and app-visible state before asserting downstream UI.
- Tests needed: final full E2E suite.
- Confidence: High.
- Fix status: fixed; final `npm run test:e2e -- --reporter=line` passed 24/24.

## Previously Fixed or Carried Forward

- Deposit replay memo timing, stuck withdrawal recovery, SELL payout serialization, production topology checks, health/readiness background job checks, recovery-code lifecycle, trust proxy, metrics production policy, auth/session hardening, registration enumeration, Turnstile timeout, dashboard duplicate requests, and MongoDB index additions were already present in the dirty worktree or prior reports and were not reverted.

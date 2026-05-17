# Fix Log

Generated: 2026-05-16

## FIX-001: Shared button contract violations

- Issue ID: `UI-001`
- Files changed:
  - `src/components/Navbar.tsx`
  - `src/components/merchant/MerchantLayout.tsx`
- What changed: replaced raw interactive `<button>` elements in the navbar logout controls and merchant dashboard refresh control with `SketchyButton`, preserving handlers, disabled state, accessible labels, and responsive layout.
- Why safe: behavior stayed local to rendering/styling; the existing failing contract test defined the expected implementation boundary.
- Best-practice reference: React render behavior and component consistency guidance: https://react.dev/learn/render-and-commit
- Tests added/updated: no new test required; existing `frontend buttons render through SketchyButton` contract test covered the defect.
- Commands run:
  - `npx vitest run server/middleware/frontend-contracts.test.ts`
  - `npm run test:unit`
  - `npm run test:integration`
  - `npm run build`
- Result: targeted, unit, integration, and build passed after the fix.
- Regression risk: low; limited UI component substitution.
- Rollback plan: restore the prior raw buttons if a SketchyButton-specific rendering issue appears, then update the contract intentionally.

## FIX-002: Preserve auth state on transient refresh failures

- Issue ID: `SEC-001` / `BOUNDARY-003`
- Files changed:
  - `src/app/AuthProvider.tsx`
  - `src/features/auth/refresh-error.ts`
  - `server/middleware/frontend-contracts.test.ts`
- What changed: introduced `shouldClearAuthAfterRefreshError()` and changed `AuthProvider.refreshUser()` so only explicit `401` refresh responses clear client auth state. Transient non-401 failures now preserve the previous state and end loading.
- Why safe: backend authorization remains authoritative; explicit unauthenticated responses still clear state. The fix avoids treating network/provider/server errors as session invalidation.
- Best-practice reference: OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Tests added/updated: added contract tests proving `401` clears and non-401 `ApiClientError`, generic `Error`, and `null` do not clear.
- Commands run:
  - `npx vitest run server/middleware/frontend-contracts.test.ts`
  - `npm run test:unit`
  - `npm run lint`
  - `npm run build`
  - `npm run test:integration`
- Result: targeted, unit, lint, build, and integration passed after the fix.
- Regression risk: low to medium; users may remain on a protected UI during a transient API outage, but protected backend calls still enforce authentication.
- Rollback plan: revert `AuthProvider.tsx`, remove `src/features/auth/refresh-error.ts`, and remove the added contract tests.

## FIX-003: Stabilize WebKit E2E waits on real app/API conditions

- Issue ID: `REL-001` / `BROWSER-002`
- Files changed:
  - `tests/e2e/auth.spec.ts`
  - `tests/e2e/merchant.spec.ts`
- What changed: the auth E2E test now waits for the successful `/api/auth/login/password` response before asserting the protected route. The merchant E2E test now waits for the uploaded proof filename, the enabled submit button, and the successful `/api/orders` response before asserting the success toast.
- Why safe: test-only change; no production behavior or security semantics changed.
- Best-practice reference: Playwright condition-based waiting practice and web.dev user-flow reliability guidance: https://web.dev/performance/
- Tests added/updated: updated existing E2E tests to wait on stable conditions instead of racing UI state.
- Commands run:
  - `npx playwright test tests/e2e/auth.spec.ts --project=webkit --reporter=line`
  - `npx playwright test tests/e2e/merchant.spec.ts --project=webkit --reporter=line`
  - `npm run test:e2e -- --reporter=line`
- Result: targeted WebKit auth passed, targeted WebKit merchant passed when run sequentially, and full E2E passed 24/24.
- Regression risk: low; tests now assert the same user outcomes with stronger synchronization.
- Rollback plan: restore the previous click/assert sequence if these waits conflict with future API route changes.

## Deferred Items

- `SEC-002` / `PERF-001`: unified transaction history overfetch and total semantics. Deferred because money-history pagination requires API-contract work and high-confidence no-duplicate/no-missing tests.
- `PERF-002`: merchant dashboard cold-cache unbounded pending-order work. Deferred pending aggregate query design and parity tests.
- `PERF-003`: notification delivery still awaited in some mutation responses. Deferred pending queue/audit retry design.

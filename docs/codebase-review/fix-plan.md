# Fix Plan

Generated: 2026-05-16

## Scope Rule

Only issues proven by source inspection, prior/fresh test output, browser checks, or database query analysis are eligible. No production code changes happen without a failing test first.

## Proposed Fixes

### FIX-001: Replace raw buttons caught by frontend contract test

- Issue ID: `UI-001`
- Files to change: `src/components/Navbar.tsx`, `src/components/merchant/MerchantLayout.tsx`.
- Proposed change: replace the three raw `<button>` elements identified by the failing contract test with `SketchyButton`, preserving event handlers, disabled state, aria-labels, and layout classes.
- Evidence: baseline `npm run test:unit` failed `frontend buttons render through SketchyButton`.
- Reference: React render/component guidance: https://react.dev/learn/render-and-commit
- Security/correctness risk: low; rendering-only change.
- Performance impact: negligible.
- Regression risk: low; button styling/layout could shift.
- Tests to add/run: existing frontend contract test, full unit suite.
- Rollback plan: restore prior raw buttons and intentionally update the contract if the design system changes.

### FIX-002: Preserve auth state on transient refresh failures

- Issue ID: `SEC-001` / `BOUNDARY-003`
- Files to change: `src/app/AuthProvider.tsx`, `server/middleware/frontend-contracts.test.ts` or a focused frontend test file.
- Proposed change: introduce a small testable helper that classifies refresh failures. `401` should clear auth. Abort should preserve state and return `null`. Transient non-401 errors should end loading and preserve existing auth state.
- Evidence: `refreshUser` currently calls `clearAuth()` for every non-abort, non-401 failure.
- Reference: OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Security/correctness risk: low if 401 behavior remains unchanged; medium if explicit session expiry stops clearing.
- Performance impact: avoids unnecessary full app redirects/refetches after transient backend failures.
- Regression risk: protected pages may keep stale UI during outage; API calls still fail server-side, so no authorization weakening.
- Tests to add/run: failing unit/contract test for helper behavior; targeted frontend contracts; typecheck/build.
- Rollback plan: restore old `clearAuth()` catch branch.

## Deferred Fixes

### DEFER-001: Unified transaction feed redesign

- Issue ID: `PERF-001` / `SEC-002`
- Reason deferred: money-history API semantics and pagination contract require a broader design and migration plan.
- Tests required before implementation: interleaved source ordering, cursor/page boundaries, duplicate prevention, balance/history reconciliation.

### DEFER-002: Merchant dashboard aggregate split

- Issue ID: `PERF-002`
- Reason deferred: needs parity tests for summary totals and risk queue ordering before changing dashboard semantics.

### DEFER-003: Notification backgrounding

- Issue ID: `PERF-003`
- Reason deferred: product semantics must distinguish security-critical email from non-critical notifications.

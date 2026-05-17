# Frontend/Backend Boundary Report

Generated: 2026-05-16

## Boundary Map

- Backend-owned and observed server-side: auth/session validation, admin checks, MFA step-up, verified-account checks, money amounts/rates/fiat totals, withdrawals, deposit memo/prepare, order transitions, match create/join/resign, merchant payout fields, proof image validation, readiness, metrics production policy.
- Frontend-owned UX helpers: route redirects, form state, basic validation, hidden/visible UI, tabs, loading/error states, optimistic refreshes.

## Findings

### BOUNDARY-001: Admin route protection exists in both frontend and backend

- Severity: Low
- Files: `src/app/App.tsx`, `src/app/ProtectedRoute.tsx`, `server/routes/admin.routes.ts`
- Evidence: frontend redirects non-admin users away from `/merchant`, but backend `/api/admin` route group also applies `authenticateToken`, `requireVerifiedAccount`, `requireAdmin`, and `requireMfaStepUp`.
- Assessment: acceptable defense in depth. Frontend protection is UX only; backend remains authoritative.
- Tests needed: keep `authz-guard-parity.test.ts` and admin route tests.
- Confidence: High.

### BOUNDARY-002: Merchant BUY/SELL rates and fiat totals are backend-authoritative

- Severity: Low
- Files: `server/controllers/order.controller.ts`, `server/services/merchant-config.service.ts`
- Evidence: backend parses amount, reads merchant config, validates minimums, computes `fiatTotal`, and stores optional SELL payout details. Frontend display is not trusted for authoritative calculation.
- Assessment: acceptable.
- Tests needed: keep order service/controller tests for minimums, idempotency, status transitions, payout visibility.
- Confidence: High.

### BOUNDARY-003: Frontend auth state should not be treated as server truth

- Severity: Medium
- Files: `src/app/AuthProvider.tsx`, `src/services/api/apiClient.ts`
- Evidence: frontend stores `isAdmin`, profile completeness, and auth status from `/api/auth/me`; backend route guards still enforce protected APIs. The weakness is availability: transient refresh failure clears the state.
- Assessment: no authorization bypass found, but UX/session state handling needs a targeted fix (`SEC-001`).
- Tests needed: transient refresh failure preserves existing client state; explicit 401 clears.
- Confidence: High.
- Fix status: fixed in this pass. `AuthProvider.refreshUser()` now clears client auth only for explicit `401` refresh responses; backend route guards remain authoritative.

## No Unsafe Frontend-Only Authority Found In This Pass

No code path reviewed trusted frontend-provided role, balance, user ID, payout authorization, order status, withdrawal state, or wallet verification as authoritative without backend checks. This statement is limited to files inspected in this pass and prior report context; it is not a cryptographic proof of every route.

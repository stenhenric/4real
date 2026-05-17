# Browser Test Report

Generated: 2026-05-16

## Startup Status

Port `3000` already had a Node dev server running as PID `1384`, so this pass reused that server and did not stop it.

- `GET /api/health`: `200`
- `GET /api/health/live`: `200`
- `GET /api/health/ready`: first 30s attempt timed out; retry with 75s timeout returned `200` in about 3.96s with database, Redis, hot wallet runtime, and mandatory background jobs up.
- `GET /tonconnect-manifest.json`: `200`

## Browser Tool Note

The prompt requested Vercel Agent Browser. This Codex environment exposes the Browser/in-app browser capability rather than a tool named "Vercel Agent Browser." Browser verification in this pass uses the available local browser/E2E tooling and records that limitation explicitly.

Attempting to use the in-app Browser failed with `No active Codex browser pane available`. Fallback verification used Playwright E2E and direct HTTP checks.

## Flows Tested In This Pass

| Flow / route | Role | Expected | Actual | Status |
|---|---|---|---|---|
| `/api/health` | public | JSON health metadata | `200` with build metadata | Passed |
| `/api/health/live` | public | Liveness only | `200` | Passed |
| `/api/health/ready` | public/internal ops | Dependency readiness | First 30s attempt timed out; retry returned `200` in ~3.96s | Mixed |
| `/tonconnect-manifest.json` | public | Fast public manifest | `200` with URL/icon/privacy/terms fields | Passed |
| Playwright E2E suite | unauth, user, admin harness roles | Full smoke coverage | 23/24 passed; WebKit merchant admin test timed out | Failed |
| Playwright E2E suite after test synchronization | unauth, user, admin harness roles | Full smoke coverage | 24/24 passed across Chromium, Firefox, and WebKit | Passed |
| `tests/e2e/merchant.spec.ts` WebKit | customer/admin harness | Customer submits BUY order; admin sees treasury dashboard | Initially failed from timing/race behavior; passed after waiting on proof upload state and successful order API response | Passed |
| `tests/e2e/auth.spec.ts` WebKit | public/auth user | Register, verify, logout, wrong password, correct login, protected route | Initially timed out after second login; passed after waiting on successful login API response | Passed |

## Browser Findings

### BROWSER-001: In-app browser unavailable in this session

- Severity: Low
- Evidence: Browser plugin reported `No active Codex browser pane available`.
- Impact: route verification used Playwright and HTTP checks rather than Vercel/in-app Browser interaction.
- Fix status: not a codebase issue.

### BROWSER-002: WebKit merchant admin E2E remains timing-sensitive

- Severity: Medium
- Evidence: `npm run test:e2e` failed 1/24 tests. Targeted WebKit reruns also failed, including a 120s test timeout variant that failed waiting 10s for heading `Treasury Overview`.
- Manual cross-check: a manual WebKit harness flow loaded the merchant admin route, saw `Treasury Overview`, and displayed the pending BUY order.
- Impact: deployment should not be treated as fully verified while the browser suite has a reproducible failing check. The app behavior appears slow/timing-sensitive rather than obviously unauthorized or broken.
- Fix status: fixed as test synchronization in `FIX-003`; final `npm run test:e2e -- --reporter=line` passed 24/24.

### BROWSER-003: WebKit E2E tests were racing mutation/UI state

- Severity: Medium
- Evidence: full suite failure showed WebKit auth still on the login form after the second login path and WebKit merchant showing `Transaction failed. Please try again.` after submitting before the proof state was visibly settled.
- Impact: false negative browser failures hid real release signal.
- Fix status: fixed in tests by waiting on successful auth/order API responses and visible proof upload state before asserting downstream UI.

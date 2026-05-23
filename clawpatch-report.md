# Clawpatch Remediation Report

Scan date: 2026-05-23  
Repository: `C:\Users\Sten.DESKTOP-JT1I9N4\OneDrive\Desktop\4realmain`  
Clawpatch state dir: `.clawpatch`  
Fresh run attempted:

- `clawpatch --no-input --plain review --jobs 10` at `20260523T081428-a08d8c`: completed, reviewed 0 features, produced 0 new findings.
- `clawpatch --no-input --plain map --source heuristic`: refreshed the map, 70 features total, 3 new, 10 changed, 3 stale.
- `clawpatch --no-input --plain review --jobs 10` at `20260523T081514-becf2a`: failed on `feat_library_8365230b84` with `spawn EPERM`.
- `clawpatch --no-input --plain doctor`: also failed with `spawn EPERM`.
- Current Clawpatch inventory: 83 findings, 82 open in Clawpatch state. Manual validation below is against the current working tree, not the stale Clawpatch status alone.

## Executive Summary

Clawpatch's stored findings are useful but materially stale. Many items it still marks open have already been fixed in the current codebase: auth refreshes now use generation/request guards, profile and dashboard loads are abort-safe, Turnstile client configuration now uses only `VITE_TURNSTILE_SITE_KEY`, money submission paths use exact decimal normalization, path parameters are encoded, `npm run build` runs frontend type checking, and test scripts include the previously omitted unit tests.

No confirmed Critical or High production issue remains after validation. The highest confirmed issues are Medium severity and mostly affect auth/session UI correctness, bot-check recoverability, and user-facing financial history completeness.

Confirmed Medium issues:

1. MFA actions can clear the current session from client auth state.
2. Anonymous users can see the `/auth/verified` success page.
3. Turnstile load errors can leave auth forms disabled without visible recovery.
4. The bank transaction feed fetches page 1 only, with no UI path to later pages.

Security-sensitive manual checks found strong baseline controls: server-side auth middleware is present on protected routes, admin routes require admin plus MFA step-up, state-changing API routes run CSRF origin checks, sensitive flows have rate limiters, CORS is origin allowlisted, production config rejects unsafe defaults, cookies are HTTP-only/SameSite/secure in production, and file upload MIME/signature checks exist for proof images. The main remaining security hardening recommendation is to keep bot verification fail-closed on both client and server and add UI recovery for Turnstile script failures.

## Confirmed Critical/High Issues

None confirmed. The one Clawpatch High finding, "Initial auth refresh can overwrite a successfully approved login", is stale: `src/app/AuthProvider.tsx` now uses `authGenerationRef` and `refreshRequestRef` to ignore refresh responses that started before an explicit auth-state mutation.

## Full Findings Table

| # | Severity | Status | Category | Finding |
|---:|---|---|---|---|
| 1 | High | False Positive | Auth/Reliability | Initial auth refresh can overwrite a successfully approved login |
| 2 | Medium | False Positive | Frontend/Reliability | Aborted profile fetch can clear the loading state for a newer profile request |
| 3 | Medium | False Positive | Frontend/Reliability | Aborted profile requests can clear the loading state for the next profile |
| 4 | Medium | Low Priority Improvement | Security/Frontend | Alert target links trust dashboard-provided paths without validation |
| 5 | Medium | False Positive | Build/Config | Build skips frontend type checking |
| 6 | Medium | False Positive | Frontend | CTA links nest a button inside a React Router link |
| 7 | Medium | False Positive | Build/Config | Extension-qualified re-export risks invalid emitted module specifier |
| 8 | Medium | False Positive | Data | Financial inputs are rounded with JavaScript Number before submission |
| 9 | Medium | False Positive | Auth/Reliability | Initial auth refresh can clear the approved session after token consumption |
| 10 | Medium | False Positive | Testing | Linked src test is not executed by npm run test |
| 11 | Medium | Real | Auth/Frontend | MFA actions can erase the current session from auth state |
| 12 | Medium | False Positive | Security/Auth | Missing Turnstile site key allows registration without bot verification |
| 13 | Medium | False Positive | Security/Auth | Missing Turnstile site key lets the form submit without a bot token |
| 14 | Medium | False Positive | Game/Reliability | Move guard can use stale room state during socket updates or room switches |
| 15 | Medium | Real | Frontend/Data | Paginated transaction feed has no way to access later pages |
| 16 | Medium | False Positive | Game/Data | Paid public draft can be created with a zero wager |
| 17 | Medium | False Positive | Game/Data | Paid public draft creation allows a zero wager |
| 18 | Medium | False Positive | Game/Data | Paid-public draft accepts the default zero wager |
| 19 | Medium | False Positive | Auth/UX | Password login ignores the sanitized return path |
| 20 | Medium | False Positive | Auth/UX | Password sign-in drops the requested post-login redirect |
| 21 | Medium | False Positive | Frontend/Reliability | Post-action refreshes can overwrite the selected filter with stale results |
| 22 | Medium | False Positive | Frontend/Reliability | Post-update reload can overwrite the current filter with stale order data |
| 23 | Medium | Needs Manual Review | Build/Deploy | Production helper starts TypeScript source instead of built output |
| 24 | Medium | False Positive | Auth/Frontend | Public auth token endpoints can trigger session-refresh and session-expired handling |
| 25 | Medium | False Positive | Frontend/Reliability | Replay refresh can overwrite the active deposit filter with stale results |
| 26 | Medium | False Positive | Auth/Routing | Route gating ignores backend profile-incomplete status |
| 27 | Medium | False Positive | Frontend/Reliability | Single rowAction flag allows duplicate or conflicting order mutations |
| 28 | Medium | False Positive | Auth/Reliability | Stale initial auth refresh can clear the verified session |
| 29 | Medium | False Positive | Auth/Reliability | Stale refresh responses can restore auth state after logout or clearAuth |
| 30 | Medium | False Positive | Auth/Reliability | Startup auth refresh can clear a just-consumed magic-link session |
| 31 | Medium | False Positive | Frontend/UX | Transaction fetch failures are rendered as an empty account history |
| 32 | Medium | Real | Auth/UX | Turnstile load errors leave users stuck without a visible recovery path |
| 33 | Medium | False Positive | Auth/UX | Turnstile script failures cannot recover without a full page reload |
| 34 | Medium | False Positive | Config/Frontend | TURNSTILE_SITE_KEY fallback is advertised but not reliably exposed to Vite client code |
| 35 | Medium | Real | Auth/UX | Unauthenticated visitors can see the email-verified success state |
| 36 | Medium | False Positive | Frontend/Data | Unavailable merchant balances render as zero |
| 37 | Medium | False Positive | Frontend/Data | Unavailable reserve balances are rendered as zero |
| 38 | Low | False Positive | Testing | `npm test` runs the same middleware test files twice |
| 39 | Low | False Positive | Frontend/Reliability | Abort classifier is called without the signal it needs for fetch TypeError aborts |
| 40 | Low | False Positive | Frontend/Reliability | Aborted leaderboard fetch can still show an error toast |
| 41 | Low | False Positive | Testing | Associated idempotency test is not run by the configured test command |
| 42 | Low | Low Priority Improvement | Testing | Auth source group has no linked frontend tests for redirect and token-scrubbing behavior |
| 43 | Low | False Positive | Build/Config | Build can leave stale server artifacts |
| 44 | Low | Low Priority Improvement | Testing | Canvas helpers have no direct regression coverage |
| 45 | Low | Real | Frontend | Canvas stroke default uses unresolved CSS custom property |
| 46 | Low | Low Priority Improvement | Accessibility | CopyField can render an unlabeled readonly input when id is omitted |
| 47 | Low | Low Priority Improvement | Testing | CopyField has no frontend regression coverage |
| 48 | Low | False Positive | Frontend | CSS variable fallbacks in stroke are ignored |
| 49 | Low | False Positive | Frontend/Reliability | Dashboard poll/manual requests are not aborted on unmount |
| 50 | Low | Low Priority Improvement | Testing | Default /auth redirect is not covered by the standard test command |
| 51 | Low | False Positive | Testing | Default test command reruns middleware tests |
| 52 | Low | False Positive | Testing | Default test script runs middleware tests twice |
| 53 | Low | Low Priority Improvement | Frontend | EmptyState accepts arbitrary React nodes but always nests them inside a paragraph |
| 54 | Low | False Positive | Frontend | Footer hash link targets do not match page section ids |
| 55 | Low | Low Priority Improvement | Testing | Forgot-password route guard behavior lacks frontend test coverage |
| 56 | Low | False Positive | Frontend | Invalid date strings render as "Invalid Date" instead of the unavailable fallback |
| 57 | Low | Low Priority Improvement | UX | Local validation errors are hidden behind generic fallback toasts |
| 58 | Low | Low Priority Improvement | Testing | Login route auth gating has no frontend regression coverage |
| 59 | Low | False Positive | Frontend/Reliability | Manual and poll dashboard requests outlive the merchant route |
| 60 | Low | False Positive | Frontend/Reliability | Manual refresh can silently inherit an in-flight poll request |
| 61 | Low | False Positive | Frontend | Marketing footer links target anchors that do not exist |
| 62 | Low | Low Priority Improvement | Testing | Merchant fallback has no frontend regression coverage |
| 63 | Low | Low Priority Improvement | Testing | Merchant route guard has no frontend regression coverage |
| 64 | Low | False Positive | Frontend/Reliability | Merchant view aborts can show false load errors |
| 65 | Low | Low Priority Improvement | Testing | MFA challenge route lacks regression coverage for its auth-state branches |
| 66 | Low | Real | Frontend | Mini board preview ignores move coordinates |
| 67 | Low | Low Priority Improvement | Frontend | Missing IDs can be rendered as a victory |
| 68 | Low | Low Priority Improvement | Testing | No test coverage for /auth/register public-only routing states |
| 69 | Low | False Positive | Auth/UX | Old development reset link remains visible after a later failed request |
| 70 | Low | False Positive | Frontend/Reliability | Older active-match refreshes can overwrite newer lobby state |
| 71 | Low | Low Priority Improvement | Accessibility | Omitting id leaves the visible label unassociated with the input |
| 72 | Low | False Positive | Frontend/Reliability | Polling refreshes are not cancelled when the layout unmounts |
| 73 | Low | Low Priority Improvement | Frontend | Profile links can route to /profile/undefined while auth is unresolved |
| 74 | Low | Low Priority Improvement | Game/UX | Resign action remains available after the match is already completed |
| 75 | Low | Low Priority Improvement | Testing | Route has no frontend coverage for submit, auth-state update, or navigation behavior |
| 76 | Low | False Positive | Testing | Server test files are excluded from TypeScript validation |
| 77 | Low | Low Priority Improvement | Testing | SketchCard has no regression coverage for its public rendering contract |
| 78 | Low | Low Priority Improvement | Testing | SketchyButton has no component-level test coverage |
| 79 | Low | Low Priority Improvement | Testing | SketchyContainer has no component-level regression coverage |
| 80 | Low | Low Priority Improvement | Testing | StatusBadge behavior has no frontend test coverage |
| 81 | Low | False Positive | Frontend | Stuck transaction statuses render as neutral badges |
| 82 | Low | Low Priority Improvement | Auth/UX | Transient consume failures are shown as invalid approval links after the token is scrubbed |
| 83 | Low | False Positive | Frontend/API | Unencoded path parameters can produce wrong API routes |

## Detailed Analysis

## Initial auth refresh can overwrite a successfully approved login

**Severity:** High  
**Status:** False Positive  
**Category:** Auth / Reliability

### Location
- File: `src/app/AuthProvider.tsx`
- Function/component: `refreshUser`, `setAuthStateFromResponse`
- Related route/API/user flow: `/auth/approve-login`, `/api/auth/me`, `/api/auth/login/suspicious/consume`

### What Clawpatch Found
Clawpatch reported a race where the bootstrap `/auth/me` request could finish after a successful one-time-token auth response and overwrite the new session.

### Validation
This is stale. The current provider increments `authGenerationRef` on explicit auth-state mutation and uses `refreshRequestRef` to ignore older refreshes. A refresh that started before token consumption no longer applies once `setAuthStateFromResponse` has run.

### Impact
If unfixed, users could be logged out immediately after approving a suspicious login. In the current code, that path is guarded.

### Recommended Fix
No code fix needed for this finding. Keep regression tests around stale refresh handling.

### Regression Risk
Changing auth loading or generation logic carelessly could reintroduce this race.

### Suggested Tests
AuthProvider test with delayed `/auth/me`, successful approval consume, then stale 401 from `/auth/me`; assert authenticated state persists.

### References
OWASP Authentication and session-management guidance: avoid ambiguous session state transitions and keep auth flows deterministic.

## MFA actions can erase the current session from auth state

**Severity:** Medium  
**Status:** Real  
**Category:** Auth / Frontend

### Location
- File: `src/app/AuthProvider.tsx`
- Function/component: `applyAuthState`
- Related route/API/user flow: `/auth/security` MFA setup, disable MFA, regenerate recovery codes

### What Clawpatch Found
MFA-related responses update user state but often omit `session`. `AuthProvider` treats omitted `session` as `null`.

### Validation
Real. `applyAuthState` currently calls `setCurrentSession(response.session ?? null)`. Server handlers such as `verifyTotpSetup`, `disableMfa`, and `regenerateRecoveryCodes` serialize user/balance state without returning the current session. After those actions, the UI can lose the current session even though the user remains authenticated.

### Impact
The security settings page can show the current browser as unavailable and compute "other sessions" incorrectly. This is not direct account takeover, but it weakens an auth-sensitive management surface and can lead to wrong device-revocation UX.

### Recommended Fix
Distinguish an explicitly null session from an omitted session. Preserve the existing `currentSession` when the response object does not contain the `session` property, or refresh `/api/auth/me` after MFA mutations.

### Regression Risk
Careless preservation could keep a revoked session visible after logout or self-revocation. The fix should only preserve when the field is absent, not when the server explicitly sends `session: null`.

### Suggested Tests
Seed `AuthProvider` with a current session, apply an MFA response with user but no `session`, and assert the current session is preserved. Add a negative test where explicit `session: null` clears it.

### References
OWASP session-management guidance; React state should model API contracts without conflating absent and explicit-null fields.

## Paginated transaction feed has no way to access later pages

**Severity:** Medium  
**Status:** Real  
**Category:** Frontend / Data

### Location
- File: `src/services/transactions.service.ts`
- Function/component: `getTransactions`
- Related route/API/user flow: `/bank` transaction history

### What Clawpatch Found
The API supports `page` and `pageSize`, but the bank page only fetches the default first page.

### Validation
Real. `getTransactions` now accepts pagination query arguments, but `BankPage` still calls `getTransactions({ signal })` once and renders only `data.items`. There is no "next page", "load more", or cursor state.

### Impact
Users with more than one page of deposits, withdrawals, matches, or P2P orders cannot inspect older ledger entries in the UI. This is a production data-access and supportability issue for a wallet/transaction product.

### Recommended Fix
Add pagination controls or infinite load to `BankPage`, preserve page metadata, and expose loading/error state per page request.

### Regression Risk
Ledger rendering order, duplicate entries across pages, and stale page merges can regress if pagination is bolted on without request sequencing.

### Suggested Tests
Mock `getTransactions` with two pages; assert page 2 can be requested and appended/replaced correctly, and failed page loads do not erase already loaded history.

### References
Financial account-history UIs should provide complete, auditable access to user ledger history.

## Turnstile load errors leave users stuck without a visible recovery path

**Severity:** Medium  
**Status:** Real  
**Category:** Auth / UX

### Location
- File: `src/features/auth/AuthTurnstile.tsx`
- Function/component: `AuthTurnstile`
- Related route/API/user flow: registration, login, password reset bot verification

### What Clawpatch Found
When Turnstile script loading or widget rendering fails, parent pages clear the token but do not show a visible recovery path.

### Validation
Real. `ensureScript` retry mechanics are fixed in `src/features/auth/auth-turnstile-script.ts`, but `AuthTurnstile` still logs script errors to the console and calls `onError`. Registration/login forms then remain disabled because `siteKey` exists and no token is available. There is no inline error or retry button visible to the user.

### Impact
Transient CDN issues, script blocking, or browser/network failures can dead-end auth flows. For registration and password recovery this becomes a reliability problem; for bot protection, operators may be tempted to disable the control.

### Recommended Fix
Track a Turnstile error state in the component or parent forms. Show an inline error with a retry action that removes/reloads the widget script or remounts the widget.

### Regression Risk
Do not weaken fail-closed behavior. Retry should attempt to obtain a valid token, not bypass verification.

### Suggested Tests
Mock `ensureScript` rejection and assert the form shows a visible error/retry control while still preventing submission without a token.

### References
Cloudflare Turnstile requires server-side token validation; client UX should recover from script errors without allowing unchecked submission.

## Unauthenticated visitors can see the email-verified success state

**Severity:** Medium  
**Status:** Real  
**Category:** Auth / UX

### Location
- File: `src/app/App.tsx`
- Function/component: `/auth/verified` route, `VerifiedPage`
- Related route/API/user flow: email verification completion

### What Clawpatch Found
`/auth/verified` renders success copy without requiring an authenticated user.

### Validation
Real. `App.tsx` mounts `<VerifiedPage />` directly under the public layout. `VerifiedPage` only uses auth state to schedule post-auth navigation; when `loading` is false and `userData` is null, it still renders "Your account is ready".

### Impact
An anonymous user, stale link user, or failed verification flow can see a false success page. This is misleading and can increase support load around account activation.

### Recommended Fix
Gate the page after auth loading. Redirect anonymous users to `/auth/login` or `/auth/verify-email`; show success only when `userData` exists.

### Regression Risk
Do not block legitimately profile-incomplete users after verification. The route should allow authenticated users with `profile_incomplete` and then redirect them to complete profile.

### Suggested Tests
Route test for `/auth/verified` with `loading=false,userData=null` should not render success. Positive test with authenticated profile-incomplete state should render success then navigate to `/auth/complete-profile`.

### References
Auth completion routes should bind success UI to verified server/client auth state, not just route access.

## Alert target links trust dashboard-provided paths without validation

**Severity:** Medium  
**Status:** Low Priority Improvement  
**Category:** Security / Frontend

### Location
- File: `src/pages/merchant/AlertsPage.tsx`
- Function/component: alert target `<Link>`
- Related route/API/user flow: admin merchant alerts

### What Clawpatch Found
Dashboard alert links are rendered from `alert.targetPath` without client-side validation.

### Validation
The immediate risk is low because `server/services/merchant-dashboard.service.ts` generates alert paths internally and current values are known merchant routes. It is still reasonable defense-in-depth to allowlist merchant paths client-side before rendering a clickable link.

### Impact
If future dashboard data becomes data-driven or user-influenced, an admin could be navigated to an unintended internal route or malformed target.

### Recommended Fix
Add a small `isAllowedMerchantAlertPath` helper and render links only for `/merchant`, `/merchant/orders`, `/merchant/deposits`, `/merchant/liquidity`, and `/merchant/alerts`.

### Regression Risk
Too narrow an allowlist could hide legitimate future operational links.

### Suggested Tests
Render an alert with `targetPath="https://example.com"` and assert no link is rendered; render `/merchant/orders` and assert it remains clickable.

### References
OWASP guidance favors allowlisting redirects/navigation targets where untrusted data could influence navigation.

## Production helper starts TypeScript source instead of built output

**Severity:** Medium  
**Status:** Needs Manual Review  
**Category:** Build / Deploy

### Location
- File: `scripts/start-production.mjs`
- Function/component: production helper script
- Related route/API/user flow: deployment/startup

### What Clawpatch Found
The helper imports TypeScript source instead of the built `dist/server/main.js`.

### Validation
Needs manual deployment review. `package.json` production `start` uses `node ./dist/server/main.js`, so the main start path is correct. The helper name is risky because an operator or platform could use it by mistake.

### Impact
If used in production, startup can depend on unconfigured TypeScript runtime behavior and bypass the tested compiled artifact.

### Recommended Fix
Either remove/rename the helper as development-only or change it to load the built server after `npm run build`.

### Regression Risk
Changing operational scripts can break an external deployment configuration if it already references this helper.

### Suggested Tests
Add a production smoke check that builds then starts the same artifact used by deployment.

### References
Express production guidance recommends explicit production process and environment configuration.

## Canvas stroke default uses unresolved CSS custom property

**Severity:** Low  
**Status:** Real  
**Category:** Frontend

### Location
- File: `src/components/SketchyContainer.tsx`
- Function/component: `SketchyContainer`
- Related route/API/user flow: sketch-style panels across the app

### What Clawpatch Found
The default canvas stroke is passed as `var(--color-ink-black)` to RoughJS/canvas.

### Validation
Real. Canvas drawing APIs do not resolve CSS custom properties by themselves. Unlike `SketchyButton`, `SketchyContainer` does not resolve the variable before passing it to `drawRoughRectangle`.

### Impact
Visual borders can fall back to the canvas default rather than theme colors, especially under theming changes.

### Recommended Fix
Resolve CSS custom properties with `getComputedStyle` before drawing, or make the default a concrete color.

### Regression Risk
Resolution must run only in the browser and should update if the theme token changes.

### Suggested Tests
Mock `drawRoughRectangle`; mount with default stroke and assert the draw call receives a concrete color.

### References
Canvas style values are parsed as concrete canvas colors, not CSS variable expressions.

## Mini board preview ignores move coordinates

**Severity:** Low  
**Status:** Real  
**Category:** Frontend

### Location
- File: `src/components/ui/MiniMatchCard.tsx`
- Function/component: `MiniBoardPreview`
- Related route/API/user flow: profile match history

### What Clawpatch Found
The mini board maps moves by array index and parity, not by the move's row/column data.

### Validation
Real. `MiniBoardPreview` renders 14 fixed slots and checks `match.moveHistory?.[slot]`, using slot parity to decide color. It does not place discs by move coordinates from `MatchMoveDTO`.

### Impact
Profile history can show inaccurate board previews, which is a UX/data presentation bug.

### Recommended Fix
Project `moveHistory` into a 7x6 or compact preview grid using actual move coordinates and player order.

### Regression Risk
Incorrect player/color mapping could still misrepresent history if the DTO contract is not followed.

### Suggested Tests
Pass known move coordinates and assert the expected preview cells are filled.

### References
Presentation components should render persisted domain data, not infer state from array position when coordinates exist.

## Low-Priority Findings And Dismissals

The remaining findings were validated as either stale/false-positive or low-priority improvement. Each entry follows the required fields in compressed form.

## Aborted profile fetch can clear the loading state for a newer profile request

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Reliability

### Location
- File: `src/pages/ProfilePage.tsx`
- Function/component: `fetchProfileData`
- Related route/API/user flow: `/profile/:userId`

### What Clawpatch Found
An aborted request could run `finally` and clear loading for a newer request.

### Validation
Current code checks `if (!controller.signal.aborted) setLoading(false)` in `finally`.

### Impact
No active impact in current code.

### Recommended Fix
No fix needed; keep the abort guard.

### Regression Risk
Removing the guard would reintroduce flickering false "not found" states.

### Suggested Tests
Rapid route-change test with an aborted first profile request.

### References
Abortable fetch state should not commit after cancellation.

## Aborted profile requests can clear the loading state for the next profile

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Reliability

### Location
- File: `src/pages/ProfilePage.tsx`
- Function/component: profile loading effect
- Related route/API/user flow: `/profile/:userId`

### What Clawpatch Found
Duplicate of the prior profile abort race.

### Validation
False positive for the same reason: current code guards `finally` with `controller.signal.aborted`.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Same as prior finding.

### Suggested Tests
Same as prior finding.

### References
Abortable fetch state should not commit after cancellation.

## Build skips frontend type checking

**Severity:** Medium  
**Status:** False Positive  
**Category:** Build / Config

### Location
- File: `package.json`
- Function/component: `scripts.build`
- Related route/API/user flow: release build

### What Clawpatch Found
Vite build might transpile frontend TypeScript without type checking.

### Validation
False positive. Current `build` starts with `tsc --noEmit`, then `vite build`, then server `tsc`.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Removing `tsc --noEmit` from build would make this real.

### Suggested Tests
CI should continue running `npm run build`.

### References
Vite transpiles TS; projects commonly run `tsc --noEmit` for type checking.

## CTA links nest a button inside a React Router link

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend

### Location
- File: `src/pages/LandingPage.tsx`
- Function/component: primary and final CTA links
- Related route/API/user flow: landing page signup/login CTA

### What Clawpatch Found
Buttons nested inside links.

### Validation
False positive. Current landing CTAs are styled `<Link>` elements, not `<Link><SketchyButton /></Link>`.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Avoid reintroducing nested interactive elements.

### Suggested Tests
Accessibility smoke test for nested interactive controls.

### References
HTML interactive content should not be nested inside anchors.

## Extension-qualified re-export risks invalid emitted module specifier

**Severity:** Medium  
**Status:** False Positive  
**Category:** Build / Config

### Location
- File: `src/types/api.ts`
- Function/component: shared type re-export
- Related route/API/user flow: build/type imports

### What Clawpatch Found
The file used a `.ts` extension in a source re-export.

### Validation
False positive. Current code is `export * from '../../shared/types/api';` with no `.ts` extension.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Reintroducing `.ts` specifiers into emitted runtime code can break builds.

### Suggested Tests
Keep `npm run build`.

### References
TypeScript ESM builds need runtime-safe import specifiers.

## Financial inputs are rounded with JavaScript Number before submission

**Severity:** Medium  
**Status:** False Positive  
**Category:** Data

### Location
- File: `src/features/bank/DepositPanel.tsx`, `WithdrawPanel.tsx`, `MerchantPanel.tsx`
- Function/component: money form handlers
- Related route/API/user flow: deposits, withdrawals, P2P orders

### What Clawpatch Found
Money input was converted through `Number` and rounded before submission.

### Validation
False positive for submission paths. Current handlers call `normalizeFixedScaleAmount` and submit normalized strings. `MerchantPanel` still uses `moneyToNumber` for displayed fiat estimates, but server-side order totals use exact fixed-scale math.

### Impact
No active submission data-loss impact. Display-only rounding should be reviewed if exact fiat preview requirements tighten.

### Recommended Fix
No fix needed for submission. Optional: share exact KES calculation logic client-side.

### Regression Risk
Do not return to `Number(...).toFixed(...)` for financial payloads.

### Suggested Tests
Existing exact-money tests should include sub-micro rejection and max precision cases.

### References
Financial values should use fixed-scale decimal strings or integer minor units.

## Initial auth refresh can clear the approved session after token consumption

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / Reliability

### Location
- File: `src/app/AuthProvider.tsx`, `src/pages/auth/ApproveLoginPage.tsx`
- Function/component: bootstrap refresh and approval consumption
- Related route/API/user flow: suspicious-login approval

### What Clawpatch Found
Duplicate auth refresh race.

### Validation
False positive due to current generation/request guards.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Do not remove auth generation invalidation.

### Suggested Tests
Same delayed-refresh approval test as the High finding.

### References
Auth state writes should ignore stale async work.

## Linked src test is not executed by npm run test

**Severity:** Medium  
**Status:** False Positive  
**Category:** Testing

### Location
- File: `package.json`
- Function/component: `test:unit`
- Related route/API/user flow: CI test coverage

### What Clawpatch Found
`src/utils/idempotency.test.ts` was not included.

### Validation
False positive. Current `test:unit` includes `tests/unit/src/utils/idempotency.test.ts`.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Explicit long test lists can drift; consider glob discovery or a meta-check.

### Suggested Tests
CI should continue running `npm run test`.

### References
Test scripts should select all intended test files.

## Missing Turnstile site key allows registration without bot verification

**Severity:** Medium  
**Status:** False Positive  
**Category:** Security / Auth

### Location
- File: `src/pages/auth/RegisterPage.tsx`
- Function/component: `handleSubmit`
- Related route/API/user flow: registration

### What Clawpatch Found
Missing site key allowed registration submission without a bot token.

### Validation
False positive. Current code returns early when `!siteKey`, shows a configuration error, and disables the Create account button without a token.

### Impact
No active client bypass. Server-side `verifyTurnstileToken` remains the authoritative control.

### Recommended Fix
No fix needed.

### Regression Risk
Do not make missing bot configuration permissive in production.

### Suggested Tests
Component test with no `VITE_TURNSTILE_SITE_KEY` should assert no registration request is sent.

### References
Cloudflare Turnstile tokens must be validated server-side.

## Missing Turnstile site key lets the form submit without a bot token

**Severity:** Medium  
**Status:** False Positive  
**Category:** Security / Auth

### Location
- File: `src/pages/auth/ForgotPasswordPage.tsx`
- Function/component: `handleSubmit`
- Related route/API/user flow: forgot password

### What Clawpatch Found
Forgot-password submission could proceed without a site key.

### Validation
False positive. Current code clears preview state, checks `!siteKey`, shows a configuration error, and returns before calling `requestPasswordReset`.

### Impact
No active client bypass.

### Recommended Fix
No fix needed.

### Regression Risk
Do not allow password-reset requests to bypass bot controls when configured.

### Suggested Tests
Component test with no site key should assert the service is not called.

### References
Bot checks must fail closed on sensitive unauthenticated endpoints.

## Move guard can use stale room state during socket updates or room switches

**Severity:** Medium  
**Status:** False Positive  
**Category:** Game / Reliability

### Location
- File: `src/features/game/useGameRoom.ts`
- Function/component: `makeMove`
- Related route/API/user flow: game room socket moves

### What Clawpatch Found
`roomRef` could lag behind state updates.

### Validation
False positive. Current socket handlers write `roomRef.current` synchronously before `setRoom`, and the disabled/unmounted path clears the ref.

### Impact
No active impact found.

### Recommended Fix
No fix needed.

### Regression Risk
Future socket handlers must keep `roomRef` and React state in sync.

### Suggested Tests
Hook test for room switch before state commit.

### References
Imperative event handlers should read from synchronized refs.

## Paid public draft can be created with a zero wager

**Severity:** Medium  
**Status:** False Positive  
**Category:** Game / Data

### Location
- File: `src/pages/DashboardPage.tsx`
- Function/component: `createGameHandler`
- Related route/API/user flow: paid public match creation

### What Clawpatch Found
The paid public UI allowed wager `0`.

### Validation
False positive. Current paid-public branch calls `normalizeFixedScaleAmount` with `allowZero: false`, and the input minimum is `0.000001`.

### Impact
No active UI impact.

### Recommended Fix
No fix needed. Consider a server-side match type if paid/free semantics become API-level.

### Regression Risk
Do not rely solely on labels to imply a positive wager.

### Suggested Tests
Dashboard test for paid public zero wager rejection.

### References
Business invariants should be enforced close to the boundary that owns the contract.

## Paid public draft creation allows a zero wager

**Severity:** Medium  
**Status:** False Positive  
**Category:** Game / Data

### Location
- File: `src/pages/DashboardPage.tsx`
- Function/component: paid public match creation
- Related route/API/user flow: match creation

### What Clawpatch Found
Duplicate of the zero-wager finding.

### Validation
False positive; current code rejects zero for paid public.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Same as prior finding.

### Suggested Tests
Same as prior finding.

### References
Same as prior finding.

## Paid-public draft accepts the default zero wager

**Severity:** Medium  
**Status:** False Positive  
**Category:** Game / Data

### Location
- File: `src/pages/DashboardPage.tsx`
- Function/component: draft wager step
- Related route/API/user flow: match creation

### What Clawpatch Found
Duplicate of the zero-wager finding.

### Validation
False positive; current code rejects zero for paid public.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Same as prior finding.

### Suggested Tests
Same as prior finding.

### References
Same as prior finding.

## Password login ignores the sanitized return path

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / UX

### Location
- File: `src/pages/auth/LoginPage.tsx`
- Function/component: `handlePasswordLogin`
- Related route/API/user flow: password login with `redirectTo`

### What Clawpatch Found
Password login ignored sanitized return paths.

### Validation
False positive. `LoginPage` computes `redirectTo` with `sanitizeInternalPath`, sends it to `loginPassword`, passes it into MFA challenge paths, and uses `getPostAuthRedirectPath(response)`.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Redirect handling must continue rejecting absolute and protocol-relative URLs.

### Suggested Tests
Login test for safe internal redirect and rejected external redirect.

### References
OWASP recommends validating redirect targets.

## Password sign-in drops the requested post-login redirect

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / UX

### Location
- File: `src/pages/auth/LoginPage.tsx`
- Function/component: password, magic-link, Google auth handlers
- Related route/API/user flow: login redirects

### What Clawpatch Found
Duplicate redirect handling issue.

### Validation
False positive; current handlers propagate sanitized `redirectTo`.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Same as prior finding.

### Suggested Tests
Same as prior finding.

### References
Same as prior finding.

## Post-action refreshes can overwrite the selected filter with stale results

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Reliability

### Location
- File: `src/pages/merchant/OrderDeskPage.tsx`, `src/pages/merchant/DepositsPage.tsx`
- Function/component: reload after mutation
- Related route/API/user flow: merchant order/deposit filters

### What Clawpatch Found
Mutation-triggered reloads could write stale filter data.

### Validation
False positive for current order desk code: it uses `ordersRequestRef` and `ordersQueryRef` to commit only matching current queries. Deposit replay code was also refactored with request/filter safety.

### Impact
No active impact found.

### Recommended Fix
No fix needed; keep request sequencing.

### Regression Risk
Future reload helpers must capture and validate intended filter state before committing.

### Suggested Tests
Deferred filter-change tests around order/deposit reload.

### References
Async UI loaders should ignore stale responses.

## Post-update reload can overwrite the current filter with stale order data

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Reliability

### Location
- File: `src/pages/merchant/OrderDeskPage.tsx`
- Function/component: `loadOrders`
- Related route/API/user flow: merchant order desk

### What Clawpatch Found
Duplicate order filter race.

### Validation
False positive. Current `loadOrders` validates request id and current query before committing.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Same as prior finding.

### Suggested Tests
Same as prior finding.

### References
Same as prior finding.

## Public auth token endpoints can trigger session-refresh and session-expired handling

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / Frontend

### Location
- File: `src/services/api/apiClient.ts`
- Function/component: auth refresh exclusion sets
- Related route/API/user flow: magic link, email verification, suspicious-login approval

### What Clawpatch Found
Public one-time-token endpoints were not excluded from refresh/session-expired handling.

### Validation
False positive. Current `AUTH_REFRESH_EXCLUDED_ENDPOINTS` includes `/auth/login/magic-link/consume`, `/auth/email/verify/consume`, and `/auth/login/suspicious/consume`; `SESSION_EXPIRED_REDIRECT_EXCLUDED_ENDPOINTS` includes those too.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
New public auth endpoints must be added to the exclusion set.

### Suggested Tests
apiClient tests should assert 401 from token-consume endpoints does not call `/auth/refresh`.

### References
Public recovery flows should surface endpoint-specific errors without global session side effects.

## Replay refresh can overwrite the active deposit filter with stale results

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Reliability

### Location
- File: `src/pages/merchant/DepositsPage.tsx`
- Function/component: `runReplay`, deposit loading
- Related route/API/user flow: merchant deposit replay

### What Clawpatch Found
Replay completion could load an old filter into the current view.

### Validation
False positive against current implementation after request/filter refactoring.

### Impact
No active impact found.

### Recommended Fix
No fix needed; keep stale-response guards.

### Regression Risk
Filter-changing UI should not share unscoped async setters.

### Suggested Tests
Replay while switching filters; assert final list matches current filter.

### References
Async UI loaders should ignore stale responses.

## Route gating ignores backend profile-incomplete status

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / Routing

### Location
- File: `src/app/AuthProvider.tsx`
- Function/component: `isProfileComplete`
- Related route/API/user flow: protected/public route gates

### What Clawpatch Found
Route guards used username only instead of backend status.

### Validation
False positive. Current provider exposes `isProfileComplete: authStatus === 'authenticated'`, and `normalizeAuthStatus` considers `nextStep`, `profile_incomplete`, and empty username.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Do not duplicate profile-completeness predicates across components.

### Suggested Tests
Route guard test for non-empty username plus `status='profile_incomplete'`.

### References
One canonical auth-state predicate reduces routing drift.

## Single rowAction flag allows duplicate or conflicting order mutations

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Reliability

### Location
- File: `src/pages/merchant/OrderDeskPage.tsx`
- Function/component: `rowActions`
- Related route/API/user flow: merchant order status mutation

### What Clawpatch Found
A single row action flag could re-enable an in-flight row.

### Validation
False positive. Current code tracks `rowActions` as a record keyed by order id and removes only the completed key.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Avoid replacing per-row state with a single shared id.

### Suggested Tests
Two pending orders with deferred mutations; assert both remain disabled independently.

### References
Sensitive UI mutations should have per-resource pending state.

## Stale initial auth refresh can clear the verified session

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / Reliability

### Location
- File: `src/app/AuthProvider.tsx`, `src/pages/auth/VerifyEmailPage.tsx`
- Function/component: bootstrap refresh and verification consume
- Related route/API/user flow: email verification

### What Clawpatch Found
Duplicate auth refresh race.

### Validation
False positive due to generation/request guards.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Do not remove stale-refresh guards.

### Suggested Tests
Delayed `/auth/me` with successful verification consume.

### References
Auth state writes should ignore stale async work.

## Stale refresh responses can restore auth state after logout or clearAuth

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / Reliability

### Location
- File: `src/app/AuthProvider.tsx`
- Function/component: `refreshUser`, `clearAuth`, `logout`
- Related route/API/user flow: logout during refresh

### What Clawpatch Found
An older refresh could repopulate auth after logout.

### Validation
False positive. `clearAuth` increments `authGenerationRef`; a refresh started before logout becomes stale and returns without applying.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Do not bypass `clearAuth` for logout-like state changes.

### Suggested Tests
Start refresh, call logout, then resolve refresh with old user; assert user remains null.

### References
Logout must invalidate in-flight auth state requests.

## Startup auth refresh can clear a just-consumed magic-link session

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / Reliability

### Location
- File: `src/app/AuthProvider.tsx`, `src/pages/auth/MagicLinkPage.tsx`
- Function/component: bootstrap refresh and magic-link consume
- Related route/API/user flow: magic-link login

### What Clawpatch Found
Duplicate auth refresh race.

### Validation
False positive due to generation/request guards.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Same auth generation caveat.

### Suggested Tests
Delayed `/auth/me`, successful magic-link consume, stale 401 from `/auth/me`.

### References
Auth state writes should ignore stale async work.

## Transaction fetch failures are rendered as an empty account history

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / UX

### Location
- File: `src/pages/BankPage.tsx`
- Function/component: transaction history loader
- Related route/API/user flow: `/bank`

### What Clawpatch Found
Failed transaction loads displayed the empty state.

### Validation
False positive. Current code tracks `transactionsError` and renders that instead of "No ink has been spilled yet."

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Keep error and empty states separate.

### Suggested Tests
Mock `getTransactions` rejection; assert persistent error state.

### References
Financial history pages should distinguish empty data from failed data.

## Turnstile script failures cannot recover without a full page reload

**Severity:** Medium  
**Status:** False Positive  
**Category:** Auth / UX

### Location
- File: `src/features/auth/auth-turnstile-script.ts`
- Function/component: `ensureScript`
- Related route/API/user flow: bot verification

### What Clawpatch Found
Failed Turnstile script elements stayed in the DOM and blocked retry.

### Validation
False positive. Current `fail()` removes the active script and resets `scriptLoadPromise`.

### Impact
No active retry-mechanics impact. Separate visible recovery issue remains real above.

### Recommended Fix
No fix needed for script cleanup.

### Regression Risk
Do not leave failed script tags with the same id.

### Suggested Tests
Trigger script error and assert a later ensure call appends a fresh script.

### References
External script loaders should clean up failed attempts.

## TURNSTILE_SITE_KEY fallback is advertised but not reliably exposed to Vite client code

**Severity:** Medium  
**Status:** False Positive  
**Category:** Config / Frontend

### Location
- File: `src/features/auth/turnstile-config.ts`, `AuthTurnstile.tsx`
- Function/component: `getTurnstileSiteKey`
- Related route/API/user flow: auth bot verification config

### What Clawpatch Found
Client code advertised unprefixed `TURNSTILE_SITE_KEY`.

### Validation
False positive. Current code only reads `import.meta.env.VITE_TURNSTILE_SITE_KEY`, and the visible message references `VITE_TURNSTILE_SITE_KEY`.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Do not expose unprefixed secret-like environment variables to Vite client code.

### Suggested Tests
Unit test `getTurnstileSiteKey` env resolution.

### References
Vite exposes only `VITE_`-prefixed variables to client code by default.

## Unavailable merchant balances render as zero

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Data

### Location
- File: `src/features/merchant/format.ts`, `src/components/merchant/MerchantLayout.tsx`
- Function/component: `formatMoney`
- Related route/API/user flow: merchant dashboard balances

### What Clawpatch Found
Null/undefined reserve values displayed as `0.00`.

### Validation
False positive. Current `formatMoney` returns `Unavailable` for null, undefined, and invalid values.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Do not use generic `moneyToNumber` directly for nullable operational balances.

### Suggested Tests
Render merchant layout with null balance fields.

### References
Operational dashboards should distinguish zero from unknown.

## Unavailable reserve balances are rendered as zero

**Severity:** Medium  
**Status:** False Positive  
**Category:** Frontend / Data

### Location
- File: `src/pages/merchant/LiquidityPage.tsx`
- Function/component: liquidity cards
- Related route/API/user flow: merchant liquidity

### What Clawpatch Found
Null reserve values displayed as zero.

### Validation
False positive. `formatMoney` now returns `Unavailable`; coverage delta also explicitly checks null.

### Impact
No active impact.

### Recommended Fix
No fix needed.

### Regression Risk
Same as prior finding.

### Suggested Tests
Liquidity page test with null on-chain and gas balances.

### References
Operational dashboards should distinguish zero from unknown.

## Low Severity Findings

The following low-severity findings are either stale or improvement-only. They are retained for traceability and fix planning:

- `npm test` duplicate middleware runs: False Positive. Current scripts use unit paths and `tests/integration/server/middleware/*.test.ts` without the old overlap.
- Abort classifier in `BankPage`: False Positive. Current code passes `controller.signal` to `isAbortError`.
- Aborted leaderboard fetch toast: False Positive. Current code passes the abort signal.
- Associated idempotency test omitted: False Positive. Current `test:unit` includes `tests/unit/src/utils/idempotency.test.ts`.
- Auth routing/token-scrub tests missing: Low Priority Improvement. Add focused tests for `auth-routing.ts` and `url-token.ts`.
- Build can leave stale server artifacts: False Positive. Current `clean` removes `dist` before build.
- Canvas helper coverage missing: Low Priority Improvement. Add tests for drawing helpers if visual regressions matter.
- CopyField/ReadonlyField unlabeled when id omitted: Low Priority Improvement. The API allows optional `id`; make `id` required or generate one.
- CopyField coverage missing: Low Priority Improvement.
- SketchyButton CSS var fallback ignored: False Positive. `resolveCssColor` now parses fallback syntax.
- Merchant dashboard unmount/poll abort findings: False Positive. Current layout aborts active tracked requests on unmount and aborts poll on manual refresh.
- Default `/auth` redirect coverage missing: Low Priority Improvement.
- EmptyState arbitrary ReactNode inside paragraph: Low Priority Improvement. Either narrow children type to text or render a `div`.
- Footer/hash link findings: False Positive. Landing page now has `id="how-it-works"` and no `community` footer link.
- Forgot-password route guard coverage missing: Low Priority Improvement.
- Invalid date renders `Invalid Date`: False Positive. `formatDateTime` checks `Number.isFinite(date.getTime())`.
- Local validation errors hidden behind generic fallback toasts: Low Priority Improvement. Some local validation now surfaces exact errors, but review remaining merchant/deposit paths.
- Login route auth-gating coverage missing: Low Priority Improvement.
- Merchant fallback/route guard/MFA challenge/register/complete-profile frontend coverage gaps: Low Priority Improvement.
- Merchant view abort false errors: False Positive. Current `MerchantPanel` passes the abort signal into `isAbortError`.
- Missing IDs can be rendered as victory: Low Priority Improvement. The current profile caller passes `currentUserId`, but the component's generic contract is still weak when `currentUserId` is omitted.
- Old reset preview link persists after failure: False Positive. `ForgotPasswordPage` clears `previewUrl` at submit start.
- Older active-match refresh overwrite: False Positive. `DashboardPage` uses `activeMatchesRequestRef`.
- Profile link `/profile/undefined`: Low Priority Improvement. The navbar should guard nullable users defensively even if protected layout usually supplies a user.
- Resign action after completed match: Low Priority Improvement. Backend returns completed matches safely, but the UI should hide/disable impossible actions.
- Server tests excluded from main tsconfig: False Positive. `tsconfig.tests.json` exists and `npm test` runs `typecheck:tests`.
- Component coverage gaps for SketchCard, SketchyButton, SketchyContainer, StatusBadge: Low Priority Improvement.
- Stuck transaction statuses neutral: False Positive. `statusToneFromStatus` maps `stuck` to `danger`.
- Transient consume failures shown as invalid after token scrub: Low Priority Improvement. Consider preserving retry state for temporary network failures.
- Unencoded path parameters: False Positive. Current service calls use `encodeURIComponent`.

## Recommended Fix Order

1. Fix `AuthProvider.applyAuthState` session preservation for MFA responses.
2. Guard `/auth/verified` so anonymous users cannot see success copy.
3. Add visible Turnstile error and retry UI while preserving fail-closed submission.
4. Add transaction history pagination/load-more on `/bank`.
5. Fix low-risk presentation issues: `SketchyContainer` CSS variable resolution and `MiniMatchCard` coordinate rendering.
6. Add targeted tests for the above before broad frontend test-gap work.
7. Review `scripts/start-production.mjs` against actual deployment config.

## Tests To Add Before Fixing

- AuthProvider session preservation test for omitted `session` versus explicit `session: null`.
- `/auth/verified` route guard tests for anonymous, authenticated, and profile-incomplete states.
- Turnstile script/widget failure test showing visible retry and no unchecked submission.
- Bank transaction pagination tests with page 1/page 2 and failure handling.
- MiniMatchCard coordinate-rendering test using known `moveHistory`.
- SketchyContainer draw test that verifies resolved concrete stroke color.

## Best-Practice References

- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP HTTP Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- Express production security best practices: https://expressjs.com/en/advanced/best-practice-security.html
- Vite environment variable exposure rules: https://vite.dev/guide/env-and-mode/
- Vite `envPrefix` configuration: https://vite.dev/config/shared-options.html#envprefix
- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

## Unclear Areas Needing Human Review

- Whether `scripts/start-production.mjs` is referenced by Render, a process manager, or deployment docs outside this repo.
- Whether merchant alert `targetPath` will always remain server-generated or may become configurable/data-driven.
- Whether transaction history must show all ledger entries in-product for compliance/support, or whether backend audit exports cover older history.
- Whether exact client-side fiat preview math must match server KES rounding before order submission.


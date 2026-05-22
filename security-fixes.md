# Security Fixes

## GAP-001 Fix: OAuth Account Pre-Hijacking

### Vulnerability class

OAuth account linking / account pre-hijacking.

### Best-practice references used

- OWASP Application Security Verification Standard: authentication and session management verification categories.
- OWASP Authentication Cheat Sheet: reauthentication and account recovery are high-risk authentication events.
- OWASP Session Management Cheat Sheet: session integrity controls are needed around high-risk authentication and recovery events.
- RFC 9700, OAuth 2.0 Security Best Current Practice: OAuth integrations should use defense in depth and preserve strong binding of OAuth artifacts.
- OpenID Connect Core 1.0: the stable OpenID Connect identifier is issuer plus `sub`; `email` is a claim and must not be treated as the only unique account identifier.

### Code changes

- `AuthController.handleGoogleCallback` now rejects Google OAuth fallback linking when the Google email matches an existing unverified local account.
- The rejected callback clears the OAuth state cookie, does not call `UserService.linkGoogleAccount`, does not create an auth session, and redirects to `/auth/login?error=google_account_verification_required`.
- The rejection is logged as `auth.google_callback_rejected` with bounded security context: user id, recipient domain, and whether the matched local account has a password credential. The user-facing message remains generic enough to avoid exposing unnecessary account-state detail.
- `UserService.linkGoogleAccount` now only links accounts that already have `emailVerifiedAt` set and no longer sets `emailVerifiedAt` itself.
- `LoginPage` and the safe error-message map now display the recovery/verification instruction for the new OAuth callback error.

### Why this fixes the issue

The vulnerable path used a verified Google email to select an existing local account by email, then marked that local account verified while preserving the existing password hash. An attacker-created password could therefore become usable after the victim completed Google OAuth.

The fixed path stops before linking when the matching local account is unverified. No Google subject is written, no email verification timestamp is written, no session cookies are issued, and the existing password login path still treats the local account as unverified. The service-level guard also prevents future callers from using `linkGoogleAccount` as an email-verification primitive.

### Tests added

- `server/middleware/auth-security.test.ts`
  - `linkGoogleAccount only links already verified users without marking email verified`
  - `handleGoogleCallback rejects a matching unverified password account without linking or issuing a session`
  - `handleGoogleCallback links and logs in an existing verified local account by email`
  - `handleGoogleCallback logs in an account already linked to the Google subject`
  - `handleGoogleCallback creates and logs in a new Google user when no local account exists`
- `server/services/google-oauth.service.test.ts`
  - `consumeCallback rejects a Google userinfo profile with an unverified email`

### Verification performed

- Red test before fix: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts server/services/google-oauth.service.test.ts`
  - Failed as expected because the unverified-account callback called `linkGoogleAccount`.
- Focused regression after fix: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts server/services/google-oauth.service.test.ts`
  - Passed: 36 tests, 0 failures.
- Test typecheck: `npm run typecheck:tests`
  - Passed.
- Unit suite: `npm run test:unit`
  - Passed: 61 tests, 0 failures.
- Auth/security integration subset: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts server/middleware/auth-email-flows.test.ts server/middleware/security.middleware.test.ts server/middleware/rate-limit.middleware.test.ts server/services/google-oauth.service.test.ts`
  - Passed: 51 tests, 0 failures.
- TypeScript lint/typecheck: `npm run lint`
  - Passed.
- Full integration suite: `npm run test:integration`
  - Timed out twice with no failure output, once after 4 minutes and once after 10 minutes. The auth/OAuth-relevant integration subset above completed successfully.

### Remaining risks

- Existing production data should be reviewed for accounts that were linked through the previous vulnerable behavior, especially accounts with both `googleSubject`, `emailVerifiedAt`, and a local `passwordHash`.
- This fix intentionally rejects the ambiguous OAuth linking case instead of building a full OAuth account-recovery flow. A future recovery flow should revoke local credentials and sessions before allowing OAuth to claim an existing unverified account.

## GAP-002 Fix: Registration Enumeration and Auth Email Abuse

### Vulnerability class

Account enumeration and auth email abuse through registration, verification resend, magic-link, and password-reset flows.

### Best-practice references used

- OWASP Authentication Cheat Sheet: authentication errors should avoid revealing whether an account exists, and authentication attempts should have throttling controls.
- OWASP Forgot Password Cheat Sheet: password recovery responses should be consistent for existing and non-existing accounts and should include per-account rate limiting.
- OWASP Application Security Verification Standard: authentication and recovery flows should resist automated abuse and account enumeration.

### Code changes

- `AuthController.register` now returns the same 202 response shape for:
  - new registrations,
  - existing unverified emails,
  - existing verified emails,
  - duplicate usernames.
- Existing unverified email registration still triggers a verification email, but existing verified emails and duplicate usernames do not create accounts or send verification emails.
- Added `AUTH_EMAIL_RECIPIENT_RATE_LIMIT_WINDOW_MS` and `AUTH_EMAIL_RECIPIENT_RATE_LIMIT_MAX` configuration with documented defaults in `.env.example`.
- Added `createAuthEmailRecipientRateLimiter`, keyed by a SHA-256 hash of the normalized target email address.
- Applied recipient-keyed limiting after request-body validation on:
  - `POST /api/auth/register`
  - `POST /api/auth/login/magic-link/request`
  - `POST /api/auth/email/verify/resend`
  - `POST /api/auth/password/forgot`

### Why this fixes the issue

Registration no longer gives different HTTP status codes or different outward response shapes for existing verified emails, existing unverified emails, and duplicate usernames. That removes the direct registration-side account-state oracle.

The email-triggering routes still keep their existing source/IP limiter, but now also enforce a normalized recipient-email limiter. Distributed requests from different source IPs therefore share the same recipient budget and cannot churn verification, magic-link, or password-reset emails for one mailbox as easily.

### Tests added

- `server/middleware/auth-security.test.ts`
  - `register uses the same response shape for new and existing email account states`
  - `register does not expose username collisions in the HTTP response`
- `server/middleware/rate-limit.middleware.test.ts`
  - `auth email recipient limiter blocks repeated requests for one normalized email across IPs`

### Verification performed

- Red test before fix: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts server/middleware/rate-limit.middleware.test.ts`
  - Failed as expected because existing email/username registration returned 409 and the recipient limiter export did not exist.
- Focused regression after fix: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts server/middleware/rate-limit.middleware.test.ts`
  - Passed: 39 tests, 0 failures.
- Auth/security integration subset: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts server/middleware/auth-email-flows.test.ts server/middleware/rate-limit.middleware.test.ts server/middleware/security.middleware.test.ts server/services/google-oauth.service.test.ts`
  - Passed: 54 tests, 0 failures.
- Test typecheck: `npm run typecheck:tests`
  - Passed.
- Unit suite: `npm run test:unit`
  - Passed: 61 tests, 0 failures.
- TypeScript lint/typecheck: `npm run lint`
  - Passed.

### Remaining risks

- The recipient limiter uses the configured Express rate-limit store. Production should keep Redis configured so the recipient budget is shared across instances.
- The registration UX is intentionally more generic for duplicate usernames and existing emails. Product copy may need adjustment so legitimate users understand to check email, sign in, or recover their account without reintroducing enumeration.

## GAP-003 Fix: Expensive Operation Abuse Limits

### Vulnerability class

Unrestricted resource consumption / business logic abuse on expensive authenticated state-changing APIs.

### Best-practice references used

- OWASP API Security Top 10 API4:2023 Unrestricted Resource Consumption: APIs should enforce resource and rate limits based on operation cost and business impact.
- OWASP Bot Management and Anti-Automation Cheat Sheet: abuse controls should use rate limits and quotas tied to the actor and operation.
- OWASP ASVS: sensitive and high-cost authenticated workflows should include abuse resistance and server-side enforcement.

### Code changes

- Added route-specific authenticated actor limiters keyed by the authenticated user id:
  - `createDepositOperationRateLimiter`
  - `createOrderCreateRateLimiter`
  - `createMatchMutationRateLimiter`
  - `createAdminMutationRateLimiter`
- Added environment configuration and `.env.example` defaults for each limiter:
  - `DEPOSIT_OPERATION_RATE_LIMIT_WINDOW_MS` / `DEPOSIT_OPERATION_RATE_LIMIT_MAX`
  - `ORDER_CREATE_RATE_LIMIT_WINDOW_MS` / `ORDER_CREATE_RATE_LIMIT_MAX`
  - `MATCH_MUTATION_RATE_LIMIT_WINDOW_MS` / `MATCH_MUTATION_RATE_LIMIT_MAX`
  - `ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS` / `ADMIN_MUTATION_RATE_LIMIT_MAX`
- Applied deposit operation limiting to:
  - `POST /api/transactions/deposit/memo`
  - `POST /api/transactions/deposit/prepare`
- Applied order creation limiting to:
  - `POST /api/orders`
- Applied match mutation limiting to:
  - `POST /api/matches`
  - `POST /api/matches/:roomId/join`
  - `POST /api/matches/:roomId/resign`
- Applied admin mutation limiting to:
  - `POST /api/admin/merchant/deposits/replay-window`
  - `POST /api/admin/merchant/deposits/:txHash/reconcile`
  - `POST /api/admin/withdrawals/:withdrawalId/recover`

### Why this fixes the issue

The affected endpoints already required authentication, verification, admin, or MFA where appropriate, but they shared mostly broad request budgets. The fix adds operation-specific budgets at the route layer, after authentication has established the actor and before expensive handlers can create database rows, parse or enqueue order work, call provider replay flows, mutate match state, or initiate payment-related side effects.

The limiter key is based on the authenticated user id, so requests from multiple IPs still count against the same actor budget. The existing Redis-backed rate-limit store support is reused, so production deployments with Redis share these budgets across app instances.

### Tests added

- `server/middleware/rate-limit.middleware.test.ts`
  - `expensive operation limiters are keyed by authenticated user instead of IP`
  - `expensive authenticated mutation routes apply route-specific limiters before handlers`

### Verification performed

- Red test before fix: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/rate-limit.middleware.test.ts`
  - Failed as expected because the GAP-003 limiter exports and route wiring did not exist.
- Focused GAP-003 regression: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/rate-limit.middleware.test.ts`
  - Passed: 14 tests, 0 failures.
- Affected route/service subset: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/rate-limit.middleware.test.ts server/middleware/ton-payments.test.ts server/middleware/order-service.test.ts server/middleware/match-service.test.ts server/middleware/match-controller-context.test.ts server/middleware/match-access.test.ts server/middleware/merchant-dashboard.test.ts server/middleware/withdrawal-recovery.test.ts server/middleware/transaction-controller.test.ts`
  - Passed: 87 tests, 0 failures.
- Test typecheck: `npm run typecheck:tests`
  - Passed.
- Unit suite: `npm run test:unit`
  - Passed: 61 tests, 0 failures.
- TypeScript lint/typecheck: `npm run lint`
  - Passed.

### Remaining risks

- These are request-rate controls, not full business quotas. Follow-up work should still add durable caps such as active deposit memo count per user, pending order count per user, and bounded admin replay windows/frequency in persistent storage.
- Production should keep Redis configured for rate limiting so actor budgets are shared across instances.
- The default limits are conservative starting points and should be tuned against real traffic and provider quota data.

## GAP-004 Fix: Withdrawal Status Error Disclosure

### Vulnerability class

Sensitive data exposure / improper error handling.

### Best-practice references used

- OWASP Error Handling Cheat Sheet: user-facing errors should be generic and should not expose stack traces, system messages, dependency details, or exception text.
- OWASP Logging Cheat Sheet: detailed operational error data belongs in protected logs/state and should not be exposed through public web-accessible responses.
- OWASP ASVS error handling and logging guidance: applications should avoid information leakage through error messages while preserving operational diagnostics.

### Code changes

- `serializeWithdrawalStatus` no longer copies `WithdrawalDocument.lastError` directly into the user-facing API DTO.
- Stuck withdrawals now return the stable public message `Withdrawal confirmation is taking longer than expected and is under review.`
- Failed withdrawals now return the stable public message `Withdrawal processing failed after retries. Your held balance was refunded.`
- Retry-state errors on queued, processing, or sent withdrawals are omitted from the user status response.
- Internal worker/repository behavior still preserves `lastError` for operational workflows and merchant/admin diagnostics that already require privileged routes.

### Why this fixes the issue

Before the fix, raw worker/provider exception strings flowed from `WithdrawalRepository.lastError` into `GET /api/transactions/withdrawals/:withdrawalId`. A user could see dependency URLs, provider behavior, internal timeout text, or other diagnostic details.

The fixed serializer treats `lastError` as internal state and derives only a small set of public status messages based on the withdrawal state. The raw value is not included in the serialized JSON, so provider URLs and exception text cannot leak through the user withdrawal status endpoint.

### Tests added

- `server/middleware/transaction-controller.test.ts`
  - `getWithdrawalStatusHandler returns a generic public error for stuck withdrawals`
  - `getWithdrawalStatusHandler returns a generic public error for failed withdrawals`
  - `getWithdrawalStatusHandler omits raw retry errors for queued withdrawals`

### Verification performed

- Red test before fix: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/transaction-controller.test.ts`
  - Failed as expected because the API response included raw `lastError` strings.
- Focused GAP-004 regression: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/transaction-controller.test.ts`
  - Passed: 6 tests, 0 failures.
- Withdrawal/payment subset: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/transaction-controller.test.ts server/middleware/ton-payments.test.ts server/middleware/withdrawal-recovery.test.ts server/middleware/authz-guard-parity.test.ts`
  - Passed: 50 tests, 0 failures.
- Test typecheck: `npm run typecheck:tests`
  - Passed.
- Unit suite: `npm run test:unit`
  - Passed: 61 tests, 0 failures.
- TypeScript lint/typecheck: `npm run lint`
  - Passed.

### Remaining risks

- Merchant/admin diagnostic surfaces still intentionally show more operational context. Those routes are admin/MFA protected, but their content should continue to be reviewed for provider tokens, URLs, and stack fragments.
- Existing `lastError` values remain in the database for operations. If those values may contain secrets, a separate data cleanup/redaction migration should be considered.

## GAP-005 Fix: Production Content Security Policy

### Vulnerability class

Missing browser security headers / missing Content Security Policy defense in depth.

### Best-practice references used

- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html): deliver CSP through the `Content-Security-Policy` response header and use it as defense in depth against XSS, malicious remote scripts, unsafe form targets, object injection, and framing attacks.
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/): recommends baseline CSP directives such as `default-src 'self'`, `form-action 'self'`, `base-uri 'self'`, `object-src 'none'`, and `frame-ancestors 'none'`.
- [Helmet documentation](https://helmetjs.github.io/): documents Express `contentSecurityPolicy` configuration through directive maps and Helmet defaults.

### Code changes

- Added `server/http/security-headers.ts` with shared Helmet options for the application.
- Enabled an enforced production CSP for Express responses through `app.use(helmet(getSecurityHelmetOptions(env)))`.
- Applied the same Helmet options to the Socket.IO engine middleware so websocket polling/upgrade responses no longer use a separate CSP-disabled configuration.
- Kept CSP disabled outside production to preserve local Vite/HMR development behavior.
- The production policy:
  - restricts default resources to `self`,
  - blocks plugins with `object-src 'none'`,
  - blocks framing with `frame-ancestors 'none'`,
  - restricts form submissions with `form-action 'self'`,
  - allows scripts only from `self` and Cloudflare Turnstile,
  - allows Cloudflare Turnstile frames,
  - allows same-origin API/socket traffic plus HTTPS/WSS connections needed by TonConnect dynamic wallet bridges,
  - allows same-origin fonts/assets plus data/blob/HTTPS images needed by app and wallet UI assets.

### Why this fixes the issue

Before the fix, Helmet was explicitly configured with `contentSecurityPolicy: false` in both `server/app.ts` and `server/runtime.ts`, so production responses lacked the primary browser-side policy that limits injected scripts, malicious remote resources, plugin execution, form exfiltration, and framing.

The fix replaces the disabled setting with a production-only enforced CSP. A successful XSS or markup injection bug now has a narrower execution surface: inline scripts remain blocked, arbitrary remote scripts are blocked, object/embed payloads are blocked, injected forms cannot post off-site, and the app cannot be framed by another site.

### Tests added

- `server/middleware/app-health.test.ts`
  - `production responses include an enforced content security policy`

### Verification performed

- Red test before fix: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/app-health.test.ts`
  - Failed as expected because `content-security-policy` was absent.
- Focused GAP-005 regression: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/app-health.test.ts`
  - Passed: 20 tests, 0 failures.
- Related security middleware subset: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/security.middleware.test.ts`
  - Passed: 6 tests, 0 failures.
- Test typecheck: `npm run typecheck:tests`
  - Passed.

### Remaining risks

- `connect-src` intentionally allows `https:` and `wss:` because TonConnect uses a dynamic wallet list and wallet-specific bridge endpoints. This is materially better than no CSP, but it is broader than a fully enumerated allowlist. Production telemetry should be used to narrow this once supported wallet bridges are confirmed.
- The policy allows inline styles because the React UI currently uses inline style attributes and dynamic style props. Future hardening can remove inline style usage and drop `'unsafe-inline'` from `style-src`.

# Security Protection Gap Report

## 1. Scope Reviewed

Reviewed the local React/Vite frontend, Express/TypeScript backend, Socket.IO handlers, Mongo/Mongoose models and custom repositories, authentication/session flows, Google OAuth, email verification, password reset, MFA, merchant/admin routes, TON/Jetton deposit and withdrawal flows, upload handling for order proofs, background workers, middleware, environment configuration, logging, and tests.

The Galaxy Bug Bounty Checklist was used as the coverage framework. The review was code-only against the local workspace; no production target was tested and no destructive commands were run.

## 2. Endpoint and Feature Inventory

Frontend routes:

| Route | Component / protection |
|---|---|
| `/` | `LandingPage`, public |
| `/privacy` | `PrivacyPolicyPage`, public |
| `/terms` | `TermsOfUsePage`, public |
| `/auth` | Auth index redirect |
| `/auth/login` | `LoginPage`, public-only |
| `/auth/register` | `RegisterPage`, public-only |
| `/auth/forgot-password` | `ForgotPasswordPage`, public-only |
| `/auth/reset-password` | `ResetPasswordPage`, token flow |
| `/auth/verify-email` | `VerifyEmailPage`, token/resend flow |
| `/auth/magic-link` | `MagicLinkPage`, token flow |
| `/auth/approve-login` | `ApproveLoginPage`, token flow |
| `/auth/verified` | `VerifiedPage`, post-verification |
| `/auth/mfa` | `MfaChallengePage`, challenge flow |
| `/auth/complete-profile` | `CompleteProfilePage`, protected |
| `/auth/security` | `SecuritySettingsPage`, protected |
| `/play` | `DashboardPage`, protected |
| `/leaderboard` | `DashboardPage` leaderboard tab, protected UI, public API exists |
| `/bank` | `BankPage`, protected |
| `/game/:roomId` | `GamePage`, protected |
| `/profile/:userId` | `ProfilePage`, protected UI, profile API is public |
| `/merchant` | `MerchantDashboardPage`, frontend `requireAdmin` |
| `/merchant/orders` | `OrderDeskPage`, frontend `requireAdmin` |
| `/merchant/deposits` | `DepositsPage`, frontend `requireAdmin` |
| `/merchant/liquidity` | `LiquidityPage`, frontend `requireAdmin` |
| `/merchant/alerts` | `AlertsPage`, frontend `requireAdmin` |

Backend API endpoints:

| Endpoint | Public/auth/admin/payment/upload/webhook classification |
|---|---|
| `GET /api/health` | Public health, production redacted |
| `GET /api/health/live` | Public liveness, production redacted |
| `GET /api/health/ready` | Public readiness, production redacted |
| `GET /api/metrics` | Public in non-production; bearer token protected/404-disabled in production |
| `GET /tonconnect-manifest.json` | Public TON Connect manifest |
| `GET /api/users/leaderboard` | Public cacheable API |
| `GET /api/users/:userId` | Public user profile |
| `POST /api/auth/register` | Public auth, rate limited, Turnstile in production when configured |
| `POST /api/auth/login/password` | Public auth, IP and identifier rate limited, Turnstile in production when configured |
| `POST /api/auth/login/magic-link/request` | Public auth email flow, IP rate limited |
| `POST /api/auth/login/magic-link/consume` | Public token consume, rate limited |
| `POST /api/auth/login/suspicious/consume` | Public token consume, rate limited |
| `GET /api/auth/oauth/google/start` | Public OAuth start |
| `GET /api/auth/oauth/google/callback` | Public OAuth callback |
| `POST /api/auth/email/verify/resend` | Public auth email flow, IP rate limited |
| `POST /api/auth/email/verify/consume` | Public token consume, rate limited |
| `POST /api/auth/password/forgot` | Public auth email flow, IP rate limited |
| `POST /api/auth/password/reset` | Public token consume, rate limited |
| `POST /api/auth/mfa/challenge` | Public challenge consume, rate limited |
| `POST /api/auth/refresh` | Cookie refresh, rate limited |
| `GET /api/auth/me` | Authenticated |
| `POST /api/auth/logout` | Cookie logout, CSRF origin checked |
| `GET /api/auth/sessions` | Authenticated |
| `DELETE /api/auth/sessions/:sessionId` | Authenticated + MFA step-up |
| `POST /api/auth/sessions/revoke-others` | Authenticated + MFA step-up |
| `POST /api/auth/mfa/totp/setup` | Authenticated; MFA step-up if already enabled |
| `POST /api/auth/mfa/totp/verify` | Authenticated |
| `POST /api/auth/mfa/disable` | Authenticated + MFA step-up |
| `POST /api/auth/mfa/recovery-codes/regenerate` | Authenticated + MFA step-up |
| `POST /api/auth/profile/complete` | Authenticated |
| `GET /api/matches/active` | Public cache/read |
| `POST /api/matches` | Authenticated + verified; idempotent match creation |
| `POST /api/matches/:roomId/join` | Authenticated + verified; idempotent match join |
| `POST /api/matches/:roomId/resign` | Authenticated + verified; idempotent resignation |
| `GET /api/matches/user/:userId` | Authenticated + verified; user match history |
| `GET /api/matches/:roomId` | Authenticated + verified; private match invite token support |
| `GET /api/orders/config` | Authenticated + verified; merchant config |
| `GET /api/orders` | Authenticated + verified; own orders |
| `POST /api/orders` | Authenticated + verified; multipart proof upload and P2P order creation |
| `PATCH /api/orders/:id` | Authenticated + verified + admin + MFA step-up |
| `GET /api/transactions` | Authenticated + verified; own ledger/deposits/withdrawals |
| `GET /api/transactions/all` | Authenticated + verified + admin + MFA step-up |
| `GET /api/transactions/withdrawals/:withdrawalId` | Authenticated + verified; own withdrawal status |
| `POST /api/transactions/deposit/memo` | Authenticated + verified; payment memo creation |
| `POST /api/transactions/deposit/prepare` | Authenticated + verified; TON Connect transaction preparation |
| `POST /api/transactions/withdraw` | Authenticated + verified + MFA step-up; withdrawal limiter + idempotency |
| `GET /api/admin/merchant/config` | Authenticated + verified + admin + MFA step-up |
| `PATCH /api/admin/merchant/config` | Authenticated + verified + admin + MFA step-up |
| `GET /api/admin/merchant/dashboard` | Authenticated + verified + admin + MFA step-up |
| `GET /api/admin/merchant/orders` | Authenticated + verified + admin + MFA step-up |
| `GET /api/admin/merchant/deposits` | Authenticated + verified + admin + MFA step-up |
| `POST /api/admin/merchant/deposits/replay-window` | Authenticated + verified + admin + MFA step-up; Toncenter replay |
| `POST /api/admin/merchant/deposits/:txHash/reconcile` | Authenticated + verified + admin + MFA step-up |
| `POST /api/admin/withdrawals/:withdrawalId/recover` | Authenticated + verified + admin + MFA step-up |

Socket endpoints:

| Event | Protection |
|---|---|
| Socket.IO connection | Access token from cookie or `handshake.auth.token`; verifies session, email, and profile completion |
| `join-room` | Per-user socket rate limit; verifies participant via `RealtimeMatchService.joinRoom` |
| `make-move` | Per-user/room socket rate limit; verifies participant and current turn |

Auth/session/token handlers:

- Opaque access and refresh tokens are stored in `HttpOnly`, `Secure` in production, `SameSite=Strict` cookies.
- Access token hashes are Redis-backed; refresh tokens are rotated and reuse detection revokes all sessions.
- One-time tokens cover email verification, password reset, magic link, and suspicious login.
- MFA supports TOTP setup, challenge consume, disable, recovery code regeneration, and step-up cache.
- Google OAuth uses server-side state, PKCE, nonce, and browser-state cookie binding.

Middleware:

- `requestContextMiddleware`
- `helmet` with CSP disabled
- `cors(getCorsOptions())`
- `compression`
- `express.json({ limit })`
- `cookieParser`
- global `/api` general rate limiter
- `/api` no-store cache middleware
- `/api` origin/referer CSRF middleware
- `authenticateToken`
- `requireVerifiedAccount`
- `requireAdmin`
- `requireMfaStepUp`
- `requireMfaStepUpIfEnabled`
- `validateBody`
- `errorHandler`
- static/dotfile/probe path blocking middleware

Database models and repositories:

- Mongoose models: `User`, `AuthSession`, `OneTimeToken`, `Transaction`, `Order`, `Match`, `MerchantConfig`
- Mongo collection repositories: `deposits`, `withdrawals`, `deposit_memos`, `user_balances`, `processed_txs`, `unmatched_deposits`, `idempotency_keys`, `order_proof_relays`, `failed_deposit_ingestions`, `audit_events`, `distributed_locks`, `poller_state`, `jetton_wallet_cache`

Payment, wallet, and background jobs:

- Deposit memo generation and TON Connect transaction preparation
- Deposit poller for incoming USDT Jetton transfers
- Failed deposit replay worker
- Merchant deposit replay/reconcile admin flow
- Withdrawal request, hot-wallet send worker, confirmation worker, stuck withdrawal recovery
- Order proof relay worker to Telegram
- Hot wallet monitor
- Stale match expiry
- BullMQ or local interval scheduling depending on feature flags

Webhook endpoints:

- No inbound webhook endpoint was found. Payment confirmation is poller/replay based.

File upload endpoints:

- `POST /api/orders` accepts multipart `proofImage` for BUY orders. It enforces max size, allowed MIME types, and image magic-byte checks; files are relayed to Telegram and temporarily stored as base64 in `order_proof_relays`.

## 3. Executive Summary

Critical gaps:

- None classified as critical from local code evidence.

High-risk gaps:

- `GAP-001`: OAuth can activate and link an attacker-precreated, unverified local account for a victim email while preserving the attacker-set password.

Medium-risk gaps:

- `GAP-002`: Registration/email flows expose account state and lack recipient/account-scoped throttles.
- `GAP-003`: Expensive payment, order, match, and admin replay flows rely mostly on a broad global API limiter.
- `GAP-004`: Withdrawal status can expose raw internal/provider error text to the user.
- `GAP-005`: CSP is explicitly disabled, leaving weak browser-side containment if an XSS sink is introduced.

Low-risk gaps:

- No separate low-only findings were promoted; low-risk observations are included in the role and missing-test sections.

Areas that appear protected:

- Server-side admin authorization is applied to `/api/admin/*`, admin order updates, and admin transaction listing.
- Session cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` in production.
- CSRF origin/referer checks are applied globally to unsafe `/api` methods.
- Password reset and magic/verification links use hashed one-time tokens with expiry and consume-once semantics.
- Refresh tokens rotate and reuse detection revokes sessions.
- Withdrawal status and user transaction queries are scoped to the authenticated user.
- Order listing is scoped to the authenticated user.
- Private match access checks use participant status or an invite token hash.
- File upload proof validation includes body size, MIME allowlist, and magic-byte checks.
- Deposit and withdrawal processing has idempotency, unique tx hash handling, state-machine checks, and transaction-backed balance mutations.

Areas needing manual confirmation:

- Whether public profile and match-history visibility is intentional product behavior.
- Whether Telegram proof channel access is restricted to trusted merchant operators.
- Whether production deployment always configures Redis, Turnstile, edge protection, and distributed job flags as expected.
- Whether source maps are emitted or served in production by the deployment pipeline.

## 4. Checklist Coverage Matrix

| Checklist Area | Relevant? | Reviewed? | Protection Exists? | Gap Count | Notes |
|---|---:|---:|---:|---:|---|
| Broken Access Control / IDOR | Yes | Yes | Partial | 0 | Main user/admin object access is scoped; public profile/history visibility needs product confirmation. |
| Authentication / Sessions | Yes | Yes | Partial | 1 | Strong cookie/session design; OAuth pre-hijack path survives. |
| Account Takeover | Yes | Yes | Partial | 2 | OAuth linking and registration/email state leakage are the main gaps. |
| OAuth | Yes | Yes | Partial | 1 | State, PKCE, nonce, browser binding exist; existing unverified account linking is unsafe. |
| CSRF | Yes | Yes | Yes | 0 | Cookie auth is protected by `SameSite=Strict` plus origin/referer checks for unsafe `/api` methods. |
| XSS | Yes | Yes | Partial | 1 | React encoding is used and no dangerous HTML sinks found, but CSP is disabled. |
| Injection | Yes | Yes | Yes | 0 | Zod validation and Mongoose sanitize/trusted filters are used; no raw SQL or shell sink found. |
| Rate Limit / Abuse | Yes | Yes | Partial | 2 | Auth and withdrawal have specific limiters; expensive state/payment paths need route/user quotas. |
| Sensitive Data Exposure | Yes | Yes | Partial | 1 | Public errors are generally sanitized; withdrawal status exposes raw `lastError`. |
| CORS / Headers | Yes | Yes | Partial | 1 | CORS allowlist and many Helmet headers exist; CSP disabled and no explicit Permissions-Policy. |
| File Upload | Yes | Yes | Partial | 0 | Size/MIME/signature checks exist; no web-executable upload path found. |
| SSRF / Open Redirect | Yes | Yes | Yes | 0 | Redirects are internal-path sanitized; server fetches use fixed provider URLs. |
| Webhooks | No | Yes | N/A | 0 | No inbound webhook endpoint found. |
| Payment / Wallet Security | Yes | Yes | Partial | 1 | State/idempotency mostly strong; abuse throttling and error exposure gaps remain. |
| Business Logic Abuse | Yes | Yes | Partial | 2 | OAuth pre-hijack and expensive workflow abuse are business-logic gaps. |
| Error Handling / Info Leaks | Yes | Yes | Partial | 1 | Error middleware sanitizes 500s; withdrawal status leaks raw worker errors. |

## 5. Findings

### GAP-001: Google OAuth can activate an attacker-precreated unverified local account

- Severity: High
- Checklist area: Account Takeover, OAuth, Authentication / Sessions, Business Logic Abuse
- Affected feature: Registration plus Google OAuth login/linking
- Affected route/API: `POST /api/auth/register`, `GET /api/auth/oauth/google/callback`, `POST /api/auth/login/password`
- Affected files:
  - `server/controllers/auth.controller.ts`
  - `server/services/user.service.ts`
- Affected function/component:
  - `AuthController.register`
  - `AuthController.handleGoogleCallback`
  - `UserService.linkGoogleAccount`
- Current protection:
  - Google OAuth validates state, browser binding, PKCE, nonce, audience, subject, and `email_verified`.
  - New local registrations require email verification before password login completes.
- Missing or weak protection:
  - Google OAuth links any existing account by email without checking whether that local account was previously verified.
  - Linking sets `emailVerifiedAt` but preserves any existing `passwordHash`.
  - This enables classic account pre-hijacking: an attacker can register a victim email with an attacker password, leave it unverified, wait for the victim to sign in with Google, then use the preserved password after OAuth marks the account verified.
- Evidence from code:
  - `server/controllers/auth.controller.ts:202-240` checks for an existing user during registration and allows an unverified account to remain, while returning `pending_email_verification`.
  - `server/controllers/auth.controller.ts:481-486` finds a user by Google subject, then falls back to `UserService.findByEmail(googleProfile.email)` and links that existing user.
  - `server/services/user.service.ts:189-197` sets `googleSubject` and `emailVerifiedAt` but does not clear `passwordHash`, revoke credentials, or require local-account proof.
- Attack or abuse scenario:
  - Attacker registers `victim@example.com` with a password they control.
  - Victim later uses Google OAuth for `victim@example.com`.
  - The callback links the Google identity to the attacker-created local account and marks it verified.
  - Attacker logs in with the original password because the account is now verified.
- Impact:
  - Full account takeover for users who first access the product through Google after an attacker has preclaimed their email locally.
  - Any wallet balance, orders, game history, and merchant/admin privileges on that identity become exposed if the affected account gains those capabilities.
- Recommended fix:
  - Do not link OAuth to an existing unverified local account while preserving local credentials.
  - For an existing unverified password account, either block OAuth linking and require verification of the existing local account, or treat OAuth as account recovery that clears the existing password, revokes sessions/tokens, and requires the Google-authenticated user to set fresh credentials.
  - Audit and handle preexisting unverified accounts before enabling OAuth broadly.
- Best-practice reference:
  - OAuth account linking should require proof of ownership of the existing account, not only proof of the external identity, when local credentials already exist.
- Tests to add:
  - Unit/integration test: create an unverified password user for `victim@example.com`, complete Google OAuth for the same email, then assert the original password no longer authenticates or the link is rejected.
  - Unit test: `UserService.linkGoogleAccount` does not mark an unverified password account verified while preserving `passwordHash`.
  - Regression test: verified existing local account linking continues to require verified Google email and preserves intended behavior.
  - Negative test: OAuth callback for an existing unverified account returns a safe error or recovery state and does not issue a session.
- Confidence: High

### GAP-002: Registration and email flows expose account state and lack recipient-scoped abuse throttles

- Severity: Medium
- Checklist area: Account Takeover, Rate Limit / Abuse, Error Handling / Info Leaks
- Affected feature: Register, verification resend, forgot password, magic link
- Affected route/API:
  - `POST /api/auth/register`
  - `POST /api/auth/email/verify/resend`
  - `POST /api/auth/password/forgot`
  - `POST /api/auth/login/magic-link/request`
- Affected files:
  - `server/controllers/auth.controller.ts`
  - `server/middleware/rate-limit.middleware.ts`
  - `server/routes/auth.routes.ts`
- Affected function/component:
  - `AuthController.register`
  - `AuthController.resendVerificationEmail`
  - `AuthController.requestPasswordReset`
  - `AuthController.requestMagicLink`
  - `createAuthEmailRateLimiter`
- Current protection:
  - Auth and auth-email endpoints use `express-rate-limit`.
  - Forgot password and magic-link request responses are mostly generic.
  - Turnstile is required in production when `TURNSTILE_SECRET_KEY` is configured for register, password login, magic-link request, and password reset request.
- Missing or weak protection:
  - Registration reveals account state: existing verified email returns `EMAIL_ALREADY_EXISTS`, existing username returns `USERNAME_ALREADY_EXISTS`, and existing unverified email returns a `pending_email_verification` response containing the email.
  - Email-triggering endpoints are throttled by the default request key, not by normalized recipient email or user id.
  - Successful email requests are not skipped but are still per source rather than per recipient, which leaves mailbox flooding and token churn possible through distributed sources.
- Evidence from code:
  - `server/controllers/auth.controller.ts:207-236` returns different behavior for existing unverified vs verified emails.
  - `server/controllers/auth.controller.ts:239-240` separately reveals username existence.
  - `server/controllers/auth.controller.ts:544-569` and `server/controllers/auth.controller.ts:600-624` use generic user-facing responses but still send recipient-specific email when a user exists.
  - `server/middleware/rate-limit.middleware.ts:108-124` defines `createAuthEmailRateLimiter` without a recipient-specific `keyGenerator`.
  - `server/routes/auth.routes.ts:45`, `server/routes/auth.routes.ts:50`, and `server/routes/auth.routes.ts:52` use the email limiter on email-sending routes.
- Attack or abuse scenario:
  - An attacker enumerates whether an email is registered/verified via registration response differences.
  - The attacker repeatedly triggers verification, magic-link, or password reset emails against a target mailbox from multiple IPs or through normal traffic volume.
  - The enumeration result can also be combined with `GAP-001` to identify accounts likely to be vulnerable to OAuth pre-hijacking.
- Impact:
  - Account discovery, targeted phishing signal, victim mailbox flooding, email provider quota pressure, and operational alert noise.
- Recommended fix:
  - Make registration responses generic for existing emails, especially unverified accounts.
  - Add recipient/user-scoped cooldowns for verification resend, magic link, password reset, and registration-existing-unverified resend paths.
  - Keep IP/global throttles, but add normalized email or user-id keyed limits and audit events.
- Best-practice reference:
  - Auth recovery flows should avoid account enumeration and should throttle both by requester and target account.
- Tests to add:
  - Registering an existing verified or unverified email returns the same outward status/message shape.
  - Repeated verification resend for one email is blocked by a recipient-scoped limiter even when request IP differs.
  - Repeated password reset and magic-link requests for the same email are blocked by recipient-scoped limits.
  - Username uniqueness errors do not expose more information than the product intentionally allows.
- Confidence: High

### GAP-003: Expensive state-changing payment, order, match, and admin flows lack route-specific abuse limits

- Severity: Medium
- Checklist area: Rate Limit / Abuse, Payment / Wallet Security, Business Logic Abuse, File Upload
- Affected feature: Deposit memo/prepare, order creation, match lifecycle, merchant replay/reconcile
- Affected route/API:
  - `POST /api/transactions/deposit/memo`
  - `POST /api/transactions/deposit/prepare`
  - `POST /api/orders`
  - `POST /api/matches`
  - `POST /api/matches/:roomId/join`
  - `POST /api/matches/:roomId/resign`
  - `POST /api/admin/merchant/deposits/replay-window`
  - `POST /api/admin/merchant/deposits/:txHash/reconcile`
- Affected files:
  - `server/app.ts`
  - `server/routes/transactions.routes.ts`
  - `server/routes/orders.routes.ts`
  - `server/routes/matches.routes.ts`
  - `server/routes/admin.routes.ts`
  - `server/middleware/rate-limit.middleware.ts`
- Affected function/component:
  - `generateDepositMemoHandler`
  - `prepareTonConnectDepositHandler`
  - `OrderController.createOrder`
  - `MatchController.createMatch`
  - `MatchController.joinMatch`
  - `MatchController.resignMatch`
  - `MerchantAdminController.replayDepositWindow`
  - `MerchantAdminController.reconcileDeposit`
- Current protection:
  - A broad general limiter is applied to `/api`.
  - Auth flows and withdrawals have dedicated limiters.
  - Order, match, and withdrawal mutations use idempotency keys where appropriate.
  - Socket events have separate socket rate limits.
- Missing or weak protection:
  - No per-user/route limiter or quota exists for several expensive state-changing routes.
  - `POST /api/orders` parses multipart input, stores proof payloads, may relay to Telegram, sends emails, invalidates caches, and creates audit/transaction records, but only has the general limiter.
  - Deposit prepare derives or fetches Jetton wallet information and deposit memo creates DB rows; neither has a dedicated per-user quota.
  - Admin replay can call Toncenter over a caller-selected time window; it is admin/MFA protected but not separately limited or bounded beyond numeric validation.
  - In non-Redis deployments the general limiter is in-process, so multiple instances weaken protection unless production topology enforcement is correctly configured.
- Evidence from code:
  - `server/app.ts:389-392` applies the broad `/api` limiter, no-store, CSRF, then route registration.
  - `server/routes/transactions.routes.ts:26-27` exposes deposit memo/prepare without dedicated limiters.
  - `server/routes/transactions.routes.ts:28` shows withdrawal does have `createWithdrawalRateLimiter`, illustrating the missing parity.
  - `server/routes/orders.routes.ts:15` exposes order creation without a dedicated limiter.
  - `server/routes/matches.routes.ts:13-15` exposes match create/join/resign without dedicated HTTP limiters.
  - `server/routes/admin.routes.ts:24-34` exposes replay/reconcile/recover admin actions without route-specific limiters.
  - `server/middleware/rate-limit.middleware.ts:57-135` defines auth, auth-email, password-login-identifier, and withdrawal limiters only.
- Attack or abuse scenario:
  - A verified user repeatedly creates deposit memos, prepares TonConnect transactions, creates multipart orders, or creates/join/resigns matches within the broad global budget.
  - A compromised admin session with MFA step-up can repeatedly replay large deposit windows and consume Toncenter/provider quota.
  - Attackers can drive email, Telegram, database, cache invalidation, and external API work at rates that are too high for these specific operations.
- Impact:
  - Provider quota exhaustion, DB growth, worker backlog, mailbox/Telegram noise, degraded availability, and unnecessary wallet/payment operational load.
- Recommended fix:
  - Add per-user and per-route limiters for deposit memo, deposit prepare, order creation, match lifecycle, and admin replay/reconcile.
  - Add business quotas, such as active memo count per user, pending order count per user, match creation/join cadence, and admin replay window size/frequency.
  - Use Redis-backed limiters in production and fail closed for high-cost routes when Redis is required but unavailable.
- Best-practice reference:
  - High-cost authenticated operations need abuse limits tied to the actor and target resource, not only a shared IP/global request bucket.
- Tests to add:
  - Deposit memo creation is blocked after N active memos per user or N requests per window.
  - Deposit prepare is limited per user/wallet and does not repeatedly call Jetton derivation beyond the budget.
  - Order creation limiter rejects repeated multipart submissions and does not enqueue Telegram relay/email after rejection.
  - Match create/join/resign HTTP endpoints enforce per-user route limits.
  - Admin deposit replay enforces a maximum window and per-admin replay frequency.
- Confidence: High

### GAP-004: Withdrawal status returns raw internal/provider error text

- Severity: Medium
- Checklist area: Sensitive Data Exposure, Error Handling / Info Leaks, Payment / Wallet Security
- Affected feature: Withdrawal processing and status polling
- Affected route/API: `GET /api/transactions/withdrawals/:withdrawalId`
- Affected files:
  - `server/workers/withdrawal-worker.ts`
  - `server/repositories/withdrawal.repository.ts`
  - `server/serializers/api.ts`
  - `server/controllers/transaction.controller.ts`
- Affected function/component:
  - `runWithdrawalWorker`
  - `WithdrawalRepository.markStuck`
  - `WithdrawalRepository.markRetryState`
  - `serializeWithdrawalStatus`
  - `getWithdrawalStatusHandler`
- Current protection:
  - Withdrawal status lookup is scoped to the authenticated user with `findByWithdrawalIdForUser`.
  - User-facing withdrawal notification emails often use generic messages for stuck/failed states.
- Missing or weak protection:
  - Worker code stores raw exception messages in `lastError`.
  - The API serializer returns `lastError` directly to the user for their withdrawal.
  - This creates a path from provider/backend exception strings to a user-facing API response.
- Evidence from code:
  - `server/workers/withdrawal-worker.ts:162-204` derives `errorMessage` directly from caught errors and logs/stores it.
  - `server/workers/withdrawal-worker.ts:207-236` marks withdrawals stuck or retry/failed with raw `errorMessage`.
  - `server/repositories/withdrawal.repository.ts:86-111` persists `lastError`.
  - `server/controllers/transaction.controller.ts:134-144` returns the authenticated user's withdrawal status.
  - `server/serializers/api.ts:245-254` includes `lastError` in the `WithdrawalStatusDTO`.
- Attack or abuse scenario:
  - A user triggers a withdrawal failure or polls an already failed/stuck withdrawal.
  - The API response reveals raw provider error text, internal state names, timeout details, or dependency messages that were intended for logs/ops.
- Impact:
  - Information leakage about wallet/provider behavior, infrastructure failures, and internal processing state.
  - The same raw message may be reused in merchant alerts and logs; if a dependency includes sensitive URLs or details in an error message, exposure can grow.
- Recommended fix:
  - Split internal and public withdrawal error fields.
  - Persist raw errors only in internal logs/audit or an `internalLastError` field not returned by user APIs.
  - Return a fixed public status message such as `Withdrawal confirmation is delayed and under review`.
  - Redact dependency URLs, provider tokens, and stack details before any persistence or notification.
- Best-practice reference:
  - User-facing error payloads should use stable, non-sensitive problem codes/messages while operational detail stays in protected logs.
- Tests to add:
  - A stuck withdrawal with raw `lastError` serializes to a generic public message.
  - Failed withdrawal status does not include provider exception text.
  - Merchant/admin views, if they need diagnostics, require admin authorization and still redact tokens/URLs.
  - Worker tests assert `lastErrorPublic` or equivalent never contains raw thrown messages.
- Confidence: High

### GAP-005: Content Security Policy is disabled

- Severity: Medium
- Checklist area: XSS, CORS / Headers
- Affected feature: Browser security headers for frontend and Socket.IO engine responses
- Affected route/API: All frontend routes and HTTP responses passing through Helmet
- Affected files:
  - `server/app.ts`
  - `server/runtime.ts`
- Affected function/component:
  - `createApp`
  - `startServer`
- Current protection:
  - React escapes normal text rendering.
  - No `dangerouslySetInnerHTML` sink was found in the reviewed frontend.
  - Helmet is enabled for other headers and `x-powered-by` is disabled.
  - CORS uses an origin allowlist with credentials.
- Missing or weak protection:
  - CSP is explicitly disabled in both main app Helmet and Socket.IO engine Helmet usage.
  - There is no documented replacement CSP at CDN/proxy level in the repo.
  - No explicit Permissions-Policy was found.
- Evidence from code:
  - `server/app.ts:268-270` calls `helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })`.
  - `server/runtime.ts:69-71` applies Helmet to `io.engine` with `contentSecurityPolicy: false`.
  - `server/app.ts:255` disables `x-powered-by`, showing headers are otherwise centrally managed.
- Attack or abuse scenario:
  - If stored or reflected XSS is introduced through future profile, order, proof URL, toast/error, or merchant content surfaces, lack of CSP allows unrestricted script execution relative to the app origin.
  - Because auth uses `HttpOnly` cookies, token theft is harder, but XSS can still perform same-origin authenticated actions from the victim browser.
- Impact:
  - Missing defense-in-depth for authenticated user, merchant, and admin sessions.
  - Higher impact for any future XSS or third-party script compromise.
- Recommended fix:
  - Add a production CSP that covers scripts, styles, images, fonts, connect sources, frame ancestors, base-uri, form-action, and object-src.
  - Include required origins for Turnstile, TonConnect, Socket.IO/WebSocket, fonts/assets, Google OAuth navigation as needed.
  - Add tests asserting CSP is present in production and does not block required app resources.
  - Add an explicit Permissions-Policy suitable for the app.
- Best-practice reference:
  - CSP is not a substitute for output encoding, but it is a standard containment control for web apps with authenticated sessions.
- Tests to add:
  - Production HTTP response includes expected `Content-Security-Policy`.
  - CSP includes `frame-ancestors 'none'` or equivalent when compatible with deployment.
  - Turnstile, TonConnect, Socket.IO, and static assets continue to work under the policy.
  - Regression test ensures `contentSecurityPolicy: false` is not reintroduced without a documented upstream CSP.
- Confidence: High

## 6. Protection Gaps by Role

Guest/public user:

- Can pre-register someone else's email without verifying it, setting up the OAuth pre-hijack path in `GAP-001`.
- Can use registration responses to infer email/username state in `GAP-002`.
- Can trigger public auth email request flows subject mostly to source-level limits in `GAP-002`.

Authenticated user:

- Can repeatedly use deposit memo/prepare, order, and match routes within the broad general API rate limit in `GAP-003`.
- Can receive raw withdrawal processing errors for their own withdrawals in `GAP-004`.
- Benefits from backend object scoping on own orders, transactions, sessions, and withdrawals.

Merchant:

- No distinct merchant role exists in the backend; merchant pages are admin-only. This reduces role-boundary ambiguity but should be confirmed against product intent.

Admin:

- Admin routes have backend `authenticateToken`, `requireVerifiedAccount`, `requireAdmin`, and `requireMfaStepUp`.
- Admin deposit replay/reconcile and withdrawal recovery lack separate high-cost operation throttles in `GAP-003`.
- Merchant/admin browser sessions lack CSP containment in `GAP-005`.

Webhook/payment provider:

- No inbound webhook actor exists. Toncenter, Telegram, Gmail, Turnstile, Google OAuth, and TON clients are outbound dependency integrations.
- Deposit and withdrawal provider data is schema parsed and tx hashes are deduplicated.

Background job/system actor:

- Background jobs mutate balances and payment state using repository state machines and transactions.
- Raw provider/worker errors can be persisted and returned through withdrawal status in `GAP-004`.
- Job scheduling uses BullMQ or local intervals; production distributed-mode feature flag requirements are enforced in env config.

## 7. Frontend-Only Protection Issues

No admin, merchant, withdrawal, order, or match protection was found to be frontend-only for the primary backend routes. The frontend uses `ProtectedRoute requireAdmin` for `/merchant/*`, but the backend also enforces admin and MFA on `/api/admin/*`, admin order updates, and admin transaction listing.

Items needing manual confirmation:

| UI/component where restriction exists | Backend route that still needs enforcement | Required server-side validation |
|---|---|---|
| `ProfilePage` shows arbitrary profiles/history | `GET /api/users/:userId`, `GET /api/matches/user/:userId` | Confirm these are intentionally public/social data. If not, require self/admin or friend/participant checks. |
| `SecuritySettingsPage` drives MFA setup/verify UI | `POST /api/auth/mfa/totp/verify` | Add route-specific brute-force/cadence limits even though the route is authenticated. |
| Merchant pages limit access to admins in UI | Already enforced by `/api/admin/*`; no gap found | Keep parity tests for every new merchant route. |

## 8. Missing Tests

Account takeover / OAuth:

- Pre-hijack regression: unverified local password account plus Google OAuth for same email must not leave attacker password usable.
- Existing unverified account OAuth callback should not issue a normal authenticated session unless the local credential is neutralized.
- Existing verified account OAuth linking should preserve intended behavior and still require verified Google email.

Registration and email abuse:

- Registration response shape does not reveal verified vs unverified email state.
- Recipient-scoped cooldowns block repeated verification resend, magic-link, and password-reset requests for the same email.
- Email cooldown tests cover multiple source IPs or separate request contexts.

Rate limit / business abuse:

- Deposit memo creation has per-user quotas and active memo caps.
- Deposit prepare has per-user/wallet route limits.
- Order creation limiter blocks repeated multipart submissions before Telegram/email side effects.
- Match create/join/resign HTTP endpoints enforce per-user route limits.
- Admin replay windows enforce maximum span and replay frequency.

Sensitive data exposure:

- Withdrawal status serializer does not return raw `lastError`.
- Worker tests assert raw dependency errors are stored only in internal fields/logs.
- Merchant diagnostic views, if added, redact provider tokens/URLs.

Headers/XSS:

- Production responses include a CSP.
- Required frontend integrations work under CSP.
- Tests fail if Helmet CSP is disabled without documented upstream replacement.
- Permissions-Policy is present if adopted.

Existing protected areas that should keep tests:

- Admin route guard parity for every new `/api/admin/*` route.
- CSRF rejection for unsafe methods with missing/invalid origin.
- Cookie flags in production.
- Refresh-token rotation and reuse detection.
- Private match access with invite token hash.
- Withdrawal ownership checks.
- Order ownership checks.
- Deposit replay idempotency and duplicate tx handling.

## 9. Prioritized Remediation Plan

1. Critical

- No critical fixes were identified from current evidence.

2. High

- Fix OAuth pre-hijacking on existing unverified accounts. Complexity: Medium.
  - Block or special-case linking to unverified local accounts.
  - Clear/revoke attacker-controlled password credentials if OAuth is allowed to claim the account.
  - Add regression tests for attacker-precreated accounts.

3. Medium

- Add recipient/account-scoped auth email throttles and reduce registration enumeration. Complexity: Medium.
- Add route-specific per-user abuse controls for deposit, order, match, and admin replay flows. Complexity: Medium.
- Split internal withdrawal error text from public withdrawal status responses. Complexity: Small.
- Add production CSP and tests for required integrations. Complexity: Medium.

4. Low

- Add explicit Permissions-Policy. Complexity: Small.
- Decide and document whether profile/match history is intentionally public to authenticated users. Complexity: Small.
- Add tests that no source maps or `.env`/dotfiles are served in production. Complexity: Small.

## 10. Items Not Applicable

- WordPress misconfiguration: Not applicable; no WordPress/PHP runtime exists.
- HTTP request smuggling: No custom reverse proxy, raw HTTP parser, or header forwarding layer was found in app code. Node/Express deployment should still be hardened at the platform/proxy level.
- OSINT-only checklist items: Not applicable to local code protection review, except secrets/config hygiene. A local `.env` exists but is ignored by git; `.env.example` is tracked as a template.
- Inbound webhooks: Not applicable; payment confirmation uses polling/replay rather than webhook routes.
- SQL injection: Not applicable; the app uses MongoDB/Mongoose, not SQL.
- Command injection: No server route reached `child_process` execution. `spawnSync`/`execSync` uses were found only in build/architecture helper scripts, not request handlers.
- SSRF through user-controlled URLs: No server-side fetch from user-controlled arbitrary URLs was found. Provider fetches use fixed Google, Cloudflare, Toncenter, Telegram, and Gmail endpoints.
- OAuth redirect URI injection: Reviewed and not currently applicable as a finding; redirect paths are internal-path sanitized before OAuth state storage and post-callback redirect.
- Upload-to-execute: Not applicable from current evidence; uploaded proof images are not written to a web-executable path and are not served by the app.

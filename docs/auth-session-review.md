# Auth and Session Security Review

## 1. Executive summary

Status: audit complete for the reviewed auth/session surface, with the first safe fix batch applied and verified.

Initial architecture read shows a React/Vite frontend calling an Express API that uses HttpOnly cookies containing opaque access and refresh tokens. Access token hashes are cached in Redis, refresh token hashes and session metadata are stored in MongoDB `AuthSession`, and one-time email/password/magic-link tokens are stored hashed in MongoDB `OneTimeToken` with TTL indexes.

Notable existing strengths found during mapping:
- Password hashes use Argon2id through Node crypto with configurable memory, pass, and parallelism parameters.
- Auth tokens and one-time tokens are generated with `crypto.randomBytes` and stored as SHA-256 hashes.
- Session validation is server-side on protected routes.
- Refresh tokens rotate and used refresh-token hashes are tracked for replay detection.
- Password reset revokes active sessions.
- Auth cookies are HttpOnly, `SameSite=Strict`, host-only, and use the `__Host-` prefix in production.
- CSRF origin/referrer checks are applied to unsafe `/api` methods.
- Admin and high-risk routes use server-side role checks and MFA step-up.

Fixes applied in this batch:
- Atomic refresh-token rotation with replay handling.
- `User.passwordHash` excluded by default with explicit auth-only opt-in.
- Login missing-user timing hardening with dummy Argon2 verification.
- Browser-bound Google OAuth state using a short-lived HttpOnly cookie.
- Production origin and Redis TLS fail-fast configuration hardening.
- MongoDB TTL cleanup for expired session records.
- Frontend one-time-token URL scrubbing and terminal logout behavior.

Deferred items are documented in Remaining risks. The main intentional deferral is registration duplicate-response genericization because it changes the current username-correction UX/API contract.

Follow-up status: account-identifier password-login throttling has now been implemented and tested, and production-parity authorization guard tests have been added for admin/merchant/withdrawal-sensitive routes. Registration duplicate-response genericization remains intentionally deferred because the current frontend depends on `USERNAME_ALREADY_EXISTS` to preserve a safe username-correction UX, and returning generic success for an already-verified email would imply delivery of an email that is not actually sent.

## 2. Current auth architecture overview

Primary backend files:
- `server/routes/auth.routes.ts`: auth endpoint declarations, auth-specific rate limiters, body validation, protected session/MFA routes.
- `server/controllers/auth.controller.ts`: registration, login, magic-link, Google OAuth, email verification, password reset, session refresh/logout/session management, MFA endpoints, profile completion.
- `server/middleware/auth.middleware.ts`: access-token cookie authentication, authenticated principal construction, admin gate, verified/profile-complete gate, MFA step-up gates.
- `server/services/auth-session.service.ts`: opaque access/refresh session issuance, Redis access token records, MongoDB session records, refresh rotation/reuse detection, logout/revocation, session listing, suspicious login detection, MFA step-up cache.
- `server/models/AuthSession.ts`: MongoDB session document schema and indexes.
- `server/services/one-time-token.service.ts` and `server/models/OneTimeToken.ts`: hashed single-use tokens for email verification, password reset, magic link, and suspicious login approval.
- `server/services/auth-email.service.ts`: one-time token issuance and email delivery orchestration.
- `server/services/google-oauth.service.ts`: Google OAuth state, nonce, PKCE, token exchange, ID token verification, userinfo validation.
- `server/services/password-hash.service.ts`: Argon2id password hashing and verification.
- `server/services/password-policy.service.ts`: password length, common-password, and email/username-content checks.
- `server/models/User.ts` and `server/services/user.service.ts`: user identity fields, password hash storage, MFA state, account lookup/update helpers.
- `server/config/cookies.ts`, `server/config/cors.ts`, `server/config/env.ts`: auth cookie, CORS, origin, and auth/session env configuration.
- `server/middleware/csrf.middleware.ts`: unsafe-method origin/referrer verification.
- `server/middleware/rate-limit.middleware.ts`: general, auth, auth-email, and withdrawal rate limiters.

Primary frontend files:
- `src/services/auth.service.ts`: frontend auth API wrapper.
- `src/services/api/apiClient.ts`: `credentials: include`, 401 refresh attempt, 401/403 auth event dispatch.
- `src/app/AuthProvider.tsx`: source-of-truth auth state hydration from `/api/auth/me`, logout state clearing.
- `src/app/ProtectedRoute.tsx`, `src/app/PublicOnlyRoute.tsx`: frontend route guards.
- `src/features/auth/*` and `src/pages/auth/*`: login, registration, password reset, email verification, MFA, and OAuth UI.

## 3. Current session architecture overview

Session model:
- Access cookie name: `4real-at` in development/test and `__Host-4real-at` in production.
- Refresh cookie name: `4real-rt` in development/test and `__Host-4real-rt` in production.
- Device cookie name: `4real-did` in development/test and `__Host-4real-did` in production.
- Cookie attributes from `server/config/cookies.ts`: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` only when `NODE_ENV=production`; access and refresh cookies have `Max-Age` values tied to configured access and refresh idle TTLs.
- Access token: opaque random token, SHA-256 hash stored in Redis at `auth:access:<hash>` with `AUTH_ACCESS_TTL_SECONDS`.
- Refresh token: opaque random token, SHA-256 hash stored in `AuthSession.currentRefreshTokenHash`.
- Session metadata: MongoDB `AuthSession` records hold `sessionId`, `userId`, `deviceId`, current token hashes, absolute and idle expiry, last IP/user-agent, revocation metadata.
- Refresh behavior: refresh token is rotated, prior refresh hash is recorded in Redis under `auth:refresh:used:<hash>` until absolute expiry, prior access record is deleted.
- Logout behavior: cookie tokens are used to find the session; matched session is revoked, access Redis record is deleted, current refresh hash is marked used, and cookies are cleared.

## 4. Files and endpoints reviewed

### Auth endpoint map

| Endpoint | Method | File/function | Auth required | Session/token behavior | User state requirements | Roles/permissions | Frontend caller | Tests seen |
|---|---:|---|---|---|---|---|---|---|
| `/api/auth/register` | POST | `server/controllers/auth.controller.ts` `AuthController.register` | Public | Does not create session; sends email verification token | New username/email or existing unverified email | Public | `src/services/auth.service.ts` `registerAccount` | `server/middleware/auth-security.test.ts`, `tests/e2e/auth.spec.ts` |
| `/api/auth/login/password` | POST | `AuthController.loginPassword` | Public | Creates new server session and access/refresh/device cookies after verified credential and account checks | Existing user with password; verified email required for full login | Public | `loginPassword` | `auth-security.test.ts`, e2e auth |
| `/api/auth/login/magic-link/request` | POST | `AuthController.requestMagicLink` | Public | Creates hashed one-time magic-link token | Existing verified user receives link; response generic | Public | `requestMagicLink` | `auth-email-flows.test.ts`, e2e auth |
| `/api/auth/login/magic-link/consume` | POST | `AuthController.consumeMagicLink` | Public | Consumes one-time token and issues session cookies | Token must map to verified user | Public | `consumeMagicLink` | `auth-email-flows.test.ts`, e2e auth |
| `/api/auth/login/suspicious/consume` | POST | `AuthController.consumeSuspiciousLogin` | Public | Consumes one-time token and issues session cookies | Token must map to verified user | Public | `consumeSuspiciousLogin` | `auth-email-flows.test.ts` |
| `/api/auth/oauth/google/start` | GET | `AuthController.startGoogleOAuth` | Public | Stores OAuth state/nonce/PKCE verifier in Redis | Google OAuth env must be configured | Public | `requestGoogleOAuthRedirect` | `google-oauth.service.test.ts` |
| `/api/auth/oauth/google/callback` | GET | `AuthController.handleGoogleCallback` | Public | Consumes OAuth state, verifies Google ID token, issues session cookies | Verified Google email | Public | Browser redirect | `google-oauth.service.test.ts` |
| `/api/auth/email/verify/resend` | POST | `AuthController.resendVerificationEmail` | Public | Creates hashed email verification one-time token | Existing unverified user receives email; response generic for absent/verified | Public | `resendVerificationEmail` | `auth-email-flows.test.ts` |
| `/api/auth/email/verify/consume` | POST | `AuthController.consumeVerificationEmail` | Public | Consumes verification token and issues session cookies | Token must map to user | Public | `consumeVerificationEmail` | `auth-email-flows.test.ts`, e2e auth |
| `/api/auth/password/forgot` | POST | `AuthController.requestPasswordReset` | Public | Creates hashed password reset one-time token | Existing verified user receives email; response generic | Public | `requestPasswordReset` | `auth-email-flows.test.ts`, e2e auth |
| `/api/auth/password/reset` | POST | `AuthController.resetPassword` | Public | Consumes reset token, updates password hash, revokes active sessions | Valid reset token | Public | `resetPassword` | `auth-email-flows.test.ts`, e2e auth |
| `/api/auth/mfa/challenge` | POST | `AuthController.completeMfaChallenge` | Public challenge endpoint | Consumes MFA challenge; may issue login session or set step-up TTL | Valid challenge and TOTP/recovery code | Public, challenge-bound | `completeMfaChallenge` | `auth-security.test.ts` |
| `/api/auth/refresh` | POST | `AuthController.refreshSession` | Refresh cookie required | Rotates access and refresh cookies; records used refresh hash | Active session and user | Session owner | `refreshSession`, `apiClient` automatic retry | `auth-session.service.test.ts`, `auth-security.test.ts` |
| `/api/auth/me` | GET | `AuthController.me` | `authenticateToken` | Validates access cookie via Redis and MongoDB session | Active user | Session owner | `getCurrentUser`, `AuthProvider` | `auth-security.test.ts`, frontend contract tests |
| `/api/auth/logout` | POST | `AuthController.logout` | Cookie tokens if present | Revokes matched session, clears cookies, Clear-Site-Data | Idempotent | Session owner if token present | `logout` | `auth-security.test.ts`, e2e auth |
| `/api/auth/sessions` | GET | `AuthController.listSessions` | `authenticateToken` | Lists active sessions | Active session | Session owner | `getSessions` | `auth-session.service.test.ts` |
| `/api/auth/sessions/:sessionId` | DELETE | `AuthController.revokeSession` | `authenticateToken`, `requireMfaStepUp` | Revokes specific owned session | MFA-enabled and fresh step-up | Session owner | `revokeSession` | `auth-security.test.ts` |
| `/api/auth/sessions/revoke-others` | POST | `AuthController.revokeOtherSessions` | `authenticateToken`, `requireMfaStepUp` | Revokes other active sessions | MFA-enabled and fresh step-up | Session owner | `revokeOtherSessions` | `auth-security.test.ts` |
| `/api/auth/mfa/totp/setup` | POST | `AuthController.startTotpSetup` | `authenticateToken`, step-up if MFA enabled | Creates Redis setup token and returns TOTP setup material | Active session | Session owner | `startTotpSetup` | `auth-security.test.ts` |
| `/api/auth/mfa/totp/verify` | POST | `AuthController.verifyTotpSetup` | `authenticateToken` | Consumes setup token, encrypts TOTP secret, returns recovery codes once | Active session | Session owner | `verifyTotpSetup` | `auth-security.test.ts` |
| `/api/auth/mfa/disable` | POST | `AuthController.disableMfa` | `authenticateToken`, `requireMfaStepUp` | Verifies factor, clears MFA state and step-up cache | Active MFA user | Session owner | `disableMfa` | `auth-security.test.ts` |
| `/api/auth/mfa/recovery-codes/regenerate` | POST | `AuthController.regenerateRecoveryCodes` | `authenticateToken`, `requireMfaStepUp` | Verifies step-up, replaces recovery hashes, returns new codes once | Active MFA user | Session owner | `regenerateRecoveryCodes` | `auth-security.test.ts` |
| `/api/auth/profile/complete` | POST | `AuthController.completeProfile` | `authenticateToken` | No token rotation | Active session; username missing/being set | Session owner | `completeProfile` | frontend contract tests/e2e auth |

### Non-auth protected endpoint map

| Route group | File | Auth middleware | Notes |
|---|---|---|---|
| `/api/admin/merchant/*` | `server/routes/admin.routes.ts` | `authenticateToken`, `requireVerifiedAccount`, `requireAdmin`, `requireMfaStepUp` | Merchant/admin operations require verified profile, admin, and fresh MFA step-up. |
| `/api/orders/*` | `server/routes/orders.routes.ts` | Group uses `authenticateToken`, `requireVerifiedAccount`; PATCH additionally uses `requireAdmin`, `requireMfaStepUp` | User order creation/listing is authenticated; admin order status changes are MFA-gated. |
| `/api/transactions/*` | `server/routes/transactions.routes.ts` | Group uses `authenticateToken`, `requireVerifiedAccount`; `/all` admin+MFA; `/withdraw` MFA+withdrawal rate limit | User-specific handlers use `req.user.id`; withdrawal status repository checks ownership. |
| `/api/matches/active` | `server/routes/matches.routes.ts` | Public | Public active match listing. |
| `/api/matches/*` except `/active` | `server/routes/matches.routes.ts` | `authenticateToken`, `requireVerifiedAccount` | Match service enforces room access/invite/participant rules. |
| `/api/users/leaderboard`, `/api/users/:userId` | `server/routes/users.routes.ts` | Public | Public profile/leaderboard surfaces; serializer excludes password hash. |

## 5. Frontend auth flow overview

- `AuthProvider` calls `getCurrentUser()` on mount and treats `/api/auth/me` as the source of truth.
- Frontend API requests always use `credentials: 'include'`; auth tokens are not read from JavaScript-accessible storage.
- `apiClient` attempts one `/api/auth/refresh` on 401 for non-public endpoints, then dispatches session-expired events if refresh fails.
- `ProtectedRoute` blocks rendering while loading, redirects anonymous users to `/auth/login`, redirects incomplete profiles to `/auth/complete-profile`, and applies admin UX gating.
- Frontend route guards are UX-only; backend route groups enforce authorization.

## 6. Backend auth flow overview

- Registration validates email/username/password, verifies Turnstile when configured, hashes password, creates user, and sends email verification without issuing a session.
- Password login validates credentials with a generic invalid-credential message, rehashes old password hashes asynchronously when needed, requires email verification before session issuance, and uses suspicious-device logic plus MFA or email approval.
- Email verification, magic-link, and suspicious-login approval consume hashed one-time tokens and issue server sessions.
- Password reset consumes a hashed one-time token, enforces password policy, writes a new Argon2id hash, marks email verified, and revokes active sessions.
- Google OAuth uses Redis-backed state, nonce, and PKCE; verifies Google ID token audience and nonce; checks userinfo consistency; then creates or links a user and issues a session.
- MFA setup stores setup state in Redis, encrypts TOTP secret with AES-256-GCM, hashes recovery codes, and uses Redis-backed step-up state for sensitive operations.

## 7. Database/session/token storage overview

- `User`: stores email, normalized username, optional `passwordHash`, optional `googleSubject`, MFA state, security login metadata, admin flag, stats/balance. `passwordHash` is now excluded by schema default and explicitly selected only by auth lookup helpers that need password verification or password presence.
- `AuthSession`: stores session records with current access/refresh token hashes, idle and absolute expiration, device, IP/user-agent, revocation state, and indexes for session lookup.
- `OneTimeToken`: stores hashed one-time tokens with `type`, `userId`, `expiresAt`, `consumedAt`, metadata, unique token hash, and a MongoDB TTL index on `expiresAt`.
- Redis: stores access token hash records with access TTL, refresh-token reuse markers until session absolute expiry, OAuth state/nonce/PKCE, MFA setup/challenge state, and MFA step-up TTLs.

## 8. Findings table

| ID | Severity | Status | Area | Finding |
|---|---|---|---|---|
| F-01 | Medium | Confirmed | Session refresh | Refresh-token rotation is not atomic, weakening replay detection under concurrent refresh races. |
| F-02 | Medium | Fixed | Login throttling | Password login throttling was IP-only and had no account-identifier failure control. |
| F-03 | Low | Partially fixed / accepted risk | Enumeration | Login timing was hardened; registration duplicate responses still expose account-existence signals by accepted UX/API tradeoff. |
| F-04 | Medium | Confirmed | OAuth | Google OAuth state is not bound to the initiating browser. |
| F-05 | Medium | Confirmed | Production config | Production can fall back to localhost allowed origins for credentialed CORS and CSRF checks. |
| F-06 | Medium | Confirmed | Production config | Production Redis transport is not required to be encrypted. |
| F-07 | Low | Confirmed | Session storage | Expired session documents retain token hashes and metadata without TTL cleanup. |
| F-08 | Medium | Confirmed | Frontend token handling | One-time auth tokens remain in URL query strings during token flows. |
| F-09 | Low | Confirmed | Frontend logout | Logout can enter the session-refresh path before terminating. |
| F-10 | Low | Fixed for mapped sensitive routes | Authorization tests | Regression coverage did not fully model production authorization guards for merchant/admin-sensitive routes. |
| F-11 | Low | Confirmed | User model | `User.passwordHash` is not excluded by schema default, increasing accidental exposure risk in future queries. |

### Finding details

#### F-01: Refresh-token rotation is not atomic

- Severity: Medium
- File path and line/function affected: `server/services/auth-session.service.ts` `AuthSessionService.refreshSession`
- Confirmed or suspected: Confirmed by static trace; race not dynamically reproduced before planning.
- What is wrong: Refresh reuse is checked in Redis, then MongoDB session lookup and mutation happen as separate operations. Two concurrent refreshes using the same refresh token can both pass the reuse check before either write is visible.
- Why it matters: A stolen refresh token can be raced against the legitimate client and may win a rotated session instead of reliably triggering all-session revocation.
- Best-practice source supporting the finding: OWASP Session Management Cheat Sheet recommends session identifier renewal to prevent fixation/reuse risks and emphasizes server-side session expiration and invalidation; OWASP ASVS V3 focuses on robust session management.
- Recommended fix: Use conditional compare-and-swap on the current refresh-token hash and active-session predicates so only one refresh can rotate a session. Treat a failed conditional update as replay and revoke sessions.
- Regression risk: Medium. Refresh behavior is core auth state; stale tabs and retry behavior must remain predictable.
- Tests needed: Normal refresh still rotates; a stale concurrent refresh causes replay handling; refresh still updates Redis access records and returns session DTO.

#### F-02: Password login throttling is IP-only

- Severity: Medium
- File path and line/function affected: `server/routes/auth.routes.ts` `/login/password`; `server/middleware/rate-limit.middleware.ts` `createAuthRateLimiter`
- Confirmed or suspected: Confirmed.
- What is wrong: The auth limiter uses the express-rate-limit default key, effectively client IP. It does not limit by normalized account identifier.
- Why it matters: Distributed attacks can spread attempts across IPs against one account. Turnstile helps automated abuse but is not account-centric failed-authentication throttling.
- Best-practice source supporting the finding: OWASP Authentication Cheat Sheet recommends protections against brute force, credential stuffing, and password spraying; NIST SP 800-63B requires rate limiting for failed authentication attempts.
- Recommended fix: Add identifier-based throttling for password login and MFA challenge attempts with careful DoS-resistant tuning.
- Regression risk: Medium. Account lockouts can create denial of service if too strict.
- Tests needed: Per-identifier throttling, IP throttling still applies, successful login behavior remains unchanged.
- Follow-up fix applied: `/api/auth/login/password` now keeps the existing IP limiter and adds a second temporary limiter keyed by a SHA-256 hash of the normalized login identifier after request-body validation. Successful responses do not consume the identifier budget. Limited responses use the same generic `AUTH_RATE_LIMITED` body for existing and absent identifiers.

#### F-03: Login and registration expose account-existence signals

- Severity: Low
- File path and line/function affected: `server/controllers/auth.controller.ts` `register`, `loginPassword`; `server/services/password-hash.service.ts` `verifyPassword`
- Confirmed or suspected: Confirmed; timing magnitude not benchmarked.
- What is wrong: Registration returns specific duplicate email/username conflicts. Login returns before Argon2 verification for absent users, while existing users pay the password hash cost.
- Why it matters: Account lists support credential stuffing and phishing. The login timing issue is narrower because credentials still fail generically.
- Best-practice source supporting the finding: OWASP Authentication Cheat Sheet recommends generic login, password recovery, and account creation responses; NIST SP 800-63B supports verifier protections against guessing.
- Recommended fix: Add dummy password verification for missing login users. Defer registration response changes unless product accepts UX/API contract changes.
- Regression risk: Low to medium. Dummy verification adds CPU cost to invalid logins; registration response changes could affect frontend field errors.
- Tests needed: Missing-user login performs dummy verification path; invalid login remains generic.
- Follow-up decision: registration duplicate responses remain field-specific for now. The frontend uses `USERNAME_ALREADY_EXISTS` to return the user to the username step without discarding the email verification flow. Generic success for an existing verified email would also imply that a verification email was sent when none was sent. A safer future design would add non-enumerating, abuse-controlled username availability UX or accept the UX loss with product approval.

#### F-04: OAuth state is not bound to the initiating browser

- Severity: Medium
- File path and line/function affected: `server/services/google-oauth.service.ts` `createAuthorizationUrl`, `consumeCallback`; `server/controllers/auth.controller.ts` `startGoogleOAuth`, `handleGoogleCallback`
- Confirmed or suspected: Confirmed.
- What is wrong: OAuth `state` is stored server-side but callback validation does not check a browser-bound value from the initiating user agent.
- Why it matters: A valid OAuth callback initiated by an attacker can be delivered to a victim browser and log the victim into the attacker's account. This is login CSRF/session swapping rather than direct credential theft.
- Best-practice source supporting the finding: OWASP Authentication Cheat Sheet and ASVS V2/V3 require robust authentication protocol/session protections; OAuth state is a CSRF control.
- Recommended fix: Bind Google OAuth state to a short-lived HttpOnly cookie value, store only its hash in Redis, and require a matching cookie on callback.
- Regression risk: Medium. OAuth must continue to work through cross-site top-level redirects; the binding cookie needs `SameSite=Lax`, not `Strict`.
- Tests needed: Callback rejects missing/mismatched binding and succeeds with matching binding.

#### F-05: Production may trust localhost origins

- Severity: Medium
- File path and line/function affected: `server/config/env.ts` `resolveAllowedOrigins`; `server/config/cors.ts`; `server/middleware/csrf.middleware.ts`
- Confirmed or suspected: Confirmed.
- What is wrong: If `ALLOWED_ORIGINS` is unset, defaults are localhost origins in every environment. CORS allows credentials for allowed origins and CSRF accepts the same allowlist.
- Why it matters: Missing production config creates a dangerous trust boundary. Credentialed browser requests should be allowlisted to real production origins.
- Best-practice source supporting the finding: OWASP CSRF Prevention Cheat Sheet recommends CSRF mitigation for state-changing requests and origin verification; OWASP Authorization Cheat Sheet recommends explicit trust boundaries; MDN Set-Cookie/Secure Cookie guidance supports tight cookie scope.
- Recommended fix: In production, derive the allowed origin from `PUBLIC_APP_ORIGIN`/manifest origin or fail fast rather than defaulting to localhost.
- Regression risk: Low to medium. Misconfigured deployments may fail startup instead of silently trusting the wrong origins.
- Tests needed: Production without `ALLOWED_ORIGINS` uses configured public origin or fails when public origin is missing/local.

#### F-06: Production Redis transport is not required to be encrypted

- Severity: Medium
- File path and line/function affected: `server/config/env.ts` `REDIS_URL`; `server/services/redis.service.ts` `getRedisClient`; `.env.example`
- Confirmed or suspected: Confirmed.
- What is wrong: Production requires Redis but accepts cleartext `redis://`.
- Why it matters: Redis stores access-token hash mappings, refresh replay markers, OAuth state, and MFA state. Cleartext network transport increases exposure if infrastructure traffic is observable.
- Best-practice source supporting the finding: OWASP Session Management Cheat Sheet and ASVS V3 require protecting session identifiers and session state; NIST SP 800-63B emphasizes protecting authenticators/verifier data.
- Recommended fix: Require `rediss://` for production Redis.
- Regression risk: Medium. Production secrets may need migration to a TLS Redis URL.
- Tests needed: Production rejects `redis://`; production accepts `rediss://`; non-production still accepts local `redis://`.

#### F-07: Expired session documents retain token hashes and metadata indefinitely

- Severity: Low
- File path and line/function affected: `server/models/AuthSession.ts` `AuthSessionSchema`; `server/services/auth-session.service.ts` expiry filters
- Confirmed or suspected: Confirmed.
- What is wrong: Expired sessions are rejected by queries, but naturally expired rows are not automatically deleted or cleaned.
- Why it matters: Retained token hashes and IP/user-agent metadata increase privacy and storage exposure after they are no longer operationally useful.
- Best-practice source supporting the finding: OWASP Session Management Cheat Sheet says sessions must have expiration; ASVS V3 expects server-side session lifetime controls.
- Recommended fix: Add MongoDB TTL cleanup on absolute expiry or an explicit cleanup job. For this batch, add a TTL index on `absoluteExpiresAt`.
- Regression risk: Low. Historical session listing already filters expired sessions.
- Tests needed: Schema declares the TTL index.

#### F-08: One-time auth tokens remain in URL query strings

- Severity: Medium
- File path and line/function affected: `src/pages/auth/MagicLinkPage.tsx`, `VerifyEmailPage.tsx`, `ApproveLoginPage.tsx`, `ResetPasswordPage.tsx`
- Confirmed or suspected: Confirmed.
- What is wrong: Pages read `?token=` values and keep them in browser URLs during token consumption or password reset entry.
- Why it matters: URL-carried credentials can leak via browser history, screenshots, logs, support tooling, and copied URLs.
- Best-practice source supporting the finding: OWASP Authentication Cheat Sheet password recovery guidance; OWASP Session Management Cheat Sheet advises session IDs/tokens not be exposed in URLs or logs.
- Recommended fix: Capture the token in component state/ref and immediately remove `token` from the URL with `history.replaceState`.
- Regression risk: Medium. Token pages must still submit the captured token and preserve non-sensitive query params like email/error.
- Tests needed: Utility/contract test that scrubbing removes only the token parameter and preserves path, other params, and hash.

#### F-09: Logout can refresh before terminating

- Severity: Low
- File path and line/function affected: `src/services/auth.service.ts` `logout`; `src/services/api/apiClient.ts` 401 refresh branch; `src/app/AuthProvider.tsx` `logout`
- Confirmed or suspected: Confirmed frontend behavior.
- What is wrong: Logout does not set `skipAuthRefresh`, so a 401 logout response can trigger `/auth/refresh` before retrying logout.
- Why it matters: Logout should be terminal. Refreshing during logout complicates revocation semantics.
- Best-practice source supporting the finding: OWASP Session Management Cheat Sheet logout/session invalidation guidance; ASVS V3.
- Recommended fix: Call logout with `skipAuthRefresh: true`.
- Regression risk: Low. Backend logout is already idempotent and clears cookies when tokens are present.
- Tests needed: Frontend auth-service test proving logout does not call refresh on 401.

#### F-10: Production authorization guard parity is under-tested

- Severity: Low
- File path and line/function affected: `server/routes/admin.routes.ts`, `orders.routes.ts`, `transactions.routes.ts`, `tests/e2e/harness/server.mjs`
- Confirmed or suspected: Confirmed coverage gap; no runtime bypass found.
- What is wrong: The e2e harness does not fully model production `requireVerifiedAccount`/`requireMfaStepUp` behavior for sensitive merchant/admin paths.
- Why it matters: Future guard regressions could pass e2e tests while weakening production authorization.
- Best-practice source supporting the finding: OWASP Authorization Cheat Sheet recommends least privilege and tests validating mapped permissions; ASVS V4.
- Recommended fix: Add route-level real-router tests or align e2e harness guard semantics.
- Regression risk: Test-only risk.
- Tests needed: Real-router or harness parity tests for unauthenticated, unverified, non-admin, no-MFA-step-up, and authorized admin cases.
- Follow-up fix applied: added production-middleware parity tests for unauthenticated, unverified, non-admin, admin without MFA step-up, authorized admin, withdrawal MFA, and withdrawal object scoping.

#### F-11: `passwordHash` is not excluded by schema default

- Severity: Low
- File path and line/function affected: `server/models/User.ts` `passwordHash`; `server/services/user.service.ts` auth lookup helpers
- Confirmed or suspected: Confirmed.
- What is wrong: `passwordHash` is a normal selected field unless individual queries exclude it.
- Why it matters: Current serializers do not return it, but future direct `User.find*` queries can accidentally expose password hashes internally or in responses.
- Best-practice source supporting the finding: OWASP Authentication Cheat Sheet points to secure password storage; NIST SP 800-63B requires verifiers to store secrets in resistant forms; least-exposure is a standard secure design control.
- Recommended fix: Mark `passwordHash` as `select: false` and explicitly opt in only for auth code that needs it.
- Regression risk: Medium. Auth serializers use `hasPassword`, and login needs the hash; explicit query selection must preserve these contracts.
- Tests needed: User schema default excludes password hash; login lookup helpers opt in; public lookups still exclude the hash.

## 9. Best-practice references used

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP ASVS V2 Authentication, V3 Session Management, V4 Access Control: https://owasp.org/www-project-application-security-verification-standard/
- NIST SP 800-63B: https://pages.nist.gov/800-63-4/sp800-63b.html
- MDN Secure Cookie Configuration: https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies
- MDN Set-Cookie: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- web.dev SameSite Cookies Explained: https://web.dev/articles/samesite-cookies-explained
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## 10. Subagent reports summary

Subagents were used after the main architecture map was created.

- Backend auth/session core: reported F-01, F-02, and F-03; confirmed existing strengths in password hashing, one-time token storage, cookies, CSRF, and MFA.
- OAuth/config/CORS/CSRF/Redis: reported F-04, F-05, F-06, and F-07; flagged cross-cutting deployment impacts.
- Frontend auth behavior: reported F-08 and F-09; confirmed no frontend localStorage/sessionStorage token storage and backend as source of truth.
- Authorization/protected routes: reported F-10; found no confirmed production authorization bypass in inspected route groups.

## 11. Fix plan

Fixes selected for the first safe batch:

| Fix | Finding IDs | Files to change | Exact behavior change | Why needed | Regression testing | Contract/session impact |
|---|---|---|---|---|---|---|
| Atomic refresh rotation | F-01 | `server/services/auth-session.service.ts`, `server/services/auth-session.service.test.ts` | Replace refresh save path with conditional update on current refresh-token hash and active session predicates; failed conditional update revokes sessions as replay. | Ensures one refresh token can only rotate once. | Add stale/concurrent refresh test and rerun auth session tests. | Backend session semantics strengthen; no public API shape change; may invalidate sessions during actual replay race. |
| Login timing hardening and password hash default exclusion | F-03, F-11 | `server/models/User.ts`, `server/services/user.service.ts`, `server/controllers/auth.controller.ts`, auth tests | Set `passwordHash` `select:false`; explicitly select it in auth lookup helpers; perform dummy Argon2 verification when login identifier has no password user. | Reduces accidental hash exposure and login timing enumeration. | Add schema/query tests and login missing-user dummy verification test. | No response contract change; invalid login CPU cost increases. |
| OAuth browser-bound state | F-04 | `server/services/google-oauth.service.ts`, `server/controllers/auth.controller.ts`, `server/config/cookies.ts`, Google OAuth tests | Store hash of a random browser binding in OAuth state; set short-lived HttpOnly `SameSite=Lax` cookie; require matching cookie on callback; clear it after callback. | Prevents login CSRF/session swapping via attacker-initiated OAuth callbacks. | Add missing/mismatched/matching binding tests. | OAuth callback requires the initiating browser cookie; no API response shape change except internal start cookie. |
| Production origin and Redis TLS hardening | F-05, F-06 | `server/config/env.ts`, `.env.example`, env/security tests | Production allowed origins derive from explicit public origin instead of localhost fallback; production Redis must use `rediss://`. | Removes insecure production fallback paths. | Add production env tests. | Deployment config may need updates; no runtime API contract change. |
| AuthSession expiry cleanup index | F-07 | `server/models/AuthSession.ts`, `server/services/auth-session.service.test.ts` | Add TTL index on `absoluteExpiresAt`. | Cleans expired session rows after server-side absolute expiry. | Add schema index test. | Expired sessions already unusable; old session history beyond absolute expiry will be removed. |
| Frontend token URL scrubbing and logout bypass | F-08, F-09 | `src/features/auth/*`, auth pages, `src/services/auth.service.ts`, frontend contract tests | Capture one-time token then remove `token` from current URL; call logout with `skipAuthRefresh`. | Reduces token leakage and makes logout terminal. | Add helper/contract tests and logout no-refresh test. | No backend contract change; reload after scrubbing requires a fresh link. |

Deferred after the first batch:
- F-02 account-identifier throttling: initially deferred for product/DoS tuning risk, then implemented in the focused follow-up below.
- F-10 authorization harness parity: initially deferred as test-only hardening, then addressed with production-middleware parity tests in the focused follow-up below.
- Registration duplicate response genericization from F-03: still deferred because it would change existing UX/API field-error behavior and needs human product approval.

Focused follow-up fix plan:

| Fix | Finding IDs | Files to change | Exact behavior change | Why needed | Regression testing | Contract/session impact |
|---|---|---|---|---|---|---|
| Password-login identifier throttling | F-02 | `server/middleware/rate-limit.middleware.ts`, `server/routes/auth.routes.ts`, `server/middleware/rate-limit.middleware.test.ts` | Keep the existing IP auth limiter and add a second `/login/password` limiter after body validation, keyed by a SHA-256 hash of the normalized email/username. Use the same temporary window/max and generic response as the auth limiter, with `skipSuccessfulRequests` so successful authentication does not consume the identifier budget. | NIST SP 800-63B requires failed-attempt rate limiting on subscriber accounts; OWASP recommends login throttling while warning about account-lockout DoS. Hashing the key avoids storing raw identifiers in Redis/rate-limit memory. | Add route-level limiter tests for same-identifier failures, different identifiers, IP limiter preservation, successful login, and generic limited responses. | No response contract change; failure limit remains temporary rather than a hard account lockout. |
| Registration duplicate-response decision | F-03 | `auth-session-review.md` only unless the contract is proven safe to change | Keep existing field-specific duplicate responses for now because the frontend intentionally uses `USERNAME_ALREADY_EXISTS` to return users to the username step, and generic success for existing verified email could imply an email was sent when none was sent. | OWASP recommends generic account creation responses, but changing this contract safely needs product/UX approval and possibly an out-of-band username availability replacement. | Document decision and required future safe path. | No code change in this follow-up; current enumeration tradeoff remains accepted and explicit. |
| Authorization guard parity tests | F-10 | New focused middleware/route test file | Add production-middleware parity tests for unauthenticated, unverified, non-admin, admin without MFA step-up, authorized admin, withdrawal MFA, and withdrawal object scoping. | OWASP Authorization Cheat Sheet recommends deny-by-default and tests that validate mapped permissions are enforced on every request. | Run the new test file and relevant auth/security tests. | Test-only change; no public API contract change. |
| Manual/staging verification checklist | Manual residual risk | `auth-session-review.md` | Expand manual checks into an executable staging checklist for OAuth browser flow, invalid state cookie, HTTPS cookie flags, real email token links, Redis TLS, and concurrent refresh replay. | Unit tests cannot prove provider, proxy, TLS, cookie, and real Redis/Mongo deployment behavior. | Documentation review plus targeted automated checks above. | No code contract change. |

## 12. Fixes applied

### F-01: Atomic refresh-token rotation

- Changed `server/services/auth-session.service.ts` to rotate refresh tokens with a conditional `AuthSession.updateOne` on `_id`, the current refresh-token hash, and active-session predicates.
- If the conditional update loses the race, refresh now revokes all sessions for the user as `refresh_reuse_detected` and returns `SESSION_REPLAY_DETECTED`.
- Existing successful refresh behavior remains unchanged: a new access token, refresh token, Redis access record, and cookie set are still returned.

### F-03 and F-11: Login timing hardening and password hash default exclusion

- Changed `server/models/User.ts` so `passwordHash` has `select: false`.
- Changed `server/services/user.service.ts` auth lookup helpers to explicitly select `+passwordHash` where password comparison or `hasPassword` requires it.
- Changed `server/controllers/auth.controller.ts` password login so absent users still run Argon2 verification against a static dummy hash before returning the generic invalid-credentials error.
- Deferred registration duplicate-response genericization because it would change existing field-error UX/API behavior.

### F-04: Browser-bound Google OAuth state

- Added short-lived Google OAuth state cookie helpers in `server/config/cookies.ts`.
- Changed `server/services/google-oauth.service.ts` to store only a hash of a random browser binding in Redis state and require the raw binding from an HttpOnly cookie on callback.
- Changed `server/controllers/auth.controller.ts` to set the binding cookie on OAuth start and clear it on callback success/failure.
- The OAuth binding cookie uses `SameSite=Lax` so it survives Google’s top-level cross-site redirect; auth session cookies remain `SameSite=Strict`.

### F-05 and F-06: Production origin and Redis TLS hardening

- Changed `server/config/env.ts` so production no longer falls back to localhost allowed origins. Production now uses explicit `ALLOWED_ORIGINS` or derives an origin from `PUBLIC_APP_ORIGIN` / `VITE_TON_MANIFEST_URL`, while rejecting localhost origins.
- Changed `server/config/env.ts` so production `REDIS_URL` must use `rediss://`.
- Updated `.env.example` to document local `redis://` versus production `rediss://`.

### F-07: Expired session cleanup

- Added a MongoDB TTL index on `AuthSession.absoluteExpiresAt` in `server/models/AuthSession.ts`.
- This removes expired session records after their authoritative absolute expiry; active session validation was already rejecting expired sessions.

### F-08 and F-09: Frontend token URL scrubbing and terminal logout

- Added `src/features/auth/url-token.ts` to remove only the sensitive `token` query parameter with `history.replaceState`.
- Updated magic link, email verification, suspicious login approval, and password reset pages to capture the token before scrubbing the URL.
- Updated frontend logout in `src/services/auth.service.ts` to use `skipAuthRefresh: true`.

### F-02: Account-identifier login throttling

- Added `createPasswordLoginIdentifierRateLimiter()` in `server/middleware/rate-limit.middleware.ts`.
- Wired it only to `POST /api/auth/login/password` in `server/routes/auth.routes.ts`, after body validation and in addition to the existing IP-based auth limiter.
- The limiter key is a SHA-256 hash of the normalized email or username, so Redis/in-memory rate-limit stores do not hold raw account identifiers.
- The limiter uses the existing `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` values, `skipSuccessfulRequests`, and the same generic `AUTH_RATE_LIMITED` response body as the existing auth limiter.
- This is a temporary throttle, not a permanent account lockout. It still creates a bounded DoS possibility against a target identifier during the window, so values should be monitored and tuned in production.

### F-03: Registration duplicate-response decision

- No registration response contract change was made in this follow-up.
- Current backend behavior returns specific duplicate errors for verified existing email and username conflict, while existing unverified email gets a generic pending-verification resend path.
- Current frontend behavior depends on `USERNAME_ALREADY_EXISTS` to move users back to the details step and show username-specific correction. Removing that without a replacement would degrade account creation and could silently hide actionable username conflicts.
- Decision: keep the current contract as an accepted Low risk until product approves either generic account-creation responses or a replacement username-availability design.

### F-10: Authorization guard parity tests

- Added `server/middleware/authz-guard-parity.test.ts`.
- The test app uses the real production auth middleware chain: `authenticateToken`, `requireVerifiedAccount`, `requireAdmin`, and `requireMfaStepUp`.
- Coverage now includes unauthenticated request rejection, unverified-user rejection, non-admin rejection, admin-without-step-up rejection, authorized admin success, normal-user withdrawal step-up enforcement, and withdrawal status lookup scoped to `req.user.id`.

## 13. Tests added or updated

- `server/services/auth-session.service.test.ts`: added refresh compare-and-swap/replay coverage and TTL index coverage.
- `server/services/google-oauth.service.test.ts`: updated OAuth happy-path tests for browser binding and added missing/mismatched binding rejection tests.
- `server/config/env.test.ts`: added production origin derivation/rejection tests and production Redis TLS tests.
- `server/middleware/auth-security.test.ts`: added `passwordHash` schema exclusion coverage and kept production cookie/security tests compatible with new production env requirements.
- `server/middleware/frontend-contracts.test.ts`: added token URL scrubbing and logout no-refresh coverage.
- `server/middleware/rate-limit.middleware.test.ts`: added identifier throttling tests for normalized repeated failures, different identifiers, preserved IP limiting, successful login behavior, and generic limited responses.
- `server/middleware/authz-guard-parity.test.ts`: added production-middleware parity coverage for sensitive admin/merchant/order/withdrawal routes and object scoping.

## 14. Regression checks performed

- Focused auth/session backend suite passed.
- `npm run lint` passed after fixing an exact optional property typing issue in `server/config/env.ts`.
- `npm run build` passed, including Vite production build and server TypeScript build.
- New frontend auth contract tests passed when run with `--test-name-pattern`.
- Full `server/middleware/frontend-contracts.test.ts` still fails two unrelated pre-existing contract checks: toast message length and raw button usage. The new auth tests in that file pass.
- Follow-up focused auth/security suite passed with 55 tests after adding account-identifier throttling and authorization parity tests.
- The account-identifier limiter test was run before implementation and failed because `createPasswordLoginIdentifierRateLimiter` did not exist, then passed after the middleware and route wiring were added.

## 15. Commands run and results

| Command | Result |
|---|---|
| `Get-ChildItem -Force` | Succeeded; identified server, src, shared, tests, docs, node_modules, package files. |
| `rg --files` | Succeeded; identified auth/session-related backend, frontend, and test files. |
| `git status --short` | Succeeded; existing untracked `reviewcodebase.md` noted and left untouched. |
| `Get-Content -Raw package.json` | Succeeded; test/lint/build scripts identified. |
| Targeted `Get-Content -Raw` reads for auth/session files | Succeeded; architecture summarized above. |
| Web reference reads for OWASP/MDN/NIST/web.dev sources | Succeeded; sources listed above. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/services/auth-session.service.test.ts server/services/google-oauth.service.test.ts server/config/env.test.ts server/middleware/auth-security.test.ts server/middleware/frontend-contracts.test.ts` | Failed during initial red phase as expected for newly added tests, plus the pre-existing frontend contract failures. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/auth-security.test.ts server/services/auth-session.service.test.ts server/middleware/auth-email-flows.test.ts server/services/auth-email.service.test.ts server/services/one-time-token.service.test.ts server/services/google-oauth.service.test.ts server/config/env.test.ts server/middleware/security.middleware.test.ts` | Passed: 53 tests, 53 pass. |
| `node --import ./server/test/setup-env.js --test-name-pattern="frontend auth helper|frontend logout" --test --experimental-strip-types server/middleware/frontend-contracts.test.ts` | Passed: 2 auth/frontend tests selected by pattern. |
| `npm run lint` | Passed. |
| `npm run build` | Passed: Vite production build and `tsc --project tsconfig.server.json`. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts` | Failed only the two unrelated frontend contract checks listed below; 12 of 14 tests passed, including the new auth tests. |
| `git diff --check` | Passed; only CRLF normalization warnings were reported. |
| Report stale-marker search | Initial broad search matched its own command row; after correcting that row, no stale in-progress markers remain in the report body. |
| `git diff --stat` and `git status --short` | Succeeded; changed files were scoped to auth/session implementation, tests, env docs, frontend token handling, and this report. Existing untracked `reviewcodebase.md` was left untouched. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/rate-limit.middleware.test.ts` before implementation | Failed as expected: `createPasswordLoginIdentifierRateLimiter` was not exported yet. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/authz-guard-parity.test.ts` before implementation | Initial harness expectation failed because the existing withdrawal not-found code is `WITHDRAWAL_NOT_FOUND`; corrected the test expectation, then the file passed. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/rate-limit.middleware.test.ts` | Passed: 6 tests, including 5 password-login identifier/IP throttling tests. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/authz-guard-parity.test.ts` | Passed: 7 production-parity authz guard tests. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/rate-limit.middleware.test.ts server/middleware/authz-guard-parity.test.ts server/middleware/auth-security.test.ts server/services/auth-session.service.test.ts server/services/google-oauth.service.test.ts server/config/env.test.ts` | Passed: 55 tests, 55 pass. |
| Follow-up `npm run lint` | Passed. |
| Follow-up `npm run build` | Passed: Vite production build and `tsc --project tsconfig.server.json`. |

## 16. Failed commands, if any

| Command | Result | Impact |
|---|---|---|
| Recursive `Get-ChildItem -Force -Filter package.json -Recurse` | Timed out after entering `.worktrees` and `node_modules` | No audit impact; root `package.json` was read directly. |
| `npm run test:unit -- ...` | Timed out because the package script runs the full fixed unit list and did not narrow to the requested files. | No verification gap for changed auth files; the relevant auth tests were run directly with Node. |
| `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/frontend-contracts.test.ts` | Failed `frontend toast strings stay within the guideline target` and `frontend buttons render through SketchyButton`. | These failures are unrelated to the auth/session changes. New auth tests in the same file passed. |
| First follow-up `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/rate-limit.middleware.test.ts` | Failed because the new test imported a not-yet-implemented identifier limiter. | Expected TDD red phase; fixed by adding the limiter. |
| First follow-up `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/authz-guard-parity.test.ts` | Failed one assertion expecting `NOT_FOUND` instead of the existing `WITHDRAWAL_NOT_FOUND` code. | Test harness expectation was corrected; no production code change required. |

## 17. Remaining risks

- Registration duplicate responses still expose account-existence signals through field-specific conflicts. This is an explicit UX/API contract decision and was not changed in this follow-up.
- Account-identifier throttling is temporary and generic, but attackers can still consume a victim identifier's failure budget for the configured window. Monitor production `AUTH_RATE_LIMIT_*` values and auth failure telemetry before tightening limits.
- Authorization guard parity now covers mapped sensitive admin/order/withdrawal paths, but broader object-level access tests should continue to be added as new protected resources are introduced.
- Google OAuth browser flow was unit-tested but not manually exercised against the real provider in a browser.
- Production deployment must provide non-local `PUBLIC_APP_ORIGIN` or explicit `ALLOWED_ORIGINS`, and a TLS Redis URL (`rediss://`), or startup will fail by design.
- Session TTL cleanup depends on MongoDB creating the new TTL index. Existing expired records will be removed by MongoDB after index creation and its normal TTL monitor cadence.

## 18. Manual checks still needed

Staging checklist:
- Real Google OAuth browser login: start at `/auth/login`, click Google sign-in, complete provider auth, confirm callback sets normal auth cookies and lands on `/play` or `/auth/complete-profile`.
- Invalid/missing OAuth state cookie callback: start OAuth in one browser, copy only the callback URL into a separate clean browser profile, and confirm redirect to `/auth/login?error=google` without session cookies.
- HTTPS cookie flags: in a production-like HTTPS environment, confirm access/refresh/device cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, host-only, and use the `__Host-` prefix. Confirm Google OAuth state cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, short-lived, and cleared after callback.
- Password reset link from real email: request reset, open the email link, confirm the URL token is removed from the address bar before/while submitting the new password, confirm old sessions are invalidated.
- Email verification link from real email: register a new account, open the verification email link, confirm token URL scrubbing and successful session creation.
- Magic link from real email: request a magic link, open it, confirm token URL scrubbing and successful login.
- Suspicious-login approval link from real email: trigger suspicious login approval in staging, open the approval email link, confirm token URL scrubbing and session creation only from a valid token.
- Production Redis TLS: deploy with `REDIS_URL=rediss://...`, confirm startup succeeds, then temporarily test a non-production-safe staging config with `redis://` under `NODE_ENV=production` and confirm startup fails before serving traffic.
- Concurrent refresh replay with real MongoDB/Redis: log in once, capture the refresh cookie in a controlled test client, send two concurrent `POST /api/auth/refresh` requests using the same cookie, confirm one succeeds and the other returns `SESSION_REPLAY_DETECTED` or invalidates subsequent session use.

## 19. Production rollout notes

- Set `PUBLIC_APP_ORIGIN` to the real HTTPS frontend origin and set `ALLOWED_ORIGINS` explicitly if more than one trusted origin is needed.
- Set `REDIS_URL` to a TLS URL beginning with `rediss://` in production.
- `POST /api/auth/login/password` now has both IP and hashed-identifier throttling. Keep `AUTH_RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX` conservative at first and monitor support reports for accidental short-window lockouts.
- Confirm MongoDB can create the `absoluteExpiresAt` TTL index on `authsessions`.
- Expect expired session records to be deleted after absolute expiry; active sessions are not invalidated by the TTL index.
- OAuth callback now requires the browser-bound state cookie set by `/api/auth/oauth/google/start`; reverse proxies must preserve cookies on the callback request.
- No public API response shapes were intentionally changed in this batch.

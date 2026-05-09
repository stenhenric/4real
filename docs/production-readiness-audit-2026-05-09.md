# Production Readiness Audit Report - 2026-05-09

## Executive Summary

This batch addressed the production-blocking issues confirmed during the baseline audit:

- Production dependency advisories in transitive `axios` and `ip-address` packages are remediated.
- Google OAuth callback processing now verifies ID tokens with Google's verifier instead of trusting a locally decoded JWT payload.
- Socket.IO now enforces origin allow-listing for WebSocket upgrades, not just HTTP long-polling CORS.
- Frontend runtime no longer depends on Google Fonts availability, which removed the Firefox E2E failure source.
- Blockchain transaction replay guards in `processed_txs` are durable; the legacy TTL index is removed during index setup.

## Critical Bugs Fixed

### Issue: Production dependency advisories

Impact: `npm audit --omit=dev` reported high/moderate advisories in production dependency paths: `axios@1.15.0` via `@ton/ton@16.2.4` and `ip-address@10.1.0` via `express-rate-limit@8.4.0`.

Best-practice reference: Node.js security best practices and Express production security guidance recommend keeping dependencies patched and actively monitoring third-party package vulnerabilities.

Files inspected: `package.json`, `package-lock.json`, dependency tree via `npm explain`.

Files changed: `package.json`, `package-lock.json`.

Fix: Upgraded `express-rate-limit` to `8.5.1`, added direct `google-auth-library`, and added an npm override forcing `axios@1.16.0`.

Tests: `npm audit --omit=dev --audit-level=moderate` reports `found 0 vulnerabilities`; full unit, integration, build, and E2E gates pass.

Regression risk: Low. The change is limited to patched dependency versions and verified through existing rate-limit, TON/payment, and E2E coverage.

Verification commands: `npm audit --omit=dev --audit-level=moderate`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`.

## Security Issues Fixed

### Issue: Google OAuth ID token was decoded but not verified

Impact: The service checked nonce after local JWT payload decoding, but did not cryptographically verify signature, issuer, audience, or expiry before trusting claims. A callback flow should only trust a verified ID token.

Best-practice reference: Google Identity "Verify the Google ID token on your server side"; OWASP ASVS authentication verification.

Files inspected: `server/services/google-oauth.service.ts`, `server/controllers/auth.controller.ts`, auth tests.

Files changed: `server/services/google-oauth.service.ts`, `server/services/google-oauth.service.test.ts`, `package.json`, `package-lock.json`.

Fix: Added `google-auth-library` `OAuth2Client.verifyIdToken`, kept existing PKCE/state/nonce behavior, validated nonce after verification, required verified email claims, and rejected mismatches between verified token identity and `userinfo`.

Tests: Added tests for verified token audience use, verifier rejection, nonce mismatch, and `userinfo` subject mismatch.

Regression risk: Medium. OAuth callback behavior is sensitive, but the public response contract and redirect behavior are unchanged.

Verification commands: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/services/google-oauth.service.test.ts`, plus full test gates.

### Issue: Socket.IO origin checks did not cover WebSocket upgrades

Impact: Socket.IO CORS settings apply to HTTP long-polling but do not block WebSocket upgrades by themselves. Without `allowRequest`, cross-origin socket upgrade attempts could reach authentication logic outside the intended browser origin boundary.

Best-practice reference: Socket.IO v4 CORS/security documentation; OWASP ASVS origin and cross-site request controls.

Files inspected: `server/runtime.ts`, `server/config/cors.ts`, `server/sockets/game.socket.ts`.

Files changed: `server/config/cors.ts`, `server/runtime.ts`, `server/middleware/security.middleware.test.ts`.

Fix: Added `getSocketAllowRequest()` and wired it into `new SocketIOServer({ allowRequest })`, reusing the existing `ALLOWED_ORIGINS` policy.

Tests: Added allow/deny tests for configured and disallowed socket origins.

Regression risk: Low to medium. Legitimate clients from configured origins continue to connect; unlisted origins now fail earlier.

Verification commands: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/security.middleware.test.ts`, plus full E2E.

## Financial Integrity Issues Fixed

### Issue: Processed blockchain transaction replay guards expired after 90 days

Impact: `processed_txs` had a TTL index on `processedAt`. If a deposit replay window or cursor reset covered old chain history after TTL expiry, the same chain transaction hash could be processed again unless another unique ledger row happened to block it.

Best-practice reference: OWASP ASVS data integrity controls, MongoDB production index management, TON transaction processing replay-safety expectations.

Files inspected: `server/repositories/processed-transaction.repository.ts`, `server/services/deposit-ingestion.service.ts`, `server/workers/deposit-poller.ts`, `server/workers/withdrawal-worker.ts`, TON payment tests.

Files changed: `server/repositories/processed-transaction.repository.ts`, `server/repositories/processed-transaction.repository.test.ts`, `package.json`.

Fix: Replaced the TTL `processedAt` index with a normal lookup index and added startup migration logic to drop the legacy TTL index if it exists.

Tests: Added repository tests proving durable index creation and legacy TTL index removal.

Regression risk: Low. Storage retention increases, but dedupe semantics become safer for financial processing.

Verification commands: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/repositories/processed-transaction.repository.test.ts`, full integration TON/payment tests.

## Endpoint Matrix

| Method | Path | Controller | Auth | Validation | Writes / External Calls | Idempotency | Rate Limit | Coverage / Fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | `createApp` | Public | None | Build/status read | No | General API not applied | Covered by app-health |
| GET | `/api/health/live` | `createApp` | Public | None | Build/status read | No | General API not applied | Covered indirectly |
| GET | `/api/health/ready` | `createApp` | Public | None | Redis/BullMQ/hot-wallet probes | No | General API not applied | Covered by app-health |
| GET | `/api/metrics` | `renderMetrics` | Public | None | Metrics render | No | General API not applied | No change |
| GET | `/tonconnect-manifest.json` | `createApp` | Public | None | Env-derived manifest | No | N/A | E2E smoke |
| POST | `/api/auth/register` | `AuthController.register` | Public | `registerRequestSchema` | User/email token/Gmail | No | Auth limiter | Existing auth tests |
| POST | `/api/auth/login/password` | `AuthController.loginPassword` | Public | `loginPasswordRequestSchema` | Sessions/security email | No | Auth limiter | Existing auth tests |
| POST | `/api/auth/login/magic-link/request` | `AuthController.requestMagicLink` | Public | `magicLinkRequestSchema` | One-time token/Gmail | No | Auth limiter | Existing auth tests |
| POST | `/api/auth/login/magic-link/consume` | `AuthController.consumeMagicLink` | Public token | `consumeMagicLinkRequestSchema` | Session cookies | Token single-use | Auth limiter | Existing auth tests |
| POST | `/api/auth/login/suspicious/consume` | `AuthController.consumeSuspiciousLogin` | Public token | `consumeSuspiciousLoginRequestSchema` | Session cookies | Token single-use | Auth limiter | Existing auth tests |
| GET | `/api/auth/oauth/google/start` | `AuthController.startGoogleOAuth` | Public | Query sanitization | Redis state, Google redirect URL | State single-use | General API | OAuth verification tests |
| GET | `/api/auth/oauth/google/callback` | `AuthController.handleGoogleCallback` | Public callback | Query checks | Google token/userinfo, user/session | State single-use | General API | OAuth verification fixed |
| POST | `/api/auth/email/verify/resend` | `AuthController.resendVerificationEmail` | Public | `emailVerificationResendRequestSchema` | Email token/Gmail | No | Auth limiter | Existing auth tests |
| POST | `/api/auth/email/verify/consume` | `AuthController.consumeVerificationEmail` | Public token | `consumeVerificationEmailRequestSchema` | User/session | Token single-use | Auth limiter | Existing auth tests |
| POST | `/api/auth/password/forgot` | `AuthController.requestPasswordReset` | Public | `forgotPasswordRequestSchema` | Email token/Gmail | No | Auth limiter | Existing auth tests |
| POST | `/api/auth/password/reset` | `AuthController.resetPassword` | Public token | `passwordResetRequestSchema` | Password/session revoke | Token single-use | Auth limiter | Existing auth tests |
| POST | `/api/auth/mfa/challenge` | `AuthController.completeMfaChallenge` | Challenge token | `mfaChallengeRequestSchema` | Session/step-up | Challenge single-use | Auth limiter | Existing auth tests |
| POST | `/api/auth/refresh` | `AuthController.refreshSession` | Refresh cookie | Cookie presence | Session rotate | Refresh token | Auth limiter | Existing auth tests |
| GET | `/api/auth/me` | `AuthController.me` | Session | None | User/session/balance read | No | General API | Existing auth tests |
| POST | `/api/auth/logout` | `AuthController.logout` | Cookie optional | None | Session revoke/cookie clear | Safe replay | General API | Existing auth tests |
| GET | `/api/auth/sessions` | `AuthController.listSessions` | Session | None | Session read | No | General API | Existing auth tests |
| DELETE | `/api/auth/sessions/:sessionId` | `AuthController.revokeSession` | Session + MFA | Param presence | Session revoke | No | General API | Existing auth tests |
| POST | `/api/auth/sessions/revoke-others` | `AuthController.revokeOtherSessions` | Session + MFA | None | Session revoke | No | General API | Existing auth tests |
| POST | `/api/auth/mfa/totp/setup` | `AuthController.startTotpSetup` | Session, step-up if enabled | None | MFA setup token | No | General API | Existing auth tests |
| POST | `/api/auth/mfa/totp/verify` | `AuthController.verifyTotpSetup` | Session | `mfaTotpVerifyRequestSchema` | MFA secret/codes | Setup token | General API | Existing auth tests |
| POST | `/api/auth/mfa/disable` | `AuthController.disableMfa` | Session + MFA | `mfaDisableRequestSchema` | MFA disable | No | General API | Existing auth tests |
| POST | `/api/auth/mfa/recovery-codes/regenerate` | `AuthController.regenerateRecoveryCodes` | Session + MFA | None | Recovery codes | No | General API | Existing auth tests |
| POST | `/api/auth/profile/complete` | `AuthController.completeProfile` | Session | `completeProfileRequestSchema` | Username update | No | General API | E2E/auth |
| GET | `/api/users/leaderboard` | `UserController.getLeaderboard` | Public | Query normalization in service | User read | No | General API | Existing query tests |
| GET | `/api/users/:userId` | `UserController.getProfile` | Public | Param presence/service checks | Public user read | No | General API | Existing privacy tests |
| GET | `/api/matches/active` | `MatchController.getActiveMatches` | Public | None | Cache/DB read | No | General API | E2E/match |
| POST | `/api/matches` | `MatchController.createMatch` | Verified session | `createMatchRequestSchema` | Match/ledger | Required | General API | Existing + E2E |
| POST | `/api/matches/:roomId/join` | `MatchController.joinMatch` | Verified session | Controller param/header checks | Match/ledger | Required | General API | Existing access tests |
| POST | `/api/matches/:roomId/resign` | `MatchController.resignMatch` | Verified session | Param check | Match/payout | Required | General API | E2E/match |
| GET | `/api/matches/user/:userId` | `MatchController.getUserHistory` | Verified session | Param presence/service filter | Match read | No | General API | Existing query tests |
| GET | `/api/matches/:roomId` | `MatchController.getMatch` | Verified session | Param/query checks | Match read | No | General API | Existing access tests |
| GET | `/api/orders/config` | `OrderController.getMerchantConfig` | Verified session | None | Config read | No | General API | E2E/merchant |
| GET | `/api/orders` | `OrderController.getOrders` | Verified session | User/admin scoping | Orders read | No | General API | E2E/merchant |
| POST | `/api/orders` | `OrderController.createOrder` | Verified session | Multipart parser + `createOrderRequestSchema` | Orders/ledger/Telegram/email | Required | General API | Existing order tests |
| PATCH | `/api/orders/:id` | `OrderController.updateOrder` | Admin + MFA | `updateOrderStatusRequestSchema` | Order/ledger/email | Transition guarded | General API | Existing order tests |
| GET | `/api/transactions` | `getUserTransactions` | Verified session | Query clamp | Ledger/deposit/withdraw read | No | General API | E2E/bank |
| GET | `/api/transactions/all` | `getAllTransactions` | Admin + MFA | Query clamp | Ledger read | No | General API | No change |
| GET | `/api/transactions/withdrawals/:withdrawalId` | `getWithdrawalStatusHandler` | Verified session | Param/user scope | Withdrawal read | No | General API | Existing payment tests |
| POST | `/api/transactions/deposit/memo` | `generateDepositMemoHandler` | Verified session | None | Memo create | Server-generated memo | General API | Existing payment tests |
| POST | `/api/transactions/deposit/prepare` | `prepareTonConnectDepositHandler` | Verified session | `prepareTonConnectDepositRequestSchema` | Memo/TonConnect payload | Memo bound to user | General API | Existing payment tests |
| POST | `/api/transactions/withdraw` | `requestWithdrawalHandler` | Verified session + MFA | `withdrawRequestSchema` | Balance/withdrawal/email | Required | Withdrawal limiter | Existing payment tests |
| GET | `/api/admin/merchant/config` | `MerchantAdminController.getConfig` | Admin + MFA | None | Config read | No | General API | E2E/merchant |
| PATCH | `/api/admin/merchant/config` | `MerchantAdminController.updateConfig` | Admin + MFA | `updateMerchantConfigRequestSchema` | Config/audit | No | General API | Existing merchant tests |
| GET | `/api/admin/merchant/dashboard` | `MerchantAdminController.getDashboard` | Admin + MFA | None | Cache/dashboard read | No | General API | Existing merchant tests |
| GET | `/api/admin/merchant/orders` | `MerchantAdminController.getOrders` | Admin + MFA | Query clamp | Dashboard read | No | General API | Existing merchant tests |
| GET | `/api/admin/merchant/deposits` | `MerchantAdminController.getDeposits` | Admin + MFA | Query clamp | Deposit reviews read | No | General API | Existing deposit tests |
| POST | `/api/admin/merchant/deposits/replay-window` | `MerchantAdminController.replayDepositWindow` | Admin + MFA | `merchantDepositReplayWindowRequestSchema` | Toncenter/deposit ingestion | Durable tx hashes | General API | Existing payment tests |
| POST | `/api/admin/merchant/deposits/:txHash/reconcile` | `MerchantAdminController.reconcileDeposit` | Admin + MFA | `merchantDepositReconcileRequestSchema` | Deposit/balance/audit/email | Resolution guarded | General API | Existing deposit tests |

## Frontend Issues Fixed

### Issue: Runtime Google Fonts dependency broke Firefox E2E

Impact: Firefox logged a downloadable font failure from `fonts.gstatic.com`, causing the public route smoke test to fail. The app should not require a third-party font response for primary route rendering.

Best-practice reference: Twelve-Factor dependency/config discipline, frontend production reliability, and security guidance to minimize unnecessary third-party runtime dependencies.

Files inspected: `src/index.css`, `tests/e2e/page-smoke.spec.ts`.

Files changed: `src/index.css`, `server/middleware/frontend-contracts.test.ts`.

Fix: Removed the Google Fonts import and used a local/system handwritten font stack.

Tests: Added a frontend contract test that rejects `fonts.googleapis.com`/`fonts.gstatic.com` in the stylesheet. Full Playwright suite now passes.

Regression risk: Low. Visual typography may vary by OS, but route rendering no longer depends on network font loading.

Verification commands: `npm run test:e2e`.

## Dead Code Removed

No dead code was removed in this batch. No removal was made without import/runtime proof.

## Duplicates Removed

No duplicate code was removed in this batch.

## Tests Added Or Updated

- `server/services/google-oauth.service.test.ts`
- `server/repositories/processed-transaction.repository.test.ts`
- `server/middleware/security.middleware.test.ts`
- `server/middleware/frontend-contracts.test.ts`
- `package.json` `test:unit` command updated to include new tests.

## Best-Practice References Used

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Cheat Sheet Series: https://cheatsheetseries.owasp.org/
- Express production security: https://expressjs.com/en/advanced/best-practice-security.html
- Node.js security best practices: https://nodejs.org/en/learn/getting-started/security-best-practices
- MongoDB production notes: https://www.mongodb.com/docs/manual/administration/production-notes/
- Socket.IO security and CORS guidance: https://socket.io/docs/v4/security/ and https://socket.io/docs/v4/handling-cors/
- TON documentation: https://docs.ton.org/
- Google OAuth ID token verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/
- BullMQ documentation: https://docs.bullmq.io/
- Twelve-Factor App: https://12factor.net/
- OpenTelemetry documentation: https://opentelemetry.io/docs/

## Remaining Risks

- The local untracked `.env` still causes Vite to warn that `NODE_ENV=production` is unsupported in `.env`. The build exits successfully, but local/prod env files should move `NODE_ENV` assignment to process launch configuration.
- This batch fixed the confirmed production blockers from the approved plan. A deeper manual business-logic audit could still inspect every non-touched frontend state and every admin query variant beyond the automated suites.

## Commands Run And Results

- `npm ls --depth=0`: passed before changes.
- `npm run lint`: passed before changes and after changes.
- `npm run test:unit`: passed before changes with 71 tests; passed after changes with 80 tests.
- `npm run test:integration`: passed before changes with 122 tests; passed after changes with 125 tests.
- `npm run build`: passed before changes and after changes; Vite emitted the local `.env` `NODE_ENV=production` warning.
- `npm audit --omit=dev --audit-level=moderate`: failed before changes with 4 vulnerabilities; passed after changes with `found 0 vulnerabilities`.
- `npm run test:e2e`: before changes timed out with Firefox remote-font console failure captured; after changes passed 21 tests across Chromium, Firefox, and WebKit in 5.1 minutes.

## Files Changed

- `package.json`
- `package-lock.json`
- `server/config/cors.ts`
- `server/runtime.ts`
- `server/services/google-oauth.service.ts`
- `server/services/google-oauth.service.test.ts`
- `server/repositories/processed-transaction.repository.ts`
- `server/repositories/processed-transaction.repository.test.ts`
- `server/middleware/security.middleware.test.ts`
- `server/middleware/frontend-contracts.test.ts`
- `src/index.css`
- `docs/production-readiness-audit-2026-05-09.md`

## Recommended Next Steps

- Remove `NODE_ENV=production` from the local `.env` file and set it in the production process manager or deployment environment.
- Run a separate, time-boxed second audit focused on authorization edge cases in merchant/admin query filters and game-room reconnect abuse scenarios.
- Add CI jobs for `npm audit --omit=dev --audit-level=moderate`, `npm run test:unit`, `npm run test:integration`, `npm run build`, and Playwright browser smoke tests.

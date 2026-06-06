# Logic Completeness and Flawed Logic Audit

## Audit Summary

- **Date:** 2026-06-06
- **Codebase:** `C:\Users\Sten.DESKTOP-JT1I9N4\OneDrive\Desktop\4realmain`
- **Branch/commit:** `main`, baseline HEAD `9cc3a30` (`update deposit`), local branch one commit ahead of `4real/main`
- **Auditor:** Codex main auditor plus six focused subagents
- **Tools used:** repository search and source inspection, focused subagents, Node test runner, TypeScript, Vite production build, Playwright Chromium, Git diff validation
- **Tests run:** focused unit tests (17 passed), focused integration tests (77 passed), targeted TON/money integrity tests (2 passed), focused Chromium journeys (3 passed), `npm run typecheck`, `npm run build`, `git diff --check`
- **Areas inspected:** frontend routes/state/reducers, API routes/controllers, auth/session/MFA, deposits, withdrawals, balances, idempotency, orders, matches, rating, Socket.IO, Redis state, Mongo transactions/indexes, workers, test coverage, production configuration gates
- **Areas not inspected live:** production Mongo/Redis/TON provider state, real multi-instance load behavior, external email/provider availability, full cross-browser E2E suite, full load/k6 suite
- **Overall risk level:** **High residual risk** because three evidence-backed concurrency/auth findings remain unresolved. No confirmed Critical finding remained after validation.

## System Map

| Area | Implementation and source of truth |
| --- | --- |
| Frontend | React 19 + Vite + React Router. Primary routes are registered in `src/app/App.tsx`. Critical screens include Bank, Game, Merchant, Dashboard, and Auth/Security pages. |
| API | Express routes under `server/routes`, controllers under `server/controllers`, and business rules under `server/services`. |
| Primary database | MongoDB through Mongoose plus direct Mongo collection repositories. Transactions protect money, order, match settlement, rating, and idempotency mutations. |
| Cache/session/coordination | Redis stores access-token state, used-refresh markers, MFA challenges, withdrawal intents, rate-limit state, Socket.IO room state, and distributed room locks. |
| Auth model | Opaque cookie tokens. Redis access/refresh state is checked against durable Mongo `AuthSession` and the live `User` record. |
| Authorization | Route middleware enforces authentication, verified account, admin role, and MFA step-up. Object ownership generally derives from `req.user.id`. |
| Money model | `user_balances` is the balance source of truth. Deposits and withdrawals have durable collections; legacy/activity ledger entries use `Transaction`. |
| Deposit model | Memo generation -> TonConnect/manual payment -> Toncenter polling/streaming -> memo claim -> processed transaction -> deposit -> balance credit. |
| Withdrawal model | Review -> MFA-bound Redis intent -> idempotent Mongo mutation -> atomic balance hold -> queued withdrawal -> send/confirm/recovery workers. |
| Order model | P2P BUY/SELL order state, proof validation, balance hold/refund/credit, ledger, and audit are coordinated transactionally. |
| Game model | Match create/join -> wager holds -> Socket.IO room/moves -> Mongo move history -> settlement -> rating event/stat updates -> payout/refund. |
| Workers | Deposit poll/replay, withdrawal send/confirm/recovery, order-proof relay, stale-match expiry, hot-wallet monitoring. |
| External integrations | TonConnect, Toncenter/TON chain, Gmail/product email, Google OAuth, Cloudflare Turnstile, Socket.IO Redis adapter. |

### Key Models and Collections

- `User`, `AuthSession`, `UserBalance`, `Transaction`
- `deposit_memos`, `deposits`, `processed_txs`, `unmatched_deposits`, `failed_deposit_ingestions`
- `withdrawals`, `idempotency_keys`, `audit_events`
- `Order`, `Match`, `RatingEvent`

### Key Routes

- `/api/auth/*`: register, login, OAuth, refresh, MFA, recovery codes, sessions, logout
- `/api/transactions/*`: feed, deposit memo/status/prepare, withdrawal request/status
- `/api/orders/*`: user order create/list and admin transitions
- `/api/matches/*`: create, join, resign, history, accessible match
- `/api/admin/*`: merchant operations, deposit replay/reconciliation, withdrawal recovery

## Critical Flow Map

| Flow | Expected behavior | Actual source of truth | Risk notes |
| --- | --- | --- | --- |
| Login/session refresh | Rotate tokens without accepting replay or revoking legitimate sessions after a local partial failure | `AuthSessionService`, Redis used-refresh markers, Mongo `AuthSession` | Residual high-risk partial-failure ordering issue remains. |
| MFA enrollment/recovery | Only the legitimate recently authenticated user can bind MFA; recovery-code replacement must always deliver the new set | Auth routes/controller, `AuthMfaService`, Redis challenges, `User.mfa` | Recovery-code delivery failure was fixed. First-time enrollment still lacks fresh authentication. |
| Deposit | Credit exactly once when a valid on-time transfer reaches the hot wallet | Toncenter transfer, durable memo ownership, `processed_txs`, `deposits`, `user_balances` | Delayed on-time memo recovery, false failure reporting, duplicate outcome reporting, expired UI, and manual tracking were fixed. Exact prepared-amount policy still needs clarification. |
| Withdrawal | Require MFA, be safely retryable, enforce balance and daily limits, and never downgrade terminal state | Redis withdrawal intent, Mongo idempotency transaction, `user_balances`, `withdrawals`, workers | Intent compensation and terminal CAS were fixed. Daily-limit concurrency remains unresolved. |
| P2P order | Hold/credit/refund exactly once and keep order, ledger, balance, and audit consistent | `OrderService` Mongo transaction and unique proof/code constraints | Core state transitions were consistent. Duplicate-code `allow` policy needs clarification. |
| Match | Lock wagers, serialize moves, persist authoritative state, settle/rate once, and notify both players | Mongo `Match`, Redis room state/lock, `RatingEvent`, balance/ledger | Session parallelism, stale room moves, lock renewal, room notification, and room-id entropy were fixed. Zero-move timeout policy needs clarification. |
| Transaction feed | Return a stable page plus an accurate total | Legacy transactions plus deposits and withdrawals | User feed total was fixed. Admin legacy-only listing intent needs clarification. |

## Findings by Severity

### Critical Findings

No confirmed Critical findings remained after false-positive validation.

### High Findings - Unresolved

## High - Confirmed: Daily withdrawal limit is not concurrency-safe

**Category:** Race condition / payment / database consistency

**Affected files:**
- `server/services/withdrawal-service.ts:59`
- `server/services/withdrawal-service.ts:72`
- `server/repositories/withdrawal.repository.ts:190`
- `server/controllers/transaction.controller.ts:174`

**Current behavior:** `requestWithdrawal` aggregates the user's already-accounted withdrawals, compares the result with `DAILY_WITHDRAWAL_LIMIT_USDT`, and only then inserts the new queued withdrawal.

**Why this is flawed or incomplete:** The aggregate check and queued insertion are not protected by a per-user/day reservation row, compare-and-set counter, or cross-request lock. Two different valid requests can read the same total before either insert is visible.

**Reachable scenario:**
1. A user has 10 USDT remaining under the daily limit and sufficient balance.
2. The user submits two authorized withdrawals concurrently with different idempotency keys.
3. Both transactions read the same accounted total and each approves an 8 USDT withdrawal.
4. Both queued withdrawals can commit.

**Impact:** The configured daily withdrawal risk limit can be exceeded under production concurrency.

**Evidence:** `WithdrawalRepository.sumAccountedRawBetween` is called before `WithdrawalRepository.createQueued`; idempotency protects one request key, not two separately valid requests.

**Best-practice reference:** [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/), [MongoDB Node.js Driver Transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)

**False-positive check:** Atomic balance deduction prevents overspending the wallet balance, but it does not enforce the independent daily-limit invariant.

**Suggested fix direction:** Maintain a per-user/per-day withdrawal reservation counter updated with an atomic conditional predicate in the same transaction, or serialize withdrawal admission by user/day with a durable renewable lock and explicit retry response.

**Regression test needed:** Run two real Mongo withdrawal transactions concurrently near the limit and assert exactly one commits and the accounted total stays within the configured cap.

**Severity rationale:** High because it violates a money-risk control but does not independently create funds or bypass the available-balance check.

## High - Confirmed: First-time MFA enrollment does not require fresh authentication

**Category:** Authorization / auth / MFA

**Affected files:**
- `server/routes/auth.routes.ts:86`
- `server/routes/auth.routes.ts:87`
- `server/middleware/auth.middleware.ts:120`
- `server/controllers/auth.controller.ts:843`

**Current behavior:** MFA setup uses `requireMfaStepUpIfEnabled`, which intentionally skips step-up for accounts that do not already have MFA. The setup endpoint returns a secret and the verify endpoint enables MFA.

**Why this is flawed or incomplete:** Possession of any active non-MFA session is sufficient to bind attacker-controlled MFA and recovery codes. No password confirmation or recent-auth marker is required.

**Reachable scenario:**
1. An attacker gains access to an unlocked browser or stolen active session.
2. The account does not already have MFA.
3. The attacker calls TOTP setup, verifies their authenticator, and stores attacker-controlled recovery codes.

**Impact:** Persistent account takeover and possible victim lockout.

**Evidence:** The route guard explicitly allows first-time setup without step-up; existing integration coverage confirms that behavior.

**Best-practice reference:** [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [CISA Secure by Design](https://www.cisa.gov/securebydesign)

**False-positive check:** This is not a theoretical MFA warning; the current route and middleware produce the reachable binding path.

**Suggested fix direction:** Require password reauthentication or a short-lived fresh-auth proof bound to the current session before issuing or verifying the first TOTP secret.

**Regression test needed:** A normal authenticated but non-fresh session must be rejected by both setup and verification; a fresh-authenticated session must succeed.

**Severity rationale:** High because it provides a realistic persistence path after session compromise.

## High - High confidence: Refresh rotation can convert a legitimate retry into replay revocation

**Category:** Auth / retry logic / distributed consistency

**Affected files:**
- `server/services/auth-session.service.ts:655`
- `server/services/auth-session.service.ts:676`
- `server/services/auth-session.service.ts:693`
- `server/services/auth-session.service.ts:717`

**Current behavior:** Refresh rotation writes the used-refresh marker and removes old access state before the durable Mongo rotation and new Redis access state are fully complete. A later request that sees the used marker revokes all user sessions as replay.

**Why this is flawed or incomplete:** Redis and Mongo are updated in an order that has no compensation or grace state. A transient process, Redis, Mongo, or response failure can leave the client holding the old cookie after the server marked it as replayed.

**Reachable scenario:**
1. A legitimate refresh begins.
2. The used-refresh marker is persisted.
3. Mongo rotation, new access-state creation, or response delivery fails.
4. The browser retries the old cookie.
5. The server treats the retry as malicious replay and revokes all sessions.

**Impact:** Multi-device logout and avoidable auth outage during a transient local failure.

**Evidence:** The used marker is written before the durable rotation/new access state, and reuse detection calls `revokeAllSessionsForUser`.

**Best-practice reference:** [Stripe on robust idempotent APIs](https://stripe.com/blog/idempotency), [Redis Production Usage](https://redis.io/docs/latest/develop/clients/)

**False-positive check:** The failure window is explicit in the operation ordering; no compensating rollback or retry-grace record was found.

**Suggested fix direction:** Introduce a staged rotation record or short retry grace that can replay the already-created successor token response, and only classify the old token as hostile reuse after a completed rotation state is durable.

**Regression test needed:** Force failure after the used marker but before new cookies/state are delivered, retry the old token, and assert that the legitimate retry does not revoke all sessions.

**Severity rationale:** High because it can repeatedly break the primary authentication journey and revoke unrelated sessions.

### High and Medium Findings - Fixed and Verified During Audit

| Severity | Finding and evidence | Fix applied | Regression/verification |
| --- | --- | --- | --- |
| High | Redis withdrawal intent was consumed inside a retryable Mongo transaction and lost on abort (`transaction.controller.ts`, `withdrawal-intent.service.ts`). | Reuse the consumed intent across transaction callback retries and restore it with remaining TTL after failed mutation. | Withdrawal intent restore unit test passed; typecheck/build passed. |
| High | Stale worker paths could overwrite a confirmed withdrawal or refund after state changed (`withdrawal.repository.ts`, `withdrawal-worker.ts`). | Added compare-and-set status/confirmation guards and abort refund when the failed transition no longer applies. | Targeted withdrawal CAS integration test passed. |
| High | Match/rating used `Promise.all` on the same Mongo session (`match.service.ts`, `rating.service.ts`). | Session-bound reads and writes now execute sequentially. | Match/rating integration tests and typecheck passed. |
| High | A stale cached room could accept a duplicate/out-of-turn move and emit state that Mongo rejected (`realtime-match.service.ts:165`, `match.service.ts:444`). | Refresh cached room on DB drift, make move-history persistence return a match result, and resync on failed persistence. | Realtime stale-move regression passed. |
| High | Distributed room lock had a fixed 5-second lease with no renewal (`game-room-registry.service.ts:28`). | Added ownership-checked Redis lock renewal while the task runs. | Long-running distributed room-lock regression passed. |
| High | REST join/resign and background expiry did not push authoritative room completion/activation (`public-match-events.ts:31`, `match.controller.ts:112`). | Added failure-isolated post-commit room snapshots and `game-started`/`game-over` events. | Match/realtime integration tests and build passed. |
| High | Six-character match room IDs had material birthday-collision risk with no retry (`match.service.ts:149`). | Increased generated IDs to 64 bits / 16 hex characters. | Collision-resistance regression passed. |
| High | On-time deposits could become uncreditable when the memo TTL deleted ownership before delayed ingestion (`deposit-memo.repository.ts:5`). | Retain expired memo ownership for seven days while validity is still evaluated against the transfer timestamp. | Index migration/retention unit test passed. |
| High | Post-commit deposit notification failure could be reported as failed ingestion (`deposit-ingestion.service.ts:223`). | Notification failure remains logged but no longer throws after committed credit. | Typecheck, integration paths, and build passed. |
| High | Duplicate concurrent deposit ingestion could report `credit` even when the mutation lost the unique-key race (`deposit-ingestion.service.ts:721`). | Non-applied credit/unmatched outcomes are now reported as `already_processed`. | Typecheck and deposit integration paths passed. |
| High | Recovery-code hashes could be replaced before an audit write failed, causing a 500 before codes were returned (`auth-mfa.service.ts:184`). | Audit failure is logged after the security mutation without blocking delivery of the newly stored codes. | Recovery-code audit-failure regression passed. |
| High | Manual-wallet deposit was advertised but had no way to enter confirmation polling (`DepositPanel.tsx:546`). | Added an explicit "I've sent it" action that enters the same pending/status flow. | Bank Chromium journey passed. |
| Medium | Admin replay `dryRun: "false"` was coerced to `true` (`request-schemas.ts:259`). | Require an actual JSON boolean. | Validation regression passed. |
| Medium | Deposit API status `expired` was ignored by the reducer/UI (`depositFlowReducer.ts:138`). | Stop polling, preserve the amount, and require fresh payment details. | Reducer regression passed. |
| Medium | Game page catch blocks overrode handled auth redirects with `/play` navigation (`GamePage.tsx:678`). | Ignore errors already handled by the global auth redirect flow. | Focused Chromium redirect journey passed. |
| Medium | Withdrawal MFA used unsanitized `returnTo` (`WithdrawalMfaPage.tsx:42`). | Apply the shared internal-path sanitizer and preserve safe query/hash state. | Focused Chromium external-return journey passed. |
| Medium | User transaction feed `total` represented the fetched window, not all available items (`transaction.service.ts:95`). | Count each durable source and return the summed total. | Transaction service/controller regression passed. |

## Findings by Domain

### Auth/session/MFA

- **Unresolved:** first-time MFA enrollment fresh-auth requirement; refresh rotation partial-failure behavior.
- **Fixed:** recovery-code regeneration no longer strands the user after an audit failure; withdrawal MFA return path is sanitized.
- **Validated protections:** live database principal determines admin role; sensitive admin routes require verified account, admin role, and MFA step-up; logout/revocation and cookie controls are materially present.

### Frontend State and UX Logic

- **Fixed:** expired deposit state, manual-wallet confirmation entry, handled game auth redirects, withdrawal MFA return path.
- **Validated protections:** withdrawal duplicate submission/idempotency state and MFA resume logic have focused reducer/E2E coverage.

### Backend API and Service Logic

- **Fixed:** strict replay boolean validation and accurate transaction-feed total.
- **Validated protections:** ownership generally derives from `req.user.id`; withdrawal status lookup is user-scoped; multipart order creation still validates its parsed payload.

### Payment/Deposit/Withdraw/Ledger

- **Unresolved:** daily withdrawal limit concurrency.
- **Fixed:** withdrawal intent compensation, withdrawal terminal CAS, delayed memo retention, post-commit notification behavior, duplicate ingestion reporting, manual deposit status flow.
- **Validated protections:** balance debit/credit uses atomic repository updates; deposit `txHash` and processed transaction uniqueness prevent double credit; order finalization is transactional.

### Game/Match/ELO/Settlement

- **Fixed:** same-session parallel operations, stale cached moves, non-renewed distributed lock, non-socket room events, short room IDs.
- **Validated protections:** self-join is blocked, wagers use atomic balance deductions, and `RatingEvent.matchId` uniqueness prevents duplicate rating application.

### Database/Concurrency/Cache

- **Unresolved:** daily withdrawal limit admission race.
- **Fixed:** compare-and-set withdrawal transitions, room-lock renewal, memo retention index migration, sequential session operations.
- **Validated protections:** processed deposits, order transaction codes, rating events, and room IDs have uniqueness constraints.

### Background Workers/Retries

- **Fixed:** stale withdrawal worker state can no longer downgrade confirmed state; post-commit email failure no longer creates a false failed-ingestion path; room lock renews during slow work.
- **Residual risk:** production multi-instance behavior still needs real Mongo/Redis concurrency tests.

### Testing Gaps

- No real multi-request test proves the daily withdrawal cap under concurrency.
- No failure-injection test proves refresh rotation recovery after each Redis/Mongo/response boundary.
- No test enforces a fresh-auth policy for first-time MFA enrollment because the product currently allows it.
- Full `ton-payments.test.ts`, full integration suite, all-browser E2E, and load tests were not completed in this audit run.

## Needs Clarification

1. **MFA challenge retry policy:** `AuthController` consumes the challenge before factor verification (`auth.controller.ts:871`, then verification at `auth.controller.ts:877`). Is one typo intentionally supposed to burn the challenge, or should it retain a bounded attempt counter?
2. **Disabled/suspended accounts:** `User` has no disabled/suspended business state. Confirm whether account suspension is intentionally absent.
3. **Deposit exact-amount policy:** TonConnect prepares an amount, but memo ownership does not persist an expected amount and ingestion credits the actual on-chain amount. Confirm underpayment/overpayment rules.
4. **Admin `/api/transactions/all`:** the endpoint returns only legacy `Transaction` documents, not durable deposit/withdrawal collections. Confirm whether it is a legacy activity view or intended as a complete ledger.
5. **M-Pesa duplicate policy:** configuration supports `MPESA_CODE_DUPLICATE_POLICY=allow`, while the order model has a unique partial index on `transactionCodeNormalized`. Confirm whether `allow` is still a supported production mode.
6. **Zero-move active timeout:** after a guest joins, an active match with zero moves times out the player whose turn it is. Confirm whether this should be a rated/wagered loss or a no-contest until both realtime participants are present.
7. **Audit durability policy:** recovery codes now remain deliverable when the audit store fails. Confirm whether security audit events require an outbox/retry queue rather than best-effort logging.

## False Positives Avoided

- No double-credit finding was reported for normal deposit replay because `processed_txs.txHash` is uniquely constrained and balance credit is inside the transaction.
- No generic double-spend finding was reported because balance deduction uses atomic conditional updates.
- No duplicate P2P finalization finding was reported because order state, balance, ledger, and audit changes are transactionally coordinated.
- No admin-role bypass was reported; admin authorization is enforced server-side from the live principal.
- No cross-user withdrawal-status leak was reported; lookup is scoped by withdrawal ID and authenticated user ID.
- No private-match access leak was reported; participant/invite-token checks are enforced server-side.
- No JWT algorithm finding was reported because the application uses opaque stateful tokens rather than JWT access tokens.
- No PostgreSQL finding was reported because PostgreSQL is not used in this codebase.
- The M-Pesa `allow` policy mismatch and admin all-transactions scope were kept under clarification instead of being presented as confirmed bugs.

## Recommended Regression Test Plan

1. **Money/concurrency:** real Mongo test for two withdrawals near the daily cap; stale worker confirm-vs-refund races; withdrawal intent failure at each transaction boundary.
2. **Auth:** first-time MFA fresh-auth enforcement; refresh rotation failure injection before/after every Redis/Mongo write; legitimate retry versus hostile replay.
3. **Deposits:** delayed on-time transfer after memo expiry; duplicate-key loser returns `already_processed`; notification failure after committed credit; manual wallet pending-to-confirmed E2E.
4. **Matches:** real Mongo transaction join/rating test; two-node move race; REST join activation broadcast; resign/expiry room game-over event; zero-move timeout policy.
5. **Frontend:** handled auth redirect produces no fallback toast/navigation; expired deposit restart; safe withdrawal return path.
6. **Operations:** multi-instance Redis/Mongo load test and k6 scenarios for withdrawal, refresh, match move, and deposit replay endpoints.

## Suggested Fix Order

1. Make the daily withdrawal cap atomic under concurrency.
2. Require fresh authentication before first-time MFA enrollment.
3. Redesign refresh rotation so legitimate retries cannot be classified as replay after a local partial failure.
4. Resolve and encode the MFA challenge retry, deposit exact-amount, admin ledger, M-Pesa duplicate, and zero-move timeout policies.
5. Add real multi-instance concurrency and failure-injection coverage before production rollout.

## Verification Evidence

- `npm run typecheck` - passed
- `npm run build` - passed
- Focused unit run - 17 passed
- Focused integration run - 77 passed
- Targeted TON/money integrity regressions - 2 passed
- Focused Playwright Chromium run - 3 passed
- `git diff --check` - passed
- A combined broad `ton-payments.test.ts` run timed out; the new targeted memo-retention and withdrawal-transition tests passed independently.

## Appendix: Subagent Reports

| Subagent | Scope | Main contribution |
| --- | --- | --- |
| Franklin | Backend/API | Recovery-code post-write failure, replay boolean coercion, transaction total contract |
| Beauvoir | Auth/session/MFA | First-time MFA enrollment and refresh-rotation partial-failure findings |
| Leibniz | Payments/wallet/ledger | Withdrawal intent loss, delayed memo deletion, deposit notification/duplicate reporting |
| Kierkegaard | Match/game/ELO | Non-socket room sync, same-session transaction work, room-lock lease, room ID entropy |
| Hume | Frontend state/UX | Expired deposit, handled auth redirect, manual deposit tracking, withdrawal return path |
| Popper | Database/concurrency/testing | Daily-limit race, withdrawal terminal-state races, transaction/session and lock risks |

## Appendix: Official References Used

- [NIST Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final)
- [CISA Secure by Design](https://www.cisa.gov/securebydesign)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Express Production Security](https://expressjs.com/en/advanced/best-practice-security/)
- [Node.js Security Best Practices](https://nodejs.org/learn/getting-started/security-best-practices)
- [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [MongoDB Node.js Driver Transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)
- [Mongoose Transactions](https://mongoosejs.com/docs/transactions.html)
- [Redis Production Usage](https://redis.io/docs/latest/develop/clients/)
- [React: Choosing State Structure](https://react.dev/learn/choosing-the-state-structure)
- [React: Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles/)
- [Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe on robust idempotent APIs](https://stripe.com/blog/idempotency)

# Production Fixes Report

Date: 2026-05-31

## 1. Summary

The confirmed P0 launch blockers from `production-readiness-review.md` were fixed first, then the listed P1 real-money beta blockers were addressed.

Fixed:

- C1: Withdrawal MFA resume intents now consume atomically and are bound to the submitted idempotency key, user, amount, address, and authorization state.
- C2: TON withdrawal send ambiguity after possible broadcast now moves withdrawals to a stuck/broadcast-unknown reconciliation state with no automatic retry or refund.
- C3: Withdrawal confirmation accounting now runs only when the terminal status transition succeeds, with idempotent already-confirmed handling.
- H2: Clean install/build/test/audit gates are green on the final workspace.
- H1: Production static serving denies compiled server output and source map probe paths.
- H3-H11: The requested P1 blockers were fixed: MFA login parity, active match expiry race, Socket.IO distributed transport safety, M-Pesa proof durability before Telegram relay, BullMQ retry semantics, money-state metrics, duplicate frontend money submits, guarded balance backfill, and withdrawal same-key replay after consumed MFA intent.

What remains:

- Chrome DevTools MCP runtime testing could not be completed because the local Browser/Node REPL MCP failed to initialize its kernel assets. Playwright runtime/e2e verification was used instead and is green.
- Public-launch P2/compliance hardening was not separately scoped in the report. This work makes production launch and controlled real-money beta safer, but public launch still needs a separate P2/compliance signoff.

Production launch is safer because the confirmed money-loss race conditions now have atomic guards, safe terminal transitions, stuck-state reconciliation, deny-listed server artifact serving, and regression coverage.

Real-money beta is no longer blocked by the listed P0/P1 findings, assuming testnet/mocked TON verification remains the test posture and production environment/secret/wallet controls are reviewed separately before live funds.

## 2. Files Changed

| Path | Reason changed | Summary of change |
| --- | --- | --- |
| `package.json` | Gate coverage | Added the balance backfill unit test to the unit test command. |
| `package-lock.json` | Supply-chain gate | Applied `npm audit fix --omit=dev`; final production audit reports zero vulnerabilities. |
| `server/controllers/auth.controller.ts` | H3 | Centralized MFA-aware session issuance for password, magic link, Google OAuth, and suspicious-login flows. |
| `server/controllers/order.controller.ts` | H6 | Persists proof metadata before accepting/relaying M-Pesa proof orders. |
| `server/controllers/transaction.controller.ts` | C1/H11 | Reordered withdrawal resume idempotency replay before destructive intent consumption and enforced intent binding. |
| `server/http/frontend.ts` | H1 | Added explicit production/static deny handling for `/server` artifact paths. |
| `server/models/Order.ts` | H6 | Added durable proof upload metadata fields. |
| `server/repositories/withdrawal.repository.ts` | C3 | Terminal transition methods now expose transition success/failure instead of returning void. |
| `server/runtime.ts` | H5 | Uses shared websocket-only Socket.IO transport policy. |
| `server/scripts/backfill-balance-atomic.ts` | H10 | Reworked script as dry-run by default, guarded production execution, and conditional/idempotent atomic backfill. |
| `server/serializers/api.ts` | H6 | Serializes proof upload metadata for authorized admin/review surfaces. |
| `server/services/auth-mfa.service.ts` | H3 | Carries login MFA redirect metadata through challenge creation. |
| `server/services/background-jobs.service.ts` | H7 | BullMQ processors now rethrow after recording failure so BullMQ retry/DLQ behavior works. |
| `server/services/match.service.ts` | H4 | Stale expiry settlement now rechecks active status and stale activity in the guarded update path. |
| `server/services/metrics.service.ts` | H8 | Added counters for terminal failed deposits, stuck withdrawals, and failed proof relays. |
| `server/services/order-proof-relay.service.ts` | H6/H8 | Records failed proof relay metrics without making Telegram the proof source of truth. |
| `server/services/order.service.ts` | H6 | Stores proof checksum, MIME, size, storage key, uploader, and timestamp before relay. |
| `server/services/withdrawal-engine.ts` | C2 | Separates pre-broadcast failures from post-broadcast unknown outcomes and throws a typed broadcast-unknown error. |
| `server/services/withdrawal-intent.service.ts` | C1 | Implements atomic consume with Redis `GETDEL` and Lua fallback plus expectation binding. |
| `server/services/withdrawal-recovery.service.ts` | C2/C3 | Reconciliation confirmation/refund paths are idempotent and gated on safe terminal transitions. |
| `server/workers/failed-deposit-replay-worker.ts` | H8 | Emits terminal failed deposit metrics. |
| `server/workers/withdrawal-worker.ts` | C2/C3/H8 | Prevents auto-retry/refund after possible broadcast, marks stuck, and gates confirmation accounting on transition success. |
| `shared/socket-config.ts` | H5 | New shared websocket-only Socket.IO transport policy. |
| `shared/types/api.ts` | H6 | Adds proof upload DTO fields. |
| `src/features/bank/MerchantPanel.tsx` | H9 | Adds synchronous duplicate-submit guard and stable in-flight idempotency keys for merchant money actions. |
| `src/features/bank/WithdrawPanel.tsx` | H9/H11 | Adds synchronous duplicate-submit guard and stable withdrawal idempotency key reuse through retry. |
| `src/pages/auth/MagicLinkPage.tsx` | H3 | Routes MFA-required magic-link responses to the MFA challenge flow. |
| `src/pages/auth/WithdrawalMfaPage.tsx` | C1/H11 | Preserves the withdrawal idempotency key through MFA resume. |
| `src/services/matches.service.ts` | H5 | Aligns client match/socket calls with transport policy expectations. |
| `src/services/orders.service.ts` | H9 | Accepts caller-provided idempotency keys for order creation. |
| `src/services/transactions.service.ts` | C1/H11 | Carries idempotency metadata through withdrawal resume requests. |
| `src/services/users.service.ts` | H5 | Minor client service typing/import adjustment from shared policy work. |
| `src/sockets/gameSocket.ts` | H5 | Uses websocket-only Socket.IO transports. |
| `tests/e2e/harness/server.mjs` | H1/manual verification | Denies `/server` artifact paths in the e2e production harness. |
| `tests/e2e/match.spec.ts` | H4/H9 | Adds/adjusts race and duplicate-submit coverage around matches. |
| `tests/e2e/merchant.spec.ts` | H9 | Adds merchant rapid duplicate submit/idempotency-key coverage. |
| `tests/e2e/page-smoke.spec.ts` | H1/H5/H9/manual verification | Adds withdrawal duplicate submit, static exposure checks, websocket/mobile coverage, and stable route-data waits. |
| `tests/integration/server/middleware/auth-security.test.ts` | H3 | Adds MFA parity tests for password, magic link, Google OAuth, and session issuance. |
| `tests/integration/server/middleware/background-jobs.service.test.ts` | H7 | Adds BullMQ retry/rethrow coverage. |
| `tests/integration/server/middleware/logging-and-schemas.test.ts` | H8 | Adds metrics/redaction coverage for new money-state metrics. |
| `tests/integration/server/middleware/match-service.test.ts` | H4 | Adds active match expiry race tests. |
| `tests/integration/server/middleware/order-service.test.ts` | H6 | Adds proof durability and relay failure coverage. |
| `tests/integration/server/middleware/realtime-match.service.test.ts` | H5 | Adds distributed transport policy test. |
| `tests/integration/server/middleware/static-files.test.ts` | H1 | Adds explicit deny tests for server artifact/source-map paths. |
| `tests/integration/server/middleware/ton-payments.test.ts` | C1/C2/C3/H11 | Adds withdrawal intent, idempotency replay, ambiguous TON send, no-refund, no-duplicate, and confirmation-accounting tests. |
| `tests/integration/server/middleware/withdrawal-recovery.test.ts` | C2/C3 | Adds idempotent stuck withdrawal recovery/refund/confirmation tests. |
| `tests/unit/scripts/backfill-balance-atomic.test.ts` | H10 | Adds dry-run, production guard, conditional update, and idempotent rerun tests. |
| `tests/unit/server/services/withdrawal-intent.service.test.ts` | C1 | Adds atomic consume and Redis fallback path coverage. |
| `production-fixes-report.md` | Required output | Documents fixes, tests, references, manual verification, and release recommendation. |

## 3. Finding-by-Finding Resolution

| Finding | Status | Files changed | Tests added | Remaining risk |
| --- | --- | --- | --- | --- |
| C1 | Fixed | `server/services/withdrawal-intent.service.ts`, `server/controllers/transaction.controller.ts`, `src/pages/auth/WithdrawalMfaPage.tsx`, `src/services/transactions.service.ts` | `withdrawal-intent.service.test.ts`, `ton-payments.test.ts`, e2e withdrawal MFA/duplicate submit tests | None known for the covered race; Redis availability remains an operational dependency. |
| C2 | Fixed | `server/services/withdrawal-engine.ts`, `server/workers/withdrawal-worker.ts`, `server/services/withdrawal-recovery.service.ts`, `server/services/metrics.service.ts` | `ton-payments.test.ts`, `withdrawal-recovery.test.ts` | Chain reconciliation quality depends on available TON lookup data and ops response to stuck alerts. |
| C3 | Fixed | `server/repositories/withdrawal.repository.ts`, `server/workers/withdrawal-worker.ts`, `server/services/withdrawal-recovery.service.ts` | `ton-payments.test.ts`, `withdrawal-recovery.test.ts` | None known for covered transition races. |
| H2 | Fixed | `package-lock.json`, `package.json`, tests across stack | Full command gates listed below | First final `npm ci` retry hit Windows `EBUSY`; immediate retry succeeded cleanly. |
| H1 | Fixed | `server/http/frontend.ts`, `tests/e2e/harness/server.mjs`, `static-files.test.ts`, `page-smoke.spec.ts` | Static artifact deny tests and manual path probes | Production reverse proxy/CDN config must preserve these deny semantics. |
| H3 | Fixed | `auth.controller.ts`, `auth-mfa.service.ts`, `MagicLinkPage.tsx` | `auth-security.test.ts` | Risk-based MFA is not enabled; MFA-enabled accounts require challenge before full session. |
| H4 | Fixed | `match.service.ts`, `match-service.test.ts`, `match.spec.ts` | Active expiry race tests | Multi-node safety still depends on configured Mongo/lock behavior. |
| H5 | Fixed | `shared/socket-config.ts`, `server/runtime.ts`, `src/sockets/gameSocket.ts` | `realtime-match.service.test.ts`, e2e websocket smoke | Websocket-only strategy requires load balancer websocket support. |
| H6 | Fixed | `Order.ts`, `order.service.ts`, `order.controller.ts`, `api.ts`, `order-proof-relay.service.ts` | `order-service.test.ts` | Proof metadata is durable before relay; external private object storage/signed URL hardening should be validated in deployment. |
| H7 | Fixed | `background-jobs.service.ts` | `background-jobs.service.test.ts` | Retry safety remains per-processor; unsafe withdrawal send retries remain disabled after possible broadcast. |
| H8 | Fixed | `metrics.service.ts`, `failed-deposit-replay-worker.ts`, `withdrawal-worker.ts`, `order-proof-relay.service.ts` | `logging-and-schemas.test.ts` | Alert routing thresholds are operational policy. |
| H9 | Fixed | `WithdrawPanel.tsx`, `MerchantPanel.tsx`, `orders.service.ts`, e2e specs | Duplicate submit e2e tests | Browser refresh during in-flight action still relies on backend idempotency. |
| H10 | Fixed | `backfill-balance-atomic.ts`, `package.json` | `backfill-balance-atomic.test.ts` | Live production use still requires explicit operator confirmation and dry-run review. |
| H11 | Fixed | Same as C1 plus frontend idempotency preservation | Same-key replay, different-key rejection, no duplicate queue/ledger tests | Covered by C1 fix. |

## 4. Industry References Used

- C1/H11: Redis `GETDEL` command, Redis Lua scripting, OWASP API Security Top 10, OWASP Session Management Cheat Sheet, BullMQ idempotent jobs pattern.
- C2: TON Jetton processing guidance, TON transaction exploration/finality guidance, TON Center API v3, OWASP ASVS, OWASP Logging Cheat Sheet, BullMQ idempotent jobs pattern.
- C3/H4: MongoDB transactions production considerations, Mongoose transactions and query/update results, OWASP ASVS, OWASP API Security.
- H1: Express static files, Express production security best practices, Vite production build.
- H2: Node.js test runner, Playwright best practices, Vite production build, npm audit, GitHub code scanning/Dependabot/secret scanning guidance.
- H3: OWASP Authentication Cheat Sheet, OWASP ASVS.
- H5: Socket.IO multiple-node deployment and server options.
- H6: OWASP File Upload Cheat Sheet, OWASP Logging Cheat Sheet.
- H7: BullMQ retrying failing jobs and idempotent jobs pattern.
- H8: OWASP Logging Cheat Sheet, Express production performance best practices.
- H9: OWASP API Security, React docs.
- H10: MongoDB production notes and transaction production considerations.

## 5. Test Results

Final command results:

| Command | Result |
| --- | --- |
| `npm ci` | PASS. Final retry: `added 318 packages, and audited 319 packages in 3m`; `found 0 vulnerabilities`; warning: deprecated `node-domexception@1.0.0`. A previous attempt hit Windows `EBUSY` while unlinking a locked `node_modules` file and was retried successfully. |
| `npm run typecheck` | PASS. `tsc --noEmit`, server TS project, and `tsconfig.tests.json` completed. |
| `npm run build` | PASS. Cleaned `dist`, ran TypeScript checks, Vite production build, and server TypeScript build. |
| `npm run test` | PASS. Unit: 149 passed. Integration: 284 passed. |
| `npm run test:coverage` | PASS. 383 passed. All-files coverage: line 71.94%, branch 71.48%, functions 68.14%. |
| `npm run test:e2e` | PASS. 51 passed across Chromium, Firefox, and WebKit. |
| `npm audit --omit=dev` | PASS. `found 0 vulnerabilities`. |

Targeted coverage included:

- Withdrawal intent atomic consumption and Redis fallback/Lua path.
- Withdrawal idempotency replay after consumed MFA intent.
- Ambiguous TON send failure and seqno/post-send persistence fault injection.
- Withdrawal confirmation transition/accounting race safety.
- Static server artifact and source map exposure deny paths.
- Active match expiry race.
- Frontend duplicate withdrawal and merchant money submits.
- BullMQ retry/DLQ rethrow semantics.

## 6. Manual Verification

Chrome DevTools MCP:

- Attempted, but the local Browser/Node REPL MCP failed before browser control with a kernel asset initialization error. No production credentials, production wallets, production databases, mainnet funds, or real withdrawals were used.

Fallback runtime verification:

- Full Playwright e2e runtime covered landing page, register/login/logout, protected redirects, bank deposit/withdrawal flows, withdrawal MFA resume, duplicate submit behavior, game lobby/room, merchant unauthorized/admin routes, websocket connection behavior, mobile merchant viewport, console errors, network failures, and cookie/session behavior.
- Static artifact URL checks were verified in production-style middleware/harness tests. These paths return 404/no-store: `/server/main.js`, `/server/main.js.map`, `/server/runtime.js`, `/server/runtime.js.map`, and compiled server service/controller-style probe paths.
- Cookie/storage observations in the e2e harness matched test expectations: auth cookies are HttpOnly with SameSite policy; secure is false only in the local non-HTTPS harness.
- No screenshots were required for the final report because the regressions were API/race/security-gate oriented and are covered by automated assertions.

## 7. Remaining Blockers

- No listed C1/C2/C3/H1-H11 code blocker remains open.
- Chrome DevTools MCP runtime verification remains incomplete because the local MCP tool failed to initialize; Playwright was used as the safe replacement.
- Public launch should remain blocked until a separate P2/compliance/operations review validates production environment variables, secret handling, wallet custody, alert routing, backup/recovery, CDN/proxy deny rules, and real-world TON/M-Pesa operational runbooks.

## 8. Release Recommendation

Safe for production launch: Yes

Safe for real-money beta: Yes

Safe for public launch: No

Reason:

The confirmed P0 launch blockers and listed P1 real-money beta blockers are fixed with regression tests and green install/build/test/audit gates. The platform is safer for a controlled production beta, but public launch still needs a separate P2/compliance and operations signoff. Chrome DevTools MCP verification was not completed due a local tool failure, though Playwright runtime coverage is green.

Required next steps:

- Review and deploy with testnet/mocked TON validation first; do not use production wallets or mainnet funds for tests.
- Confirm production reverse proxy/CDN preserves `/server` artifact denial.
- Confirm stuck withdrawal, terminal failed deposit, proof relay failure, and recovery queue metrics are wired to ops alerts.
- Complete Chrome DevTools MCP runtime verification when the local MCP tool is available, or keep Playwright browser runtime checks as the CI-enforced substitute.
- Run a separate P2/public launch review before public availability.

# Production Readiness Review: 4real

## 1. Executive summary

Overall launch readiness: not ready for production launch.

Production launch is not safe because three confirmed critical withdrawal/accounting defects can create duplicate withdrawal execution windows, unsafe retry/refund behavior after an ambiguous TON broadcast, or ledger accounting changes without a successful status transition. Real-money beta is not safe until those issues are fixed and verified with concurrency/fault-injection tests. Public launch is also not safe because build/test gates could not be completed in this workspace, server build artifacts are likely publicly served, distributed realtime assumptions are incomplete, and several money-flow observability gaps remain.

Finding counts:

- Critical: 3
- High: 11
- Medium: 18
- Low: 1

Top 5 risks:

- Duplicate withdrawal resume after MFA because Redis intent consumption is non-atomic and not bound to the submitted idempotency key.
- Ambiguous TON withdrawal send failures can be retried or refunded even after a transfer may have been broadcast.
- Withdrawal confirmation can update accounting totals even when the terminal status transition did not apply.
- Production static serving likely exposes `dist/server/*` and server source maps.
- Active match expiry can settle a wagered game after fresh activity because expiry does not recheck the stale cutoff during settlement.

Top 5 fastest wins:

- Make withdrawal intent consumption atomic with Redis `GETDEL` or Lua compare/delete and validate the idempotency key before creating withdrawals.
- Change post-broadcast TON errors to a `stuck` reconciliation state instead of retry/refund.
- Make withdrawal status transitions return matched/modified results and gate ledger accounting on successful transitions.
- Serve only Vite client assets from `dist`, or compile server output outside the public static root and disable production server source maps.
- Add a conditional stale cutoff/status filter to active-match expiry and test fresh-move/expiry races.

Exact areas not fully reviewed:

- Chrome DevTools/browser runtime flows were not tested. No callable Browser/Chrome DevTools MCP tool was exposed in this session, and the app could not be built/launched after `npm ci` failed.
- Actual production environment values, Google OAuth console settings, Gmail sending, Turnstile production keys, Render/dashboard settings, Redis TLS/auth at provider level, and TON hot-wallet balances were not verified.
- Real mainnet withdrawals, production M-Pesa data, production wallets, and production credentials were intentionally not used.
- Some subagent findings were accepted only where line-level evidence existed; unsupported speculation was rejected or marked Needs verification.

Confidence level: Medium.

Why: the static review covered architecture, auth, payments, realtime, database/concurrency, Redis/BullMQ, frontend, testing, deployment, and supply chain with exact code evidence. Confidence is not High because runtime browser testing and full test/build execution were blocked by local dependency-install failure.

## 2. Final launch verdict

- Safe for production launch: No
- Safe for real-money beta: No
- Safe for public launch: No
- Reason: confirmed critical withdrawal/accounting bugs can affect funds and ledger correctness; build/test gates did not pass in this review environment; additional high-risk deployment, realtime, MFA, and observability weaknesses remain.
- Minimum required fixes before launch: fix Critical findings C1-C3, remove public exposure of server build artifacts/source maps, establish a clean reproducible install/build/test gate, and verify duplicate-deposit/duplicate-withdrawal/ledger-atomicity tests.
- Minimum required verification before launch: green `npm ci`, `npm run typecheck`, `npm run build`, `npm run test`, `npm run test:coverage`, `npm run test:e2e`, `npm audit --omit=dev`, production env validation, Mongo index verification, Redis TLS/auth verification, TON mainnet/testnet separation, hot-wallet gas buffer verification, and runtime browser checks in DEV/test.
- Recommended rollout: do not launch real money. After fixes, run a closed testnet/sandbox beta with mocked or low-limit funds, single-instance topology unless Socket.IO sticky-session/websocket-only behavior is verified, alerting on deposits/withdrawals, and explicit rollback/runbooks.

## 3. Confirmed tech stack

| Technology | Where it appears | Used for | Production risk areas | Official docs used |
|---|---|---|---|---|
| TypeScript | `package.json:17`, `tsconfig.server.json:7` | Strict frontend/backend typing and server build | Broken typecheck blocks release; source maps expose server source if served | TypeScript/Vite/Node docs |
| Node.js ESM | `package.json:5`, `package.json:8` | Server runtime | Startup mode and production env assumptions | Node.js security releases, Node.js test runner |
| Express | `package.json:49`, `server/app.ts` | REST API, middleware, static frontend serving | Static exposure, proxy, headers, request limits | Express production security/performance, Express static docs |
| React | `package.json:58`, `src/app/App.tsx` | Frontend SPA | Protected route UX, duplicate submits, stale auth state | React docs |
| Vite | `package.json:9`, `vite.config.ts` | Client build/dev middleware | Build output layout, production build verification | Vite build/env docs |
| React Router | `package.json:60`, `src/app/App.tsx` | Frontend routing | Lost deep links, protected/public route behavior | React Router docs |
| Socket.IO | `package.json:62`, `server/runtime.ts:57`, `src/sockets/gameSocket.ts:3` | Realtime game rooms | Multi-instance scaling, sticky sessions, move races | Socket.IO multiple nodes/server options |
| MongoDB/Mongoose | `package.json:56`, `server/models`, `server/repositories` | Persistence, transactions, indexes | Atomic balances, status transitions, unique idempotency | MongoDB production/index/transaction docs, Mongoose docs |
| Redis/ioredis | `package.json:54`, `server/services/redis.service.ts` | Sessions, locks, BullMQ, rate limits, socket adapter | Atomic locks, TLS/auth, outage behavior | Redis security/persistence docs |
| BullMQ | `package.json:42`, `server/services/bullmq-jobs.service.ts` | Background job scheduling | Retry/DLQ behavior, duplicate side effects, failed jobs | BullMQ docs |
| TON / Jetton / TonConnect | `package.json:30-32`, `server/services/withdrawal-engine.ts`, `src/features/bank/DepositPanel.tsx` | USDT deposits/withdrawals and wallet connect | Broadcast ambiguity, confirmations, manifest correctness | TON Connect, Jetton, TON Center docs |
| Google OAuth/Gmail | `package.json:51-52`, `server/services/google-oauth.service.ts` | OAuth login and product/auth emails | Redirect/state validation, MFA parity, email sending | Google OAuth 2.0, Gmail API sending docs |
| Cloudflare Turnstile | `server/http/security-headers.ts:5`, auth UI | Bot protection | CSP, bypass in test/dev, production keys | Cloudflare Turnstile docs |
| Zod | `package.json:69`, validation modules | Request/env validation | Missing edge validation, production env guarantees | Zod docs and OWASP validation guidance |
| Helmet/CORS/rate limits | `package.json:47`, `package.json:50`, `package.json:53`, `package.json:57` | Headers, CORS, rate limiting | CSRF/CORS/rate-limit coverage | Helmet, express-rate-limit, CORS docs |
| Playwright/Node test runner | `package.json:12-16`, `playwright.config.ts` | Unit/integration/e2e testing | Gates incomplete due install/build failure | Playwright best practices, Node test runner |
| Tailwind/RoughJS | `package.json:61`, `package.json:65` | UI styling/game visuals | Build/runtime dependency health | Vite/React docs |

## 4. Architecture and critical data-flow map

Auth/session data flow:

- Frontend route: `src/pages/auth/*`, `src/app/ProtectedRoute.tsx`, `src/app/PublicOnlyRoute.tsx`
- API route: `server/routes/auth.routes.ts`
- Middleware: CSRF/cache/security middleware in `server/app.ts`, auth middleware in `server/middleware/auth.middleware.ts`
- Controller: `server/controllers/auth.controller.ts`
- Service: `server/services/auth-session.service.ts`, `server/services/auth-mfa.service.ts`, `server/services/google-oauth.service.ts`
- Model: user/session/token models under `server/models`
- Cookie/session side effects: session and refresh cookies set in auth controller; refresh rotation handled in auth session service
- Logs/metrics: auth events logged through server logger; suspicious login and MFA paths have tests but not all sign-in paths require MFA

Deposit data flow:

- Frontend route: `/bank` via `src/pages/BankPage.tsx`, deposit panel in `src/features/bank/DepositPanel.tsx`
- API route: deposit/transaction routes under `server/routes`
- Service: `server/services/deposit-tonconnect.service.ts`, `server/services/deposit-ingestion.service.ts`, TON streaming/polling services
- External API: TON/TonCenter/TonConnect
- DB writes: deposit records, processed transaction hashes, user balance repositories
- Ledger update: balance/ledger update occurs inside Mongo transactions in deposit ingestion
- Idempotency key: on-chain tx hash uniqueness via `processed_txs`
- Logs/metrics: unmatched deposit and wallet reserve metrics exist; terminal failed replay is not surfaced in readiness/metrics

Withdrawal data flow:

- Frontend route: `/bank?view=withdraw`, `src/features/bank/WithdrawPanel.tsx`
- API route: withdrawal action in `server/controllers/transaction.controller.ts`
- MFA route: `/auth/withdrawal-mfa`, `WithdrawalMfaPage`, `AuthMfaService`
- Withdrawal intent: `server/services/withdrawal-intent.service.ts`
- Worker: `server/workers/withdrawal-worker.ts`
- External TON send: `server/services/withdrawal-engine.ts`
- Confirmation: withdrawal worker and recovery service
- Ledger update: withdrawal repository, user balance repository, processed transaction records
- Logs/metrics: withdrawal pending/stuck/failure logs exist; ambiguous-send and confirmation accounting paths are unsafe

Game data flow:

- Frontend route: lobby/play/game in `src/pages/GamePage.tsx`, `src/features/game/useGameRoom.ts`
- Socket event: `join-room`, `make-move`, disconnect/reconnect events in `server/sockets/game.socket.ts`
- Socket handler: authenticated socket middleware and game socket handler
- Game service: `server/services/realtime-match.service.ts`, `server/services/match.service.ts`
- Model/repository: match models/repositories under `server/models` and `server/repositories`
- Persistence: move history/status updates in MongoDB
- Emitted event: `room-sync`, `move-made`, `game-over`, lobby public events
- Settlement/update: complete/expire/resign paths in match service

Admin/merchant data flow:

- Frontend route: `/merchant`, `src/components/merchant/MerchantLayout.tsx`
- API route: `server/routes/admin.routes.ts`, order/admin routes
- Auth middleware: `authenticateToken`, `requireVerifiedAccount`
- Admin middleware: `requireAdmin`, `requireMfaStepUp`
- Service: order, dashboard, proof relay, merchant dashboard services
- DB writes: orders, proofs, balance updates, audit-related status changes
- Audit logs: admin and order logs exist, but proof relay terminal failures and deposit terminal failures need stronger operational surfacing

## 5. Subagent coverage

| Reviewer | Scope | Result |
|---|---|---|
| Stack and architecture | Structure, route map, critical data flows, risky modules | Completed; architecture and production path maps integrated |
| Security | OWASP/Node/Express/authz/headers/secrets/static searches | Completed; unsupported bypass claims rejected |
| Auth/session/MFA | Register, login, refresh, OAuth, MFA, withdrawal step-up | Completed; MFA parity and withdrawal intent issues included |
| Payments/TON/wallet/ledger/M-Pesa | Deposits, withdrawals, ledger, proof/code flows | Completed; highest-priority critical findings included |
| Game fairness/realtime | Match creation, moves, stale expiry, scaling | Completed; stale expiry and scaling findings included |
| Database/concurrency | Models, indexes, transactions, migrations, queries | Completed; status-transition and migration risks included |
| Redis/BullMQ/jobs | Redis, queues, retries, locks, readiness | Completed; retry/DLQ and terminal deposit visibility findings included |
| Frontend UX/routing | Routes, bank, MFA, admin shell, errors | Completed; money double-submit and UX findings included |
| Chrome DevTools runtime | Browser/runtime checks | Not completed; no callable Browser/DevTools MCP and app could not build |
| Testing/QA | Test commands and missing-test analysis | Completed; command failures and targeted gaps included |
| Deployment/supply chain | Env, lockfile, workflows, deployment descriptors | Completed; static exposure, audit, and CI/deployment gaps included |

## 6. Commands run and results

| Command | Result | Output summary | Launch impact |
|---|---|---|---|
| `npm ci` | Fail | First run timed out. Second run failed with `ENOTEMPTY: directory not empty, rmdir ...\node_modules\caniuse-lite\data\features`. | Blocks launch until a clean environment proves reproducible install. |
| `npm run typecheck` | Fail | Missing module/type errors for `react`, `react-router-dom`, `lucide-react`, `@tonconnect/ui-react`, and others after failed install. | Blocks launch until rerun after clean install. |
| `npm run build` | Fail | `npm run clean` ran, then typecheck/build failed with missing dependency/types. | Blocks launch until green build. |
| `npm run test` | Fail | Fails at `typecheck:tests` with missing modules/types after failed install. | Blocks launch until tests run in clean environment. |
| `npm run test:coverage` | Fail | Partial runner summary: `tests 90`, `pass 47`, `fail 43`, `duration_ms 93279.6736`; failures mostly `ERR_MODULE_NOT_FOUND`. | Blocks launch until complete coverage run passes. |
| `npm run test:e2e` | Fail | Runs `npm run build` first, so fails with build/type errors. | Blocks launch until e2e passes. |
| `npm audit --omit=dev` | Fail | 7 moderate vulnerabilities: `qs`, `body-parser`, `express`, `ws`, `engine.io`, `engine.io-client`, `socket.io-adapter`. No high/critical reported. | Should fix before public launch. |
| `npm outdated` | Fail/noisy | Broken install caused many dependencies to show `MISSING`. | Needs rerun after clean install. |
| Static `rg` searches requested by user | Completed | Security, payment, money, DB, socket, CORS, frontend storage, and comment patterns reviewed. | Findings included where evidence-backed. |
| `.github`/deployment descriptor check | Completed | No `.github/`, `render.yaml`, Dockerfile, Procfile, Fly, Railway, Vercel, or Netlify descriptors found by repo inspection. | Should fix before public launch for CI/supply-chain gates. |

## 7. Critical blockers

### [Critical] Withdrawal MFA intent can be consumed twice and is not bound to the idempotency key

- Status: Confirmed
- Area: payment / ledger / auth
- File(s):
  - `server/services/withdrawal-intent.service.ts:13`
  - `server/services/withdrawal-intent.service.ts:76`
  - `server/services/withdrawal-intent.service.ts:84`
  - `server/controllers/transaction.controller.ts:87`
  - `server/controllers/transaction.controller.ts:106`
  - `server/controllers/transaction.controller.ts:123`
- Function/class/module: `WithdrawalIntentService.consumeIntent`, `TransactionController.handleWithdrawal`
- What is wrong: withdrawal intent records store an `idempotencyKey`, but resume consumes the intent with Redis `get` followed by `del`, which is not atomic. The controller consumes the intent before idempotency mutation lookup and does not validate that `intent.idempotencyKey` matches the submitted `idempotencyKey`.
- Why it matters in production: two concurrent resume requests can both read the same authorized withdrawal intent before deletion. If they use different idempotency keys, both can reach withdrawal creation and worker execution, risking duplicate withdrawal attempts and duplicate balance debits.
- Evidence from code: `consumeIntent` reads with `this.redis.get(key)` then deletes with `this.redis.del(key)`. `handleWithdrawal` calls `consumeIntent` at resume and only later enters `IdempotencyService.withMutation`, using the caller-supplied idempotency key. The code checks user/address/amount/authorization but not the intent idempotency key.
- Runtime evidence, if any: Not tested; browser/runtime unavailable.
- Command evidence, if any: Static inspection via required payment/idempotency searches.
- Official reference: OWASP ASVS session/transaction integrity guidance, OWASP API Security Top 10 BOLA/business-flow integrity, Redis atomic command guidance, BullMQ/Redis idempotent job guidance.
- Recommended fix: atomically consume intents with Redis `GETDEL` or a Lua compare-and-delete script; validate the stored idempotency key before destructive actions; make idempotency replay lookup happen before intent consumption for repeated requests; bind intent to session/device and withdrawal challenge.
- Tests to add: concurrent resume with the same intent and different idempotency keys; retry of the same idempotency key after a lost 202 response; expired intent; mismatched user/address/amount/idempotency key.
- Risk if ignored: duplicate withdrawal execution, duplicate balance debit, blocked recovery after lost responses, and real-money fund loss.
- Launch impact: Blocks launch

### [Critical] Ambiguous TON withdrawal send failures can be retried or refunded after possible broadcast

- Status: Confirmed
- Area: payment / ledger
- File(s):
  - `server/workers/withdrawal-worker.ts:126`
  - `server/services/withdrawal-engine.ts:95`
  - `server/services/withdrawal-engine.ts:112`
  - `server/services/withdrawal-engine.ts:116`
  - `server/workers/withdrawal-worker.ts:202`
  - `server/workers/withdrawal-worker.ts:227`
- Function/class/module: `sendUsdtWithdrawal`, `WithdrawalWorker.processWithdrawal`
- What is wrong: after `contract.sendTransfer` is called, only the specific `"Seqno stuck"` polling path is converted into `SeqnoTimeoutError` and held for reconciliation. Other post-broadcast errors are treated as ordinary failures by the worker and can enter retry/refund logic.
- Why it matters in production: wallet broadcast can succeed while the API acknowledgement, seqno polling, or follow-up code throws. Retrying can send another transfer; refunding can restore internal balance after funds already left the wallet.
- Evidence from code: `sendUsdtWithdrawal` calls `contract.sendTransfer`. Only one poll error branch returns `SeqnoTimeoutError`; other errors are rethrown. The worker marks `SeqnoTimeoutError` stuck, but generic errors increment retry count and eventually call failed-withdrawal refund handling.
- Runtime evidence, if any: Not tested against TON; real mainnet testing intentionally not performed.
- Command evidence, if any: Static inspection via required withdrawal/TON searches.
- Official reference: TON Jetton transfer docs, TON Center API docs, OWASP ASVS transaction integrity principles.
- Recommended fix: once a transfer broadcast is attempted, persist seqno/send attempt metadata and move all uncertain post-send failures to `stuck` reconciliation. Do not retry or refund until on-chain lookup proves no transfer occurred. Make recovery idempotent by tx hash/seqno/outgoing message id.
- Tests to add: fault injection after `sendTransfer` succeeds; ack timeout; seqno poll timeout; non-seqno post-broadcast exception; retry worker restart; recovery after later confirmation.
- Risk if ignored: double withdrawal, ledger mismatch, user balance over-refund, hot-wallet loss.
- Launch impact: Blocks launch

### [Critical] Withdrawal confirmation accounting can run without a successful terminal status transition

- Status: Confirmed
- Area: payment / ledger / database
- File(s):
  - `server/repositories/withdrawal.repository.ts:112`
  - `server/repositories/withdrawal.repository.ts:125`
  - `server/workers/withdrawal-worker.ts:318`
  - `server/workers/withdrawal-worker.ts:335`
  - `server/services/withdrawal-recovery.service.ts:210`
  - `server/services/withdrawal-recovery.service.ts:227`
- Function/class/module: `WithdrawalRepository.markConfirmed`, `WithdrawalWorker.confirmWithdrawal`, `WithdrawalRecoveryService`
- What is wrong: `markConfirmed` filters by `status` but returns `void` and ignores matched/modified counts. Worker and recovery flows unconditionally continue with processed-transaction/accounting work after calling it.
- Why it matters in production: if a withdrawal has already moved to `failed`, `refunded`, or another terminal state, the `markConfirmed` update can match zero documents while accounting still records the withdrawal as confirmed.
- Evidence from code: repository update filter allows only `processing`, `sent`, or `stuck`, but caller cannot know whether the transition applied. Both worker and recovery paths proceed after calling the method.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static inspection via required `findOneAndUpdate|updateOne|transaction|atomic` searches.
- Official reference: MongoDB transaction production considerations and OWASP ASVS transaction integrity guidance.
- Recommended fix: make terminal status transition methods return matched/modified results or the updated document; only record processed transactions and ledger accounting after a successful transition; handle already-confirmed idempotently; reject confirmation of failed/refunded states unless an explicit manual recovery path is used.
- Tests to add: confirmation racing with failure/refund; recovery confirmation of already terminal withdrawal; repeated confirmation; processed tx uniqueness and accounting totals.
- Risk if ignored: corrupted ledger totals, incorrect withdrawal history, unrecoverable reconciliation mismatch.
- Launch impact: Blocks launch

## 8. High-risk issues

### [High] Production static serving likely exposes compiled server output and server source maps

- Status: Confirmed
- Area: deployment / security
- File(s):
  - `package.json:9`
  - `tsconfig.server.json:15`
  - `tsconfig.server.json:19`
  - `server/http/frontend.ts:105`
- Function/class/module: `npm run build`, `registerProductionFrontend`
- What is wrong: the build compiles server output into `dist/server` with source maps enabled, and Express serves the whole `dist` directory as public static content.
- Why it matters in production: public clients can likely request `/server/main.js` and `/server/main.js.map`, exposing backend implementation and original TypeScript source. Even without secrets, this materially improves attacker reconnaissance.
- Evidence from code: `npm run build` runs Vite then `tsc --project tsconfig.server.json`; `tsconfig.server.json` uses `outDir: "./dist/server"` and `sourceMap: true`; `express.static(distPath)` serves the complete `dist` directory.
- Runtime evidence, if any: Not tested because build failed.
- Command evidence, if any: Static file reads of `package.json`, `tsconfig.server.json`, and `server/http/frontend.ts`.
- Official reference: Express static file serving docs and Express production security best practices.
- Recommended fix: compile server output outside the public static root, or serve only the client subdirectory/assets; disable production server source maps or keep maps outside web root.
- Tests to add: integration test asserting `/server/main.js`, `/server/main.js.map`, and other server build paths return 404 in production mode.
- Risk if ignored: source disclosure, easier exploit development, exposed internal route/service names and operational assumptions.
- Launch impact: Blocks real-money beta

### [High] Verification gates failed in this workspace and no green production build was established

- Status: Confirmed
- Area: deployment / tests
- File(s):
  - `package.json:8`
  - `package.json:9`
  - `package.json:11`
  - `package.json:14`
  - `package.json:16`
  - `package.json:17`
- Function/class/module: npm scripts
- What is wrong: required install/build/typecheck/test/e2e commands did not pass during review. The first root cause was local `npm ci` install state, but after it failed, all build/test gates were unverifiable.
- Why it matters in production: production launch requires a reproducible install, build, and test gate. Without a green run, regressions in money, auth, and game flows cannot be excluded.
- Evidence from code: package scripts define the required gates. Build depends on TypeScript and Vite. E2E depends on build.
- Runtime evidence, if any: Not available.
- Command evidence, if any: `npm ci` failed with `ENOTEMPTY` under `node_modules\caniuse-lite\data\features`; `npm run typecheck`, `npm run build`, `npm run test`, `npm run test:coverage`, and `npm run test:e2e` then failed with missing dependency/module errors. Coverage partial summary: `tests 90`, `pass 47`, `fail 43`.
- Official reference: Node.js test runner docs, Playwright best practices, Vite production build docs.
- Recommended fix: rerun in a clean CI/workspace without preexisting `node_modules`; ensure `npm ci`, typecheck, build, tests, coverage, and e2e pass before any release candidate is accepted.
- Tests to add: CI pipeline enforcing the exact production gate commands, including e2e.
- Risk if ignored: shipping an unverified or non-buildable release.
- Launch impact: Blocks launch

### [High] MFA-enabled accounts can receive sessions without MFA on several sign-in paths

- Status: Confirmed
- Area: auth / security
- File(s):
  - `server/controllers/auth.controller.ts:322`
  - `server/controllers/auth.controller.ts:378`
  - `server/controllers/auth.controller.ts:439`
  - `server/controllers/auth.controller.ts:518`
- Function/class/module: `AuthController.login`, `AuthController.consumeMagicLink`, `AuthController.handleGoogleOAuthCallback`
- What is wrong: password login only challenges MFA when login is suspicious; magic-link and Google OAuth callback paths issue sessions without an MFA branch. This is a confirmed behavior. If product MFA is intended as sign-in protection for enrolled accounts, these are bypass paths.
- Why it matters in production: users may believe MFA protects account sign-in, but alternate sign-in methods can create sessions without MFA. For a real-money wallet/game platform, account access can lead to balance withdrawal attempts and sensitive account changes.
- Evidence from code: normal password login proceeds to session issuance when not suspicious; magic-link and Google OAuth callback call session issuance/redirect code without checking `user.mfa.enabledAt`.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static auth/MFA searches.
- Official reference: OWASP Authentication Cheat Sheet and OWASP ASVS authentication requirements.
- Recommended fix: centralize post-primary-auth session issuance behind a policy that requires MFA for enrolled users, or explicitly document and enforce a risk-based MFA model. Apply consistently to password, magic link, Google OAuth, and recovery paths.
- Tests to add: MFA-enrolled user login via password, magic link, and Google OAuth must challenge before issuing session; suspicious and non-suspicious cases.
- Risk if ignored: weakened account protection and user-facing security promise mismatch.
- Launch impact: Blocks real-money beta

### [High] Active match expiry can settle a live wagered game after fresh activity

- Status: Confirmed
- Area: websocket / payment / ledger
- File(s):
  - `server/services/match.service.ts:446`
  - `server/services/match.service.ts:538`
  - `server/services/match.service.ts:554`
  - `server/services/match.service.ts:400`
  - `server/services/realtime-match.service.ts:137`
- Function/class/module: `MatchService.expireStaleMatches`, `MatchService.expireActiveMatch`, `RealtimeMatchService.makeMove`
- What is wrong: stale active matches are selected by `lastActivityAt < activeCutoff`, but `expireActiveMatch` later fetches by `roomId` and only verifies `status === active`. It does not recheck the cutoff inside the settlement transition or share the room lock used by live moves.
- Why it matters in production: a fresh move can update `lastActivityAt` after the stale scan, while expiry still settles the match as stale. In real-money games, that can incorrectly determine outcome/fund settlement.
- Evidence from code: move persistence updates `lastActivityAt`; expiry selection and actual expiry are separate; expiry path checks status only.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static game/socket searches.
- Official reference: MongoDB atomic update guidance and Socket.IO scaling/multi-node docs.
- Recommended fix: perform expiry with a conditional atomic update including `status` and `lastActivityAt < activeCutoff`, or use the same room/distributed lock and re-read stale cutoff before settlement.
- Tests to add: race test where a move updates `lastActivityAt` between stale scan and expiry; concurrent move/expiry; settlement idempotency.
- Risk if ignored: incorrect game outcome and wager/fund misallocation.
- Launch impact: Blocks real-money beta

### [High] Socket.IO distributed deployment lacks sticky-session or websocket-only guarantee

- Status: Confirmed
- Area: websocket / deployment
- File(s):
  - `server/runtime.ts:57`
  - `server/runtime.ts:65`
  - `src/sockets/gameSocket.ts:3`
  - `server/config/env.ts:430`
- Function/class/module: Socket.IO server/client startup and topology validation
- What is wrong: the app can enable a Redis adapter for distributed topology, but server/client Socket.IO transports use defaults and there is no repo-level sticky-session deployment config or websocket-only enforcement.
- Why it matters in production: Socket.IO requires sticky sessions when HTTP long-polling is enabled across multiple nodes. Redis adapter alone does not make long-polling handshake/session routing safe.
- Evidence from code: server creates `new SocketIOServer(httpServer, { cors: ... })` with default transports; client calls `io(window.location.origin)` with defaults; env validation requires adapter for distributed mode but not sticky-session/websocket-only deployment evidence.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static socket/runtime search.
- Official reference: Socket.IO docs, `Using multiple nodes`: sticky sessions are required when HTTP long-polling is enabled unless using WebSocket-only transports.
- Recommended fix: either enforce `transports: ['websocket']` on both client and server for distributed deployments, or document and verify sticky sessions at the load balancer. Add deployment health checks for topology.
- Tests to add: multi-instance socket smoke test with reconnect and room join; config test that distributed topology requires explicit sticky/websocket-only mode.
- Risk if ignored: failed room joins, disconnect loops, lost move events, and degraded real-money game sessions under scaling.
- Launch impact: Blocks real-money beta

### [High] M-Pesa BUY proof is not durably retained if Telegram proof relay fails

- Status: Confirmed
- Area: payment / admin / operations
- File(s):
  - `server/controllers/order.controller.ts:136`
  - `server/controllers/order.controller.ts:279`
  - `server/controllers/order.controller.ts:304`
  - `server/services/order-proof-relay.service.ts:110`
- Function/class/module: `OrderController.createOrder`, `OrderProofRelayService`
- What is wrong: proof image validation exists, but the order creation path stores only relay-related metadata and queues/sends the proof to Telegram after order creation. If relay permanently fails, there is no local durable proof object available for admin review.
- Why it matters in production: BUY orders depend on proof/code review. A real customer payment proof can become unavailable while an order remains in the system, forcing unsafe manual decisions or customer disputes.
- Evidence from code: controller validates proof file, creates the order with `proofRelayQueued`, then queues relay. Relay terminal failure logs/marks failure but does not persist the proof locally.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static M-Pesa/proof searches.
- Official reference: OWASP File Upload Cheat Sheet, OWASP Logging Cheat Sheet.
- Recommended fix: persist proof objects durably in controlled storage before accepting the order, store checksum/metadata, link proof to order, and make Telegram relay a secondary notification path.
- Tests to add: relay failure after order creation; proof available to admin after relay failure; oversized/bad MIME/magic-byte rejection; replayed proof hash handling.
- Risk if ignored: disputed fiat orders, unsafe admin approval, loss of audit evidence.
- Launch impact: Blocks real-money beta

### [High] BullMQ retry and DLQ behavior is bypassed by a wrapper that swallows processor errors

- Status: Confirmed
- Area: deployment / background jobs
- File(s):
  - `server/services/bullmq-jobs.service.ts:21`
  - `server/services/bullmq-jobs.service.ts:94`
  - `server/services/bullmq-jobs.service.ts:103`
  - `server/services/background-jobs.service.ts:85`
- Function/class/module: `startBullmqBackgroundJobs`, `createJobRunner`
- What is wrong: BullMQ queues are configured with attempts/backoff and failed/DLQ handlers, but the processor commonly wraps work in `createJobRunner`, which catches failures, records `lastError`, logs, and does not rethrow.
- Why it matters in production: BullMQ only marks jobs failed/retries them when the processor throws. Ordinary job failures can therefore look successful to BullMQ, bypassing retries, failed-set retention, and DLQ alerts.
- Evidence from code: worker awaits `definition.processor()`; `createJobRunner` catches errors and does not rethrow.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static Redis/BullMQ search.
- Official reference: BullMQ retrying/failing jobs docs.
- Recommended fix: separate scheduler state recording from queue processor failure semantics; rethrow errors for BullMQ-managed jobs; ensure idempotent processors before enabling retries; add DLQ alerting.
- Tests to add: processor throwing causes retry; terminal failure enters DLQ; readiness/metrics reflect failed queue state.
- Risk if ignored: silent missed retries for deposit reconciliation, withdrawal monitoring, stale match expiry, or other production jobs.
- Launch impact: Blocks real-money beta

### [High] Terminal failed deposit replays are only log-visible

- Status: Confirmed
- Area: payment / observability
- File(s):
  - `server/workers/failed-deposit-replay-worker.ts:47`
  - `server/workers/failed-deposit-replay-worker.ts:53`
  - `server/repositories/failed-deposit-ingestion.repository.ts:127`
  - `server/app.ts:103`
  - `server/services/metrics.service.ts:349`
- Function/class/module: `replayFailedDepositIngestions`, readiness, metrics
- What is wrong: replay terminal failures are persisted as `terminal_failure` and logged with `deposit_unrecoverable`, but readiness only checks background job state and metrics expose unmatched deposits/queue depth, not terminal failed deposits.
- Why it matters in production: a real customer deposit can become unrecoverable in app state without failing readiness or appearing in core metrics/dashboard unless external log alerting catches it.
- Evidence from code: terminal failure status is stored and logged; readiness filters mandatory job `lastError`; metrics include unmatched deposits and BullMQ queue depth, not terminal failure count.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static worker/metrics search.
- Official reference: OWASP Logging Cheat Sheet and incident response observability guidance.
- Recommended fix: expose terminal failed deposit count/age metric, readiness warning or degraded status for unreconciled terminal failures, merchant/admin dashboard queue, and alert runbook.
- Tests to add: terminal replay increments metric; readiness/degraded status or dashboard shows terminal failures; alert redacts tx details safely.
- Risk if ignored: missed customer deposits and delayed incident response.
- Launch impact: Blocks real-money beta

### [High] Frontend money actions can generate new idempotency keys on rapid double submit

- Status: Confirmed
- Area: frontend / payment / UX
- File(s):
  - `src/features/bank/MerchantPanel.tsx:146`
  - `src/features/bank/MerchantPanel.tsx:555`
  - `src/services/orders.service.ts:41`
  - `src/features/bank/WithdrawPanel.tsx:363`
  - `src/features/bank/WithdrawPanel.tsx:375`
- Function/class/module: merchant order submit, withdrawal confirm, `createOrder`
- What is wrong: money-action submit handlers rely on React disabled/loading state. They do not use a synchronous in-flight ref/key guard, and service calls generate a fresh idempotency key per invocation.
- Why it matters in production: rapid clicks or lag can submit duplicate fiat orders or multiple withdrawal MFA intents before UI disabled state takes effect. Backend must still be authoritative, but the client currently increases duplicate-action pressure.
- Evidence from code: merchant submit sets loading but has no early loading guard; create order generates a fresh idempotency key per call; withdrawal confirm creates a new key per click.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static frontend/idempotency search.
- Official reference: OWASP API Security guidance on business-flow abuse and idempotent money operations.
- Recommended fix: keep one stable in-flight idempotency key per user action, guard synchronously with a ref, and reuse the key until success/final failure.
- Tests to add: double-click submit produces one request/key; retry reuses the same idempotency key; disabled state under slow network.
- Risk if ignored: duplicate orders, extra MFA intents, user confusion, and higher chance of backend duplicate-money bugs being exercised.
- Launch impact: Blocks real-money beta

### [High] Balance atomic backfill can overwrite current atomic balances from stale raw fields

- Status: Confirmed
- Area: database / ledger
- File(s):
  - `server/scripts/backfill-balance-atomic.ts:29`
  - `server/scripts/backfill-balance-atomic.ts:39`
  - `server/scripts/backfill-balance-atomic.ts:47`
  - `server/scripts/backfill-balance-atomic.ts:50`
- Function/class/module: `backfillAtomicBalances`
- What is wrong: the backfill reads batches of `balanceRaw`/totals and bulk writes `balanceAtomic`/totals later using only `_id` as a filter. If run while live balance updates occur, stale raw values can overwrite newer atomic fields.
- Why it matters in production: migration/backfill scripts that touch balances must be safe under live writes or explicitly offline. This script can corrupt wallet balances if run during production traffic.
- Evidence from code: batch read occurs before bulk write; update filter is only `{ _id: document._id }`; no version/timestamp guard, transaction, or maintenance lock is used.
- Runtime evidence, if any: Not run against DB.
- Command evidence, if any: Static script review.
- Official reference: MongoDB production notes and transaction/update concurrency guidance.
- Recommended fix: make the migration offline-only with an explicit production guard, or use conditional updates comparing raw fields/version read, plus dry-run and reconciliation reporting.
- Tests to add: concurrent balance update during migration; stale update must not overwrite; idempotent rerun; production guard.
- Risk if ignored: balance corruption and ledger mismatch.
- Launch impact: Blocks real-money beta

### [High] Withdrawal idempotency replay is unreachable after the MFA intent has already been consumed

- Status: Confirmed
- Area: payment / UX / reliability
- File(s):
  - `server/controllers/transaction.controller.ts:106`
  - `server/controllers/transaction.controller.ts:123`
  - `tests/integration/server/middleware/ton-payments.test.ts:1101`
- Function/class/module: `TransactionController.handleWithdrawal`, withdrawal integration test
- What is wrong: the controller consumes the withdrawal intent before idempotency replay lookup. A client retry with the same idempotency key after a lost response can hit `consumeIntent === null` and get an expired-intent error instead of replaying the stored accepted response. Existing replay coverage mocks `consumeIntent` to succeed on replay, skipping this production branch.
- Why it matters in production: money-action clients retry after network failures. If safe replay fails, users may restart flows, create new intents, and increase duplicate or stuck withdrawal risk.
- Evidence from code: consume occurs before `IdempotencyService.withMutation`; test coverage mocks the consumed intent path rather than asserting replay after the intent is gone.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Testing subagent and static inspection.
- Official reference: OWASP API Security guidance on idempotent operations and transaction integrity.
- Recommended fix: perform idempotency lookup/replay before destructive intent consumption, or store accepted response under the intent before deletion and make retries replayable.
- Tests to add: successful first resume with lost response, same-key retry after intent deletion, different-key retry rejection, no second queue item.
- Risk if ignored: stuck withdrawals, duplicate user retries, operational support load.
- Launch impact: Blocks real-money beta

## 9. Medium-risk issues

### [Medium] OAuth redirect sanitizer allows backslash open redirect after session issuance

- Status: Confirmed
- Area: auth / security
- File(s):
  - `src/features/auth/auth-routing.ts:3`
  - `server/controllers/auth.controller.ts:65`
  - `server/controllers/auth.controller.ts:456`
  - `server/services/google-oauth.service.ts:155`
  - `server/controllers/auth.controller.ts:518`
- Function/class/module: `sanitizeRedirectTo`, Google OAuth start/callback
- What is wrong: redirect sanitization accepts strings like `/\attacker.example`, which browsers resolve as `https://attacker.example/` when assigned relative to an app origin.
- Why it matters in production: after OAuth callback sets session cookies, the browser can be redirected to an attacker-controlled domain. Cookies remain host-scoped, but the flow enables phishing and trust abuse.
- Evidence from code: server and frontend sanitizers allow one leading slash and only reject `//`; Google OAuth stores redirect target in state and redirects after session issuance.
- Runtime evidence, if any: Node URL check: `/\\attacker.example` resolves to `https://attacker.example/` from `https://app.example.com`.
- Command evidence, if any: Static auth redirect search.
- Official reference: OWASP Unvalidated Redirects guidance and OWASP Authentication Cheat Sheet.
- Recommended fix: reject backslashes and encoded backslashes, parse with `new URL(value, origin)`, require same origin, and store only normalized path/query/hash.
- Tests to add: `//host`, `/\host`, `/%5Chost`, encoded slash/backslash, valid app paths.
- Risk if ignored: phishing/open redirect around login.
- Launch impact: Should fix before public launch

### [Medium] Distributed room lock has fixed 5 second TTL with no renewal

- Status: Confirmed
- Area: websocket / Redis
- File(s):
  - `server/services/game-room-registry.service.ts:24`
  - `server/services/game-room-registry.service.ts:261`
  - `server/services/realtime-match.service.ts:137`
  - `server/services/realtime-match.service.ts:187`
- Function/class/module: `GameRoomRegistry.runDistributedExclusive`
- What is wrong: distributed room lock TTL is fixed at 5 seconds and is acquired once. Long DB/network pauses can exceed TTL while the critical section still runs.
- Why it matters in production: another instance can acquire the same room lock and operate on stale state, risking duplicated/lost moves under distributed scaling.
- Evidence from code: Redis `SET NX PX 5000` acquisition wraps async task without renewal/heartbeat.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static Redis/game search.
- Official reference: Redis locking guidance and Socket.IO multi-node docs.
- Recommended fix: renew lock during long critical sections, shorten critical sections, or use a tested lock library with fencing tokens. Add DB-side conditional guards as a second layer.
- Tests to add: simulated slow DB over TTL; concurrent instances; stale lock holder must not persist stale move.
- Risk if ignored: inconsistent room state in distributed gameplay.
- Launch impact: Should fix before public launch

### [Medium] Move persistence ignores whether the Mongo update matched a live match

- Status: Confirmed
- Area: websocket / database
- File(s):
  - `server/services/match.service.ts:400`
  - `server/services/match.service.ts:409`
  - `server/services/realtime-match.service.ts:212`
- Function/class/module: `MatchService.persistMoveHistory`, `RealtimeMatchService.makeMove`
- What is wrong: move persistence calls `updateOne` but does not check matched/modified count before the realtime service caches and emits move state.
- Why it matters in production: if the match document is missing, terminal, or update fails to match, clients can receive a move that was not durably persisted.
- Evidence from code: `persistMoveHistory` returns `void`; realtime flow continues after it.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static DB/socket search.
- Official reference: MongoDB update result docs and transaction consistency guidance.
- Recommended fix: return update result or updated match state; fail the socket action if persistence did not apply; add retry/reload logic.
- Tests to add: deleted match, terminal match, DB update matched 0, no `move-made` emission.
- Risk if ignored: client/server divergence and replay/reconnect inconsistency.
- Launch impact: Should fix before public launch

### [Medium] Resign and stale-expiry paths do not emit room-level game-over events

- Status: Confirmed
- Area: websocket / UX
- File(s):
  - `server/sockets/game.socket.ts:168`
  - `server/controllers/match.controller.ts:184`
  - `server/services/match.service.ts:557`
  - `src/features/game/useGameRoom.ts:103`
- Function/class/module: game socket events, resign/expiry paths
- What is wrong: move completion emits room-level `game-over`, but resign and stale expiry paths mainly emit public lobby events. The client game room hook listens for `room-sync`, `game-started`, `move-made`, and `game-over`.
- Why it matters in production: players can remain on stale game screens after non-move completion until refresh/reconnect.
- Evidence from code: socket move handler emits `game-over`; resign/expiry emit public status updates without direct room event in the inspected path.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static game/socket search.
- Official reference: Socket.IO event delivery guidance.
- Recommended fix: emit room-level terminal events for resign/stale expiry and update client state consistently.
- Tests to add: resign emits `game-over` to both players; stale expiry emits room terminal state; reconnect sees final result.
- Risk if ignored: confusing real-money game completion UX and support disputes.
- Launch impact: Should fix before public launch

### [Medium] M-Pesa code validation is plausibility-based unless manual/provider verification is enforced

- Status: Needs verification
- Area: payment / admin
- File(s):
  - `server/services/mpesa-code-validation.service.ts:336`
  - `server/services/mpesa-code-validation.service.ts:340`
  - `server/services/order.service.ts:206`
- Function/class/module: `MpesaCodeValidationService`, `OrderService`
- What is wrong: code validation can return `VALID_PLAUSIBLE` based on format/date rules. Admin approval can credit BUY orders. The review did not find provider-side transaction verification in this path.
- Why it matters in production: plausibility checks alone cannot prove a real M-Pesa payment occurred. Admin workflow may mitigate this, but the launch gate should verify it.
- Evidence from code: validation result is plausibility status; order service admin completion can credit.
- Runtime evidence, if any: Not tested with M-Pesa provider.
- Command evidence, if any: Static M-Pesa search.
- Official reference: OWASP API Security business-flow validation and logging guidance.
- Recommended fix: require durable proof plus provider/statement reconciliation or explicit admin evidence checklist before crediting; rate-limit and lock repeated code guesses.
- Tests to add: fake plausible code cannot auto-credit; duplicate code rejection; failed-attempt lock; admin audit evidence requirement.
- Risk if ignored: fraudulent credits or disputes.
- Launch impact: Blocks real-money beta

### [Medium] Withdrawal MFA TTL mismatch can expire server intent while frontend still offers resume

- Status: Confirmed
- Area: auth / payment / UX
- File(s):
  - `server/services/withdrawal-intent.service.ts:7`
  - `server/services/withdrawal-intent.service.ts:68`
  - `src/features/bank/withdrawalResume.ts:2`
- Function/class/module: withdrawal intent storage and frontend resume storage
- What is wrong: server withdrawal intents use a 5 minute TTL, while the frontend draft/resume window is 10 minutes. Authorization refreshes server TTL to 5 minutes.
- Why it matters in production: users can return from MFA to a still-visible frontend draft whose server intent has expired, causing failed/resubmitted withdrawals.
- Evidence from code: server TTL is `300`; frontend draft TTL is `10 * 60 * 1000`.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static withdrawal MFA search.
- Official reference: OWASP Session Management and Authentication Cheat Sheets.
- Recommended fix: align TTLs and show exact expiry; refresh only under secure challenge state; give clear expired-intent recovery.
- Tests to add: return at 4:59, 5:01, and 10:00; expired server intent clears frontend draft.
- Risk if ignored: failed withdrawals and duplicate restart attempts.
- Launch impact: Should fix before public launch

### [Medium] MFA challenge is consumed before factor verification

- Status: Confirmed
- Area: auth / MFA
- File(s):
  - `server/services/auth-mfa.service.ts:120`
  - `server/services/auth-mfa.service.ts:128`
  - `server/controllers/auth.controller.ts:850`
- Function/class/module: `AuthMfaService.consumeChallenge`, withdrawal MFA verification
- What is wrong: MFA challenge consumption deletes the challenge before factor verification occurs in the controller path.
- Why it matters in production: one wrong or malformed factor attempt can burn the challenge, forcing restart. That can be acceptable as anti-replay, but it should be intentional and user-visible for withdrawal step-up.
- Evidence from code: challenge is deleted in consume path; controller verifies factor after consumption.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static MFA search.
- Official reference: OWASP Authentication Cheat Sheet.
- Recommended fix: decide policy explicitly. If retry is intended, verify factor before deleting or track attempts; if one-shot is intended, message it clearly and test recovery.
- Tests to add: wrong factor behavior; replay behavior; expired challenge; user returns to withdrawal flow after failure.
- Risk if ignored: user lockout/friction and duplicate withdrawal restarts.
- Launch impact: Should fix before public launch

### [Medium] `npm start` does not force production mode

- Status: Confirmed
- Area: deployment
- File(s):
  - `package.json:8`
  - `server/config/env.ts:19`
  - `scripts/start-production.mjs:1`
  - `server/http/frontend.ts:133`
  - `server/http/security-headers.ts:26`
- Function/class/module: start script and env loading
- What is wrong: `npm start` runs `node ./dist/server/main.js` without forcing `NODE_ENV=production`; env parsing defaults missing `NODE_ENV` to `development`; a production wrapper exists but is not wired to `start`.
- Why it matters in production: if the host forgets `NODE_ENV=production`, the server can attempt Vite middleware and CSP is disabled.
- Evidence from code: start script, env default, dev middleware branch, and CSP production gating.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static deployment review.
- Official reference: Express production security/performance docs, Vite env/mode docs.
- Recommended fix: wire `npm start` to the production wrapper or fail startup when production deployment vars are present but `NODE_ENV` is not production.
- Tests to add: start script/env test; production-like env with missing `NODE_ENV` fails.
- Risk if ignored: accidental dev-mode production deployment.
- Launch impact: Should fix before public launch

### [Medium] Production lockfile has unresolved moderate vulnerabilities

- Status: Confirmed
- Area: deployment / security
- File(s):
  - `package.json:49`
  - `package.json:62`
  - `package-lock.json:1957`
  - `package-lock.json:2382`
  - `package-lock.json:2569`
  - `package-lock.json:3878`
  - `package-lock.json:4237`
  - `package-lock.json:4246`
- Function/class/module: dependency lockfile
- What is wrong: `npm audit --omit=dev` reports 7 moderate production vulnerabilities involving `qs`, `body-parser`, `express`, `ws`, `engine.io`, `engine.io-client`, and `socket.io-adapter`.
- Why it matters in production: real-money platforms should keep production dependency advisories under an explicit risk-acceptance gate.
- Evidence from code: direct `express` and `socket.io` deps; locked vulnerable transitive versions.
- Runtime evidence, if any: Not applicable.
- Command evidence, if any: `npm audit --omit=dev` failed with 7 moderate vulnerabilities and no high/critical.
- Official reference: npm audit docs and GitHub Dependabot docs.
- Recommended fix: update/override affected packages to patched versions where available, rerun audit, and document any accepted residual advisory.
- Tests to add: CI audit gate for production dependencies.
- Risk if ignored: known DoS/memory disclosure advisories remain in production dependency tree.
- Launch impact: Should fix before public launch

### [Medium] Protected deep links are lost after login

- Status: Confirmed
- Area: frontend / UX
- File(s):
  - `src/app/ProtectedRoute.tsx:25`
  - `src/pages/auth/LoginPage.tsx:45`
  - `src/pages/auth/LoginPage.tsx:92`
- Function/class/module: `ProtectedRoute`, `LoginPage`
- What is wrong: unauthenticated protected routes redirect to `/auth/login` without preserving `redirectTo`; login defaults to `/play`.
- Why it matters in production: invite links, game room links, and bank/withdraw links drop users into the lobby after login.
- Evidence from code: protected redirect omits current path; login default is `/play`.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static frontend routing search.
- Official reference: React Router docs.
- Recommended fix: include sanitized `redirectTo` from current location and consume it after login.
- Tests to add: `/game/:roomId` logged-out redirect returns to room; `/bank?view=withdraw` returns to withdraw.
- Risk if ignored: failed onboarding and lost withdrawal/game context.
- Launch impact: Should fix before public launch

### [Medium] Revoked admins can remain in stale merchant shell until auth refresh

- Status: Confirmed
- Area: frontend / admin / UX
- File(s):
  - `src/app/ProtectedRoute.tsx:33`
  - `server/routes/admin.routes.ts:18`
  - `src/services/api/apiClient.ts:139`
  - `src/components/merchant/MerchantLayout.tsx:169`
- Function/class/module: admin route guard and API client
- What is wrong: client admin route protection relies on cached `userData?.isAdmin`; server denies revoked users, but API 403 handling does not navigate on `ADMIN_ACCESS_REQUIRED`.
- Why it matters in production: server-side authorization holds, but revoked admins can remain in a stale admin UI with confusing errors.
- Evidence from code: client guard, server admin middleware, API 403 allowlist, merchant error display.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static frontend/admin search.
- Official reference: OWASP ASVS access control and API Security Top 10.
- Recommended fix: on admin 403, refresh `/me` and navigate out of merchant shell; clear stale admin state.
- Tests to add: revoke admin during session; next admin API 403 removes merchant UI.
- Risk if ignored: confusing stale privileged UI and support/audit ambiguity.
- Launch impact: Should fix before public launch

### [Medium] Some technical/server errors are shown directly to users

- Status: Confirmed
- Area: frontend / UX / security
- File(s):
  - `src/components/merchant/MerchantLayout.tsx:169`
  - `src/components/merchant/MerchantLayout.tsx:350`
  - `src/features/game/useGameRoom.ts:66`
  - `src/pages/GamePage.tsx:41`
- Function/class/module: merchant layout, game room hook/page
- What is wrong: merchant dashboard and game socket errors forward raw error messages instead of consistently mapping them through safe user-facing copy.
- Why it matters in production: internal 500/503/socket messages can leak implementation details and create confusing support screenshots.
- Evidence from code: raw `loadError.message` and socket `error.message` are displayed/toasted.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static frontend error search.
- Official reference: OWASP Error Handling/Logging guidance and OWASP REST Security Cheat Sheet.
- Recommended fix: map API/socket errors to stable user-facing messages and log detailed errors server-side only.
- Tests to add: server 500/503 and socket error render generic copy without stack/internal message.
- Risk if ignored: information disclosure and poor incident UX.
- Launch impact: Should fix before public launch

### [Medium] Deposit pending state does not poll or refresh balance after wallet send

- Status: Confirmed
- Area: frontend / payment / UX
- File(s):
  - `src/features/bank/DepositPanel.tsx:173`
  - `src/features/bank/DepositPanel.tsx:377`
  - `src/pages/BankPage.tsx:131`
- Function/class/module: deposit panel and bank page
- What is wrong: after TonConnect send, the panel enters pending state and shows copy that balance will update, but it does not refresh user balance or poll transactions from that state.
- Why it matters in production: successful deposits can appear stale until navigation/manual refresh, causing duplicate deposits/support tickets.
- Evidence from code: send path sets pending/toast; transaction fetch runs only when portal view is active.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static frontend deposit search.
- Official reference: React docs and TON Connect UX expectations.
- Recommended fix: poll deposit status/transactions with backoff, refresh balance on confirmed credit, and show clear pending/failure states.
- Tests to add: pending deposit polls; confirmed credit refreshes balance; timeout/failure copy.
- Risk if ignored: user confusion and duplicate funding attempts.
- Launch impact: Should fix before public launch

### [Medium] TonConnect manifest legal URLs do not match app routes

- Status: Confirmed
- Area: frontend / deployment
- File(s):
  - `server/app.ts:369`
  - `server/app.ts:370`
  - `server/http/frontend.ts:16`
  - `server/http/frontend.ts:17`
- Function/class/module: TonConnect manifest and frontend route allowlist
- What is wrong: manifest emits `/privacy-policy.html` and `/terms-of-use.html`, while frontend routes are `/privacy` and `/terms`.
- Why it matters in production: wallet/client review links may 404 or fail trust/compliance checks.
- Evidence from code: manifest URL generation and frontend route list differ.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static deployment review.
- Official reference: TON Connect manifest docs.
- Recommended fix: align manifest URLs with existing routes or add static/SPA routes for the advertised paths.
- Tests to add: `/tonconnect-manifest.json` URLs return 200.
- Risk if ignored: wallet trust/compliance friction.
- Launch impact: Should fix before public launch

### [Medium] Critical money and realtime failure modes are tested through mocks or missing branches

- Status: Confirmed
- Area: tests
- File(s):
  - `tests/integration/server/middleware/ton-payments.test.ts:1101`
  - `server/controllers/transaction.controller.ts:107`
  - `server/controllers/transaction.controller.ts:124`
  - `server/repositories/user-balance.repository.ts:176`
  - `server/services/realtime-match.service.ts:153`
  - `tests/e2e/match.spec.ts:28`
- Function/class/module: integration/e2e test suite
- What is wrong: existing tests cover many happy/security paths, but several production-critical failure modes are mocked away or missing: consumed withdrawal intent replay, repository-level atomic debit/concurrency, invalid/out-of-turn socket moves, proof negative validation, readiness down states, REST CORS preflight/no-origin CSRF, OAuth start redirect/cookie contract.
- Why it matters in production: tests can pass without exercising the branches most likely to lose money or cause disputes.
- Evidence from code: withdrawal replay test mocks intent consumption success; debit path is often mocked through service calls; invalid move branches return `null` but need explicit socket assertions.
- Runtime evidence, if any: Not available.
- Command evidence, if any: `npm run test*` could not complete in this workspace.
- Official reference: Node.js test runner and Playwright best practices.
- Recommended fix: add targeted tests listed in Section 20 before beta.
- Tests to add: see Section 20.
- Risk if ignored: regressions in real-money edge cases remain undetected.
- Launch impact: Blocks real-money beta

### [Medium] No GitHub workflows or deployment descriptors were found in the repository

- Status: Confirmed
- Area: deployment / supply-chain
- File(s):
  - `package.json:11`
  - `package.json:14`
  - `package.json:16`
- Function/class/module: repository CI/deployment configuration
- What is wrong: no committed `.github/`, `render.yaml`, Dockerfile, Procfile, Fly, Railway, Vercel, or Netlify descriptors were found. CI, deployment command, instance count, and security scanning assumptions live outside the repo.
- Why it matters in production: launch gates are harder to audit and repeat when they are not versioned with the code.
- Evidence from code: package scripts exist, but no repository workflow/deployment descriptor was found.
- Runtime evidence, if any: Not applicable.
- Command evidence, if any: repo inspection returned `NO_GITHUB_DIR`.
- Official reference: GitHub code scanning, Dependabot, and secret scanning docs.
- Recommended fix: add versioned CI that runs install/typecheck/build/tests/e2e/audit and documents deployment topology/env.
- Tests to add: CI workflow itself; branch protection requiring green gates.
- Risk if ignored: unrepeatable release process and missing supply-chain controls.
- Launch impact: Should fix before public launch

### [Medium] Production metrics/readiness do not cover all irreversible money states

- Status: Confirmed
- Area: observability / payment
- File(s):
  - `server/app.ts:295`
  - `server/app.ts:303`
  - `server/services/metrics.service.ts:349`
  - `server/workers/failed-deposit-replay-worker.ts:53`
- Function/class/module: readiness endpoint, metrics service, failed deposit replay
- What is wrong: readiness checks dependency status/background job `lastError`, and metrics include unmatched deposits, but terminal deposit failures and some withdrawal stuck/recovery queues need explicit SLO metrics and alerts.
- Why it matters in production: readiness can stay green while a customer-affecting money item needs manual recovery.
- Evidence from code: readiness and metrics lines above; deposit terminal failure is log-only plus repository status.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static observability search.
- Official reference: OWASP Logging Cheat Sheet.
- Recommended fix: expose counts/ages for terminal failed deposits, stuck withdrawals, pending confirmations, unreconciled reserve deltas, and failed proof relays; alert on thresholds.
- Tests to add: metrics include each state; readiness degradation policy; redaction in logs/metrics.
- Risk if ignored: slow incident detection and customer fund-support failures.
- Launch impact: Should fix before public launch

### [Medium] Merchant/admin dashboard queries need pagination and N+1 review before scale

- Status: Needs verification
- Area: database / performance
- File(s):
  - `server/services/transaction.service.ts:67`
  - `server/services/merchant-dashboard.service.ts:279`
  - `server/services/merchant-dashboard.service.ts:284`
  - `server/services/merchant-dashboard.service.ts:293`
  - `server/services/merchant-dashboard.service.ts:506`
- Function/class/module: transaction feed and merchant dashboard enrichment
- What is wrong: static review flagged dashboard/feed enrichment and count/query patterns that should be checked for pagination, indexes, and looped DB calls under production data sizes.
- Why it matters in production: admin/merchant dashboards are operationally critical during payment incidents; slow dashboards make recovery harder.
- Evidence from code: query/enrichment code locations identified by DB and frontend reviewers; exact runtime cost not measured.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: Static `.find`, `countDocuments`, loop, and service searches.
- Official reference: MongoDB indexing strategies and production notes.
- Recommended fix: profile dashboard queries against production-like data, ensure pagination and covering indexes, remove N+1 enrichment.
- Tests to add: integration/performance tests with large order/transaction sets; query plan verification for core dashboard filters.
- Risk if ignored: degraded admin incident response under load.
- Launch impact: Should fix before public launch

### [Medium] Actual production environment values and external service settings were not verified

- Status: Needs verification
- Area: deployment
- File(s):
  - `.env.example:59`
  - `.env.example:90`
  - `.env.example:96`
  - `.env.example:121`
  - `.env.example:160`
  - `server/config/env.ts:390`
  - `server/config/env.ts:406`
  - `server/config/env.ts:420`
  - `server/config/env.ts:430`
- Function/class/module: environment schema and production deployment
- What is wrong: code has production env validation, but the actual production settings for Google OAuth redirect URI, Gmail sender, Turnstile keys, CORS origins, Redis TLS/auth, TON network/hot wallet, metrics token, topology, and trust proxy were not available in this review.
- Why it matters in production: wrong env values can break auth, deposits, withdrawals, metrics, CORS, sessions, or distributed locking.
- Evidence from code: env schema includes production guards; `.env.example` contains placeholders/defaults, not production values.
- Runtime evidence, if any: Not tested.
- Command evidence, if any: static env/deployment review.
- Official reference: Express behind proxies, Redis security, Google OAuth, Gmail API, Cloudflare Turnstile, TON docs.
- Recommended fix: perform a production config review against actual deployment secrets/settings without exposing them in repo or logs.
- Tests to add: startup smoke test with production-like env in CI secret environment; redacted config report.
- Risk if ignored: production startup failures or unsafe network/wallet/auth configuration.
- Launch impact: Blocks real-money beta

## 10. Low-risk issues / cleanup

### [Low] Default `npm test` does not include e2e

- Status: Confirmed
- Area: tests
- File(s):
  - `package.json:11`
  - `package.json:14`
  - `package.json:15`
- Function/class/module: npm scripts
- What is wrong: `npm test` runs typecheck, unit, and integration tests only; e2e is separate and included in `test:all`.
- Why it matters in production: developers may treat `npm test` as the release gate and skip Playwright coverage.
- Evidence from code: script definitions in `package.json`.
- Runtime evidence, if any: Not applicable.
- Command evidence, if any: Static script review.
- Official reference: Playwright best practices.
- Recommended fix: make CI run `test:all` or an explicit equivalent and document local release commands.
- Tests to add: CI workflow requiring e2e.
- Risk if ignored: important frontend/auth/game regressions may miss the default local gate.
- Launch impact: Can fix after launch

## 11. Security review

Security posture has several strong controls: production CSP is enabled through Helmet when `NODE_ENV=production`, CSRF middleware protects `/api` mutations, cookies appear centralized with secure flags, admin routes apply server-side middleware, Mongoose sanitization and schema validation exist, and `.env` files are ignored. Confirmed security findings are in Sections 8 and 9: static server artifact exposure, MFA parity gaps, OAuth open redirect, technical error display, audit vulnerabilities, and unverified production env/external service settings.

### False alarms rejected

| Suspected issue | File inspected | Why it looked suspicious | Why it was rejected | Evidence |
|---|---|---|---|---|
| Admin routes might rely on frontend-only admin state | `server/routes/admin.routes.ts:18` | Merchant UI has a client `isAdmin` guard | Server routes apply auth, verified-account, admin, and MFA step-up middleware | `admin.routes.ts:18`, `admin.routes.ts:25-41` |
| CSRF missing for cookie-authenticated API | `server/app.ts:387`, `server/middleware/csrf.middleware.ts:20` | Cookie auth is used | `/api` cache/security middleware includes CSRF origin/referer checks | `csrf.middleware.ts:20-40` |
| Auth tokens stored in localStorage | `src/services/api/apiClient.ts`, auth controller | Frontend auth state exists | Review found cookie-based auth/session handling; no confirmed localStorage bearer token persistence | auth cookies set in controller; localStorage search did not show auth token storage |
| NoSQL injection through raw filters | `server/config/db.ts:6`, `server/middleware/validate.middleware.ts:8`, `server/utils/trusted-filter.ts:30` | Many Mongo queries exist | Mongoose sanitization and validation wrappers are present | listed files |
| Proof upload accepts arbitrary files | `server/controllers/order.controller.ts:149` | BUY proofs accept uploads | Size, MIME, and magic-byte validation are present | `order.controller.ts:149-157` |
| Dev-only bank preview exposed in production | `src/app/App.tsx:55` | Comment says `DEV-ONLY` and route bypasses auth | Route and lazy import are guarded by `import.meta.env.DEV` | `App.tsx:56`, `App.tsx:88` |
| Deposit duplicate credits from streaming/polling | `server/repositories/processed-transaction.repository.ts:118`, `server/services/deposit-ingestion.service.ts:628` | Both streaming and polling can see same chain tx | Unique processed tx hash and transactional credit path exist | listed files |

### Stale comment / AI-comment cleanup

- Searched comments and risk words with `rg -n "//|/\*|TODO|FIXME|HACK|NOTE|temporary|AI|generated|workaround|later|for now|should|probably" server src shared tests`.
- The notable production-looking comment was `src/app/App.tsx:55`, but it was rejected as a false alarm because the preview route is development-gated.
- No confirmed stale or hallucinated comment was important enough to block launch. Comments that use temporary/future language should still be reviewed during remediation.

## 12. Auth, session, and MFA review

Covered flows by static review: register, verify email, login, refresh session, protected route access, logout, forgot/reset password, Google OAuth login, MFA challenge, withdrawal MFA challenge, and return from withdrawal MFA.

Confirmed strengths:

- Protected route loading prevents most auth flash issues (`ProtectedRoute.tsx:21`, `PublicOnlyRoute.tsx:9`).
- Server admin authorization exists before admin routes.
- CSRF and cache controls are present for API responses.
- Refresh/session logic has tests around reuse/rotation and invalidation, although full commands did not pass locally.

Primary concerns:

- Critical C1 and High H11 make withdrawal step-up unsafe under concurrency/retry.
- High H3 shows MFA is not consistently enforced for all sign-in methods if MFA is intended as account sign-in protection.
- Medium M1, M6, and M7 cover redirect and MFA recovery edge cases.

## 13. Payment, wallet, TON, ledger, withdrawal, and M-Pesa review

Deposit flow review:

- Memo generation timing looked acceptable: frontend generates memo after amount review and server enforces expiration.
- Duplicate on-chain deposit credit protection appears directionally strong through unique processed transaction hash and Mongo transaction credit path.
- Remaining blockers are observability and recovery: terminal failed deposit replay is not surfaced in readiness/metrics, and production deposit runtime was not exercised.

Withdrawal flow review:

- Launch is blocked by C1, C2, and C3.
- Additional high-risk retry UX issue H11 makes lost-response retries unsafe.
- Hot-wallet gas buffer, TON network separation, production mnemonic secrecy, and real confirmation behavior were not verified with actual production config.

M-Pesa/proof flow review:

- Proof validation includes size/MIME/signature checks, but proof durability is a high-risk gap if Telegram relay fails.
- Code validation should not be treated as provider verification unless manual/provider reconciliation is explicitly part of operations.

## 14. Game fairness and realtime review

Confirmed strengths:

- Socket auth and server-side move validation exist.
- Realtime service validates participant, turn, column bounds, full columns, and terminal status.
- Some tests cover malformed room IDs and happy-path e2e play.

Primary concerns:

- Active stale expiry can race with fresh moves and incorrectly settle a wagered match.
- Multi-instance Socket.IO behavior is unsafe unless sticky sessions or websocket-only transport is verified.
- Distributed room lock TTL needs renewal/fencing.
- Persistence and terminal event emission need stronger update-result handling and client synchronization.

## 15. Database and concurrency review

Confirmed strengths:

- Deposit processed transaction uniqueness and transactional crediting are present.
- Several repository/service paths use atomic updates and indexes.
- Production env includes MongoDB TLS/explicit URI checks.

Primary concerns:

- Withdrawal terminal transitions must return update results and gate accounting.
- Backfill scripts touching balances must be offline or concurrency-safe.
- Move persistence must check matched/modified count.
- Dashboard queries need production-size profiling and index verification.

## 16. Redis, BullMQ, and background jobs review

Confirmed strengths:

- Redis production URL and TLS/auth validation are relatively strong.
- Distributed topology requires distributed locks, BullMQ, and Redis Socket.IO adapter in env validation.
- Graceful shutdown exists for background jobs, Socket.IO/HTTP, DB, and Redis.

Primary concerns:

- BullMQ retry/DLQ semantics are bypassed when wrapped processors swallow exceptions.
- Room lock TTL has no renewal.
- Terminal failed deposits are not prominent in readiness/metrics.

## 17. Frontend UX and routing review

Confirmed strengths:

- Protected/public route loading states reduce route flash.
- Withdrawal MFA resume is directionally implemented, including frontend draft/resume logic.
- Deposit memo timing is not generated too early based on static review.

Primary concerns:

- Money double-submit can generate multiple idempotency keys.
- Protected deep links are not resumed after login.
- Admin revocation can leave stale merchant shell.
- Some raw technical errors reach users.
- Deposit pending state does not actively refresh/poll balance.

## 18. API and validation review

Request validation is present through schemas and middleware, and CORS/CSRF controls exist. The API concerns that remain are business-flow validation rather than basic schema validation: withdrawal intent/idempotency binding, M-Pesa proof/code evidence, OAuth redirect normalization, admin 403 client handling, and no-origin/preflight test coverage.

## 19. Logging, monitoring, metrics, and incident-readiness review

Readiness and metrics exist, including dependency checks and protected metrics token behavior. However, production incident readiness is not sufficient for money flows until terminal failed deposits, stuck withdrawals, withdrawal confirmation mismatches, proof relay failures, reserve deltas, and pending confirmations are represented in metrics/dashboard/alerts with runbooks.

## 20. Testing gaps and recommended tests

Required missing-test analysis:

- Auth register/login/logout: covered directionally, but full test command failed locally.
- Refresh token rotation: covered directionally; rerun required.
- Session invalidation: covered directionally; rerun required.
- Email verification/password reset: covered directionally; rerun required.
- Google OAuth edge cases: callback/linking covered; add OAuth start cookie/redirect contract tests.
- MFA setup/challenge: covered directionally; add all sign-in-method MFA parity tests.
- Withdrawal MFA resume: add consumed-intent retry, concurrent resume, mismatched idempotency key.
- Duplicate deposit: existing unique-hash coverage directionally present; add streaming+polling duplicate race test.
- Duplicate withdrawal: add duplicate intent/concurrent worker/fault-injection tests.
- Worker retry idempotency: add BullMQ throw/retry/DLQ tests and post-broadcast TON uncertainty tests.
- Ledger atomicity: add repository-level concurrent debit and terminal-transition accounting tests.
- Balance precision: covered directionally; add migration/backfill concurrency tests.
- M-Pesa code validation: add fake plausible code/no auto-credit and failed-attempt lock tests.
- M-Pesa proof replay: add proof hash replay/durable proof failure tests.
- Socket auth: covered directionally; add socket-level unauthorized room join tests.
- Invalid move/out of turn/duplicate move: add explicit no-emit tests.
- Game settlement/stale match expiry: add move/expiry race and settlement idempotency tests.
- Admin authorization: covered server-side; add revoked-admin UI/API refresh test.
- CSRF/CORS/rate limit: add no-origin mutation and REST preflight tests.
- Readiness endpoint: add Mongo/Redis/BullMQ down-state 503 tests.
- Redis unavailable/Mongo unavailable: add startup/readiness and degraded-mode tests.
- Protected frontend routing: add deep-link resume and auth refresh tests.
- Playwright happy path: rerun after build; add bank/deposit/withdrawal MFA/game/admin unauthorized flows.

## 21. Deployment and supply-chain review

Deployment is not production-ready from repository evidence alone:

- No green local install/build/test/e2e/audit gate was established.
- Static server artifact/source-map exposure must be fixed.
- `npm start` relies on external `NODE_ENV=production`.
- No committed CI/deployment descriptors were found.
- Actual production env/external settings were not verified.
- `npm audit --omit=dev` has 7 moderate vulnerabilities.

Positive deployment evidence:

- Env schema contains strong production guards for MongoDB, Redis, trust proxy, topology, metrics token, and worker counts.
- Metrics endpoint is protected in production when `METRICS_TOKEN` is configured.
- Readiness endpoint checks database, Redis, BullMQ, hot wallet runtime, shutdown state, and background jobs.

## 22. Production launch checklist

| Checklist item | Status |
|---|---|
| `npm ci` passes | Fail |
| `npm run typecheck` passes | Fail |
| `npm run build` passes | Fail |
| `npm run test` passes | Fail |
| `npm run test:coverage` passes | Fail |
| `npm run test:e2e` passes | Fail |
| `npm audit --omit=dev` has no unresolved critical/high issues | Pass for high/critical; Fail for moderate gate |
| production env vars verified | Not tested |
| `.env.example` matches actual env schema | Not tested |
| MongoDB indexes verified | Not tested |
| Redis TLS/auth verified | Not tested |
| metrics token configured | Not tested |
| CORS production origins verified | Not tested |
| trust proxy verified | Not tested |
| Google OAuth redirect URI verified | Not tested |
| Gmail sending verified | Not tested |
| Turnstile production keys verified | Not tested |
| TON network config verified | Not tested |
| TON mainnet/testnet separation verified | Not tested |
| hot wallet address verified | Not tested |
| hot wallet minimum TON gas buffer verified | Not tested |
| hot wallet mnemonic not logged/exposed | Not tested |
| withdrawal MFA resume verified | Fail |
| duplicate deposit cannot credit twice | Not tested |
| duplicate withdrawal cannot execute twice | Fail |
| ledger updates are atomic | Fail |
| worker retries are idempotent | Fail |
| websocket game cannot accept invalid moves | Not tested |
| user cannot play out of turn | Not tested |
| game settlement cannot run twice | Not tested |
| admin routes require server-side authorization | Pass |
| user-facing errors do not expose internals | Fail |
| logs do not expose secrets or sensitive data | Not tested |
| readiness endpoint works | Not tested |
| health endpoint works | Not tested |
| graceful shutdown works | Not tested |
| rollback plan exists | Not tested |

## 23. Prioritized remediation plan

### Fix immediately

| Priority | Finding | Why now | Owner area | Suggested fix | Test required |
|---|---|---|---|---|---|
| P0 | C1 withdrawal MFA intent non-atomic/not key-bound | Duplicate withdrawal risk | Payments/auth | Atomic consume, key validation, idempotency replay before consume | Concurrent resume tests |
| P0 | C2 ambiguous TON send retry/refund | Double-send/refund risk | Payments/wallet | Persist post-broadcast uncertainty as stuck; reconcile before retry/refund | Fault-injection TON tests |
| P0 | C3 confirmation accounting without transition | Ledger corruption risk | Ledger/database | Return transition result; gate accounting on modified state | Race terminal-state tests |
| P0 | H2 verification gates failed | No green release candidate | DevOps/testing | Clean CI install/build/test/e2e/audit | CI gate |
| P1 | H1 static server output exposure | Source disclosure | Deployment | Move server build outside public static root | 404 static tests |

### Fix before real-money beta

| Priority | Finding | Why before beta | Owner area | Suggested fix | Test required |
|---|---|---|---|---|---|
| P1 | H3 MFA parity | Real-money account protection | Auth | Central MFA gate for all session issuance paths | MFA enrolled sign-in tests |
| P1 | H4 active expiry race | Wrong wager settlement | Game/backend | Conditional stale cutoff update/lock | Move-expiry race test |
| P1 | H5 Socket.IO scaling | Multi-instance game reliability | Realtime/devops | Sticky sessions or websocket-only | Multi-instance socket test |
| P1 | H6 proof durability | Fiat proof/audit loss | Payments/admin | Durable proof storage before order acceptance | Relay failure proof test |
| P1 | H7 BullMQ retries swallowed | Background job false safety | Jobs | Rethrow in BullMQ processors, DLQ alerts | Retry/DLQ tests |
| P1 | H8 terminal failed deposits log-only | Missed customer deposits | Ops/payments | Metrics/dashboard/alerts | Terminal metric test |
| P1 | H9 frontend duplicate money submits | Duplicate money actions | Frontend | Stable in-flight idempotency refs | Double-click tests |
| P1 | H10 balance backfill unsafe live | Balance corruption | Database | Offline guard or conditional updates | Concurrent migration test |
| P1 | H11 withdrawal replay unreachable | Stuck/restarted withdrawals | Payments | Replay before consume | Lost-response retry test |
| P1 | M5 M-Pesa plausibility-only | Fake credits if ops weak | Payments/admin | Provider/manual evidence gate | Fake plausible code test |
| P1 | M15 testing gaps | Edge cases untested | QA | Add listed tests | Targeted test suite |
| P1 | M16 production env not verified | Misconfig breaks money/auth | DevOps | Production config review | Startup smoke test |

### Fix before public launch

| Priority | Finding | Why before launch | Owner area | Suggested fix | Test required |
|---|---|---|---|---|---|
| P2 | M1 OAuth open redirect | Login phishing | Auth | Same-origin URL normalization | Redirect tests |
| P2 | M2 lock TTL no renewal | Distributed consistency | Realtime/Redis | Renew/fence lock | Slow critical-section test |
| P2 | M3 move persistence ignores update | State divergence | Game/database | Check update result | No-match no-emit test |
| P2 | M4 missing terminal room events | Player dispute UX | Game/frontend | Emit room terminal events | Resign/expiry socket tests |
| P2 | M6 TTL mismatch | Withdrawal UX failures | Auth/payments | Align TTLs | Time-bound resume tests |
| P2 | M7 MFA challenge burn | User lockout/restarts | Auth | Define retry policy | Wrong-factor tests |
| P2 | M8 npm start mode | Accidental dev production | Deployment | Use production start wrapper | Env startup tests |
| P2 | M9 audit moderates | Supply-chain hygiene | DevOps | Update lockfile | Audit CI |
| P2 | M10 deep links lost | Bad onboarding | Frontend | Preserve redirectTo | Route tests |
| P2 | M11 stale admin shell | Admin UX/audit clarity | Frontend/admin | Refresh/navigate on admin 403 | Revocation test |
| P2 | M12 raw errors | Info leakage/UX | Frontend | Error mapping | 500/socket error tests |
| P2 | M13 deposit no refresh | Deposit confusion | Frontend/payment | Poll status/balance | Deposit pending test |
| P2 | M14 TonConnect legal URLs | Wallet trust | Deployment | Align manifest/routes | Manifest URL test |
| P2 | M17 dashboard scale | Incident performance | Database/admin | Profile and index | Query plan/perf test |
| P2 | M18 no CI/deploy descriptors | Release repeatability | DevOps | Commit CI/deploy docs | Branch protection |

### Fix after launch

| Priority | Finding | Why later is acceptable | Owner area | Suggested fix | Test required |
|---|---|---|---|---|---|
| P3 | L1 default npm test excludes e2e | CI can still run e2e explicitly | QA | Document or make `npm test` include e2e in CI | CI script test |

## 24. Production launch gate

### Launch blocker

- C1 withdrawal MFA intent non-atomic/not idempotency-bound.
- C2 ambiguous TON send retry/refund after possible broadcast.
- C3 withdrawal confirmation accounting can corrupt ledger totals.
- H2 clean install/build/typecheck/test/e2e verification failed in this workspace.

### Must fix before real-money beta

- H1 static server output/source maps exposed under public static root.
- H3 MFA parity across sign-in methods.
- H4 active match stale-expiry race.
- H5 Socket.IO distributed sticky/websocket-only guarantee.
- H6 durable M-Pesa proof storage.
- H7 BullMQ retries/DLQ semantics.
- H8 terminal failed deposit observability.
- H9 frontend stable idempotency keys for money actions.
- H10 balance backfill live-safety.
- H11 withdrawal idempotency replay after consumed intent.
- M5 M-Pesa plausibility/provider/manual verification.
- M15 critical missing/mocked tests.
- M16 actual production env/external service verification.

### Should fix before public launch

- M1 OAuth redirect sanitizer.
- M2 distributed room lock renewal/fencing.
- M3 move persistence update result handling.
- M4 room terminal events for resign/expiry.
- M6 withdrawal MFA TTL alignment.
- M7 MFA challenge retry/consume policy.
- M8 production start mode.
- M9 audit moderate vulnerabilities.
- M10 protected deep-link resume.
- M11 stale admin shell handling.
- M12 safe user-facing errors.
- M13 deposit pending refresh/polling.
- M14 TonConnect legal URLs.
- M17 merchant/dashboard performance verification.
- M18 CI/deployment descriptors.

### Can fix after launch

- L1 default `npm test` excluding e2e if CI explicitly gates e2e elsewhere.

## 25. Minimum safe production checklist

1. Run `npm ci`
2. Run `npm run typecheck`
3. Run `npm run build`
4. Run `npm run test`
5. Run `npm run test:coverage`
6. Run `npm run test:e2e`
7. Run `npm audit --omit=dev`
8. Verify production env vars
9. Verify Mongo indexes
10. Verify Redis TLS/auth
11. Verify metrics token
12. Verify CORS production origin
13. Verify trust proxy config
14. Verify Google OAuth redirect URI
15. Verify Gmail sending
16. Verify Turnstile production keys
17. Verify TON mainnet/testnet separation
18. Verify hot wallet gas buffer
19. Verify withdrawal MFA resume
20. Verify duplicate deposit protection
21. Verify duplicate withdrawal protection
22. Verify ledger atomicity
23. Verify worker idempotency
24. Verify websocket move validation
25. Verify admin authorization
26. Verify user-facing errors
27. Verify log redaction
28. Verify readiness endpoint
29. Verify graceful shutdown
30. Verify rollback plan

## 26. Appendix: official references used

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP API Security Top 10: https://owasp.org/API-Security/
- OWASP Node.js Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- Express production security: https://expressjs.com/en/advanced/best-practice-security.html
- Express production performance: https://expressjs.com/en/advanced/best-practice-performance.html
- Express behind proxies: https://expressjs.com/en/guide/behind-proxies.html
- Node.js test runner: https://nodejs.org/api/test.html
- React docs: https://react.dev/reference/react
- React Router docs: https://reactrouter.com/start/framework/routing
- Vite production build: https://vite.dev/guide/build
- Vite env and modes: https://vite.dev/guide/env-and-mode
- Playwright best practices: https://playwright.dev/docs/best-practices
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Helmet docs: https://helmetjs.github.io/
- CORS package docs: https://github.com/expressjs/cors
- express-rate-limit docs: https://express-rate-limit.mintlify.app/overview
- Socket.IO multiple nodes: https://socket.io/docs/v4/using-multiple-nodes/
- Socket.IO server options: https://socket.io/docs/v4/server-options/
- MongoDB production notes: https://www.mongodb.com/docs/manual/administration/production-notes/
- MongoDB indexing strategies: https://www.mongodb.com/docs/manual/applications/indexes/
- MongoDB transaction production considerations: https://www.mongodb.com/docs/manual/core/transactions-production-consideration/
- Mongoose docs: https://mongoosejs.com/docs/guide.html
- Redis security: https://redis.io/docs/latest/operate/oss_and_stack/management/security/
- Redis persistence: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- BullMQ docs: https://docs.bullmq.io/
- TON Connect docs: https://docs.ton.org/applications/ton-connect/overview
- TON Jetton docs: https://docs.ton.org/blockchain-basics/standard/tokens/jettons/overview
- TON Center API docs: https://toncenter.com/api/v3/
- Google OAuth 2.0 docs: https://developers.google.com/identity/protocols/oauth2
- Gmail API sending docs: https://developers.google.com/workspace/gmail/api/guides/sending
- Cloudflare Turnstile docs: https://developers.cloudflare.com/turnstile/
- GitHub code scanning: https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning
- GitHub Dependabot: https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependabot-version-updates
- GitHub secret scanning: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
- npm audit: https://docs.npmjs.com/cli/commands/npm-audit

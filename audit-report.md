# 4real Fintech Audit Report

Last updated: 2026-04-25

## Executive Summary

This repository is a custodial, real-money application that manages user USDT balances on TON, merchant buy/sell orders, and wagered matches. The current production shape is:

Browser + TonConnect + Socket.IO client -> Express API + Socket.IO server -> MongoDB -> Toncenter/TON -> Telegram proof review channel.

This hardening pass removed the highest-risk issues that were previously present in the codebase:

- Money-changing HTTP routes now require `Idempotency-Key`.
- Match seat-claiming and wager locking moved out of socket connection flow and into explicit HTTP APIs.
- Stale matches now settle instead of leaving funds locked indefinitely.
- Merchant proof handling no longer trusts arbitrary external URLs; proofs are uploaded to the backend and relayed to Telegram.
- API errors now use a consistent `{ code, message, details? }` envelope.
- Deposit polling rejects aborted transfers and records audit metadata.
- TonConnect manifest serving is now backend-owned and bound to the actual request origin.

Residual production risks still remain and are listed below. The most important operational action outside the codebase is secret rotation: the checked-in local environment values currently visible in `.env` must be treated as compromised.

Production readiness score after this pass: **82 / 100**

## Project Structure Map

### Root

- `server.ts`: top-level entry that starts the backend.
- `package.json`: runtime and build scripts.
- `package-lock.json`: pinned dependency graph.
- `tsconfig.json`: TypeScript configuration.
- `vite.config.ts`: Vite build configuration.
- `index.html`: SPA HTML shell.
- `.env.example`: safe example configuration for backend and frontend runtime.
- `audit-report.md`: this audit report.
- `toast-audit.md`: toast UX review notes.
- `toast-guidelines.md`: toast design guidance.
- `metadata.json`: repo metadata used by the local environment.
- `scripts/start-production.mjs`: production boot script.

### `public/`

- `public/tonconnect-manifest.json`: static fallback TonConnect manifest for local/static use.
- `public/tonconnect-icon.svg`: stable wallet-manifest icon.
- `public/privacy-policy.html`: placeholder privacy policy page.
- `public/terms-of-use.html`: placeholder terms page.

### `shared/`

- `shared/types/api.ts`: shared API DTOs and enums between frontend and backend.
- `shared/socket-events.ts`: shared Socket.IO event names.

### `src/` frontend

#### App shell

- `src/main.tsx`: React bootstrap.
- `src/index.css`: global styling.
- `src/vite-env.d.ts`: Vite type declarations.
- `src/types/api.ts`: frontend re-export of shared API types.

#### `src/app/`

- `src/app/App.tsx`: route tree.
- `src/app/AppLayout.tsx`: authenticated layout shell.
- `src/app/AppProviders.tsx`: top-level providers including TonConnect.
- `src/app/AuthProvider.tsx`: auth state, refresh, and cookie-backed session handling.
- `src/app/ProtectedRoute.tsx`: route guard.
- `src/app/RouteLoading.tsx`: lazy route fallback UI.
- `src/app/ToastProvider.tsx`: toast notifications.

#### `src/pages/`

- `src/pages/AuthPage.tsx`: login/register screen.
- `src/pages/BankPage.tsx`: bank landing page and transaction history.
- `src/pages/DashboardPage.tsx`: lobby, leaderboard, and match creation entry.
- `src/pages/GamePage.tsx`: room preview, explicit join flow, realtime board, resign flow.
- `src/pages/ProfilePage.tsx`: user profile and history.
- `src/pages/NotFoundPage.tsx`: 404 page.

#### `src/pages/merchant/`

- `src/pages/merchant/MerchantDashboardPage.tsx`: merchant overview.
- `src/pages/merchant/OrderDeskPage.tsx`: admin order review queue.
- `src/pages/merchant/LiquidityPage.tsx`: liquidity and job health view.
- `src/pages/merchant/AlertsPage.tsx`: consolidated merchant alerts.

#### `src/features/bank/`

- `src/features/bank/DepositPanel.tsx`: deposit memo/TonConnect deposit UI.
- `src/features/bank/WithdrawPanel.tsx`: withdrawal request UI.
- `src/features/bank/MerchantPanel.tsx`: user merchant order form and per-user order history.

#### `src/features/game/`

- `src/features/game/useGameRoom.ts`: Socket.IO room synchronization hook.
- `src/features/game/types.ts`: room and game event types.

#### `src/features/merchant/`

- `src/features/merchant/format.ts`: merchant dashboard formatting helpers.

#### `src/components/`

- `src/components/Navbar.tsx`: main navigation.
- `src/components/SketchyButton.tsx`: custom button component.
- `src/components/SketchyContainer.tsx`: custom panel component.
- `src/components/merchant/MerchantLayout.tsx`: merchant section layout and shared data loading.

#### `src/services/`

- `src/services/auth.service.ts`: auth API client.
- `src/services/matches.service.ts`: match API client, including create/join/resign and preview.
- `src/services/orders.service.ts`: order API client using multipart proof uploads.
- `src/services/transactions.service.ts`: deposit memo, TonConnect prep, withdrawals, transaction history.
- `src/services/users.service.ts`: leaderboard/profile APIs.
- `src/services/merchant-dashboard.service.ts`: merchant admin APIs.
- `src/services/api/apiClient.ts`: common fetch wrapper and error parsing.

#### `src/sockets/`

- `src/sockets/gameSocket.ts`: Socket.IO client factory.

#### `src/hooks/`

- `src/hooks/useCopyToClipboard.ts`: clipboard helper.
- `src/hooks/useElementSize.ts`: resize observer helper.

#### `src/utils/`

- `src/utils/cn.ts`: className merge helper.
- `src/utils/idempotency.ts`: client idempotency key generation.
- `src/utils/isAbortError.ts`: abort error guard.

#### `src/canvas/`

- `src/canvas/drawConnectFourBoard.ts`: board renderer.
- `src/canvas/drawRoughRectangle.ts`: rough sketch shape helper.
- `src/canvas/runVictoryConfetti.ts`: victory animation.

### `server/` backend

#### App and HTTP

- `server/app.ts`: Express app setup, health routes, TonConnect manifest route, middleware registration.
- `server/server.ts`: backend entry re-export.
- `server/http/frontend.ts`: Vite dev middleware and production static frontend serving.

#### Config

- `server/config/env.ts`: environment parsing, defaults, and validation.
- `server/config/db.ts`: MongoDB connection lifecycle.
- `server/config/cors.ts`: CORS configuration for HTTP and sockets.
- `server/config/cookies.ts`: auth cookie configuration.
- `server/config/config.ts`: legacy/common config helpers.

#### Controllers

- `server/controllers/auth.controller.ts`: register, login, me, logout.
- `server/controllers/match.controller.ts`: active match list, match preview, create, join, resign, history.
- `server/controllers/merchant-admin.controller.ts`: merchant dashboard/order desk.
- `server/controllers/order.controller.ts`: merchant order list/create/update.
- `server/controllers/transaction.controller.ts`: deposits, withdrawals, transaction history.
- `server/controllers/user.controller.ts`: leaderboard and user profile endpoints.

#### Middleware

- `server/middleware/auth.middleware.ts`: cookie auth and admin guard.
- `server/middleware/csrf.middleware.ts`: origin-based CSRF protection.
- `server/middleware/error.middleware.ts`: consistent API error serialization.
- `server/middleware/rate-limit.middleware.ts`: general/auth rate limiting.
- `server/middleware/request-context.middleware.ts`: request ID generation and structured request logging.
- `server/middleware/validate.middleware.ts`: Zod body validation.

#### Routes

- `server/routes/index.ts`: API route registry.
- `server/routes/auth.routes.ts`: auth routes.
- `server/routes/users.routes.ts`: user routes.
- `server/routes/matches.routes.ts`: match routes.
- `server/routes/orders.routes.ts`: order routes.
- `server/routes/transactions.routes.ts`: transaction routes.
- `server/routes/admin.routes.ts`: merchant admin routes.

#### Domain services

- `server/services/auth-identity.service.ts`: email/username normalization.
- `server/services/auth-token.service.ts`: JWT signing and verification.
- `server/services/audit.service.ts`: audit event recording.
- `server/services/background-jobs.service.ts`: worker scheduler and health snapshots.
- `server/services/deposit-service.ts`: deposit memo issuance.
- `server/services/deposit-tonconnect.service.ts`: TonConnect deposit preparation.
- `server/services/game-room-registry.service.ts`: in-memory room cache and room-level exclusivity.
- `server/services/game-room.service.ts`: room state creation and board logic helpers.
- `server/services/hot-wallet-runtime.service.ts`: hot wallet runtime resolution and validation.
- `server/services/idempotency.service.ts`: persisted idempotent mutation executor.
- `server/services/match-payout.service.ts`: commission and payout math.
- `server/services/match.service.ts`: match creation, join, settlement, expiry, refunds, payouts.
- `server/services/merchant-config.service.ts`: merchant config resolution.
- `server/services/merchant-dashboard.service.ts`: merchant overview, liquidity, alerts, order desk.
- `server/services/order.service.ts`: order creation and admin state transitions.
- `server/services/realtime-match.service.ts`: socket room attach and move processing.
- `server/services/telegram-proof.service.ts`: Telegram proof relay.
- `server/services/transaction.service.ts`: unified ledger/deposit/withdrawal history.
- `server/services/user.service.ts`: user CRUD, balance sync, safe deductions, ELO updates.
- `server/services/withdrawal-engine.ts`: on-chain withdrawal sending and confirmation lookup.
- `server/services/withdrawal-service.ts`: queued withdrawal creation with transactional balance deduction.

#### Repositories

- `server/repositories/audit-event.repository.ts`: raw audit event persistence.
- `server/repositories/deposit.repository.ts`: deposit records.
- `server/repositories/deposit-memo.repository.ts`: deposit memos and claiming.
- `server/repositories/idempotency-key.repository.ts`: persisted idempotency responses.
- `server/repositories/jetton-wallet-cache.repository.ts`: TON jetton wallet derivation cache.
- `server/repositories/mongo.repository.ts`: raw Mongo collection access.
- `server/repositories/poller-state.repository.ts`: worker checkpoint state.
- `server/repositories/processed-transaction.repository.ts`: processed blockchain transaction hashes.
- `server/repositories/unmatched-deposit.repository.ts`: unmatched deposits for manual review.
- `server/repositories/user-balance.repository.ts`: authoritative raw ledger balances.
- `server/repositories/withdrawal.repository.ts`: withdrawal queue and status tracking.

#### Models

- `server/models/User.ts`: user schema.
- `server/models/Match.ts`: persisted match schema including settlement metadata.
- `server/models/Order.ts`: order schema with Telegram proof metadata.
- `server/models/Transaction.ts`: user-facing ledger transaction model.

#### Blockchain and utility libs

- `server/lib/jetton.ts`: TON address helpers and memo extraction.
- `server/lib/setup-db.ts`: index creation on boot.
- `server/lib/ton-client.ts`: TON client configuration.
- `server/utils/async-handler.ts`: async Express wrapper.
- `server/utils/http-error.ts`: typed HTTP error helpers.
- `server/utils/idempotency.ts`: request idempotency header validation.
- `server/utils/logger.ts`: structured logger.
- `server/utils/multipart.ts`: bounded multipart parser for image uploads.

#### Workers

- `server/workers/deposit-poller.ts`: Toncenter poller and deposit credit path.
- `server/workers/withdrawal-worker.ts`: withdrawal send, confirm, reconcile, and reserve monitor jobs.

#### Validation and types

- `server/validation/request-schemas.ts`: Zod request schemas.
- `server/types/api.ts`: backend re-export of shared API types.

#### Tests

- `server/middleware/auth.middleware.test.ts`: auth middleware behavior.
- `server/middleware/merchant-dashboard.test.ts`: merchant dashboard risk and pagination logic.
- `server/middleware/migration-services.test.ts`: DTO/schema/service migration checks.
- `server/middleware/order-service.test.ts`: order transactionality checks.
- `server/middleware/security.middleware.test.ts`: CSRF and validation behavior.
- `server/middleware/static-files.test.ts`: static/frontend fallback behavior.
- `server/middleware/ton-payments.test.ts`: TON memo, deposit, withdrawal, and runtime safety logic.

### Local reference bundles

- `tonpaymentskill/skill.md`: local TON workflow guidance.
- `tonpaymentskill/references/deposit-engine.md`: TON deposit reference notes.
- `tonpaymentskill/references/mongodb-schema.md`: TON ledger schema notes.
- `tonpaymentskill/references/withdrawal-engine.md`: TON withdrawal reference notes.
- `mongodb-security/skill.md`: Mongo security guidance.
- `mongodb-security/references/atlas-network-security.md`: Atlas network security notes.
- `mongodb-security/references/common-attack-scenarios.md`: Mongo attack scenario notes.

## Text Architecture Diagram

### Auth flow

1. Browser submits register/login to `/api/auth/*`.
2. `auth.controller.ts` validates identity and password, issues JWT, and stores it in an HTTP-only cookie.
3. `auth.middleware.ts` verifies JWT and token version on protected requests.
4. Frontend session state is hydrated via `AuthProvider` and `/api/auth/me`.

### Wallet and deposit flow

1. Browser requests a deposit memo from `/api/transactions/deposit/memo`.
2. Backend issues a unique memo and stores it in `deposit_memos`.
3. Browser either sends manually or uses TonConnect after `/api/transactions/deposit/prepare`.
4. `deposit-poller.ts` reads Toncenter transfer rows for the hot jetton wallet.
5. Backend rejects invalid/non-USDT/aborted rows, claims the memo, writes `deposits`, updates `user_balances`, syncs the display balance, and records audit events.

### Withdrawal flow

1. Browser submits `/api/transactions/withdraw` with `Idempotency-Key`.
2. Controller replays duplicates safely via `idempotency_keys`.
3. `withdrawal-service.ts` deducts the authoritative raw balance and queues a withdrawal atomically.
4. `withdrawal-worker.ts` claims queued docs, sends jetton transfers, confirms them on-chain, or refunds terminal failures.
5. Reserve monitor checks hot-wallet TON and USDT balances against ledger liabilities.

### Match flow

1. Browser creates a match through `/api/matches` with `Idempotency-Key`.
2. Backend enforces server-owned wager rules and, for private wagered rooms, locks player one’s wager transactionally.
3. Browser opens `/game/:roomId`, fetches `/api/matches/:roomId`, and only calls `/api/matches/:roomId/join` for an open second seat.
4. Backend claims seat two, locks seat two’s wager transactionally, and marks the match active.
5. Only after the HTTP join completes does the frontend connect to Socket.IO.
6. `realtime-match.service.ts` now only attaches existing participants and processes moves.
7. `match.service.ts` settles wins, draws, resignations, and stale matches, then writes refunds/payouts/audits.

### Merchant flow

1. Browser submits `/api/orders` as multipart form data with `type`, `amount`, and `proofImage`.
2. Backend validates MIME type, byte size, and order thresholds.
3. Backend relays the proof to Telegram, stores only Telegram metadata in `orders`, and records the pending ledger entry.
4. Merchant admins review proof links from backend-owned Telegram message URLs.
5. Admin approval/rejection runs through transactional order updates and audit logging.

### Admin flow

1. Admin browser calls `/api/admin/merchant/dashboard` and `/api/admin/merchant/orders`.
2. Backend aggregates pending orders, deposit anomalies, worker health, and hot-wallet reserve data.
3. Alerts are derived from job health, unmatched deposits, failed withdrawals, queue age, and reserve mismatches.

## Trust Boundaries

| Boundary | Trust level | Inputs crossing it | Enforced by |
|---|---|---|---|
| Browser | Untrusted | Form fields, files, room IDs, wallet addresses, join attempts | Zod validation, multipart validation, auth, idempotency, server-side business rules |
| Wallet / TonConnect | Untrusted client wallet | Submitted destination wallet, user wallet address, signed transfer intent | TON address parsing, server memo ownership checks, deposit poller verification |
| Express API | Trusted policy boundary | All HTTP requests | Controllers, middleware, services |
| Socket.IO | Semi-trusted transport only | Realtime join and move events | Auth middleware plus DB-backed participant checks |
| MongoDB | Trusted persistence, not validation | Raw collections and Mongoose models | Transactions, indexes, unique keys, schema validation |
| Toncenter / TON | External eventually consistent dependency | Transfer rows, on-chain balances, confirmations | Poller validation, processed-hash dedupe, confirmation reconciliation |
| Telegram | External operational dependency | Merchant proof review delivery | Backend relay validation and stored Telegram message metadata |

## Frontend vs Backend Responsibility Audit

### Corrected in this pass

- Wager validation moved to the backend. Public matches with non-zero wagers are now rejected server-side.
- Seat claiming and wager deduction moved out of socket connect and into `/api/matches/:roomId/join`.
- Merchant proof ownership moved to the backend. The frontend no longer tells the system where proof lives.
- Money-mutating routes now enforce server-side idempotency instead of trusting the browser not to retry.

### Still intentionally frontend-owned

- Presentation state, loading state, and navigation.
- Local rendering and animation for the game board.
- Client-generated idempotency keys for the initial request attempt.

## Findings and Fixes

### Closed Critical/High issues

- **Closed:** duplicate withdrawal risk from retrying `POST /api/transactions/withdraw` without an idempotency boundary.
- **Closed:** client-only enforcement of public/private wager rules.
- **Closed:** socket auto-join causing implicit wager deductions on page navigation.
- **Closed:** indefinite match fund lock when a room stalled or both players disappeared.
- **Closed:** merchant proof URLs allowing spoofed or mutable third-party evidence.
- **Closed:** inconsistent API errors leaking ambiguous server responses and mapping business errors to 500s.
- **Closed:** TonConnect manifest pointing to an unrelated external URL and random image source.

### Remaining High risks

- **High:** secrets currently present in local `.env` must be rotated before any production use. This includes MongoDB credentials, wallet mnemonic, and Toncenter API key.
- **High:** the system is explicitly single-node only. Match room memory and socket coordination are not safe for horizontally scaled realtime servers without a shared coordinator.
- **High:** custody remains hot-wallet based. Operational compromise of the host or mnemonic still leads to direct financial loss.

### Remaining Medium risks

- **Medium:** deposit verification still depends on Toncenter transfer data quality. The poller now rejects aborted rows, but full on-chain cell-level verification is not implemented.
- **Medium:** Telegram proof delivery is now safer than external URLs, but it is still an external dependency and should be monitored for failures and moderation access issues.
- **Medium:** client-generated idempotency keys protect duplicate submits per request path, but a user who refreshes and manually retries with a new key can still create a second intentional request.
- **Medium:** reserve monitoring now fails hard on imbalance, but there is no automatic circuit breaker yet that disables deposits/withdrawals when health turns critical.

### Remaining Low risks

- **Low:** placeholder legal pages exist only to satisfy manifest hygiene and must be replaced with reviewed policies before launch.
- **Low:** local seed data still uses simplified demo credentials and should never be reused outside development.

## Reliability and Safety Controls Now Present

- Persisted idempotency store for money-changing routes.
- Unique processed-transaction hashes to deduplicate blockchain rows.
- Mongo transactions around balance deductions, refunds, payouts, and order status transitions.
- Explicit audit events for deposits, withdrawals, match wager locks, refunds, payouts, and order decisions.
- Background stale-match settlement to ensure locked match funds reach a terminal state.
- Hard-failing reserve monitor so balance mismatches surface as job health problems.
- Bounded multipart parser and MIME allowlist for merchant proof images.

## Verification Performed

- `npm run lint`
- `npm run build`
- Direct execution of all existing test files with `node --experimental-strip-types <test-file>`

Note: the normal `npm test` / `node --test` path still cannot fork subprocesses in the current sandboxed desktop environment, so test verification was performed file-by-file instead.

## Production Readiness Score

**82 / 100**

Reasoning:

- Stronger API, ledger, and match safety controls are now in place.
- Critical client-trust and idempotency flaws were removed.
- The remaining deductions are mainly operational: exposed local secrets, single-node constraints, external Telegram dependency, and continued hot-wallet custody risk.

## Required Next Actions Before Public Launch

1. Rotate every secret currently exposed in local configuration.
2. Replace placeholder privacy/terms pages with reviewed legal documents.
3. Decide whether production will remain single-node; if not, add Redis or equivalent shared coordination for sockets and room locks.
4. Add an operational circuit breaker that disables deposits and withdrawals automatically when reserve monitoring enters a critical state.
5. Add independent monitoring and alert routing for Telegram proof relay failures and Toncenter degradation.

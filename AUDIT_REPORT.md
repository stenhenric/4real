# Full Codebase Audit — 4real

## Phase 1.1 Project Structure Discovery

### Directory tree (excluding `.git` and `node_modules`)

```text
.
├── .env.example
├── AUDIT_REPORT.md
├── deposit_withdraw_integration.md
├── featureauditskill/
│   └── skill.md
├── index.html
├── metadata.json
├── package-lock.json
├── package.json
├── public/
│   └── tonconnect-manifest.json
├── server.ts
├── server/
│   ├── config/
│   │   ├── config.ts
│   │   └── db.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── match.controller.ts
│   │   ├── order.controller.ts
│   │   ├── transaction.controller.ts
│   │   └── user.controller.ts
│   ├── lib/
│   │   ├── jetton.ts
│   │   ├── setup-db.ts
│   │   └── ton-client.ts
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   └── auth.middleware.ts
│   ├── models/
│   │   ├── Match.ts
│   │   ├── Order.ts
│   │   ├── Transaction.ts
│   │   └── User.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── matches.routes.ts
│   │   ├── orders.routes.ts
│   │   ├── transactions.routes.ts
│   │   └── users.routes.ts
│   ├── seed.ts
│   ├── services/
│   │   ├── deposit-service.ts
│   │   ├── match.service.ts
│   │   ├── order.service.ts
│   │   ├── transaction.service.ts
│   │   ├── user.service.ts
│   │   ├── withdrawal-engine.ts
│   │   └── withdrawal-service.ts
│   └── workers/
│       ├── deposit-poller.ts
│       └── withdrawal-worker.ts
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── SketchyButton.tsx
│   │   └── SketchyContainer.tsx
│   ├── index.css
│   ├── lib/
│   │   ├── api/
│   │   │   └── apiClient.ts
│   │   ├── AuthContext.tsx
│   │   ├── ToastContext.tsx
│   │   └── utils.ts
│   ├── main.tsx
│   ├── views/
│   │   ├── AuthView.tsx
│   │   ├── BankView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── DepositView.tsx
│   │   ├── GameView.tsx
│   │   ├── MerchantView.tsx
│   │   ├── ProfileView.tsx
│   │   └── WithdrawView.tsx
│   └── vite-env.d.ts
├── test_match.py
├── toast-audit.md
├── toast-guidelines.md
├── tonpaymentskill/
│   ├── references/
│   │   ├── deposit-engine.md
│   │   ├── mongodb-schema.md
│   │   └── withdrawal-engine.md
│   └── skill.md
├── tsconfig.json
├── update_audit.py
├── update_game_view.py
├── update_withdrawals.py
└── vite.config.ts
```

### Tech stack
- Languages: TypeScript (frontend + backend), JSX/TSX, Python utility scripts, Markdown docs.
- Frontend: React 19 + React Router + Vite.
- Backend: Express + Socket.IO server in `server.ts`.
- DB: MongoDB via Mongoose; also direct native collection usage through `mongoose.connection.db`.
- Auth: JWT bearer token in `Authorization` header.
- Build tools: Vite, tsx runtime, TypeScript compiler.
- Tests: Node built-in test runner (`server/middleware/*.test.ts`).
- Package manager: npm (`package-lock.json`).

### Config files and controls
- `package.json`: runtime scripts (dev/start/build/test/lint/seed) and deps.
- `tsconfig.json`: TS target/module config and path alias.
- `vite.config.ts`: React/Tailwind plugins, env define, alias, HMR toggle.
- `.env.example`: required env template for backend/TON integration.
- `public/tonconnect-manifest.json`: TonConnect app manifest.

## Phase 1.2 Entry Point Mapping

### Frontend entry
- `index.html` mounts `#root` and loads `src/main.tsx`.
- `src/main.tsx` bootstraps `<App />` under `StrictMode`.
- `src/App.tsx` provider order: `TonConnectUIProvider` → `ToastProvider` → `AuthProvider` → `BrowserRouter`.
- Startup side effects: `AuthContext` runs `refreshUser()` when token exists.

### Backend entry
- `server.ts`:
  1. Connects DB.
  2. Creates indexes.
  3. Starts deposit/withdraw workers via intervals.
  4. Sets middleware: `cors()`, `express.json()`.
  5. Registers routes under `/api/*`.
  6. Configures Socket.IO game events.
  7. Starts HTTP server.

### Workers/jobs
- `server/workers/deposit-poller.ts`: polls Toncenter every 15s.
- `server/workers/withdrawal-worker.ts`: processes queued withdrawals every 5s.
- Recovery job runs once at startup: resets stuck processing withdrawals.

## Phase 1.3 File-by-file deep map (all files)

> Each file mapped; “Red flags” are preliminary.

### Root/config/docs/scripts
- `.env.example` — Env template for JWT, Mongo, TON keys/addresses. Red flag: no runtime schema validation.
- `package.json` — scripts/dependencies. Red flag: `@types/*` listed in prod deps.
- `package-lock.json` — lockfile. Red flag: package name `react-example` mismatch branding.
- `tsconfig.json` — TS compiler options. Red flag: `allowJs` broadens unchecked surface.
- `vite.config.ts` — Vite + Tailwind + env injection. Red flag: exposes `GEMINI_API_KEY` to client bundle.
- `index.html` — SPA shell mounting root.
- `metadata.json` — app metadata for hosting container.
- `public/tonconnect-manifest.json` — wallet manifest metadata.
- `deposit_withdraw_integration.md` — internal integration notes.
- `toast-audit.md` / `toast-guidelines.md` — UX audit docs.
- `featureauditskill/skill.md` / `tonpaymentskill/skill.md` + `tonpaymentskill/references/*.md` — agent skill references.
- `update_audit.py`, `update_game_view.py`, `update_withdrawals.py`, `test_match.py` — local utility scripts; some are stale/partial.

### Backend core
- `server.ts` — HTTP+Socket.IO bootstrap, routes, room lifecycle, win detection, worker scheduling.
  - Exports: none.
  - Depends on config/db/routes/services/workers.
  - Red flags: permissive CORS `*`; no socket auth middleware beyond event token; in-memory rooms unsynced across instances.

### Backend config/lib
- `server/config/config.ts` — `getJwtSecret()` env getter.
- `server/config/db.ts` — dotenv load + mongoose connect.
- `server/lib/setup-db.ts` — creates indexes for TON workflow collections.
- `server/lib/ton-client.ts` — TonClient and hot wallet derivation.
- `server/lib/jetton.ts` — USDT master constants, address helpers, jetton wallet cache.

### Backend middleware/routes/controllers/services/models/workers
- `server/middleware/auth.middleware.ts` — JWT verify + admin guard.
- `server/middleware/auth.middleware.test.ts` — unit tests for guards.
- `server/routes/*.ts` — route registration glue.
- `server/controllers/*.ts` — request validation and service orchestration.
- `server/services/*.ts` — business logic (users, matches, orders, transactions, deposit memo, withdrawals, on-chain send).
- `server/models/*.ts` — mongoose schemas (User, Match, Order, Transaction).
- `server/workers/*.ts` — async TON deposit/withdraw processing.
- `server/seed.ts` — DB seed script.

### Frontend app/context/components/views
- `src/main.tsx` — React root mount.
- `src/App.tsx` — route table + auth-protected route wrapper.
- `src/index.css` — notebook visual design system.
- `src/lib/api/apiClient.ts` — fetch wrapper + token localStorage helpers.
- `src/lib/AuthContext.tsx` — auth/user bootstrap state.
- `src/lib/ToastContext.tsx` — toast queue + renderer.
- `src/lib/utils.ts` — `cn()` helper + sketch seed util.
- `src/components/Navbar.tsx` — top nav, wallet button, logout.
- `src/components/SketchyButton.tsx` — rough.js canvas-drawn button.
- `src/components/SketchyContainer.tsx` — rough.js framed container.
- `src/views/AuthView.tsx` — login/register form.
- `src/views/DashboardView.tsx` — lobby, match list, leaderboard, stats tabs.
- `src/views/GameView.tsx` — socket game room + canvas board rendering.
- `src/views/BankView.tsx` — portal to deposit/withdraw/merchant.
- `src/views/DepositView.tsx` — memo generation and TonConnect USDT send UX.
- `src/views/WithdrawView.tsx` — withdrawal request form.
- `src/views/MerchantView.tsx` — P2P order placement + admin approvals.
- `src/views/ProfileView.tsx` — profile and match history.
- `src/vite-env.d.ts` — Vite env typings.

## Phase 1.4 Cross-file dependency graph (high-level)

- Auth flow: `apiClient` ↔ `AuthContext` ↔ `App/ProtectedRoute` ↔ backend `auth.routes` → `AuthController` → `UserService` → `User`.
- Data fetching hubs: `src/lib/api/apiClient.ts`, `server/services/user.service.ts`, `server/services/transaction.service.ts`.
- UI tree hubs: `src/App.tsx`, `src/views/BankView.tsx`, `src/views/DashboardView.tsx`.
- Backend hubs: `server.ts`, `server/services/user.service.ts`, `server/middleware/auth.middleware.ts`.
- Orphans: `test_match.py`, `update_game_view.py` (not imported/executed by scripts).
- Circular imports: none detected in TS import graph.
- Long chain example: `BankView -> DepositView -> apiClient -> /api/transactions/deposit/memo -> transaction.controller -> deposit-service -> Mongo collections`.

## Phase 1.5 Data flow map

- Auth login: `AuthView submit` → `/api/auth/login` → JWT response → `setToken(localStorage)` → `AuthContext.refreshUser()` → `/api/auth/me` → protected routing unlock.
- Match flow: `Dashboard create` → `/api/matches` create wagered room → navigate `/game/:roomId` → socket `join-room` / `make-move` → `MatchService.completeMatch` → ELO/balance updates.
- Deposit flow: `DepositView generate memo` → `/api/transactions/deposit/memo` → user sends on-chain with memo → `deposit-poller` detects transfer → credits `user_balances` + `User.balance`.
- Withdraw flow: `WithdrawView submit` → `/api/transactions/withdraw` → reserve balance + queue withdrawal → `withdrawal-worker` sends on-chain and updates status.
- Order flow: `MerchantView POST /orders` → order + transaction pending → admin PATCH status → balance changes + transaction status update.
- Error propagation: mostly try/catch with `res.status(500/400)`; frontend often only toast/alert, limited typed error states.

## Phase 1.6 State management map

- Global state:
  - Auth context: `user`, `userData`, `loading`, `isAdmin`.
  - Toast context: `toasts[]`.
- Local critical state:
  - `GameView`: `room`, `gameOver`, `socket` (drives game lifecycle).
  - `BankView`: `activeView`, `transactions`.
  - `DashboardView`: `activeMatches`, `leaderboard`, `wager`, `isPrivate`.
  - `DepositView/WithdrawView/MerchantView`: form + async flags.

## Phase 1.7 API contract map

- `POST /api/auth/register|login`, `GET /api/auth/me`.
- `GET /api/users/leaderboard`, `GET /api/users/:userId`.
- `GET /api/matches/active`, `POST /api/matches` (auth), `GET /api/matches/user/:userId`.
- `GET/POST /api/orders` (auth), `PATCH /api/orders/:id` (admin).
- `GET /api/transactions` (auth), `GET /api/transactions/all` (admin check in controller), `POST /api/transactions/deposit/memo`, `POST /api/transactions/withdraw`.

## Phase 1.8 Environment/config map

Used env vars: `JWT_SECRET`, `MONGODB_URI`, `PORT`, `NODE_ENV`, `NETWORK`, `TONCENTER_API_KEY`, `HOT_WALLET_MNEMONIC`, `HOT_WALLET_VERSION`, `HOT_WALLET_ADDRESS`, `HOT_JETTON_WALLET`, `VITE_TON_MANIFEST_URL`, `DISABLE_HMR`, `GEMINI_API_KEY`.

## Phase 1.9 Context summary

This is a full-stack competitive Connect-4 app with JWT auth, realtime Socket.IO gameplay, Mongo persistence, and integrated TON USDT deposit/withdrawal rails. Highest-risk paths are wallet/payment flows, auth/token handling, and game wager settlement due to multi-system side effects (DB + chain + socket).

---

## Phase 2/3 Findings

### [BUG-001] Token stored in localStorage (XSS account takeover risk)
- File: `src/lib/api/apiClient.ts`
- Category: Security
- Severity: CRITICAL
- Bug: JWT is read/written in localStorage.
- Impact: XSS anywhere in frontend can exfiltrate auth token and impersonate users globally.
- Suggested fix: move auth to secure httpOnly, sameSite cookies and remove token JS access helpers.

### [BUG-002] Wildcard CORS in backend + Socket.IO
- File: `server.ts`
- Category: Security
- Severity: CRITICAL
- Bug: `app.use(cors())` and socket `origin: "*"` allow any origin.
- Impact: broad CSRF/data exposure and cross-origin scripted abuse.
- Suggested fix: strict allowed origins env list + credentials policy.

### [BUG-003] Client bundle exposes secret key variable
- File: `vite.config.ts`
- Category: Security/Config
- Severity: HIGH
- Bug: `process.env.GEMINI_API_KEY` is injected client-side.
- Impact: secret leakage to browser users.
- Suggested fix: never expose server secrets via `define`; keep only `VITE_*` non-secret vars.

### [BUG-004] Deposit deep link is referenced but backend never returns it
- File: `src/views/DepositView.tsx`
- Category: Runtime/API contract
- Severity: HIGH
- Bug: UI renders `memoData.deepLink` although backend `generateDepositMemo` returns no `deepLink`.
- Impact: broken UX/button points to undefined.
- Suggested fix: either remove anchor or add `deepLink` generation in backend response.

### [BUG-005] No validation for TON destination address in withdrawals
- File: `server/controllers/transaction.controller.ts`
- Category: Runtime/Security
- Severity: HIGH
- Bug: `toAddress` checked only for truthiness.
- Impact: invalid addresses get queued and fail later, potentially locking funds until retry/refund path completes.
- Suggested fix: parse with `Address.parse` server-side before queuing.

### [BUG-006] Potential non-atomic balance reserve + user model sync
- File: `server/services/withdrawal-service.ts`
- Category: Data/State
- Severity: HIGH
- Bug: direct collection update then separate User model update without transaction.
- Impact: ledger/model divergence on mid-operation failures.
- Suggested fix: single DB transaction/session covering both updates + queue insert.

### [BUG-007] Mixed source of truth for balances
- Files: `User.balance`, `user_balances.balanceRaw` flows across services/workers.
- Category: Logic/Data
- Severity: HIGH
- Bug: dual-ledger pattern maintained manually in many places.
- Impact: drift causes incorrect balance display, failed withdrawals, settlement errors.
- Suggested fix: designate one canonical ledger and derive display from it.

### [BUG-008] `GameView` useEffect missing dependencies used in closure
- File: `src/views/GameView.tsx`
- Category: State/Logic
- Severity: MEDIUM
- Bug: effect uses `navigate`, `warning`, `refreshUser` but excludes them from deps.
- Impact: stale closures in strict mode/react updates.
- Suggested fix: include stable dependencies or wrap callbacks.

### [BUG-009] Request wrapper assumes JSON for all responses
- File: `src/lib/api/apiClient.ts`
- Category: Runtime/API
- Severity: MEDIUM
- Bug: always runs `response.json()`; fails for empty/non-JSON responses.
- Impact: crashes on 204 or plain-text backend errors.
- Suggested fix: branch on `content-type` + handle empty body.

### [BUG-010] Admin-only transaction list route guarded in controller, not middleware
- File: `server/routes/transactions.routes.ts`
- Category: Security/Maintainability
- Severity: MEDIUM
- Bug: `/all` uses only authenticate middleware; admin checked inside controller.
- Impact: easier accidental bypass in future refactor.
- Suggested fix: add `requireAdmin` middleware at route level.

### [BUG-011] Hardcoded merchant payment details in UI
- File: `src/views/MerchantView.tsx`
- Category: Config/Security
- Severity: MEDIUM
- Bug: fixed M-Pesa and wallet text in component.
- Impact: stale or wrong payout instructions in production.
- Suggested fix: move to backend-managed config/env endpoint.

### [BUG-012] Type safety gaps via pervasive `any`
- Files: multiple frontend/backend files.
- Category: TypeScript
- Severity: MEDIUM
- Bug: many `any` request/user/room objects.
- Impact: runtime errors not caught by compiler.
- Suggested fix: define shared DTO interfaces and strict controller typings.

### [BUG-013] Scripts/reference docs include stale assumptions
- Files: `update_game_view.py`, integration markdowns.
- Category: Dead code/Maintainability
- Severity: LOW
- Bug: partial scripts and outdated comments can mislead contributors.
- Impact: maintenance friction, wrong patching.
- Suggested fix: remove or archive with clear status.

---

## Phase 4 Summary Table

| # | File | Severity | Category | Title | Downstream Impact |
|---|------|----------|----------|-------|-------------------|
| BUG-001 | src/lib/api/apiClient.ts | CRITICAL | Security | JWT in localStorage | Auth compromise across app |
| BUG-002 | server.ts | CRITICAL | Security | Wildcard CORS | Cross-origin abuse surface |
| BUG-003 | vite.config.ts | HIGH | Security/Config | Exposed API key define | Secret leakage to clients |
| BUG-004 | src/views/DepositView.tsx | HIGH | Runtime/API | Missing deepLink contract | Deposit CTA broken |
| BUG-005 | server/controllers/transaction.controller.ts | HIGH | Runtime/Security | No TON addr validation | Withdrawal queue failures |
| BUG-006 | server/services/withdrawal-service.ts | HIGH | Data | Non-atomic reserve/sync | Balance divergence |
| BUG-007 | multiple | HIGH | Logic/Data | Dual balance source | Inconsistent funds/UX |
| BUG-008 | src/views/GameView.tsx | MEDIUM | State | Stale closure deps | Subtle gameplay/UI issues |
| BUG-009 | src/lib/api/apiClient.ts | MEDIUM | Runtime | Assumes JSON always | Client parsing crashes |
| BUG-010 | server/routes/transactions.routes.ts | MEDIUM | Security | Admin check in controller only | Future guard regression |
| BUG-011 | src/views/MerchantView.tsx | MEDIUM | Config | Hardcoded merchant info | Wrong payment instructions |
| BUG-012 | multiple | MEDIUM | TypeScript | Excessive `any` | Hidden runtime defects |
| BUG-013 | scripts/docs | LOW | Dead code | Stale utility scripts | Maintenance confusion |

Totals:
- Total files scanned: 53
- Total files with no issues: 40
- Total bugs found: 13 (Critical 2 / High 5 / Medium 5 / Low 1)
- Hub files with bugs: `server.ts`, `src/lib/api/apiClient.ts`, `server/services/withdrawal-service.ts`
- Orphan files: `test_match.py`, `update_game_view.py`
- Circular dependencies found: none

## Phase 5 Prioritized Fix Plan

### Fix immediately (CRITICAL)
1. BUG-001 (token storage) — foundational auth risk.
2. BUG-002 (CORS/socket origin) — perimeter risk touching all endpoints.

### Fix before next release (HIGH)
1. BUG-003 (secret exposure).
2. BUG-006 + BUG-007 (balance consistency).
3. BUG-005 (address validation).
4. BUG-004 (deposit contract mismatch).

### Fix when time allows (MEDIUM/LOW)
1. BUG-009, BUG-010, BUG-012, BUG-011, BUG-013.

Rationale: resolve auth/perimeter/data-integrity hubs first because leaf/UI issues often stem from these core failures.

# Architectural Deep Audit Report

## Phase 1 - Full File Map (Summary)
The repository contains a standard Vite + React frontend inside `src/` and an Express + Mongoose backend inside `server/`.
* **Frontend:** React Router DOM handles `DashboardPage`, `GamePage`, `BankPage`, `AuthPage`, and `/merchant/*` dashboard views. Data interactions occur via `src/services/api/apiClient.ts` to `fetch` standard endpoints. Realtime happens via `socket.io-client` inside `useGameRoom.ts`.
* **Backend:** Organised into Controllers, Services, Middleware, and Models. Mongoose models are `Match`, `Order`, `User`, `Transaction`. Sockets handle game moves and broadcasting public lobbies updates (`PUBLIC_MATCHES_UPDATED_EVENT`). Workers (`withdrawal-worker`, `deposit-poller`) handle blockchain state.

## Phase 2 - Endpoint Map
* **GET /api/orders** - Fetches orders for user (admin fetches all). Limit bound added.
* **POST /api/orders** - Creates Buy/Sell orders
* **PATCH /api/orders/:id** - Update status (admin only)
* **GET /api/transactions** - Returns user transactions
* **GET /api/transactions/all** - Admin fetches all transactions. Limit bound added.
* **POST /api/auth/register, /api/auth/login, /api/auth/logout** - Standard JWT auth via cookies.
* **GET /api/matches/active** - Unpaginated waiting match lobby fetching. Limit bound added (returns 20).
* **POST /api/matches** - Creates a match
* **GET /api/merchant/dashboard** - Admin liquidity aggregation.

## Phase 3 - Data Flow Map
* **Data Flow**: `React Components` -> `src/services/*` -> `fetch(/api/*)` -> `Express Controller` -> `Service` -> `Mongoose Model`.
* **Issue Discovered**: Inefficient DB queries without pagination/limit constraints inside `getAllTransactions`, `getTransactionsByUser`, `getOrders` which could cause un-bounded scaling failures.
* **Cache Strategy**: Frontend uses simple React `useEffect` for state loading. Invalidation primarily relies on Socket.IO events (e.g. `PUBLIC_MATCHES_UPDATED_EVENT` triggering refetch inside `DashboardPage`).

## Phase 4 - Realtime Flow Map
* **`PUBLIC_MATCHES_UPDATED_EVENT`**: Emitted by `socketServer` inside `server/sockets/public-match-events.ts` on match creation or status update, listened to by `DashboardPage` which re-triggers REST request to `/api/matches/active`.
* **Game Session (`join-room`, `make-move`)**: Emitted by clients inside `src/features/game/useGameRoom.ts` and caught by `server/sockets/game.socket.ts` updating in-memory registry via `RealtimeMatchService` and syncing states via `room-sync`, `move-made`, and `game-over`.

## Phase 5 - Database Flow Map
* **`Order` Model:** Tracks BUY/SELL requests. Indexed on `userId, createdAt` and `status, createdAt`.
* **`Match` Model:** Stores past and active games. Indexed on `status, isPrivate, createdAt`.
* **`Transaction` Model:** Ledger of changes. Indexed on `userId, createdAt`.

## Phase 6 - Frontend/Backend Contract Verification
* Models match definitions across layers (`IUser`, `UserDTO`). Auth context uses `cookie` securely. CSRF protections validate non-GET endpoints. Frontend type definitions missed `@types/react` which broke `tsc`.

## Phase 7 & 8 - Problem Discovery & Safe Fix Plan
1. **Critical Vulnerability (Memory Exhaustion):** Several endpoints and repository functions queried Mongoose collections with `.find().sort({createdAt: -1})` without any bounds. If lists grew, Node would hit OOM issues.
   * **Fix:** Injected `.limit(100)` to `getAllTransactions`, `getTransactionsByUser`, `getOrders`, `WithdrawalRepository.findByUserId`, and `DepositRepository.findByUserId`.
2. **Type/Lint Error:** Missing `@types/react` and `@types/react-dom` in `package.json` caused JSX elements to resolve as `any` and broke `npm run lint`.
   * **Fix:** Re-installed proper type libraries and Vite/Tailwind matching versions. Fixed environment validation `zod` type constraint issues.

## Phase 9 - Regression Check
Run `npm run test` and `npm run build`. Backend tests all passed, API endpoints behave as intended, and `tsc --noEmit` yields no errors.

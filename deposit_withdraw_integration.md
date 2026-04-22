# Deposit and Withdraw Integration

## Summary of Findings
The deposit and withdraw logic handles interacting with TON on the backend, checking constraints, managing balances, and scheduling off-chain jobs (pollers and workers) to resolve those transactions asynchronously. The backend endpoints and business logic to support standard REST calls for initiating these flows, as well as the frontend views connecting them, were missing.

## File Locations of Deposit/Withdraw Logic
- **Deposit Services/Workers**: `server/services/deposit-service.ts`, `server/workers/deposit-poller.ts`
- **Withdraw Services/Workers**: `server/services/withdrawal-service.ts`, `server/services/withdrawal-engine.ts`, `server/workers/withdrawal-worker.ts`
- **API Handlers & Routing**: `server/controllers/transaction.controller.ts`, `server/routes/transactions.routes.ts`
- **Frontend Views**: `src/views/BankView.tsx`, `src/views/DepositView.tsx`, `src/views/WithdrawView.tsx`

## Data Flow Explanation
### Deposit Flow:
1. **Frontend Request**: The user navigates to the Deposit tab in the Bank portal and clicks "Generate Deposit Address & Memo".
2. **Backend Handling**: The request hits `POST /api/transactions/deposit/memo`, which runs `generateDepositMemo(userId)` in the backend. This creates a record in the database expecting an incoming TON transfer containing that specific memo text.
3. **Frontend Feedback**: The frontend receives the memo and displays it with the Hot Wallet Address to the user, instructing them to transfer the exact amount containing the memo.
4. **Worker Fulfillment**: Behind the scenes, `deposit-poller.ts` continually listens for transactions sent to the hot wallet. When it finds one with a valid memo, it updates the user's balance and records the completed transaction.

### Withdraw Flow:
1. **Frontend Request**: The user navigates to the Withdraw tab in the Bank portal, inputs a destination address and amount, and submits.
2. **Backend Handling**: The request hits `POST /api/transactions/withdraw`. The backend verifies the user's current balance and reserves the funds by decrementing their available ledger balance right away via `requestWithdrawal()`. It enqueues the withdrawal into the `withdrawals` database collection.
3. **Frontend Feedback**: The frontend notifies the user that the withdrawal was requested successfully and refreshes the user's locally stored balance.
4. **Worker Fulfillment**: Behind the scenes, `withdrawal-worker.ts` batches and processes queued withdrawals, sending TON over the blockchain to the requested address.

## Changes Made
- Modified `server/controllers/transaction.controller.ts` to implement handlers for generating deposit memos and requesting withdrawals.
- Modified `server/routes/transactions.routes.ts` to map the respective HTTP POST endpoints to the newly created handlers.
- Modified `src/views/BankView.tsx` to include interactive cards for depositing and withdrawing TON, as well as incorporating dynamic views for them.
- Added `src/views/DepositView.tsx` and `src/views/WithdrawView.tsx` with forms and state management linking up to the backend endpoints (`/api/transactions/deposit/memo` and `/api/transactions/withdraw`).

## Assumptions / Fixes Applied
- We assume standard user token authentication applies to both Deposit and Withdraw.
- It is assumed `uuid` helps gracefully provide idempotency identifiers for withdraw workflows.

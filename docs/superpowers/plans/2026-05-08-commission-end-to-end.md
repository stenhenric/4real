# Commission End-To-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and harden the paid-match commission path from match creation through winner payout and merchant liquidity reporting.

**Architecture:** Use the existing Playwright harness as the browser-facing integration layer and keep the production commission source of truth in backend payout/settlement services. The harness should mirror the backend contract closely enough for e2e tests to catch UI and workflow regressions.

**Tech Stack:** TypeScript, React, Express, Socket.IO, Playwright, Node test runner.

---

### Task 1: Paid Match E2E Coverage

**Files:**
- Modify: `tests/e2e/match.spec.ts`
- Modify: `tests/e2e/harness/server.mjs`

- [x] **Step 1: Write the failing e2e test**

Add a Playwright test that creates a 10 USDT paid public match, verifies the 18 USDT projected payout and 10% commission messaging, completes the game, verifies player-one balance becomes 50.500000 USDT, verifies player-two balance becomes 8.000000 USDT, and verifies the merchant liquidity page shows 13.500000 USDT platform commission.

- [x] **Step 2: Run the focused e2e test and confirm RED**

Run: `npx playwright test tests/e2e/match.spec.ts --project=chromium -g "settles a paid public match with merchant commission"`

Expected: FAIL before harness settlement support exists, because the winning user balance and merchant commission do not change after game completion.

- [x] **Step 3: Implement minimal harness settlement parity**

In `tests/e2e/harness/server.mjs`, add helpers that deduct wagers on create/join, credit the winner with `wager * 2 * (1 - commissionRate)`, increase a tracked system commission balance by `wager * 2 * commissionRate`, and record visible transactions for the winner and wager locks.

- [x] **Step 4: Verify GREEN**

Run: `npx playwright test tests/e2e/match.spec.ts --project=chromium -g "settles a paid public match with merchant commission"`

Expected: PASS.

### Task 2: Regression Check

**Files:**
- Test only unless failures expose a production defect.

- [x] **Step 1: Run focused backend commission tests**

Run: `npm run test:integration -- --test-name-pattern "commission|payout|merchant dashboard"`

Expected: PASS with existing backend commission and liquidity tests.

- [x] **Step 2: Run the full match e2e file in Chromium**

Run: `npx playwright test tests/e2e/match.spec.ts --project=chromium`

Expected: PASS for both free and paid match flows.

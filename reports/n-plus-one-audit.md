# N+1 Query Audit

Audit date: 2026-05-21

References reviewed before fixes:
- Prisma query optimization and N+1 guidance: https://www.prisma.io/docs/orm/prisma-client/queries/advanced/query-optimization-performance
- Prisma relation queries: https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries
- Mongoose populate docs, especially `perDocumentLimit`: https://mongoosejs.com/docs/populate.html
- Mongoose Model API, `updateMany` / bulk APIs: https://mongoosejs.com/docs/api/model.html
- MongoDB `$lookup`: https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/
- MongoDB indexes: https://www.mongodb.com/docs/manual/indexes/
- DataLoader batching/caching: https://github.com/graphql/dataloader

## Findings Table

| ID | Severity | File | Endpoint/Page | Pattern | Query Growth | Evidence | Recommended Fix | Status |
|---|---|---|---|---|---|---|---|---|
| N1-001 | High | `server/workers/failed-deposit-replay-worker.ts` | Failed deposit replay background job | Loads up to 50 failed transfers, then calls `ingestIncomingTransfer()` once per transfer without the shared lookup context. Without context, ingestion performs memo/processed/unmatched precheck queries per transfer. | Before: `1 + 3N` precheck queries. After: `1 + 3` precheck queries plus unchanged per-transfer mutations. | Regression test initially failed with both replay calls receiving `undefined` context; after fix, both receive the same context. | Build one batch lookup context from all retryable transfers and pass it to each replay ingestion. | Fixed |
| N1-002 | Medium | `server/services/auth-session.service.ts` | `/api/auth/sessions/revoke-others`, replay-detected session revocation, device replacement during login | Loads active sessions, then revokes each by deleting Redis access token, setting Redis used-refresh marker, and `save()`ing the Mongoose document. | Before: `1 find + N save` DB operations and per-session Redis round trips. After: `1 find + 1 updateMany`, one multi-key `del`, and one Redis pipeline for refresh markers. | Regression test initially hit the old per-session path. After fix, `revokeOtherSessionsForUser` calls `AuthSession.updateMany()` once and no per-document saves. | Batch revoke sessions with `updateMany`, multi-key Redis `del`, and pipelined `setex` refresh markers. | Fixed |
| N1-003 | Medium | `server/services/match.service.ts` | Stale match expiry background job | Fetches stale waiting/active matches, then loops through each `roomId` and re-enters transactional settlement helpers. | `2 list queries + O(N)` transactional reads/writes. | Static evidence: `expireStaleMatches()` loops over `waitingMatches` and `activeMatches`, calling `expireWaitingMatch()` / `expireActiveMatch()` per match. | Do not bulk rewrite settlement. Possible future optimization: bulk-expire zero-wager waiting matches or enqueue settlement jobs with bounded concurrency. | Confirmed, not fixed: settlement has per-match financial, audit, cache, and event side effects. |
| N1-004 | Medium | `server/workers/withdrawal-worker.ts` | Withdrawal confirmation / stuck withdrawal recovery jobs | Fetches pending/stale withdrawals, then calls on-chain lookup and persistence per withdrawal. | `1 list query + O(N)` provider calls and per-confirmation writes. | Static evidence: `confirmSentWithdrawals()` and `recoverStuckWithdrawals()` loop over fetched withdrawals and call `findWithdrawalTransferOnChain()` per withdrawal. | Keep bounded batches; consider provider-side batched lookup only if Toncenter exposes a matching API. | Confirmed external-service N+1, not fixed: each lookup is withdrawal-specific and side effects are idempotent/transactional. |
| SUS-005 | Low | `server/services/merchant-dashboard.service.ts` | `/api/admin/merchant/dashboard`, `/api/admin/merchant/orders` | Order desk enrichment uses `populate('userId')` and user order stats. | Constant for page: order query + populate query + aggregate. | Static evidence: `fetchOrders()` uses one Mongoose populate and `getOrderStats(userIds)` performs one `$in` aggregate. No `perDocumentLimit`. | No change. Preserve current batched populate/aggregate shape. | Cleared |
| SUS-006 | Low | `src/pages/ProfilePage.tsx`, `src/features/bank/MerchantPanel.tsx`, `src/pages/merchant/*.tsx` | Profile and merchant pages | Multiple frontend API calls in `Promise.all`. | Constant, not per rendered item. | Static evidence: pages fetch profile/history, orders/config, or refresh dashboard/orders as paired calls; no API call inside `.map()` over rows. | No change. | Cleared |
| SUS-007 | Low | `server/services/product-email-notification.service.ts` | Product email notifications | Sends one email per merchant recipient with `.map(async ...)`. | One external email delivery per recipient. Recipient lookup is batched once. | Static evidence: `sendToMerchantAdmins()` calls `findVerifiedMerchantEmailRecipients()` once, then sends individual emails. | No change. This is delivery fan-out, not avoidable data-fetch N+1. | Cleared |

## Detailed Suspects

### N1-001: Failed Deposit Replay Precheck Enrichment

File: `server/workers/failed-deposit-replay-worker.ts`

Before snippet:

```ts
const retryableFailures = await FailedDepositIngestionRepository.findRetryable(now, maxRetries, REPLAY_BATCH_SIZE);

for (const failedIngestion of retryableFailures) {
  try {
    await replayWorkerDependencies.ingestIncomingTransfer(failedIngestion.transferData);
    await FailedDepositIngestionRepository.markResolved(failedIngestion.txHash);
```

Nested DB calls hidden inside `ingestIncomingTransferWithContext()` when no context is passed:

```ts
const memoDoc = (comment ? await DepositMemoRepository.findByMemos([comment]) : [])[0];
const existingProcessed = await ProcessedTransactionRepository.findByHash(tx.transaction_hash);
const existingUnmatched = await UnmatchedDepositRepository.findByTxHash(tx.transaction_hash);
```

Why it is N+1: the worker starts with a list of retryable failures, then each transfer repeats the same three lookup shapes with different memo/hash values.

Fix applied:

```ts
const transferLookupContext = retryableFailures.length > 0
  ? await replayWorkerDependencies.buildTransferLookupContext(
      retryableFailures.map((failedIngestion) => failedIngestion.transferData),
    )
  : null;

await replayWorkerDependencies.ingestIncomingTransfer(
  failedIngestion.transferData,
  transferLookupContext ?? undefined,
);
```

Runtime/test evidence:
- Red: `server/middleware/ton-payments.test.ts` showed both replay calls received `undefined` context.
- Green: same test now verifies one shared `TransferLookupContext` is passed to both replay calls.
- Command: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/ton-payments.test.ts`

### N1-002: Auth Session Batch Revocation

File: `server/services/auth-session.service.ts`

Before snippet:

```ts
const sessions = await authSessionFind<IAuthSession>('AuthSession.find.revokeOtherSessionsForUser.sessions', {
  userId,
  sessionId: { $ne: currentSessionId },
  ...buildActiveSessionQuery(),
});

for (const session of sessions) {
  await revokeSessionDocument(session, 'other_sessions_revoked');
}
```

Nested DB/cache calls:

```ts
await deleteAccessRecord(document.currentAccessTokenHash);
await markRefreshTokenUsed(...);
await document.save();
```

Why it is N+1: session revocation fetches a list, then performs one Mongoose save and Redis operations for each session.

Fix applied:

```ts
await revokeSessionDocuments(sessions, 'other_sessions_revoked');
```

The helper deletes access-token keys with one `del(...keys)`, pipelines refresh-token reuse markers, and uses one `AuthSession.updateMany()` for all documents.

Runtime/test evidence:
- Red: new auth-session test hit the per-session revocation path.
- Green: test verifies one `AuthSession.updateMany()` call, one multi-key Redis `del`, and two pipelined `setex` commands for two sessions.
- Command: `node --import ./server/test/setup-env.js --test --experimental-strip-types server/services/auth-session.service.test.ts`

### N1-003: Stale Match Expiry Settlement

File: `server/services/match.service.ts`

Snippet:

```ts
const [waitingMatches, activeMatches] = await Promise.all([
  Match.find(...).select('roomId'),
  Match.find(...).select('roomId'),
]);

for (const match of waitingMatches) {
  const expired = await this.expireWaitingMatch(match.roomId);
}

for (const match of activeMatches) {
  const expired = await this.expireActiveMatch(match.roomId);
}
```

Why it is N+1: each stale match causes a re-fetch and transactional settlement. This is confirmed linear growth, but it is also correctness-sensitive because each match can refund wagers, update balances/ELO, create transactions, record audits, invalidate caches, and emit match events.

Status: intentionally left unchanged. A safe optimization would need separate design and tests around zero-wager matches, wager settlement, duplicate expiry races, and event emission.

### N1-004: Withdrawal Confirmation and Recovery

File: `server/workers/withdrawal-worker.ts`

Snippets:

```ts
const pending = await WithdrawalRepository.findPendingConfirmation(25);
for (const withdrawal of pending) {
  const confirmed = await workerDependencies.findWithdrawalTransferOnChain(...);
}
```

```ts
const stuck = await WithdrawalRepository.findStaleProcessing(tenMinsAgo);
for (const withdrawal of stuck) {
  const confirmed = await workerDependencies.findWithdrawalTransferOnChain(...);
}
```

Why it may be N+1: each row triggers an external provider lookup and then possible DB writes.

Status: confirmed external-service fan-out, intentionally left unchanged. The batch size is bounded, and each lookup depends on withdrawal-specific identifiers and idempotent settlement. No safe provider-side batch API was found in local code.

### Cleared Patterns

Merchant dashboard/order desk:

```ts
Order.find(options.filter)
  .sort({ createdAt: -1 })
  .populate('userId', 'username createdAt')
...
const userStats = await getOrderStats(userIds);
```

This is batched: one order query, one populate query, one aggregate. Mongoose docs warn that `perDocumentLimit` can execute one query per document; this code does not use it.

Frontend API calls:

```ts
const [profileData, historyData] = await Promise.all([
  getUserProfile(userId, controller.signal),
  getUserMatches(userId, controller.signal),
]);
```

These are constant paired requests, not loops over a list.

Product email merchant fan-out:

```ts
recipients = await dependencies.findVerifiedMerchantEmailRecipients();
const tasks = recipients
  .filter(...)
  .map(async (recipient) => deliver(...));
```

Recipient lookup is batched once. One email per recipient is required delivery fan-out, not avoidable data lookup N+1.


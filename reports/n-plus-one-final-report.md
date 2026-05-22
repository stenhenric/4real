## N+1 Optimization Final Report

### Summary
- Suspected patterns: 7
- Confirmed N+1 issues: 4
- Fixed: 2
- Not fixed: 2
- Highest-risk endpoint/page: failed deposit replay worker, because it could replay up to 50 failed transfers and repeated the same precheck query shapes per transfer.

### Confirmed Issues

#### N1-001: Failed deposit replay repeated precheck lookups
- Severity: High
- Location: `server/workers/failed-deposit-replay-worker.ts`
- Endpoint/Page: Failed deposit replay background job
- Before: retry batch lookup plus up to `3N` repeated precheck lookups hidden inside `ingestIncomingTransfer()`.
- After: retry batch lookup plus 3 batched precheck lookups via `buildTransferLookupContext()`.
- Root cause: the replay worker did not pass the shared transfer lookup context already used by the live deposit poller and replay-window service.
- Fix: build one `TransferLookupContext` for the retry batch and pass it into each per-transfer ingestion call.
- Tests: added regression coverage in `server/middleware/ton-payments.test.ts`; the test first failed with `undefined` contexts and now passes.
- Reference: Prisma N+1 guidance and DataLoader batching model.
- Risk: per-transfer mutation remains intentionally sequential to preserve idempotency, memo-claim races, audit, notification, and failure retry behavior.

#### N1-002: Auth session revocation per-document saves
- Severity: Medium
- Location: `server/services/auth-session.service.ts`
- Endpoint/Page: `/api/auth/sessions/revoke-others`, refresh replay detection, same-device session replacement during login
- Before: `1 find + N document.save()` DB writes, plus per-session Redis access-token deletion and used-refresh marker writes.
- After: `1 find + 1 updateMany()` DB write, one multi-key Redis `del`, and one Redis pipeline for refresh markers.
- Root cause: active sessions were loaded as a list, then `revokeSessionDocument()` was called per session.
- Fix: added `revokeSessionDocuments()` batch helper and reused it in `createSession`, `revokeAllSessionsForUser`, and `revokeOtherSessionsForUser`.
- Tests: added auth-session regression test proving one `updateMany()`, multi-key Redis delete, and pipelined refresh marker writes for two sessions.
- Reference: Mongoose `updateMany` docs and Prisma bulk-query guidance.
- Risk: `updateMany()` does not run document `save` middleware. No AuthSession save middleware exists in this codebase; token invalidation still happens before DB revocation.

#### N1-003: Stale match expiry per-match settlement
- Severity: Medium
- Location: `server/services/match.service.ts`
- Endpoint/Page: stale match expiry background job
- Before: `2 list queries + O(N)` transactional match settlement operations.
- After: unchanged.
- Root cause: stale match expiry fetches candidates, then calls settlement helpers once per match.
- Fix: not applied.
- Tests: existing match service tests cover settlement behavior; no new test because no production change was made.
- Reference: DataLoader/batching guidance, MongoDB bulk guidance.
- Risk: intentionally left unchanged because each item can perform financial settlement, ELO changes, refunds, audits, cache invalidation, and public events. A safe redesign should be handled separately.

#### N1-004: Withdrawal confirmation external lookup fan-out
- Severity: Medium
- Location: `server/workers/withdrawal-worker.ts`
- Endpoint/Page: withdrawal confirmation and stuck-withdrawal recovery jobs
- Before: `1 list query + O(N)` Toncenter lookups and per-confirmation writes.
- After: unchanged.
- Root cause: each withdrawal is reconciled against on-chain data individually.
- Fix: not applied.
- Tests: existing withdrawal worker tests cover confirmation, stuck, recovery, retry, and refund paths; no production change was made.
- Reference: DataLoader/batching guidance.
- Risk: bounded batch sizes reduce blast radius. A provider-side batched reconciliation API would be needed to safely remove the external-call fan-out.

### Query Count Improvements
- Failed deposit replay prechecks:
  - Before: for `N` retryable transfers, `DepositMemoRepository.findByMemos([one])`, `ProcessedTransactionRepository.findByHash(one)`, and `UnmatchedDepositRepository.findByTxHash(one)` ran per transfer.
  - After: one batched memo lookup, one batched processed-hash lookup, and one batched unmatched lookup.
  - Example: `N=50` improves from up to 150 precheck queries to 3 precheck queries.
- Auth session revocation:
  - Before: `N` Mongoose document saves after the initial find.
  - After: one `updateMany()` after the initial find.
  - Redis access-token deletion is now one multi-key `del`; refresh markers are pipelined.

### Indexes
- No new indexes were added.
- Existing relevant indexes observed:
  - AuthSession has `userId`, `deviceId`, `revokedAt`, and compound `{ userId, deviceId, revokedAt }`.
  - Failed deposit ingestion repository already declares retry and pending-time indexes.
- Recommended follow-up: run `npm run db:verify-indexes` against the target environment and review explain plans for merchant dashboard/order desk filters.

### API Contract Changes
- None.

### Test Coverage Added
- `server/middleware/ton-payments.test.ts`: failed replay worker passes one shared `TransferLookupContext` to all retry items in a batch.
- `server/services/auth-session.service.test.ts`: session revocation uses one DB batch update and batched Redis operations.

### Best-Practice References Used
- Bulk query guidance: https://www.prisma.io/docs/orm/prisma-client/queries/advanced/query-optimization-performance
- Mongoose `updateMany`: https://mongoosejs.com/docs/api/model.html
- Mongoose populate/per-document query warning: https://mongoosejs.com/docs/populate.html
- MongoDB indexes: https://www.mongodb.com/docs/manual/indexes/
- DataLoader batching/caching pattern: https://github.com/graphql/dataloader

### Recommended Follow-ups
- Design a separate stale-match-expiry optimization for zero-wager waiting matches only, with race-condition and event-emission tests.
- Investigate whether Toncenter or the app’s own indexed transaction cache can support batched withdrawal confirmation checks.
- Add lightweight development-only query counting middleware around Mongoose and MongoDB driver calls for endpoint-level query budgets.
- Review merchant dashboard pagination for the unbounded pending-order dashboard query if pending order volume can grow large.


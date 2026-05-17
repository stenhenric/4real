# Database Performance Review

## Scope

Inspected Mongoose schemas, repository indexes, controller/service query patterns, pagination, projections, `.lean()` usage, and aggregation candidates. No live MongoDB connection was used, so `explain("executionStats")` results are required on staging before claiming measured database improvement.

References:

- MongoDB performance analysis: https://www.mongodb.com/docs/manual/administration/analyzing-mongodb-performance/
- MongoDB indexes: https://www.mongodb.com/docs/manual/indexes/
- MongoDB explain results: https://www.mongodb.com/docs/manual/reference/explain-results/
- MongoDB query optimization: https://www.mongodb.com/docs/manual/core/query-optimization/

## Applied Index Fixes

### PERF-DB-001: Merchant order desk sort/filter indexes

- File: `server/models/Order.ts`
- Function/query: `MerchantDashboardService.getOrderDesk`
- Query pattern: optional `status`, optional `type`, sorted by `createdAt: -1`, paginated.
- Current issue: existing `{ status: 1, createdAt: -1 }` and `{ userId: 1, createdAt: -1 }` did not cover unfiltered chronological listing, type-only listing, or status+type listing.
- Fix: added:
  - `{ createdAt: -1 }`
  - `{ type: 1, createdAt: -1 }`
  - `{ status: 1, type: 1, createdAt: -1 }`
- Expected impact: supports the real merchant order desk filter/sort combinations without collection scan/in-memory sort.
- Regression risk: extra write/index storage overhead. Acceptable because order desk is an admin hot path and indexes match concrete queries.
- Test: `order schema declares sort indexes used by merchant order desk filters`.

### PERF-DB-002: Admin transaction chronology index

- File: `server/models/Transaction.ts`
- Function/query: admin transaction listing through transaction controller/service
- Query pattern: chronological admin list, bounded by limit/offset.
- Issue: no createdAt-only chronology index.
- Fix: added `{ createdAt: -1, _id: -1 }`.
- Expected impact: supports stable chronological admin listing.
- Regression risk: extra index storage/write cost.
- Test: `transaction schema declares createdAt index for admin chronological listing`.

### PERF-DB-003: Withdrawal stale-processing recovery index

- File: `server/repositories/withdrawal.repository.ts`
- Function/query: `findStaleProcessing(startedBefore)`
- Query: `{ status: 'processing', startedAt: { $lte: startedBefore } }`
- Issue: `ensureIndexes()` lacked `{ status: 1, startedAt: 1 }`.
- Fix: added `{ status: 1, startedAt: 1 }`.
- Expected impact: recovery scan can use equality on status then range on startedAt.
- Regression risk: extra index storage/write cost on withdrawals.
- Test: `withdrawal repository declares status-startedAt index for stale processing recovery`.

### PERF-DB-004: Failed deposit retry/pending-time indexes

- File: `server/repositories/failed-deposit-ingestion.repository.ts`
- Functions/queries: retry and pending-time failed deposit scans.
- Query patterns include status/resolved equality and ordering/range on transaction time or retry scheduling fields.
- Issue: staging explain showed the retry-due query prefers `status_1_resolvedAt_1_nextRetryAt_1_failedAt_1`. The newer `status_1_resolvedAt_1_failedAt_1_nextRetryAt_1_retryCount_1` recommendation placed `failedAt` before the `nextRetryAt` range and did not match the actual winning plan.
- Fix: keep the useful indexes and avoid adding the redundant failedAt-first retry index:
  - `{ status: 1, resolvedAt: 1, 'transferData.transaction_now': 1 }`
  - `{ status: 1, resolvedAt: 1, nextRetryAt: 1, failedAt: 1 }`
- Expected impact: tighter scans for retry/pending work.
- Regression risk: extra index storage/write cost.
- Test: `failed deposit repository declares equality-first retry and pending-time indexes`.

### PERF-DB-008: Startup verifies required staging indexes

- File: `server/lib/setup-db.ts`
- Issue: staging initially lacked the expected order, transaction, withdrawal, and failed-deposit indexes, so schema declarations alone were not enough evidence that startup/deploy had created them.
- Fix: `setupIndexes()` now calls `verifyRequiredIndexes()` after index creation and fails startup if required indexes are absent. Verification is read-only except for the existing safe `createIndexes()` calls; it does not drop or rebuild indexes.
- Required indexes verified:
  - `orders.createdAt_-1`
  - `orders.type_1_createdAt_-1`
  - `orders.status_1_type_1_createdAt_-1`
  - `transactions.createdAt_-1__id_-1`
  - `withdrawals.status_1_startedAt_1`
  - `failed_deposit_ingestions.status_1_resolvedAt_1_transferData.transaction_now_1`
  - `failed_deposit_ingestions.status_1_resolvedAt_1_nextRetryAt_1_failedAt_1`
- Staging command: `npm run db:verify-indexes`
- Test: `startup index verification covers staging-required query indexes`.

## Open Query Findings

### PERF-DB-005: Unified transaction feed overfetch

- File: transaction controller/service family
- Issue: user feed merges multiple data sources and bounds page/pageSize, but deeper pages still require source overfetch before in-memory merge.
- Recommended direction: persisted ledger/read model or keyset cursor strategy.
- Test needed: feed ordering and pagination contract tests before refactor.

### PERF-DB-006: Merchant dashboard pending/action aggregates

- File: `server/services/merchant-dashboard.service.ts`
- Issue: dashboard cold-cache can perform multiple order/deposit/liquidity queries and external calls.
- Recommended direction: add timing first, then consider stale-while-revalidate for safe admin summaries. Avoid caching money balances unless correctness/invalidation is proven.

### PERF-DB-007: Skip-based pagination remains a scale risk

- Files: order desk/admin transaction/list routes
- Issue: current bounded skip pagination is safe for small/admin lists but can degrade on deep pages.
- Recommended direction: keyset pagination after product/API compatibility review.

## Staging Explain Commands

Run these against a staging snapshot with representative data:

```javascript
db.orders.find({}).sort({ createdAt: -1 }).limit(25).explain("executionStats")
db.orders.find({ type: "BUY" }).sort({ createdAt: -1 }).limit(25).explain("executionStats")
db.orders.find({ status: "PENDING" }).sort({ createdAt: -1 }).limit(25).explain("executionStats")
db.orders.find({ status: "PENDING", type: "SELL" }).sort({ createdAt: -1 }).limit(25).explain("executionStats")
db.transactions.find({}).sort({ createdAt: -1, _id: -1 }).limit(50).explain("executionStats")
db.withdrawals.find({ status: "processing", startedAt: { $lte: ISODate("2026-05-16T00:00:00.000Z") } }).explain("executionStats")
db.failed_deposit_ingestions.find({ status: "pending", resolvedAt: null }).sort({ "transferData.transaction_now": 1 }).limit(100).explain("executionStats")
db.failed_deposit_ingestions.find({ status: "pending", resolvedAt: null, retryCount: { $lt: 5 }, nextRetryAt: { $lte: new Date() } }).sort({ failedAt: 1 }).limit(100).explain("executionStats")
```

Success criteria:

- `winningPlan` uses the intended index.
- `totalDocsExamined` is close to returned rows for selective queries.
- No blocking in-memory sort on order desk/admin chronology paths.
- Query execution remains stable under representative staging cardinality.

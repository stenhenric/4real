# Database Query Report

Generated: 2026-05-16

## Query Review

### DB-001: Merchant order desk

- Collection/model: `orders` / `Order`
- Query: optional `status`, optional `type`, sort `{ createdAt: -1 }`, count plus paginated list.
- Current index support: prior pass added `{ createdAt: -1 }`, `{ type: 1, createdAt: -1 }`, `{ status: 1, type: 1, createdAt: -1 }`.
- Status: index declarations match observed query pattern. Fresh `explain("executionStats")` is pending for the current test database.

### DB-002: Admin transaction chronology

- Collection/model: `transactions` / `Transaction`
- Query: `find({}).sort({ createdAt: -1 }).skip(offset).limit(limit)`.
- Current index support: prior pass added `{ createdAt: -1, _id: -1 }`.
- Status: index declaration matches chronological admin query. Fresh explain pending.

### DB-003: User unified transaction feed

- Collections/models: `transactions`, `deposits`, `withdrawals`.
- Query: each source fetched by user and sorted by created time, then merged in memory.
- Concern: overfetch grows with page depth and total reporting is not a real total.
- Recommended fix: persisted ledger/read model or keyset merge cursor after API contract review.

### DB-004: Merchant dashboard pending summary

- Collection/model: `orders`.
- Query: pending orders are fetched unbounded for dashboard summary and action queue.
- Concern: cold-cache latency grows with pending count.
- Recommended fix: aggregate totals/counts in MongoDB and fetch only bounded action queue rows.

## Explain Status

Fresh `explain("executionStats")` was not run in this pass. No destructive database commands were run. The code review identified query patterns and index declarations, but execution statistics should still be collected against the test database before adding or changing indexes.

Exact non-destructive explain commands to run from a Mongo shell connected to the test database:

```javascript
db.orders.find({ status: "PENDING" }).sort({ createdAt: -1 }).limit(50).explain("executionStats")
db.orders.find({ status: "PENDING", type: "BUY" }).sort({ createdAt: -1 }).limit(50).explain("executionStats")
db.transactions.find({}).sort({ createdAt: -1, _id: -1 }).limit(50).explain("executionStats")
db.transactions.find({ userId: ObjectId("<test-user-id>") }).sort({ createdAt: -1, _id: -1 }).limit(50).explain("executionStats")
db.deposits.find({ userId: ObjectId("<test-user-id>") }).sort({ createdAt: -1, _id: -1 }).limit(50).explain("executionStats")
db.withdrawals.find({ userId: ObjectId("<test-user-id>") }).sort({ createdAt: -1, _id: -1 }).limit(50).explain("executionStats")
```

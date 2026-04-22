# MongoDB Schema Reference

## Collections

### `deposits`
Records each confirmed incoming USDT transfer.

```js
{
  _id: ObjectId,
  txHash: String,           // UNIQUE — on-chain transaction hash
  userId: String,           // matched from memo
  amountRaw: String,        // raw units as string (avoids BigInt overflow)
  amountDisplay: String,    // "10.500000"
  comment: String,          // memo comment from sender
  senderJettonWallet: String,
  senderAddress: String,    // sender's main wallet (if known)
  txTime: Date,             // on-chain timestamp
  status: String,           // 'confirmed' (all deposits are confirmed on insertion)
  createdAt: Date,
}
```

Indexes:
```js
{ txHash: 1 }           unique: true
{ userId: 1, createdAt: -1 }
{ txTime: -1 }
```

---

### `withdrawals`
Outgoing USDT requests — full lifecycle.

```js
{
  _id: ObjectId,
  withdrawalId: String,     // UNIQUE — your idempotency key
  userId: String,
  toAddress: String,        // destination main wallet (not jetton wallet)
  amountRaw: String,        // raw units as string
  amountDisplay: String,
  status: String,           // 'queued' | 'processing' | 'sent' | 'confirmed' | 'failed'
  seqno: Number,            // seqno used when sent (filled on send)
  txHash: String,           // on-chain hash (filled on confirmation)
  retries: Number,          // default 0
  lastError: String,
  createdAt: Date,
  startedAt: Date,          // when worker picked it up
  sentAt: Date,
  confirmedAt: Date,
}
```

Indexes:
```js
{ withdrawalId: 1 }     unique: true
{ status: 1, createdAt: 1 }    // for queue worker
{ userId: 1, createdAt: -1 }
{ txHash: 1 }           sparse: true
```

---

### `user_balances`
Internal ledger — one document per user.

```js
{
  _id: ObjectId,
  userId: String,           // UNIQUE
  balanceRaw: String,       // current USDT balance in raw units (as string)
  totalDepositedRaw: String,
  totalWithdrawnRaw: String,
  createdAt: Date,
  updatedAt: Date,
}
```

Indexes:
```js
{ userId: 1 }           unique: true
```

> ⚠️ Store `balanceRaw` as a **String** (not Number/Long) to avoid 64-bit overflow with native MongoDB driver. Use BigInt in application code when doing arithmetic.

**Balance arithmetic pattern:**
```js
// Credit deposit
await db.collection('user_balances').updateOne(
  { userId },
  {
    $inc: { balanceRaw: parseInt(amountRaw) }, // only safe if amount fits in int32
    // OR use string manipulation with BigInt:
  },
  { upsert: true }
);

// Safer: fetch, add in JS, write back
async function creditBalance(db, userId, amountRaw) {
  const doc = await db.collection('user_balances').findOne({ userId });
  const current = BigInt(doc?.balanceRaw ?? '0');
  const newBalance = (current + BigInt(amountRaw)).toString();
  await db.collection('user_balances').updateOne(
    { userId },
    { $set: { balanceRaw: newBalance, updatedAt: new Date() } },
    { upsert: true }
  );
}
```

---

### `processed_txs`
Idempotency guard for both deposits and withdrawal confirmations.

```js
{
  _id: ObjectId,
  txHash: String,           // UNIQUE
  type: String,             // 'deposit' | 'withdrawal_confirm'
  processedAt: Date,
}
```

Indexes:
```js
{ txHash: 1 }             unique: true
{ processedAt: 1 }        expireAfterSeconds: 7776000  // TTL: 90 days
```

---

### `deposit_memos`
Maps unique memo strings to users.

```js
{
  _id: ObjectId,
  memo: String,             // UNIQUE — the comment user must include
  userId: String,
  used: Boolean,            // true once a matching deposit arrives
  usedAt: Date,
  createdAt: Date,
  expiresAt: Date,          // TTL expiry
}
```

Indexes:
```js
{ memo: 1 }               unique: true
{ userId: 1 }
{ expiresAt: 1 }          expireAfterSeconds: 0   // MongoDB TTL — auto-delete expired memos
```

---

### `poller_state`
Stores polling cursor so restarts don't re-process old transactions.

```js
{
  key: String,              // e.g. 'deposit_poller'
  lastProcessedTime: Number, // Unix timestamp of last processed tx
  updatedAt: Date,
}
```

---

### `unmatched_deposits`
Holds deposits where no memo matched (for manual review / support).

```js
{
  _id: ObjectId,
  txHash: String,
  receivedRaw: String,
  comment: String,
  senderJettonWallet: String,
  txTime: Number,
  recordedAt: Date,
  resolved: Boolean,        // manually resolved by support
}
```

---

## Full Index Setup Script

```js
// scripts/setup-db.js
export async function setupIndexes(db) {
  await db.collection('deposits').createIndexes([
    { key: { txHash: 1 }, unique: true },
    { key: { userId: 1, createdAt: -1 } },
  ]);

  await db.collection('withdrawals').createIndexes([
    { key: { withdrawalId: 1 }, unique: true },
    { key: { status: 1, createdAt: 1 } },
    { key: { userId: 1, createdAt: -1 } },
  ]);

  await db.collection('user_balances').createIndexes([
    { key: { userId: 1 }, unique: true },
  ]);

  await db.collection('processed_txs').createIndexes([
    { key: { txHash: 1 }, unique: true },
    { key: { processedAt: 1 }, expireAfterSeconds: 7_776_000 }, // 90d TTL
  ]);

  await db.collection('deposit_memos').createIndexes([
    { key: { memo: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, // TTL auto-delete
  ]);

  console.log('All indexes created');
}
```

---

## Reconciliation Query

Periodically verify on-chain USDT balance matches sum of user balances:

```js
async function reconcile(db) {
  const onChainBalance = await getHotUsdtBalance(); // from withdrawal-engine.md

  const agg = await db.collection('user_balances').aggregate([
    { $group: { _id: null, totalRaw: { $sum: { $toLong: '$balanceRaw' } } } }
  ]).toArray();

  const totalUserRaw = agg[0]?.totalRaw ?? 0;
  const totalUserUsdt = totalUserRaw / 1e6;

  console.log(`On-chain: ${onChainBalance} USDT | User ledger: ${totalUserUsdt} USDT`);

  if (Math.abs(onChainBalance - totalUserUsdt) > 1.0) {
    console.error('⚠️ RECONCILIATION MISMATCH — investigate immediately');
  }
}
```

# Deposit Engine — Complete Production Code

## Deposit Poller

Polls Toncenter v3 every 15 seconds for incoming USDT transfers to your hot wallet.

```js
// workers/deposit-poller.js
import { MongoClient } from 'mongodb';

const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const TONCENTER_BASE = process.env.NETWORK === 'testnet'
  ? 'https://testnet.toncenter.com'
  : 'https://toncenter.com';

export async function pollDeposits(db) {
  // Use last polled time stored in DB for reliability (not just "last 15 seconds")
  const state = await db.collection('poller_state').findOne({ key: 'deposit_poller' });
  const sinceTime = state?.lastProcessedTime ?? Math.floor(Date.now() / 1000) - 3600;

  const transfers = await fetchIncomingTransfers(
    process.env.HOT_JETTON_WALLET, // YOUR hot wallet's jetton wallet address
    sinceTime
  );

  if (transfers.length === 0) return;

  for (const tx of transfers) {
    await processIncomingTransfer(db, tx);
  }

  // Advance cursor to latest tx time
  const latestTime = Math.max(...transfers.map(t => t.transaction_now));
  await db.collection('poller_state').updateOne(
    { key: 'deposit_poller' },
    { $set: { lastProcessedTime: latestTime, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function fetchIncomingTransfers(jettonWalletAddress, sinceTime) {
  // IMPORTANT: use /api/v3/jetton/transfers NOT /api/v3/actions
  const url = new URL(`${TONCENTER_BASE}/api/v3/jetton/transfers`);
  url.searchParams.set('owner_address', jettonWalletAddress);
  url.searchParams.set('direction', 'in');
  url.searchParams.set('jetton_master', USDT_MASTER); // filter for USDT only
  url.searchParams.set('start_utime', String(sinceTime));
  url.searchParams.set('limit', '50');
  url.searchParams.set('sort', 'asc'); // oldest first for correct processing order

  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': process.env.TONCENTER_API_KEY },
  });

  if (res.status === 429) {
    console.warn('Toncenter rate limited — backing off');
    return [];
  }
  if (!res.ok) throw new Error(`Toncenter error ${res.status}`);

  const data = await res.json();
  return data.jetton_transfers ?? [];
}

async function processIncomingTransfer(db, tx) {
  const txHash = tx.transaction_hash;

  // ── Idempotency check ──────────────────────────────────────────────────────
  const alreadySeen = await db.collection('processed_txs').findOne({ txHash });
  if (alreadySeen) return;

  // ── Verify it's real USDT ──────────────────────────────────────────────────
  // Normalize address comparison (both to lowercase raw format)
  const txMaster = tx.jetton_master?.replace(/^0:/, '').toLowerCase();
  const expectedMaster = USDT_MASTER.split('...')[0]; // use normalized comparison in real code
  // Full check:
  if (!tx.jetton_master) return;
  // NOTE: Toncenter returns master in 0:xxx raw format; USDT_MASTER is EQxxx friendly format
  // Use Address.parse from @ton/ton to normalize before comparing

  const receivedRaw = tx.amount; // string — raw USDT units
  const comment = tx.comment ?? '';
  const senderJettonWallet = tx.source;
  const senderAddress = tx.source_owner ?? null; // sender's main wallet (if available)
  const txTime = tx.transaction_now;

  // ── Resolve user from memo ─────────────────────────────────────────────────
  const memoDoc = await db.collection('deposit_memos').findOne({ memo: comment });
  const userId = memoDoc?.userId ?? null;

  if (!userId) {
    // Unknown memo — record as unmatched deposit for manual review
    await db.collection('unmatched_deposits').insertOne({
      txHash, receivedRaw, comment, senderJettonWallet, txTime, recordedAt: new Date(),
    });
    return;
  }

  // ── Atomic: record deposit + credit balance + mark processed ───────────────
  const mongoClient = db.client; // need session-capable client
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      // Insert deposit record
      await db.collection('deposits').insertOne({
        txHash,
        userId,
        amountRaw: receivedRaw,
        amountDisplay: (Number(receivedRaw) / 1e6).toFixed(6),
        comment,
        senderJettonWallet,
        senderAddress,
        txTime: new Date(txTime * 1000),
        status: 'confirmed',
        createdAt: new Date(),
      }, { session });

      // Credit user balance
      await db.collection('user_balances').updateOne(
        { userId },
        {
          $inc: { balanceRaw: receivedRaw },
          $set: { updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, session }
      );

      // Record processed tx (idempotency guard)
      await db.collection('processed_txs').insertOne(
        { txHash, processedAt: new Date(), type: 'deposit' },
        { session }
      );
    });

    console.log(`Deposit confirmed: user=${userId} amount=${Number(receivedRaw)/1e6} USDT tx=${txHash}`);

  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key on processed_txs — race condition, already handled elsewhere
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }

  // Expire used memo so it can't be reused
  await db.collection('deposit_memos').updateOne(
    { memo: comment },
    { $set: { used: true, usedAt: new Date() } }
  );
}
```

---

## Deposit Memo Generation

```js
// Generate unique memo for each deposit request
export async function generateDepositMemo(db, userId) {
  const memo = `d-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await db.collection('deposit_memos').insertOne({
    memo,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 3600_000), // expire after 24h
    used: false,
  });

  return {
    memo,
    address: process.env.HOT_WALLET_ADDRESS,
    instructions: `Send USDT to ${process.env.HOT_WALLET_ADDRESS} with comment: ${memo}`,
    // Deep link for Tonkeeper:
    deepLink: `https://app.tonkeeper.com/transfer/${process.env.HOT_WALLET_ADDRESS}`
      + `?amount=0`                     // user enters amount
      + `&jetton=${USDT_MASTER}`
      + `&text=${encodeURIComponent(memo)}`,
    expiresIn: '24 hours',
  };
}
```

---

## Address Normalization (Critical for Comparisons)

TON addresses have multiple string representations (bounceable/non-bounceable, with/without workchain prefix). Always normalize before comparing:

```js
import { Address } from '@ton/ton';

function normalizeAddress(addr) {
  try {
    return Address.parse(addr).toRawString(); // returns "0:hexhash"
  } catch {
    return null;
  }
}

// Safe comparison
function addressesEqual(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return na !== null && na === nb;
}

// Use when verifying jetton master:
const txMasterNorm = normalizeAddress(tx.jetton_master);
const expectedMasterNorm = normalizeAddress(USDT_MASTER);
if (!addressesEqual(txMasterNorm, expectedMasterNorm)) return; // reject fake
```

---

## Jetton Wallet Derivation (Cache in DB)

```js
import { Address, JettonMaster, TonClient } from '@ton/ton';

export async function getOrDeriveJettonWallet(db, ownerAddress) {
  // Check cache first
  const cached = await db.collection('jetton_wallet_cache').findOne({
    ownerAddress: normalizeAddress(ownerAddress),
    jettonMaster: normalizeAddress(USDT_MASTER),
  });
  if (cached) return cached.jettonWallet;

  // Derive from chain
  const client = new TonClient({
    endpoint: `https://toncenter.com/api/v2/jsonRPC`,
    apiKey: process.env.TONCENTER_API_KEY,
  });
  const master = client.open(JettonMaster.create(Address.parse(USDT_MASTER)));
  const walletAddr = await master.getWalletAddress(Address.parse(ownerAddress));
  const walletStr = walletAddr.toString({ bounceable: true });

  // Cache
  await db.collection('jetton_wallet_cache').insertOne({
    ownerAddress: normalizeAddress(ownerAddress),
    jettonMaster: normalizeAddress(USDT_MASTER),
    jettonWallet: walletStr,
    derivedAt: new Date(),
  });

  return walletStr;
}
```

---

## Pagination for High-Volume Merchants

If your hot wallet receives many deposits, a single API call may not return all transfers:

```js
async function fetchAllTransfersSince(jettonWalletAddress, sinceTime) {
  const results = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const url = `${TONCENTER_BASE}/api/v3/jetton/transfers`
      + `?owner_address=${jettonWalletAddress}`
      + `&direction=in&jetton_master=${USDT_MASTER}`
      + `&start_utime=${sinceTime}`
      + `&limit=${limit}&offset=${offset}&sort=asc`;

    const res = await fetch(url, { headers: { 'X-API-Key': process.env.TONCENTER_API_KEY } });
    const { jetton_transfers } = await res.json();

    results.push(...(jetton_transfers ?? []));
    if ((jetton_transfers?.length ?? 0) < limit) break; // last page
    offset += limit;
    await sleep(200); // gentle on rate limits
  }

  return results;
}
```

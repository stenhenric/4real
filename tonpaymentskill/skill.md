---
name: ton-usdt-payments
description: >
  Build a production-grade automated TON USDT (Jetton) deposit & withdrawal system with MongoDB.
  Use this skill whenever the user wants to: detect incoming USDT deposits on TON, programmatically
  send/withdraw USDT to user wallets, build a crypto wallet backend, manage a hot wallet, queue
  withdrawals safely, store balances and transactions in MongoDB, prevent double-spending or
  double-crediting, handle seqno locking for concurrent sends, or build any exchange/app with
  TON + USDT + database. Covers full lifecycle: deposit address generation, Jetton transfer
  detection via Toncenter v3, withdrawal signing with mnemonic (WalletContractV5R1 / V4),
  seqno queue to prevent concurrent send failures, idempotent MongoDB writes, hot wallet balance
  tracking, and user ledger management. Always use this skill when TON + USDT + MongoDB appear
  together, or when the user needs automated crypto send/receive logic.
---

# TON USDT Automated Deposit & Withdrawal + MongoDB

## Overview

This skill covers the **complete server-side pipeline** for accepting USDT deposits and sending USDT withdrawals on the TON Blockchain, persisted in MongoDB.

Built on:
- **TEP-74 Jetton standard** (USDT on TON)
- **Toncenter API v3** (transaction detection)
- **@ton/ton + @ton/crypto** (wallet signing)
- **MongoDB** (ledger, queue, idempotency)

**Reference files (load when needed):**
- `references/withdrawal-engine.md` — Full withdrawal code: seqno locking, signing, retry logic
- `references/deposit-engine.md` — Full deposit polling code, jetton wallet derivation, confirmation
- `references/mongodb-schema.md` — All collection schemas, indexes, TTL patterns

---

## Critical Constants

```js
// USDT on TON — verified from official TON docs
const USDT_MASTER_MAINNET = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const USDT_DECIMALS = 6;                  // 1 USDT = 1_000_000 raw units
const TRANSFER_NOTIFICATION_OP = 0x7362d09c; // TEP-74 — fires only if forward_ton_amount > 0
const JETTON_TRANSFER_OP = 0x0f8a7ea5;   // op code to initiate a transfer
const FORWARD_TON_AMOUNT = '0.05';        // TON to attach so notification fires
const GAS_AMOUNT = toNano('0.07');        // total TON for gas per USDT send
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    YOUR BACKEND                      │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │ Deposit      │    │ Withdrawal               │   │
│  │ Poller       │    │ Queue Worker             │   │
│  │ (every 15s)  │    │ (every 5s)               │   │
│  └──────┬───────┘    └───────────┬──────────────┘   │
│         │                        │                   │
│  ┌──────▼────────────────────────▼──────────────┐   │
│  │              MongoDB                          │   │
│  │  deposits | withdrawals | user_balances       │   │
│  │  processed_txs | withdrawal_queue             │   │
│  └───────────────────────────────────────────────┘   │
│                        │                             │
└────────────────────────┼─────────────────────────────┘
                         │ Toncenter API v3
                    ┌────▼──────┐
                    │ TON Chain │
                    │ Hot Wallet│  ← your server wallet
                    └───────────┘
```

---

## Step 1 — Project Setup

```bash
npm install @ton/ton @ton/crypto mongodb dotenv
```

```
# .env — NEVER commit this file
TONCENTER_API_KEY=your_key           # from toncenter.com
HOT_WALLET_MNEMONIC="word1 word2 ..." # 24-word mnemonic — server's signing wallet
HOT_WALLET_VERSION=V5R1              # or V4 — match what you created
MONGODB_URI=mongodb+srv://...
MONGODB_DB=payments
NETWORK=mainnet                      # or testnet
```

### Shared client setup

```js
// lib/ton-client.js
import { TonClient, WalletContractV5R1, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const ENDPOINT = {
  mainnet: 'https://toncenter.com/api/v2/jsonRPC',
  testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

export function createTonClient() {
  return new TonClient({
    endpoint: ENDPOINT[process.env.NETWORK] ?? ENDPOINT.mainnet,
    apiKey: process.env.TONCENTER_API_KEY,
  });
}

export async function getHotWallet() {
  const mnemonic = process.env.HOT_WALLET_MNEMONIC.split(' ');
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const WalletContract = process.env.HOT_WALLET_VERSION === 'V4'
    ? WalletContractV4
    : WalletContractV5R1;
  const wallet = WalletContract.create({ workchain: 0, publicKey: keyPair.publicKey });
  return { wallet, keyPair };
}
```

---

## Step 2 — Derive Jetton Wallet Addresses

Every TON address that holds USDT has its own **Jetton Wallet** contract. You must monitor YOUR hot wallet's Jetton Wallet for incoming deposits.

```js
// lib/jetton.js
import { Address, JettonMaster } from '@ton/ton';
import { createTonClient } from './ton-client.js';

const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';

export async function deriveJettonWallet(ownerAddress) {
  const client = createTonClient();
  const master = client.open(JettonMaster.create(Address.parse(USDT_MASTER)));
  const walletAddr = await master.getWalletAddress(Address.parse(ownerAddress));
  return walletAddr.toString({ bounceable: true });
}

// Call once at startup — cache result in DB or env
// Your hot wallet's jetton wallet = what you monitor for deposits
```

> 💡 Run `deriveJettonWallet(yourHotWalletAddress)` once, save the result as `HOT_JETTON_WALLET` in your env/DB.

---

## Step 3 — MongoDB Collections

Full schemas in `references/mongodb-schema.md`. Summary:

| Collection | Purpose |
|---|---|
| `deposits` | Incoming USDT payments, one doc per detection |
| `withdrawals` | Outgoing USDT requests + status |
| `withdrawal_queue` | Serialised queue to avoid seqno collisions |
| `user_balances` | Internal ledger (credited on deposit, debited on withdraw) |
| `processed_txs` | Idempotency guard — prevents double-credit |

```js
// Essential indexes — run once at startup
await db.collection('deposits').createIndex({ txHash: 1 }, { unique: true });
await db.collection('withdrawals').createIndex({ withdrawalId: 1 }, { unique: true });
await db.collection('withdrawal_queue').createIndex({ status: 1, createdAt: 1 });
await db.collection('processed_txs').createIndex({ txHash: 1 }, { unique: true });
await db.collection('user_balances').createIndex({ userId: 1 }, { unique: true });
```

---

## Step 4 — Deposit Detection (Poller)

Full code in `references/deposit-engine.md`. The key call:

```js
// Use /api/v3/jetton/transfers — NOT /api/v3/actions (does not return jetton transfers)
GET https://toncenter.com/api/v3/jetton/transfers
  ?owner_address={YOUR_HOT_JETTON_WALLET}
  &direction=in
  &jetton_master={USDT_MASTER}
  &start_utime={sinceUnixTime}
  &limit=50&sort=asc
```

On each incoming transfer:
1. Check `processed_txs` — skip if already seen (idempotency)
2. Verify `tx.jetton_master === USDT_MASTER` (reject fakes)
3. Parse `tx.comment` to identify the user (see memo strategy below)
4. In a **MongoDB transaction**: write to `deposits`, credit `user_balances`, insert `processed_txs`

### Memo / User Identification Strategy

Since TON has no per-user deposit addresses (unlike some blockchains), use **memo comments** to identify who deposited:

```js
// When user wants to deposit: give them a unique memo
const memo = `uid-${userId}-${Date.now()}`;
// Store memo → userId mapping in DB
await db.collection('deposit_memos').insertOne({ memo, userId, createdAt: new Date() });

// Instructions shown to user:
// "Send USDT to: {HOT_WALLET_ADDRESS}
//  Include comment: uid-abc123-1713000000
//  ⚠️ Required — missing memo means we can't credit you"
```

---

## Step 5 — Automated Withdrawal (Sender)

> ⚠️ **The #1 Production Problem:** TON uses `seqno` (sequence number) for replay protection. Each wallet send must use the current seqno and increments it by 1. If two sends fire concurrently with the same seqno, **one will be silently dropped on-chain.** You must serialize all withdrawals through a queue.

Full production code in `references/withdrawal-engine.md`. Core pattern:

### 5a — Queue a Withdrawal Request

```js
// withdrawal-service.js
export async function requestWithdrawal({ userId, toAddress, amountUsdt, withdrawalId }) {
  const db = getDb();
  const amountRaw = BigInt(Math.round(amountUsdt * 1_000_000)).toString();

  // 1. Check user balance
  const userBalance = await db.collection('user_balances').findOne({ userId });
  if (!userBalance || BigInt(userBalance.balanceRaw) < BigInt(amountRaw)) {
    throw new Error('Insufficient balance');
  }

  // 2. Reserve funds (deduct from ledger immediately — before sending)
  await db.collection('user_balances').updateOne(
    { userId, balanceRaw: { $gte: amountRaw } }, // guard
    { $inc: { balanceRaw: -BigInt(amountRaw) } }
  );

  // 3. Enqueue
  await db.collection('withdrawals').insertOne({
    withdrawalId,           // your unique ID (idempotency key)
    userId,
    toAddress,
    amountRaw,
    status: 'queued',       // queued → processing → sent → confirmed | failed
    createdAt: new Date(),
    retries: 0,
  });
}
```

### 5b — Withdrawal Queue Worker (runs every 5 seconds)

```js
// workers/withdrawal-worker.js
import { beginCell, internal, toNano, Address, SendMode } from '@ton/ton';
import { createTonClient, getHotWallet } from '../lib/ton-client.js';
import { deriveJettonWallet } from '../lib/jetton.js';

const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
let isSending = false; // in-process mutex — process one withdrawal at a time

export async function processNextWithdrawal(db) {
  if (isSending) return; // prevent re-entry
  isSending = true;

  try {
    // Claim one queued withdrawal atomically
    const withdrawal = await db.collection('withdrawals').findOneAndUpdate(
      { status: 'queued' },
      { $set: { status: 'processing', startedAt: new Date() } },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    );
    if (!withdrawal) return;

    await sendUsdtWithdrawal(db, withdrawal);

  } catch (err) {
    console.error('Withdrawal worker error:', err.message);
  } finally {
    isSending = false;
  }
}

async function sendUsdtWithdrawal(db, withdrawal) {
  const client = createTonClient();
  const { wallet, keyPair } = await getHotWallet();
  const contract = client.open(wallet);

  // Get hot wallet's jetton wallet address
  const hotJettonWallet = await deriveJettonWallet(wallet.address.toString());

  // Build the Jetton transfer body (TEP-74)
  const destinationAddress = Address.parse(withdrawal.toAddress);
  const forwardPayload = beginCell()
    .storeUint(0, 32)                    // 0 = text comment opcode
    .storeStringTail(`withdraw-${withdrawal.withdrawalId}`) // traceability
    .endCell();

  const transferBody = beginCell()
    .storeUint(0x0f8a7ea5, 32)           // Jetton transfer op code
    .storeUint(0, 64)                    // query_id (0 is fine)
    .storeCoins(BigInt(withdrawal.amountRaw))  // amount in raw units
    .storeAddress(destinationAddress)    // recipient main wallet
    .storeAddress(wallet.address)        // response destination (excess TON returns here)
    .storeBit(0)                         // no custom payload
    .storeCoins(toNano('0.05'))          // forward_ton_amount — REQUIRED for notification
    .storeBit(1)                         // forward_payload as ref
    .storeRef(forwardPayload)
    .endCell();

  // Get current seqno — this is the critical step
  const seqno = await contract.getSeqno();

  // Sign and broadcast
  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [
      internal({
        to: Address.parse(hotJettonWallet), // send FROM our jetton wallet
        value: toNano('0.07'),              // gas
        bounce: true,
        body: transferBody,
      }),
    ],
  });

  // Wait for seqno to increment (confirms tx was accepted)
  await waitForSeqnoChange(contract, seqno, 90_000); // 90s timeout

  // Mark as sent
  await db.collection('withdrawals').updateOne(
    { _id: withdrawal._id },
    { $set: { status: 'sent', sentAt: new Date(), seqno } }
  );
}

async function waitForSeqnoChange(contract, initialSeqno, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2000);
    const currentSeqno = await contract.getSeqno();
    if (currentSeqno > initialSeqno) return; // confirmed
  }
  throw new Error(`Seqno did not increment after ${timeoutMs}ms — tx may have dropped`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
```

### 5c — Start the Worker Loop

```js
// Start both loops
setInterval(() => processNextWithdrawal(db), 5_000);   // withdrawals
setInterval(() => pollDeposits(db), 15_000);            // deposits
```

---

## Step 6 — Confirm Sent Withdrawals

After a withdrawal is `sent`, confirm it actually landed on-chain by polling for the tx:

```js
// Check Toncenter for outgoing transfer matching our seqno/amount
// See references/withdrawal-engine.md for full confirmation poller
```

---

## Key Rules for Production

### Seqno Rules
- **Never send two transactions concurrently** from the same wallet — the second will be silently dropped
- Use `isSending` mutex + DB `status: 'processing'` guard together
- After a send, **wait for seqno to increment** before releasing the lock
- For high volume (100s of withdrawals/day): use a **Highload Wallet** — sends up to 254 txs per call, uses query_id instead of seqno (see `references/withdrawal-engine.md`)

### Security Rules
- Store `HOT_WALLET_MNEMONIC` in secrets manager (AWS Secrets Manager, Vault), not plain `.env` in production
- Hot wallet should hold **only what's needed for daily operations** — sweep excess to cold wallet
- Always verify incoming `jetton_master === USDT_MASTER` before crediting (fake token protection)
- Deduct user balance **before** sending withdrawal (pre-reserve), not after
- Use `withdrawalId` as idempotency key — if worker crashes and retries, don't double-send

### Balance Rules
- User `balanceRaw` stores internal ledger balance — separate from on-chain balance
- Always reconcile: periodically check on-chain USDT balance of hot wallet vs sum of all user balances
- Keep a small TON reserve (≥ 1 TON) in hot wallet at all times for gas fees

---

## Failure Recovery

| Failure | Recovery |
|---|---|
| Worker crashes during `processing` | On restart, find `status: 'processing'` docs stuck >10 min → check if seqno advanced → if yes, mark `sent`; if no, reset to `queued` |
| Seqno timeout | Check on-chain — tx may have landed late. Use `getTransactions` to verify before re-queuing |
| Deposit poller misses a tx | Always poll with `start_utime` = last confirmed tx time, not just "last 15 seconds" |
| MongoDB write fails after chain send | Confirmation poller catches the on-chain tx and reconciles |

---

## Reference Files

- **`references/withdrawal-engine.md`** — Complete withdrawal code, seqno locking, highload wallet option, retry logic, confirmation polling
- **`references/deposit-engine.md`** — Complete deposit poller, Toncenter v3 queries, user credit logic, memo parsing
- **`references/mongodb-schema.md`** — All collection schemas, indexes, TTL, ledger patterns, BigInt handling

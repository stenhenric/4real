# Withdrawal Engine — Complete Production Code

## Standard Wallet Withdrawal (V4 / V5R1)

Good for: up to ~50-100 withdrawals/day. Sends one tx at a time due to seqno constraint.

```js
// services/withdrawal-engine.js
import { beginCell, internal, toNano, Address, SendMode, TonClient, WalletContractV5R1, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';

// ─── Singleton wallet state ──────────────────────────────────────────────────
let _client, _wallet, _keyPair, _contract;

async function initWallet() {
  if (_contract) return { contract: _contract, wallet: _wallet, keyPair: _keyPair };

  _client = new TonClient({
    endpoint: process.env.NETWORK === 'testnet'
      ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
      : 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: process.env.TONCENTER_API_KEY,
  });

  _keyPair = await mnemonicToPrivateKey(process.env.HOT_WALLET_MNEMONIC.split(' '));
  const WC = process.env.HOT_WALLET_VERSION === 'V4' ? WalletContractV4 : WalletContractV5R1;
  _wallet = WC.create({ workchain: 0, publicKey: _keyPair.publicKey });
  _contract = _client.open(_wallet);

  return { contract: _contract, wallet: _wallet, keyPair: _keyPair };
}

// ─── Build Jetton transfer cell ──────────────────────────────────────────────
function buildJettonTransferBody({ amountRaw, destination, responseAddress, comment }) {
  const forwardPayload = beginCell()
    .storeUint(0, 32)           // text comment opcode
    .storeStringTail(comment)
    .endCell();

  return beginCell()
    .storeUint(0x0f8a7ea5, 32)  // transfer op code (TEP-74)
    .storeUint(0, 64)           // query_id
    .storeCoins(BigInt(amountRaw))
    .storeAddress(Address.parse(destination))
    .storeAddress(responseAddress)  // excess TON returned here
    .storeBit(0)                // no custom payload
    .storeCoins(toNano('0.05')) // forward_ton_amount — MUST be > 0 for notification
    .storeBit(1)                // forward_payload as reference cell
    .storeRef(forwardPayload)
    .endCell();
}

// ─── Core send function ──────────────────────────────────────────────────────
export async function sendUsdtWithdrawal({ toAddress, amountRaw, withdrawalId, hotJettonWallet }) {
  const { contract, wallet, keyPair } = await initWallet();

  const body = buildJettonTransferBody({
    amountRaw,
    destination: toAddress,
    responseAddress: wallet.address,
    comment: `wd-${withdrawalId}`,
  });

  // Fetch current seqno
  const seqno = await contract.getSeqno();

  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [
      internal({
        to: Address.parse(hotJettonWallet),
        value: toNano('0.07'),     // enough gas (excess returned)
        bounce: true,
        body,
      }),
    ],
  });

  // Wait for seqno increment (confirms acceptance by blockchain)
  await pollUntilSeqnoChanges(contract, seqno, 90_000);

  return seqno;
}

async function pollUntilSeqnoChanges(contract, initialSeqno, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2500);
    try {
      const current = await contract.getSeqno();
      if (current > initialSeqno) return current;
    } catch {
      // API hiccup — keep trying
    }
  }
  throw new Error(`Seqno stuck at ${initialSeqno} after ${timeoutMs}ms`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
```

---

## Queue Worker (MongoDB-backed)

```js
// workers/withdrawal-worker.js
import { MongoClient } from 'mongodb';
import { sendUsdtWithdrawal } from '../services/withdrawal-engine.js';
import { deriveJettonWallet } from '../lib/jetton.js';

let isSending = false;
let hotJettonWallet = null; // cached — derive once at startup

export async function initWorker() {
  const { wallet } = await initWallet();
  hotJettonWallet = await deriveJettonWallet(wallet.address.toString());
  console.log(`Hot jetton wallet: ${hotJettonWallet}`);
}

export async function runWithdrawalWorker(db) {
  if (isSending) return;
  isSending = true;

  try {
    // Claim next queued withdrawal — atomic findOneAndUpdate prevents race
    const doc = await db.collection('withdrawals').findOneAndUpdate(
      { status: 'queued', retries: { $lt: 3 } },
      { $set: { status: 'processing', startedAt: new Date() } },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    );

    if (!doc) return; // nothing queued

    try {
      const seqno = await sendUsdtWithdrawal({
        toAddress: doc.toAddress,
        amountRaw: doc.amountRaw,
        withdrawalId: doc.withdrawalId,
        hotJettonWallet,
      });

      await db.collection('withdrawals').updateOne(
        { _id: doc._id },
        { $set: { status: 'sent', sentAt: new Date(), seqno } }
      );

      console.log(`Withdrawal ${doc.withdrawalId} sent (seqno: ${seqno})`);

    } catch (sendErr) {
      console.error(`Withdrawal ${doc.withdrawalId} failed:`, sendErr.message);

      // Increment retries; after 3 fails → mark failed, refund user
      const retries = (doc.retries ?? 0) + 1;
      const newStatus = retries >= 3 ? 'failed' : 'queued';

      await db.collection('withdrawals').updateOne(
        { _id: doc._id },
        { $set: { status: newStatus, lastError: sendErr.message, updatedAt: new Date() },
          $inc: { retries: 1 } }
      );

      if (newStatus === 'failed') {
        // Refund internal balance
        await db.collection('user_balances').updateOne(
          { userId: doc.userId },
          { $inc: { balanceRaw: doc.amountRaw } }
        );
        console.warn(`Withdrawal ${doc.withdrawalId} permanently failed — balance refunded`);
      }
    }

  } finally {
    isSending = false;
  }
}

// Stuck recovery: on startup, reset any 'processing' docs that got stuck
export async function recoverStuckWithdrawals(db) {
  const tenMinsAgo = new Date(Date.now() - 10 * 60_000);
  const stuck = await db.collection('withdrawals').find({
    status: 'processing',
    startedAt: { $lt: tenMinsAgo },
  }).toArray();

  for (const doc of stuck) {
    // Check if seqno advanced — means tx actually went through
    // (compare against recorded seqno if available)
    console.warn(`Resetting stuck withdrawal ${doc.withdrawalId} → queued`);
    await db.collection('withdrawals').updateOne(
      { _id: doc._id },
      { $set: { status: 'queued', updatedAt: new Date() } }
    );
  }
}
```

---

## Highload Wallet (for 100+ withdrawals/day)

Standard V4/V5 wallets serialize withdrawals one by one (~5-10s each). For exchanges needing batch sends, use TON's **Highload Wallet**:

- Sends up to **254 messages per call**
- Uses `query_id` instead of `seqno` — no serialization needed
- Requires deploying a Highload wallet contract

```js
// Install: npm install ton-highload-wallet-contract
// See: https://github.com/ton-blockchain/highload-wallet-contract-v2

import { HighloadWalletV2 } from 'ton-highload-wallet-contract';

// Build batch of up to 254 withdrawal messages
const messages = pendingWithdrawals.map(w => ({
  to: w.hotJettonWallet,
  value: toNano('0.07'),
  body: buildJettonTransferBody(w),
}));

// Send all at once — no seqno issues
await highloadWallet.sendBatch(messages);
```

> Use Highload only if standard seqno-based wallet becomes a bottleneck. Start with V5R1 unless you know you need batch sends.

---

## Withdrawal Confirmation Poller

After marking `sent`, confirm the tx landed on-chain:

```js
// Poll outgoing transfers from hot wallet's jetton wallet
export async function confirmSentWithdrawals(db) {
  const sent = await db.collection('withdrawals')
    .find({ status: 'sent', sentAt: { $gt: new Date(Date.now() - 3600_000) } })
    .toArray();

  for (const doc of sent) {
    const confirmed = await checkWithdrawalOnChain(doc);
    if (confirmed) {
      await db.collection('withdrawals').updateOne(
        { _id: doc._id },
        { $set: { status: 'confirmed', confirmedAt: new Date(), txHash: confirmed.hash } }
      );
    }
  }
}

async function checkWithdrawalOnChain(doc) {
  // Query outgoing transfers from hot jetton wallet
  const url = `${TONCENTER_BASE}/api/v3/jetton/transfers`
    + `?owner_address=${hotJettonWallet}&direction=out`
    + `&start_utime=${Math.floor(doc.sentAt.getTime() / 1000) - 30}`
    + `&limit=20`;

  const res = await fetch(url, { headers: { 'X-API-Key': process.env.TONCENTER_API_KEY } });
  const { jetton_transfers } = await res.json();

  // Match by comment containing withdrawalId
  return jetton_transfers.find(tx =>
    tx.comment?.includes(doc.withdrawalId) &&
    tx.amount === doc.amountRaw
  ) ?? null;
}
```

---

## Checking Hot Wallet TON Balance (Gas Reserve)

Your hot wallet needs TON for gas. Monitor and alert if it gets low:

```js
export async function checkGasBalance() {
  const { contract } = await initWallet();
  const balance = await contract.getBalance(); // returns nanoTON as bigint
  const tonBalance = Number(balance) / 1e9;

  if (tonBalance < 1.0) {
    console.warn(`⚠️ Hot wallet TON balance low: ${tonBalance} TON — top up to avoid stuck withdrawals`);
  }
  return tonBalance;
}
```

---

## Checking Hot Wallet USDT Balance

```js
export async function getHotUsdtBalance() {
  const res = await fetch(
    `${TONCENTER_BASE}/api/v3/jetton/wallets?owner_address=${HOT_WALLET_ADDRESS}&jetton_address=${USDT_MASTER}`,
    { headers: { 'X-API-Key': process.env.TONCENTER_API_KEY } }
  );
  const data = await res.json();
  const raw = data.jetton_wallets?.[0]?.balance ?? '0';
  return Number(raw) / 1e6; // display in USDT
}
```

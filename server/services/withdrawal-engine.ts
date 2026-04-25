import { beginCell, internal, toNano, Address, SendMode } from '@ton/ton';

import { getEnv } from '../config/env.ts';
import { addressesEqual, extractJettonTransferComment, USDT_MASTER } from '../lib/jetton.ts';
import { createTonClient, getHotWallet, getToncenterBaseUrl } from '../lib/ton-client.ts';
import { logger } from '../utils/logger.ts';

export function buildJettonTransferBody(amountRaw: string, destination: string, responseAddress: Address, comment: string) {
  const forwardPayload = beginCell()
    .storeUint(0, 32)
    .storeStringTail(comment)
    .endCell();

  return beginCell()
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(0, 64)
    .storeCoins(BigInt(amountRaw))
    .storeAddress(Address.parse(destination))
    .storeAddress(responseAddress)
    .storeBit(0)
    .storeCoins(toNano('0.05'))
    .storeBit(1)
    .storeRef(forwardPayload)
    .endCell();
}

export class SeqnoTimeoutError extends Error {
  readonly seqno: number;
  readonly sentAt: Date;

  constructor(seqno: number, timeoutMs: number, sentAt: Date) {
    super(`Seqno stuck at ${seqno} after ${timeoutMs}ms`);
    this.name = 'SeqnoTimeoutError';
    this.seqno = seqno;
    this.sentAt = sentAt;
  }
}

export async function sendUsdtWithdrawal({ toAddress, amountRaw, withdrawalId, hotJettonWallet }: { toAddress: string, amountRaw: string, withdrawalId: string, hotJettonWallet: string }) {
  const { wallet, keyPair } = await getHotWallet();
  const client = createTonClient();
  const contract = client.open(wallet);

  const body = buildJettonTransferBody(
    amountRaw,
    toAddress,
    wallet.address,
    `wd-${withdrawalId}`,
  );

  const seqno = await contract.getSeqno();
  const validUntil = Math.floor(Date.now() / 1000) + 300; // 5 minutes expiration

  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    timeout: validUntil,
    messages: [
      internal({
        to: Address.parse(hotJettonWallet),
        value: toNano('0.07'),
        bounce: true,
        body,
      }),
    ],
  });

  const sentAt = new Date();

  try {
    await pollUntilSeqnoChanges(contract, seqno, 90_000);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Seqno stuck')) {
      throw new SeqnoTimeoutError(seqno, 90_000, sentAt);
    }
    throw error;
  }

  return seqno;
}

interface ToncenterJettonTransfer {
  transaction_hash: string;
  transaction_now: number;
  amount: string | number;
  comment?: string;
  destination?: string;
  decoded_forward_payload?: { comment?: string } | Array<{ comment?: string }> | null;
}

async function fetchJettonTransfers({
  ownerAddress,
  direction,
  startUtime,
  limit,
}: {
  ownerAddress: string;
  direction: 'in' | 'out';
  startUtime: number;
  limit: number;
}): Promise<ToncenterJettonTransfer[]> {
  let allTransfers: ToncenterJettonTransfer[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${getToncenterBaseUrl()}/api/v3/jetton/transfers`);
    url.searchParams.set('owner_address', ownerAddress);
    url.searchParams.set('direction', direction);
    url.searchParams.set('jetton_master', USDT_MASTER);
    url.searchParams.set('start_utime', String(startUtime));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('sort', 'asc');

    const response = await fetch(url.toString(), {
      headers: { 'X-API-Key': getEnv().TONCENTER_API_KEY ?? '' },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 429) {
      logger.warn('withdrawal.confirmation_rate_limited');
      break; // Return what we have so far
    }

    if (!response.ok) {
      throw new Error(`Toncenter error ${response.status}`);
    }

    const data = await response.json() as { jetton_transfers?: ToncenterJettonTransfer[] };
    const transfers = data.jetton_transfers ?? [];

    allTransfers = allTransfers.concat(transfers);

    if (transfers.length < limit) {
      break;
    }

    offset += limit;
  }

  return allTransfers;
}

export async function findWithdrawalTransferOnChain({
  hotJettonWallet,
  sentAt,
  withdrawalId,
  amountRaw,
  toAddress,
}: {
  hotJettonWallet: string;
  sentAt: Date;
  withdrawalId: string;
  amountRaw: string;
  toAddress: string;
}) {
  const transfers = await fetchJettonTransfers({
    ownerAddress: hotJettonWallet,
    direction: 'out',
    startUtime: Math.max(0, Math.floor(sentAt.getTime() / 1000) - 30),
    limit: 20,
  });

  const expectedComment = `wd-${withdrawalId}`;
  const match = transfers.find((transfer) =>
    extractJettonTransferComment(transfer) === expectedComment
    && String(transfer.amount) === amountRaw
    && typeof transfer.destination === 'string'
    && addressesEqual(transfer.destination, toAddress),
  );

  if (!match) {
    return null;
  }

  return {
    txHash: match.transaction_hash,
    confirmedAt: new Date(match.transaction_now * 1000),
  };
}

export async function getHotWalletTonBalance(address: string): Promise<bigint> {
  const client = createTonClient();
  return client.getBalance(Address.parse(address));
}

export async function getHotWalletUsdtBalanceRaw(ownerAddress: string): Promise<bigint | null> {
  const url = new URL(`${getToncenterBaseUrl()}/api/v3/jetton/wallets`);
  url.searchParams.set('owner_address', ownerAddress);
  url.searchParams.set('jetton_address', USDT_MASTER);

  const response = await fetch(url.toString(), {
    headers: { 'X-API-Key': getEnv().TONCENTER_API_KEY ?? '' },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 429) {
    logger.warn('wallet_monitor.rate_limited');
    return null;
  }

  if (!response.ok) {
    throw new Error(`Toncenter error ${response.status}`);
  }

  const data = await response.json() as { jetton_wallets?: Array<{ balance?: string | number }> };
  return BigInt(data.jetton_wallets?.[0]?.balance ?? '0');
}

interface SeqnoContract {
  getSeqno: () => Promise<number>;
}

async function pollUntilSeqnoChanges(contract: SeqnoContract, initialSeqno: number, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2500);
    try {
      const current = await contract.getSeqno();
      if (current > initialSeqno) return current;
    } catch (err: unknown) {
      logger.warn('withdrawal.seqno_poll_retry', {
        error: err instanceof Error ? err.message : String(err),
        initialSeqno,
      });
    }
  }
  throw new Error(`Seqno stuck at ${initialSeqno} after ${timeoutMs}ms`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

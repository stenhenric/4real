import { Address, beginCell, toNano } from '@ton/ton';
import { getOrDeriveJettonWallet } from '../lib/jetton.ts';
import { getEnv } from '../config/env.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';

const TONCONNECT_TRANSACTION_TTL_SECONDS = 360;
const TONCONNECT_GAS_AMOUNT = '0.05';
const TONCONNECT_FORWARD_AMOUNT = '0.01';

const toUsdtRawAmount = (amountUsdt: number): string => BigInt(Math.round(amountUsdt * 1_000_000)).toString();

function buildTonConnectPayload({
  amountRaw,
  destinationAddress,
  responseAddress,
  memo,
}: {
  amountRaw: string;
  destinationAddress: string;
  responseAddress: string;
  memo: string;
}) {
  const forwardPayload = beginCell()
    .storeUint(0, 32)
    .storeStringTail(memo)
    .endCell();

  return beginCell()
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(0, 64)
    .storeCoins(BigInt(amountRaw))
    .storeAddress(Address.parse(destinationAddress))
    .storeAddress(Address.parse(responseAddress))
    .storeBit(0)
    .storeCoins(toNano(TONCONNECT_FORWARD_AMOUNT))
    .storeBit(1)
    .storeRef(forwardPayload)
    .endCell();
}

export interface PreparedTonConnectDeposit {
  memo: string;
  address: string;
  amountUsdt: number;
  amountRaw: string;
  userJettonWalletAddress: string;
  transaction: {
    validUntil: number;
    messages: {
      address: string;
      amount: string;
      payload: string;
    }[];
  };
}

export async function prepareTonConnectDeposit({
  userId,
  memo,
  walletAddress,
  amountUsdt,
}: {
  userId: string;
  memo: string;
  walletAddress: string;
  amountUsdt: number;
}): Promise<PreparedTonConnectDeposit> {
  const { HOT_WALLET_ADDRESS: hotWalletAddress } = getEnv();
  if (!hotWalletAddress) {
    throw new Error('HOT_WALLET_ADDRESS is not configured');
  }

  const memoRecord = await DepositMemoRepository.findByUserAndMemo(userId, memo);
  if (!memoRecord) {
    throw new Error('Deposit memo not found');
  }
  if (memoRecord.used === true) {
    throw new Error('Deposit memo has already been used');
  }
  if (memoRecord.expiresAt instanceof Date && memoRecord.expiresAt.getTime() <= Date.now()) {
    throw new Error('Deposit memo has expired');
  }

  const ownerAddress = Address.parse(walletAddress).toString({ bounceable: true });
  const normalizedHotWallet = Address.parse(hotWalletAddress).toString({ bounceable: true });
  const userJettonWalletAddress = await getOrDeriveJettonWallet(ownerAddress);
  const amountRaw = toUsdtRawAmount(amountUsdt);
  const payload = buildTonConnectPayload({
    amountRaw,
    destinationAddress: normalizedHotWallet,
    responseAddress: ownerAddress,
    memo,
  });

  return {
    memo,
    address: normalizedHotWallet,
    amountUsdt,
    amountRaw,
    userJettonWalletAddress,
    transaction: {
      validUntil: Math.floor(Date.now() / 1000) + TONCONNECT_TRANSACTION_TTL_SECONDS,
      messages: [
        {
          address: userJettonWalletAddress,
          amount: toNano(TONCONNECT_GAS_AMOUNT).toString(),
          payload: payload.toBoc().toString('base64'),
        },
      ],
    },
  };
}

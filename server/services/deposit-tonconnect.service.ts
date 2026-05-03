import { Address, beginCell, toNano } from '@ton/ton';
import { getOrDeriveJettonWallet } from '../lib/jetton.ts';
import { getEnv } from '../config/env.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { badRequest, notFound, serviceUnavailable } from '../utils/http-error.ts';
import { formatUsdtAmount, parseUsdtAmount } from '../utils/money.ts';

const TONCONNECT_TRANSACTION_TTL_SECONDS = 360;
const TONCONNECT_GAS_AMOUNT = '0.05';
const TONCONNECT_FORWARD_AMOUNT = '0.01';

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
  amountUsdt: string;
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
  amountUsdt: string;
}): Promise<PreparedTonConnectDeposit> {
  const { HOT_WALLET_ADDRESS: hotWalletAddress } = getEnv();
  if (!hotWalletAddress) {
    throw serviceUnavailable('HOT_WALLET_ADDRESS is not configured', 'HOT_WALLET_NOT_CONFIGURED');
  }

  const memoRecord = await DepositMemoRepository.findByUserAndMemo(userId, memo);
  if (!memoRecord) {
    throw notFound('Deposit memo not found', 'DEPOSIT_MEMO_NOT_FOUND');
  }
  if (memoRecord.used === true) {
    throw badRequest('Deposit memo has already been used', 'DEPOSIT_MEMO_ALREADY_USED');
  }
  if (memoRecord.expiresAt instanceof Date && memoRecord.expiresAt.getTime() <= Date.now()) {
    throw badRequest('Deposit memo has expired', 'DEPOSIT_MEMO_EXPIRED');
  }

  const ownerAddress = Address.parse(walletAddress).toString({ bounceable: true });
  const normalizedHotWallet = Address.parse(hotWalletAddress).toString({ bounceable: true });
  const userJettonWalletAddress = await getOrDeriveJettonWallet(ownerAddress);
  const amountRaw = parseUsdtAmount(amountUsdt).toString();
  const payload = buildTonConnectPayload({
    amountRaw,
    destinationAddress: normalizedHotWallet,
    responseAddress: ownerAddress,
    memo,
  });

  return {
    memo,
    address: normalizedHotWallet,
    amountUsdt: formatUsdtAmount(amountRaw),
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

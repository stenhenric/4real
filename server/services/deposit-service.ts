import crypto from 'node:crypto';

import { getEnv } from '../config/env.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { serviceUnavailable } from '../utils/http-error.ts';

export async function generateDepositMemo(userId: string) {
  const { HOT_WALLET_ADDRESS: hotWalletAddress } = getEnv();
  if (!hotWalletAddress) {
    throw serviceUnavailable('HOT_WALLET_ADDRESS is not configured', 'HOT_WALLET_NOT_CONFIGURED');
  }

  const memo = `d-${userId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  await DepositMemoRepository.create({
    memo,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 3600_000),
    used: false,
  });

  return {
    memo,
    address: hotWalletAddress,
    instructions: `Send USDT to ${hotWalletAddress} with comment: ${memo}`,
    expiresIn: '24 hours',
  };
}

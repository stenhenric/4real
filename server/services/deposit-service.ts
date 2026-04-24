import crypto from 'node:crypto';

import { getEnv } from '../config/env.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';

export async function generateDepositMemo(userId: string) {
  const memo = `d-${userId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  await DepositMemoRepository.create({
    memo,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 3600_000),
    used: false,
  });

  const { HOT_WALLET_ADDRESS: hotWalletAddress } = getEnv();
  if (!hotWalletAddress) {
    throw new Error('HOT_WALLET_ADDRESS is not configured');
  }

  return {
    memo,
    address: hotWalletAddress,
    instructions: `Send USDT to ${hotWalletAddress} with comment: ${memo}`,
    expiresIn: '24 hours',
  };
}

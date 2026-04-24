import type { ITransaction } from '../models/Transaction.ts';
import type {
  AuthResponseDTO,
  LeaderboardUserDTO,
  TransactionDTO,
  UserDTO,
  UserProfileDTO,
  UserStatsDTO,
  WithdrawalStatusDTO,
} from '../types/api.ts';
import type { IUser } from '../models/User.ts';
import type { DepositDocument } from '../repositories/deposit.repository.ts';
import type { WithdrawalDocument } from '../repositories/withdrawal.repository.ts';

function serializeStats(stats?: IUser['stats']): UserStatsDTO {
  return {
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    draws: stats?.draws ?? 0,
  };
}

export function serializeAuthUser(user: IUser): AuthResponseDTO {
  const authUser: UserDTO = {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    balance: user.balance,
    elo: user.elo,
    isAdmin: user.isAdmin,
    stats: serializeStats(user.stats),
  };

  return { user: authUser };
}

export function serializeUserProfile(user: IUser): UserProfileDTO {
  return {
    id: user._id.toString(),
    username: user.username,
    elo: user.elo,
    balance: user.balance,
    stats: serializeStats(user.stats),
  };
}

export function serializeLeaderboardUser(user: IUser): LeaderboardUserDTO {
  return {
    id: user._id.toString(),
    username: user.username,
    elo: user.elo,
  };
}

export function serializeLedgerTransaction(transaction: ITransaction): TransactionDTO {
  return {
    _id: transaction._id.toString(),
    type: transaction.type,
    amount: transaction.amount,
    status: transaction.status,
    createdAt: transaction.createdAt.toISOString(),
    referenceId: transaction.referenceId,
  };
}

export function serializeDepositTransaction(deposit: DepositDocument): TransactionDTO {
  return {
    _id: `deposit:${deposit.txHash}`,
    type: 'DEPOSIT',
    amount: Number(deposit.amountDisplay),
    status: deposit.status,
    createdAt: deposit.txTime.toISOString(),
    referenceId: deposit.txHash,
  };
}

export function serializeWithdrawalTransaction(withdrawal: WithdrawalDocument): TransactionDTO {
  return {
    _id: `withdrawal:${withdrawal.withdrawalId}`,
    type: 'WITHDRAW',
    amount: -Number(withdrawal.amountDisplay),
    status: withdrawal.status,
    createdAt: withdrawal.createdAt.toISOString(),
    referenceId: withdrawal.withdrawalId,
  };
}

export function serializeWithdrawalStatus(withdrawal: WithdrawalDocument): WithdrawalStatusDTO {
  return {
    withdrawalId: withdrawal.withdrawalId,
    status: withdrawal.status,
    amountUsdt: Number(withdrawal.amountDisplay),
    toAddress: withdrawal.toAddress,
    createdAt: withdrawal.createdAt.toISOString(),
    updatedAt: withdrawal.updatedAt?.toISOString(),
    txHash: withdrawal.txHash,
    lastError: withdrawal.lastError,
  };
}

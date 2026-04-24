import type { ITransaction } from '../models/Transaction.ts';
import type {
  AuthResponseDTO,
  LeaderboardUserDTO,
  MatchDTO,
  OrderDTO,
  OrderUserDTO,
  TransactionDTO,
  UserDTO,
  UserProfileDTO,
  UserStatsDTO,
  WithdrawalStatusDTO,
} from '../types/api.ts';
import type { IUser } from '../models/User.ts';
import type { IMatch } from '../models/Match.ts';
import type { IOrder } from '../models/Order.ts';
import type { DepositDocument } from '../repositories/deposit.repository.ts';
import type { WithdrawalDocument } from '../repositories/withdrawal.repository.ts';
import { calculateMatchPayout } from '../services/match-payout.service.ts';

function serializeStats(stats?: IUser['stats']): UserStatsDTO {
  return {
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    draws: stats?.draws ?? 0,
  };
}

function serializeId(value: unknown): string {
  if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }

  return String(value ?? '');
}

function serializeOrderUser(user: unknown): string | OrderUserDTO {
  if (user && typeof user === 'object' && 'username' in user) {
    const candidate = user as { _id?: unknown; username: unknown };
    return {
      id: serializeId(candidate._id),
      username: String(candidate.username),
    };
  }

  return serializeId(user);
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

export function serializeMatch(match: IMatch): MatchDTO {
  const payout = calculateMatchPayout(match.wager ?? 0);

  return {
    _id: serializeId(match._id),
    roomId: match.roomId,
    p1Username: match.p1Username,
    p2Username: match.p2Username,
    player1Id: serializeId(match.player1Id),
    player2Id: match.player2Id ? serializeId(match.player2Id) : undefined,
    status: match.status,
    winnerId: match.winnerId,
    wager: match.wager ?? 0,
    isPrivate: match.isPrivate ?? false,
    moveHistory: match.moveHistory ?? [],
    projectedWinnerAmount: payout.projectedWinnerAmount,
    commissionRate: payout.commissionRate,
    createdAt: match.createdAt?.toISOString(),
  };
}

export function serializeOrder(order: IOrder): OrderDTO {
  return {
    _id: serializeId(order._id),
    userId: serializeOrderUser(order.userId),
    type: order.type,
    amount: order.amount,
    status: order.status,
    proofImageUrl: order.proofImageUrl,
    createdAt: order.createdAt.toISOString(),
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

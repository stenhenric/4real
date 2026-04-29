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

export function serializeAuthUser(user: IUser, balance: number): AuthResponseDTO {
  const authUser: UserDTO = {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    balance,
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

export function serializeMatch(match: IMatch, options?: { inviteUrl?: string }): MatchDTO {
  const payout = calculateMatchPayout(match.wager ?? 0);

  return {
    _id: serializeId(match._id),
    roomId: match.roomId,
    p1Username: match.p1Username,
    player1Id: serializeId(match.player1Id),
    status: match.status,
    wager: match.wager ?? 0,
    isPrivate: match.isPrivate ?? false,
    moveHistory: match.moveHistory ?? [],
    projectedWinnerAmount: payout.projectedWinnerAmount,
    commissionRate: payout.commissionRate,
    ...(match.p2Username ? { p2Username: match.p2Username } : {}),
    ...(match.player2Id ? { player2Id: serializeId(match.player2Id) } : {}),
    ...(match.winnerId ? { winnerId: match.winnerId } : {}),
    ...(match.settlementReason ? { settlementReason: match.settlementReason } : {}),
    ...(match.lastActivityAt ? { lastActivityAt: match.lastActivityAt.toISOString() } : {}),
    ...(match.createdAt ? { createdAt: match.createdAt.toISOString() } : {}),
    ...(options?.inviteUrl ? { inviteUrl: options.inviteUrl } : {}),
  };
}

export function serializeOrder(order: IOrder): OrderDTO {
  return {
    _id: serializeId(order._id),
    userId: serializeOrderUser(order.userId),
    type: order.type,
    amount: order.amount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    ...(order.proof ? {
      proof: {
        provider: 'telegram' as const,
        url: order.proof.url,
        messageId: order.proof.messageId,
        chatId: order.proof.chatId,
      },
    } : {}),
    ...(order.transactionCode ? { transactionCode: order.transactionCode } : {}),
    ...(order.fiatCurrency ? { fiatCurrency: order.fiatCurrency } : {}),
    ...(order.exchangeRate !== undefined ? { exchangeRate: order.exchangeRate } : {}),
    ...(order.fiatTotal !== undefined ? { fiatTotal: order.fiatTotal } : {}),
  };
}

export function serializeLedgerTransaction(transaction: ITransaction): TransactionDTO {
  return {
    _id: transaction._id.toString(),
    type: transaction.type,
    amount: transaction.amount,
    status: transaction.status,
    createdAt: transaction.createdAt.toISOString(),
    ...(transaction.referenceId ? { referenceId: transaction.referenceId } : {}),
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
    ...(withdrawal.updatedAt ? { updatedAt: withdrawal.updatedAt.toISOString() } : {}),
    ...(withdrawal.txHash ? { txHash: withdrawal.txHash } : {}),
    ...(withdrawal.lastError ? { lastError: withdrawal.lastError } : {}),
  };
}

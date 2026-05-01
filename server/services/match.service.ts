import crypto from 'node:crypto';
import mongoose from 'mongoose';

import { getEnv } from '../config/env.ts';
import { Match } from '../models/Match.ts';
import type { IMatch } from '../models/Match.ts';
import type { MatchMoveDTO } from '../types/api.ts';
import { emitPublicMatchUpdatedEvent } from '../sockets/public-match-events.ts';
import { badRequest, conflict, internalServerError, notFound } from '../utils/http-error.ts';
import { calculateMatchPayout, calculateDrawPayout } from './match-payout.service.ts';
import { UserService } from './user.service.ts';
import { AuditService } from './audit.service.ts';
import { TransactionService } from './transaction.service.ts';
import { trustFilter } from '../utils/trusted-filter.ts';

type MatchSettlementReason = NonNullable<IMatch['settlementReason']>;

interface CreateMatchForUserResult {
  match: IMatch;
  inviteUrl?: string | undefined;
}

interface CreateMatchDocumentInput {
  roomId: string;
  player1Id: mongoose.Types.ObjectId;
  p1Username: string;
  wager: number;
  isPrivate: boolean;
  inviteTokenHash?: string | undefined;
  status: IMatch['status'];
  moveHistory: MatchMoveDTO[];
  lastActivityAt?: Date | undefined;
}

interface MatchSettlementOptions {
  match: IMatch;
  winnerId: string;
  settlementReason: MatchSettlementReason;
  moveHistory: MatchMoveDTO[];
  session: mongoose.ClientSession;
  requestId?: string | undefined;
  timeoutPlayerId?: string | undefined;
}

function now(): Date {
  return new Date();
}

async function runOwnTransaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }

  if (result === undefined) {
    throw internalServerError('Transaction completed without a result', 'TRANSACTION_NO_RESULT');
  }

  return result;
}

export class MatchService {
  static hashInviteToken(inviteToken: string): string {
    return crypto.createHash('sha256').update(inviteToken).digest('hex');
  }

  static async createMatch(matchData: CreateMatchDocumentInput, session?: mongoose.ClientSession): Promise<IMatch> {
    const match = new Match({
      ...matchData,
      lastActivityAt: matchData.lastActivityAt ?? now(),
    });
    return match.save(session ? { session } : undefined);
  }

  static async createMatchForUser({
    userId,
    wager,
    isPrivate,
    requestId,
    session,
    emitPublicEvent = true,
  }: {
    userId: string;
    wager: number;
    isPrivate: boolean;
    requestId?: string | undefined;
    session?: mongoose.ClientSession | undefined;
    emitPublicEvent?: boolean | undefined;
  }): Promise<CreateMatchForUserResult> {
    const roomId = crypto.randomBytes(3).toString('hex');
    const inviteToken = isPrivate ? crypto.randomBytes(16).toString('base64url') : undefined;
    const executeCreateMatch = async (activeSession: mongoose.ClientSession): Promise<IMatch> => {
      const user = await UserService.findById(userId, activeSession);
      if (!user) {
        throw notFound('User not found', 'USER_NOT_FOUND');
      }

      if (wager > 0) {
        const updatedUser = await UserService.deductBalanceSafely(user._id.toString(), wager, activeSession);
        if (!updatedUser) {
          throw badRequest('Insufficient balance to lock wager', 'INSUFFICIENT_BALANCE');
        }

        await TransactionService.createTransaction({
          userId: user._id.toString(),
          type: 'MATCH_WAGER',
          amount: -wager,
          referenceId: roomId,
          session: activeSession,
        });
        await AuditService.record({
          eventType: 'match_wager_locked',
          actorUserId: userId,
          targetUserId: userId,
          resourceType: 'match',
          resourceId: roomId,
          requestId,
          metadata: {
            role: 'player1',
            wager,
          },
          session: activeSession,
        });
      }

      return this.createMatch({
        roomId,
        player1Id: user._id,
        p1Username: user.username,
        wager,
        isPrivate,
        ...(inviteToken ? { inviteTokenHash: this.hashInviteToken(inviteToken) } : {}),
        status: 'waiting',
        moveHistory: [],
        lastActivityAt: now(),
      }, activeSession);
    };

    const createdMatch = session
      ? await executeCreateMatch(session)
      : await runOwnTransaction((ownSession) => executeCreateMatch(ownSession));

    if (emitPublicEvent) {
      emitPublicMatchUpdatedEvent({
        roomId: createdMatch.roomId,
        status: createdMatch.status,
        isPrivate: createdMatch.isPrivate,
      });
    }

    return {
      match: createdMatch,
      ...(inviteToken ? {
        inviteUrl: `/game/${encodeURIComponent(createdMatch.roomId)}?invite=${encodeURIComponent(inviteToken)}`,
      } : {}),
    };
  }

  static async joinMatch({
    roomId,
    userId,
    inviteToken,
    requestId,
    session,
    emitPublicEvent = true,
  }: {
    roomId: string;
    userId: string;
    inviteToken?: string | undefined;
    requestId?: string | undefined;
    session?: mongoose.ClientSession | undefined;
    emitPublicEvent?: boolean | undefined;
  }): Promise<IMatch> {
    const executeJoinMatch = async (activeSession: mongoose.ClientSession): Promise<IMatch> => {
      const [user, match] = await Promise.all([
        UserService.findById(userId, activeSession),
        this.getMatchByRoomId(roomId, activeSession),
      ]);

      if (!user) {
        throw notFound('User not found', 'USER_NOT_FOUND');
      }

      if (!match) {
        throw notFound('Match not found', 'MATCH_NOT_FOUND');
      }

      if (!this.canAccessMatch({ match, userId, inviteToken })) {
        throw notFound('Match not found', 'MATCH_NOT_FOUND');
      }

      if (match.status === 'completed') {
        throw conflict('Match has already been settled', 'MATCH_ALREADY_SETTLED');
      }

      const player1Id = match.player1Id.toString();
      const player2Id = match.player2Id?.toString();

      if (userId === player1Id || userId === player2Id) {
        return match;
      }

      if (player2Id && player2Id !== userId) {
        throw conflict('Match is already full', 'MATCH_ALREADY_FULL');
      }

      if (match.wager > 0) {
        const updatedUser = await UserService.deductBalanceSafely(userId, match.wager, activeSession);
        if (!updatedUser) {
          throw badRequest('Insufficient balance to join this match', 'INSUFFICIENT_BALANCE');
        }

        await TransactionService.createTransaction({
          userId,
          type: 'MATCH_WAGER',
          amount: -match.wager,
          referenceId: roomId,
          session: activeSession,
        });
        await AuditService.record({
          eventType: 'match_wager_locked',
          actorUserId: userId,
          targetUserId: userId,
          resourceType: 'match',
          resourceId: roomId,
          requestId,
          metadata: {
            role: 'player2',
            wager: match.wager,
          },
          session: activeSession,
        });
      }

      match.player2Id = user._id;
      match.p2Username = user.username;
      match.status = 'active';
      match.lastActivityAt = now();
      return match.save({ session: activeSession });
    };

    const finalJoinedMatch = session
      ? await executeJoinMatch(session)
      : await runOwnTransaction((ownSession) => executeJoinMatch(ownSession));

    if (emitPublicEvent) {
      emitPublicMatchUpdatedEvent({
        roomId: finalJoinedMatch.roomId,
        status: finalJoinedMatch.status,
        isPrivate: finalJoinedMatch.isPrivate,
      });
    }

    return finalJoinedMatch;
  }

  static async getAccessibleMatch({
    roomId,
    userId,
    inviteToken,
    session,
  }: {
    roomId: string;
    userId: string;
    inviteToken?: string | undefined;
    session?: mongoose.ClientSession | undefined;
  }): Promise<IMatch | null> {
    const match = await this.getMatchByRoomId(roomId, session);
    if (!match) {
      return null;
    }

    return this.canAccessMatch({ match, userId, inviteToken }) ? match : null;
  }

  static async resignMatch({
    roomId,
    userId,
    requestId,
    session,
    emitPublicEvent = true,
  }: {
    roomId: string;
    userId: string;
    requestId?: string | undefined;
    session?: mongoose.ClientSession | undefined;
    emitPublicEvent?: boolean | undefined;
  }): Promise<IMatch> {
    const executeResignMatch = async (activeSession: mongoose.ClientSession): Promise<IMatch> => {
      const match = await this.getMatchByRoomId(roomId, activeSession);
      if (!match) {
        throw notFound('Match not found', 'MATCH_NOT_FOUND');
      }

      const player1Id = match.player1Id.toString();
      const player2Id = match.player2Id?.toString();
      const isParticipant = userId === player1Id || userId === player2Id;

      if (!isParticipant) {
        throw conflict('Only match participants can resign', 'MATCH_PARTICIPANT_REQUIRED');
      }

      if (match.status === 'completed') {
        return match;
      }

      if (match.status === 'waiting') {
        if (match.wager > 0) {
          await this.refundUserWager({
            userId: player1Id,
            amount: match.wager,
            roomId,
            session: activeSession,
            requestId,
            settlementReason: 'resigned',
          });
        }

        match.status = 'completed';
        match.winnerId = 'draw';
        match.settlementReason = 'resigned';
        match.lastActivityAt = now();
        return match.save({ session: activeSession });
      }

      const winnerId = userId === player1Id ? player2Id : player1Id;
      if (!winnerId) {
        throw conflict('Match cannot be resigned without an opponent', 'MATCH_OPPONENT_REQUIRED');
      }

      return this.finalizeMatch({
        match,
        winnerId,
        settlementReason: 'resigned',
        moveHistory: match.moveHistory ?? [],
        session: activeSession,
        requestId,
      });
    };

    const finalSettledMatch = session
      ? await executeResignMatch(session)
      : await runOwnTransaction((ownSession) => executeResignMatch(ownSession));

    if (emitPublicEvent) {
      emitPublicMatchUpdatedEvent({
        roomId: finalSettledMatch.roomId,
        status: finalSettledMatch.status,
        isPrivate: finalSettledMatch.isPrivate,
      });
    }

    return finalSettledMatch;
  }

  static async getActiveMatches(): Promise<IMatch[]> {
    return Match.find({ status: 'waiting', isPrivate: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');
  }

  static async getMatchByRoomId(roomId: string, session?: mongoose.ClientSession): Promise<IMatch | null> {
    const query = Match.findOne({ roomId });
    return session ? query.session(session) : query;
  }

  static async persistMoveHistory(roomId: string, moveHistory: MatchMoveDTO[]): Promise<void> {
    await Match.updateOne(
      { roomId, status: 'active' },
      {
        $set: {
          moveHistory,
          lastActivityAt: now(),
        },
      },
    );
  }

  static async completeMatch(
    roomId: string,
    winnerId: string,
    moveHistory: MatchMoveDTO[],
    requestId?: string,
  ): Promise<IMatch | null> {
    const finalSettledMatch = await runOwnTransaction(async (session) => {
      const match = await this.getMatchByRoomId(roomId, session);
      if (!match) {
        return null;
      }

      return this.finalizeMatch({
        match,
        winnerId,
        settlementReason: winnerId === 'draw' ? 'draw' : 'winner',
        moveHistory,
        session,
        requestId,
      });
    });

    if (finalSettledMatch) {
      emitPublicMatchUpdatedEvent({
        roomId: finalSettledMatch.roomId,
        status: finalSettledMatch.status,
        isPrivate: finalSettledMatch.isPrivate,
      });
    }

    return finalSettledMatch;
  }

  static async expireStaleMatches(): Promise<{ waitingExpired: number; activeExpired: number }> {
    const env = getEnv();
    const waitingCutoff = new Date(Date.now() - env.MATCH_WAITING_EXPIRY_MS);
    const activeCutoff = new Date(Date.now() - env.MATCH_ACTIVE_INACTIVITY_MS);

    const [waitingMatches, activeMatches] = await Promise.all([
      Match.find(trustFilter({
        status: 'waiting',
        lastActivityAt: { $lt: waitingCutoff },
      })).select('roomId'),
      Match.find(trustFilter({
        status: 'active',
        lastActivityAt: { $lt: activeCutoff },
      })).select('roomId'),
    ]);

    let waitingExpired = 0;
    for (const match of waitingMatches) {
      const expired = await this.expireWaitingMatch(match.roomId);
      if (expired) {
        waitingExpired += 1;
      }
    }

    let activeExpired = 0;
    for (const match of activeMatches) {
      const expired = await this.expireActiveMatch(match.roomId);
      if (expired) {
        activeExpired += 1;
      }
    }

    return { waitingExpired, activeExpired };
  }

  static async getUserHistory(userId: string, limit: number = 5): Promise<IMatch[]> {
    return Match.find(trustFilter({
      $or: [{ player1Id: userId }, { player2Id: userId }],
      status: 'completed',
    }))
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v');
  }

  private static async expireWaitingMatch(roomId: string): Promise<boolean> {
    const session = await mongoose.startSession();
    let expired = false;
    let isPrivate = false;

    try {
      await session.withTransaction(async () => {
        const match = await this.getMatchByRoomId(roomId, session);
        if (!match || match.status !== 'waiting') {
          return;
        }

        isPrivate = match.isPrivate;

        if (match.wager > 0) {
          await this.refundUserWager({
            userId: match.player1Id.toString(),
            amount: match.wager,
            roomId,
            session,
            settlementReason: 'waiting_expired',
          });
        }

        match.status = 'completed';
        match.winnerId = 'draw';
        match.settlementReason = 'waiting_expired';
        match.lastActivityAt = now();
        await match.save({ session });
        expired = true;
      });
    } finally {
      await session.endSession();
    }

    if (expired) {
      emitPublicMatchUpdatedEvent({
        roomId,
        status: 'completed',
        isPrivate,
      });
    }

    return expired;
  }

  private static async expireActiveMatch(roomId: string): Promise<boolean> {
    const expiredMatch = await runOwnTransaction(async (session) => {
      const match = await this.getMatchByRoomId(roomId, session);
      if (!match || match.status !== 'active') {
        return null;
      }

      const moveHistory = match.moveHistory ?? [];
      const timeoutPlayerId = moveHistory.length % 2 === 0 ? match.player1Id.toString() : match.player2Id?.toString();
      return this.finalizeMatch({
        match,
        winnerId: 'draw',
        settlementReason: 'active_expired',
        moveHistory,
        session,
        timeoutPlayerId,
      });
    });

    if (expiredMatch) {
      emitPublicMatchUpdatedEvent({
        roomId: expiredMatch.roomId,
        status: expiredMatch.status,
        isPrivate: expiredMatch.isPrivate,
      });
    }

    return Boolean(expiredMatch);
  }

  private static async finalizeMatch({
    match,
    winnerId,
    settlementReason,
    moveHistory,
    session,
    requestId,
    timeoutPlayerId,
  }: MatchSettlementOptions): Promise<IMatch> {
    if (match.status === 'completed') {
      return match;
    }

    const p1IdStr = match.player1Id.toString();
    const p2IdStr = match.player2Id?.toString();

    const shouldUpdateElo = Boolean(p2IdStr) && settlementReason !== 'waiting_expired';
    if (shouldUpdateElo) {
      await this.handleEloUpdate(p1IdStr, p2IdStr, winnerId, session);
    }

    if (match.wager > 0) {
      await this.handleWagerSettlement({
        roomId: match.roomId,
        wager: match.wager,
        p1IdStr,
        p2IdStr,
        winnerId,
        settlementReason,
        session,
        requestId,
        timeoutPlayerId,
      });
    }

    match.status = 'completed';
    match.winnerId = winnerId;
    match.settlementReason = settlementReason;
    match.moveHistory = moveHistory;
    match.lastActivityAt = now();

    return match.save({ session });
  }

  private static async handleEloUpdate(
    p1IdStr: string,
    p2IdStr: string | undefined,
    winnerId: string,
    session: mongoose.ClientSession,
  ): Promise<void> {
    const p1 = await UserService.findById(p1IdStr, session);
    const p2 = p2IdStr ? await UserService.findById(p2IdStr, session) : null;

    if (!p1 || !p2 || !p2IdStr) {
      return;
    }

    const K = 32;
    const r1 = Math.pow(10, p1.elo / 400);
    const r2 = Math.pow(10, p2.elo / 400);
    const e1 = r1 / (r1 + r2);
    const e2 = r2 / (r1 + r2);

    let s1 = 0.5;
    let s2 = 0.5;
    if (winnerId === p1IdStr) {
      s1 = 1;
      s2 = 0;
    } else if (winnerId === p2IdStr) {
      s1 = 0;
      s2 = 1;
    }

    const eloChange1 = Math.round(K * (s1 - e1));
    const eloChange2 = Math.round(K * (s2 - e2));

    let p1Result: 'win' | 'loss' | 'draw' = 'draw';
    let p2Result: 'win' | 'loss' | 'draw' = 'draw';

    if (winnerId === p1IdStr) {
      p1Result = 'win';
      p2Result = 'loss';
    } else if (winnerId === p2IdStr) {
      p1Result = 'loss';
      p2Result = 'win';
    }

    await UserService.updateStatsAndElo(p1IdStr, eloChange1, p1Result, session);
    await UserService.updateStatsAndElo(p2IdStr, eloChange2, p2Result, session);
  }

  private static async handleWagerSettlement({
    roomId,
    wager,
    p1IdStr,
    p2IdStr,
    winnerId,
    settlementReason,
    session,
    requestId,
    timeoutPlayerId,
  }: {
    roomId: string;
    wager: number;
    p1IdStr: string;
    p2IdStr?: string | undefined;
    winnerId: string;
    settlementReason: MatchSettlementReason;
    session: mongoose.ClientSession;
    requestId?: string | undefined;
    timeoutPlayerId?: string | undefined;
  }): Promise<void> {
    if (winnerId !== 'draw') {
      const { projectedWinnerAmount, commissionAmount } = calculateMatchPayout(wager);

      await UserService.routeCommissionToAdmin(commissionAmount, roomId, session);

      await UserService.updateBalance(winnerId, projectedWinnerAmount, session);
      await TransactionService.createTransaction({
        userId: winnerId,
        type: 'MATCH_WIN',
        amount: projectedWinnerAmount,
        referenceId: roomId,
        session,
      });
      await AuditService.record({
        eventType: 'match_payout',
        actorUserId: winnerId,
        targetUserId: winnerId,
        resourceType: 'match',
        resourceId: roomId,
        requestId,
        metadata: {
          amount: projectedWinnerAmount,
          settlementReason,
        },
        session,
      });
      return;
    }

    const refundType = settlementReason === 'draw' ? 'MATCH_DRAW' : 'MATCH_REFUND';
    
    // Draw Commission logic
    const { refundPerPlayer, commissionAmount } = calculateDrawPayout(wager);

    // If there's a timeoutPlayerId, they pay the full commission, and the other gets a full refund
    let p1Refund = refundPerPlayer;
    let p2Refund = refundPerPlayer;

    if (timeoutPlayerId) {
      if (timeoutPlayerId === p1IdStr) {
        p1Refund = wager - commissionAmount;
        p2Refund = wager;
      } else if (p2IdStr && timeoutPlayerId === p2IdStr) {
        p1Refund = wager;
        p2Refund = wager - commissionAmount;
      }
    }

    if (p1Refund > 0) {
      await this.refundUserWager({
        userId: p1IdStr,
        amount: p1Refund,
        roomId,
        session,
        requestId,
        settlementReason,
        transactionType: refundType,
      });
    }

    if (p2IdStr && p2Refund > 0) {
      await this.refundUserWager({
        userId: p2IdStr,
        amount: p2Refund,
        roomId,
        session,
        requestId,
        settlementReason,
        transactionType: refundType,
      });
    }

    await UserService.routeCommissionToAdmin(commissionAmount, roomId, session);
  }

  private static async refundUserWager({
    userId,
    amount,
    roomId,
    session,
    requestId,
    settlementReason,
    transactionType = 'MATCH_REFUND',
  }: {
    userId: string;
    amount: number;
    roomId: string;
    session: mongoose.ClientSession;
    requestId?: string | undefined;
    settlementReason: MatchSettlementReason;
    transactionType?: 'MATCH_DRAW' | 'MATCH_REFUND' | undefined;
  }): Promise<void> {
    await UserService.updateBalance(userId, amount, session);
    await TransactionService.createTransaction({
      userId,
      type: transactionType,
      amount,
      referenceId: roomId,
      session,
    });
    await AuditService.record({
      eventType: 'match_refund',
      actorUserId: userId,
      targetUserId: userId,
      resourceType: 'match',
      resourceId: roomId,
      requestId,
      metadata: {
        amount,
        settlementReason,
        transactionType,
      },
      session,
    });
  }

  private static canAccessMatch({
    match,
    userId,
    inviteToken,
  }: {
    match: IMatch;
    userId: string;
    inviteToken?: string | undefined;
  }): boolean {
    if (!match.isPrivate) {
      return true;
    }

    const player1Id = match.player1Id.toString();
    const player2Id = match.player2Id?.toString();
    if (userId === player1Id || userId === player2Id) {
      return true;
    }

    return this.matchesInviteToken(match, inviteToken);
  }

  private static matchesInviteToken(match: IMatch, inviteToken?: string): boolean {
    if (!match.isPrivate || !match.inviteTokenHash || !inviteToken) {
      return false;
    }

    const candidateHash = this.hashInviteToken(inviteToken);
    const storedHashBuffer = Buffer.from(match.inviteTokenHash, 'hex');
    const candidateHashBuffer = Buffer.from(candidateHash, 'hex');

    if (storedHashBuffer.length !== candidateHashBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedHashBuffer, candidateHashBuffer);
  }
}

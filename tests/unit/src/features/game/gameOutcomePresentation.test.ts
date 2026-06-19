import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getResignActionPresentation,
  getVerdictHeadline,
  getVerdictMessage,
} from '../../../../../src/features/game/gameOutcomePresentation.ts';
import {
  getGameSocketErrorMessage,
  shouldLeaveGameRoomAfterJoinError,
  shouldLeaveGameRoomAfterSocketError,
} from '../../../../../src/features/game/socketErrorHandling.ts';
import type { GameOverState, RoomState } from '../../../../../src/features/game/types.ts';

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomId: 'room-1',
    players: [],
    board: [],
    currentTurn: 'user-1',
    status: 'active',
    moves: [],
    wager: '3.000000',
    projectedWinnerAmount: '5.400000',
    commissionRate: '0.100000',
    ...overrides,
  };
}

describe('game outcome presentation', () => {
  it('communicates waiting cancellation as a refund, not a forfeit', () => {
    const presentation = getResignActionPresentation(makeRoom({ status: 'waiting' }));

    assert.equal(presentation.buttonLabel, 'Cancel Match');
    assert.equal(presentation.confirmButtonLabel, 'Yes, Cancel');
    assert.match(presentation.confirmMessage, /refund/i);
    assert.doesNotMatch(presentation.confirmMessage, /forfeit/i);
    assert.match(presentation.accessibleWarning, /refund/i);
  });

  it('communicates active resignation as a wager forfeit', () => {
    const presentation = getResignActionPresentation(makeRoom({ status: 'active' }));

    assert.equal(presentation.buttonLabel, 'Resign Match');
    assert.equal(presentation.confirmButtonLabel, 'Yes, Resign');
    assert.match(presentation.confirmMessage, /forfeit/i);
    assert.match(presentation.accessibleWarning, /forfeit/i);
  });

  it('labels a waiting match cancellation as canceled instead of a draw', () => {
    const room = makeRoom({
      status: 'completed',
      winnerId: 'draw',
      settlementReason: 'resigned',
      outcome: 'no_contest',
    });
    const gameOver: GameOverState = {
      winnerId: 'draw',
      outcome: 'no_contest',
    };

    assert.equal(getVerdictHeadline({ gameOver, isDraw: true, isWin: false, room }), 'Match canceled');
    assert.match(getVerdictMessage({ gameOver, isDraw: true, isWin: false, room }), /refunded/i);
  });

  it('explains active resignation differently for winner and resigning player', () => {
    const room = makeRoom({
      status: 'completed',
      winnerId: 'user-2',
      settlementReason: 'resigned',
      outcome: 'player2_win',
    });
    const gameOver: GameOverState = {
      winnerId: 'user-2',
      outcome: 'player2_win',
    };

    assert.equal(getVerdictHeadline({ gameOver, isDraw: false, isWin: true, room }), 'Opponent resigned');
    assert.match(getVerdictMessage({ gameOver, isDraw: false, isWin: true, room }), /settled in your favor/i);
    assert.equal(getVerdictHeadline({ gameOver, isDraw: false, isWin: false, room }), 'You resigned');
    assert.match(getVerdictMessage({ gameOver, isDraw: false, isWin: false, room }), /settled for your opponent/i);
  });

  it('keeps players in the room for nonfatal socket move errors', () => {
    assert.equal(shouldLeaveGameRoomAfterSocketError({
      code: 'SOCKET_ERROR',
      message: 'Unexpected socket error',
    }), false);
    assert.equal(shouldLeaveGameRoomAfterSocketError({
      code: 'MAKE_MOVE_RATE_LIMITED',
      message: 'Too many move requests',
    }), false);
    assert.equal(shouldLeaveGameRoomAfterSocketError({
      code: 'MATCH_NOT_FOUND',
      message: 'Match not found',
    }), true);
  });

  it('uses user-safe socket error messages instead of raw internals', () => {
    assert.equal(getGameSocketErrorMessage({
      code: 'SOCKET_ERROR',
      message: 'MongoServerError: duplicate key raw detail',
    }), 'The move could not be processed. Please try again.');
    assert.equal(getGameSocketErrorMessage({
      code: 'MAKE_MOVE_RATE_LIMITED',
      message: 'Too many move requests',
    }), 'Too many move attempts. Please slow down.');
    assert.equal(getGameSocketErrorMessage({
      code: 'UNKNOWN_MATCH_WARNING',
      message: 'The room changed state.',
    }), 'The room changed state.');
  });

  it('leaves the join preview only for unavailable match errors', () => {
    assert.equal(shouldLeaveGameRoomAfterJoinError('MATCH_NOT_FOUND'), true);
    assert.equal(shouldLeaveGameRoomAfterJoinError('MATCH_ALREADY_FULL'), true);
    assert.equal(shouldLeaveGameRoomAfterJoinError('MATCH_ALREADY_SETTLED'), true);
    assert.equal(shouldLeaveGameRoomAfterJoinError('INSUFFICIENT_BALANCE'), false);
    assert.equal(shouldLeaveGameRoomAfterJoinError('SOCKET_ERROR'), false);
  });
});

import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';

import { MatchController } from '../../../../server/controllers/match.controller.ts';
import { MatchService } from '../../../../server/services/match.service.ts';

test('match controller getMatch works when the handler is invoked without class binding', async (t) => {
  const match = {
    _id: new mongoose.Types.ObjectId(),
    roomId: 'room-123',
    p1Username: 'host',
    player1Id: new mongoose.Types.ObjectId(),
    status: 'waiting',
    wager: 0,
    isPrivate: false,
    moveHistory: [],
  };
  const getAccessibleMatchMock = mock.method(MatchService, 'getAccessibleMatch', async () => match as any);
  t.after(() => getAccessibleMatchMock.mock.restore());

  let payload: unknown;
  const req = {
    params: { roomId: 'room-123' },
    query: {},
    get() {
      return undefined;
    },
    user: { id: 'user-123' },
  };
  const res = {
    json(value: unknown) {
      payload = value;
    },
  };

  const handler = MatchController.getMatch;
  await handler(req as any, res as any);

  assert.equal(getAccessibleMatchMock.mock.calls.length, 1);
  assert.deepEqual(getAccessibleMatchMock.mock.calls[0]?.arguments[0], {
    roomId: 'room-123',
    userId: 'user-123',
  });
  assert.deepEqual(payload, {
    _id: match._id.toString(),
    roomId: 'room-123',
    p1Username: 'host',
    player1Id: match.player1Id.toString(),
    status: 'waiting',
    wager: '0.000000',
    isPrivate: false,
    moveHistory: [],
    projectedWinnerAmount: '0.000000',
    commissionRate: '0.100000',
  });
});

test('match controller getMatch forwards trimmed invite query tokens', async (t) => {
  const match = {
    _id: new mongoose.Types.ObjectId(),
    roomId: 'room-private',
    p1Username: 'host',
    player1Id: new mongoose.Types.ObjectId(),
    status: 'waiting',
    wager: '0.000000',
    isPrivate: true,
    moveHistory: [],
  };
  const getAccessibleMatchMock = mock.method(MatchService, 'getAccessibleMatch', async () => match as any);
  t.after(() => getAccessibleMatchMock.mock.restore());

  const req = {
    params: { roomId: 'room-private' },
    query: { invite: '  invite-token  ' },
    user: { id: 'user-123' },
  };
  const res = {
    json() {
      return this;
    },
  };

  const handler = MatchController.getMatch;
  await handler(req as any, res as any);

  assert.deepEqual(getAccessibleMatchMock.mock.calls[0]?.arguments[0], {
    roomId: 'room-private',
    userId: 'user-123',
    inviteToken: 'invite-token',
  });
});

test('match controller user history serializes matches without private invite internals', async (t) => {
  const player1Id = new mongoose.Types.ObjectId();
  const player2Id = new mongoose.Types.ObjectId();
  const match = {
    _id: new mongoose.Types.ObjectId(),
    roomId: 'room-history',
    p1Username: 'host',
    p2Username: 'guest',
    player1Id,
    player2Id,
    status: 'completed',
    winnerId: player2Id.toString(),
    settlementReason: 'winner',
    wager: '2.000000',
    isPrivate: true,
    inviteTokenHash: 'do-not-serialize',
    moveHistory: [{ userId: player1Id.toString(), col: 0, row: 5 }],
    lastActivityAt: new Date('2026-05-21T10:00:00.000Z'),
    createdAt: new Date('2026-05-21T09:00:00.000Z'),
  };
  const getUserHistoryMock = mock.method(MatchService, 'getUserHistory', async () => [match] as any);
  t.after(() => getUserHistoryMock.mock.restore());

  let payload: unknown;
  const req = {
    params: { userId: player1Id.toString() },
    user: { id: player2Id.toString() },
  };
  const res = {
    json(value: unknown) {
      payload = value;
      return this;
    },
  };

  const handler = MatchController.getUserHistory;
  await handler(req as any, res as any);

  assert.deepEqual(getUserHistoryMock.mock.calls[0]?.arguments, [
    player1Id.toString(),
    5,
    player2Id.toString(),
  ]);
  const serializedMatch = (payload as Array<Record<string, unknown>>)[0] ?? {};
  assert.equal(serializedMatch.roomId, 'room-history');
  assert.equal(serializedMatch.player1Id, player1Id.toString());
  assert.equal(serializedMatch.player2Id, player2Id.toString());
  assert.equal(serializedMatch.isPrivate, true);
  assert.equal(serializedMatch.winnerId, player2Id.toString());
  assert.equal(serializedMatch.settlementReason, 'winner');
  assert.equal('inviteTokenHash' in serializedMatch, false);
});

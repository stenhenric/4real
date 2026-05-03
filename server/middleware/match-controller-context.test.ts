import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';

import { MatchController } from '../controllers/match.controller.ts';
import { MatchService } from '../services/match.service.ts';

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

import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { serializeUserProfile } from '../serializers/api.ts';
import { MatchService } from '../services/match.service.ts';
import { UserService } from '../services/user.service.ts';

function createSessionMock() {
  return {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };
}

function registerSessionCleanup(t: TestContext) {
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  t.after(() => startSessionMock.mock.restore());
}

function createMatchDocument({
  roomId = 'room-123',
  isPrivate,
  inviteTokenHash,
  player2Id,
}: {
  roomId?: string;
  isPrivate: boolean;
  inviteTokenHash?: string;
  player2Id?: mongoose.Types.ObjectId;
}) {
  const player1Id = new mongoose.Types.ObjectId();

  return {
    _id: new mongoose.Types.ObjectId(),
    roomId,
    player1Id,
    player2Id,
    p1Username: 'host',
    p2Username: player2Id ? 'guest' : undefined,
    status: 'waiting' as const,
    winnerId: undefined,
    settlementReason: undefined,
    wager: 0,
    isPrivate,
    inviteTokenHash,
    moveHistory: [],
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    async save() {
      return this;
    },
  };
}

test('private match preview is hidden from non-participants without a valid invite', async (t) => {
  const inviteToken = 'invite-secret';
  const privateMatch = createMatchDocument({
    roomId: 'room-private',
    isPrivate: true,
    inviteTokenHash: MatchService.hashInviteToken(inviteToken),
  });
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => privateMatch as any);

  t.after(() => getMatchMock.mock.restore());

  const inaccessible = await MatchService.getAccessibleMatch({
    roomId: privateMatch.roomId,
    userId: new mongoose.Types.ObjectId().toString(),
  });
  const accessible = await MatchService.getAccessibleMatch({
    roomId: privateMatch.roomId,
    userId: new mongoose.Types.ObjectId().toString(),
    inviteToken,
  });

  assert.equal(inaccessible, null);
  assert.equal(accessible?._id.toString(), privateMatch._id.toString());
});

test('private match join returns MATCH_NOT_FOUND for non-participants without a valid invite', async (t) => {
  registerSessionCleanup(t);

  const userId = new mongoose.Types.ObjectId();
  const privateMatch = createMatchDocument({
    roomId: 'room-private',
    isPrivate: true,
    inviteTokenHash: MatchService.hashInviteToken('invite-secret'),
  });
  const userMock = mock.method(UserService, 'findById', async () => ({
    _id: userId,
    username: 'outsider',
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => privateMatch as any);

  t.after(() => userMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());

  await assert.rejects(
    MatchService.joinMatch({
      roomId: privateMatch.roomId,
      userId: userId.toString(),
    }),
    /Match not found/,
  );
});

test('private match join succeeds with a valid invite and public matches still allow join without one', async (t) => {
  registerSessionCleanup(t);

  const userId = new mongoose.Types.ObjectId();
  const userMock = mock.method(UserService, 'findById', async () => ({
    _id: userId,
    username: 'guest',
  } as any));
  const privateMatch = createMatchDocument({
    roomId: 'room-private',
    isPrivate: true,
    inviteTokenHash: MatchService.hashInviteToken('invite-secret'),
  });
  const publicMatch = createMatchDocument({
    roomId: 'room-public',
    isPrivate: false,
  });
  const getMatchMock = mock.method(
    MatchService,
    'getMatchByRoomId',
    async (roomId: string) => (roomId === privateMatch.roomId ? privateMatch as any : publicMatch as any),
  );

  t.after(() => userMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());

  const joinedPrivate = await MatchService.joinMatch({
    roomId: privateMatch.roomId,
    userId: userId.toString(),
    inviteToken: 'invite-secret',
  });
  const joinedPublic = await MatchService.joinMatch({
    roomId: publicMatch.roomId,
    userId: userId.toString(),
  });

  assert.equal(joinedPrivate.player2Id?.toString(), userId.toString());
  assert.equal(joinedPrivate.status, 'active');
  assert.equal(joinedPublic.player2Id?.toString(), userId.toString());
  assert.equal(joinedPublic.status, 'active');
});

test('public profile serialization no longer exposes balance', () => {
  const serialized = serializeUserProfile({
    _id: new mongoose.Types.ObjectId(),
    username: 'public-user',
    email: 'public@example.com',
    password: 'hashed',
    balance: 42,
    elo: 1234,
    isAdmin: false,
    tokenVersion: 0,
    stats: { wins: 2, losses: 1, draws: 3 },
  } as any);

  assert.equal('balance' in serialized, false);
  assert.deepEqual(serialized, {
    id: serialized.id,
    username: 'public-user',
    elo: 1234,
    stats: { wins: 2, losses: 1, draws: 3 },
  });
});

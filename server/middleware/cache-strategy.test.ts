import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { MerchantAdminController } from '../controllers/merchant-admin.controller.ts';
import { MatchController } from '../controllers/match.controller.ts';
import { OrderController } from '../controllers/order.controller.ts';
import { UserController } from '../controllers/user.controller.ts';
import { resetEnvCacheForTests } from '../config/env.ts';
import { getOrDeriveJettonWallet } from '../lib/jetton.ts';
import { MerchantConfig as MerchantConfigModel } from '../models/MerchantConfig.ts';
import { JettonWalletCacheRepository } from '../repositories/jetton-wallet-cache.repository.ts';
import { resetCacheServiceForTests } from '../services/cache.service.ts';
import { MatchService } from '../services/match.service.ts';
import { UserService } from '../services/user.service.ts';
import { setRedisClientForTests } from '../services/redis.service.ts';

const TEST_WALLET = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

function createJsonResponseMock() {
  const headers = new Map<string, string>();
  return {
    payload: undefined as unknown,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    vary(name: string) {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

function createLeanQuery<T>(value: T) {
  return {
    select() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function forceRedisFailureCacheForTest(t: TestContext) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.REDIS_URL;
  process.env.NODE_ENV = 'development';
  process.env.REDIS_URL = 'rediss://cache.example.invalid:6379';
  resetEnvCacheForTests();
  resetCacheServiceForTests();
  setRedisClientForTests({
    async get() {
      throw new Error('redis read unavailable');
    },
    async set() {
      throw new Error('redis write unavailable');
    },
    async del() {
      throw new Error('redis delete unavailable');
    },
  } as any);

  t.after(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }

    setRedisClientForTests(null);
    resetEnvCacheForTests();
    resetCacheServiceForTests();
  });
}

test('GET /api/users/leaderboard falls back to source data during Redis outage without leaking private fields', async (t) => {
  forceRedisFailureCacheForTest(t);

  const userId = new mongoose.Types.ObjectId();
  const leaderboardMock = mock.method(UserService, 'getLeaderboard', async () => [{
    _id: userId,
    username: 'public-player',
    email: 'player@example.com',
    passwordHash: 'hashed',
    isAdmin: true,
    balance: '999.000000',
    elo: 1400,
    stats: { wins: 2, losses: 1, draws: 0 },
  }] as any);
  t.after(() => leaderboardMock.mock.restore());

  const res = createJsonResponseMock();
  await UserController.getLeaderboard({} as any, res as any);

  assert.deepEqual(res.payload, [{
    id: userId.toString(),
    username: 'public-player',
    elo: 1400,
  }]);
  assert.equal(res.getHeader('cache-control'), 'public, max-age=30, s-maxage=30, stale-while-revalidate=30, stale-if-error=60');
  assert.equal(leaderboardMock.mock.callCount(), 1);
});

test('GET /api/matches/active falls back to source data during Redis outage without leaking invite or internal fields', async (t) => {
  forceRedisFailureCacheForTest(t);

  const matchId = new mongoose.Types.ObjectId();
  const playerId = new mongoose.Types.ObjectId();
  const activeMatchesMock = mock.method(MatchService, 'getActiveMatches', async () => [{
    _id: matchId,
    roomId: 'room-public',
    player1Id: playerId,
    p1Username: 'host',
    status: 'waiting',
    wager: '0.000000',
    isPrivate: false,
    inviteTokenHash: 'secret-hash',
    moveHistory: [],
    lastActivityAt: new Date('2026-05-16T00:00:00.000Z'),
    createdAt: new Date('2026-05-16T00:00:00.000Z'),
  }] as any);
  t.after(() => activeMatchesMock.mock.restore());

  const res = createJsonResponseMock();
  await MatchController.getActiveMatches({} as any, res as any);

  assert.equal(res.getHeader('cache-control'), 'public, max-age=5, s-maxage=5, stale-while-revalidate=10, stale-if-error=30');
  assert.equal(activeMatchesMock.mock.callCount(), 1);
  const payload = res.payload as Array<Record<string, unknown>>;
  assert.equal(payload[0]?._id, matchId.toString());
  assert.equal(payload[0]?.roomId, 'room-public');
  assert.equal(payload[0]?.player1Id, playerId.toString());
  assert.equal('inviteTokenHash' in (payload[0] ?? {}), false);
  assert.equal('email' in (payload[0] ?? {}), false);
  assert.equal('walletAddress' in (payload[0] ?? {}), false);
});

test('GET /api/orders/config falls back to merchant config source during Redis outage', async (t) => {
  forceRedisFailureCacheForTest(t);

  const configMock = mock.method(MerchantConfigModel, 'findOne', (() => createLeanQuery({
    mpesaNumber: '254700000000',
    walletAddress: TEST_WALLET,
    instructions: 'Use exact amount.',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '140.000000',
    sellRateKesPerUsdt: '135.000000',
  })) as any);
  t.after(() => configMock.mock.restore());

  const res = createJsonResponseMock();
  await OrderController.getMerchantConfig({} as any, res as any);

  assert.deepEqual(res.payload, {
    mpesaNumber: '254700000000',
    walletAddress: TEST_WALLET,
    instructions: 'Use exact amount.',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '140.000000',
    sellRateKesPerUsdt: '135.000000',
  });
});

test('GET /api/admin/merchant/config falls back to merchant config source during Redis outage', async (t) => {
  forceRedisFailureCacheForTest(t);

  const configMock = mock.method(MerchantConfigModel, 'findOne', (() => createLeanQuery({
    mpesaNumber: '254711111111',
    walletAddress: TEST_WALLET,
    instructions: 'Admin configured instructions.',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '141.000000',
    sellRateKesPerUsdt: '136.000000',
  })) as any);
  t.after(() => configMock.mock.restore());

  const res = createJsonResponseMock();
  await MerchantAdminController.getConfig({} as any, res as any);

  assert.deepEqual(res.payload, {
    mpesaNumber: '254711111111',
    walletAddress: TEST_WALLET,
    instructions: 'Admin configured instructions.',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '141.000000',
    sellRateKesPerUsdt: '136.000000',
  });
});

test('jetton wallet derived-address lookup falls back during Redis outage without reading balances or payment state', async (t) => {
  forceRedisFailureCacheForTest(t);

  const repositoryMock = mock.method(JettonWalletCacheRepository, 'findByOwnerAndMaster', async () => ({
    jettonWallet: TEST_WALLET,
  } as any));
  const upsertMock = mock.method(JettonWalletCacheRepository, 'upsert', async () => {});
  t.after(() => repositoryMock.mock.restore());
  t.after(() => upsertMock.mock.restore());

  const result = await getOrDeriveJettonWallet(TEST_WALLET);

  assert.equal(result, TEST_WALLET);
  assert.equal(repositoryMock.mock.callCount(), 1);
  assert.equal(upsertMock.mock.callCount(), 0);
});

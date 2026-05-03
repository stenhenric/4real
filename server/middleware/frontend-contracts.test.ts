import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { getTransactionAccentClass, isCreditTransaction } from '../../src/features/bank/transactionPresentation.ts';
import {
  consumeMagicLink,
  consumeSuspiciousLogin,
  consumeVerificationEmail,
} from '../../src/services/auth.service.ts';
import request, { ApiClientError } from '../../src/services/api/apiClient.ts';
import { getMatch, joinMatch } from '../../src/services/matches.service.ts';

function createJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null;
      },
    },
    async json() {
      return data;
    },
    async text() {
      return typeof data === 'string' ? data : JSON.stringify(data);
    },
  } as Response;
}

test('ApiClientError preserves status, code, and details from backend responses', async (t) => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => createJsonResponse({
    code: 'MATCH_NOT_FOUND',
    message: 'Match not found',
    details: { roomId: 'room-404' },
  }, 404));
  t.after(() => fetchMock.mock.restore());

  await assert.rejects(
    request('/matches/room-404'),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 404);
      assert.equal(error.code, 'MATCH_NOT_FOUND');
      assert.deepEqual(error.details, { roomId: 'room-404' });
      assert.equal(error.message, 'Match not found');
      return true;
    },
  );
});

test('frontend match service forwards invite tokens into preview and join requests', async (t) => {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({
      roomId: 'room-1',
      p1Username: 'host',
      player1Id: 'p1',
      status: 'waiting',
      wager: 0,
      isPrivate: true,
      moveHistory: [],
    });
  });
  t.after(() => fetchMock.mock.restore());

  await getMatch('room-1', undefined, 'invite token');
  await joinMatch('room-1', 'invite token');

  assert.equal(calls[0]?.input, '/api/matches/room-1?invite=invite%20token');
  assert.equal(calls[1]?.input, '/api/matches/room-1/join');
  const joinHeaders = new Headers(calls[1]?.init?.headers);
  assert.equal(joinHeaders.get('X-Match-Invite'), 'invite token');
  assert.ok(joinHeaders.get('Idempotency-Key'));
});

test('frontend bank presentation treats refund credits as positive incoming funds', () => {
  assert.equal(isCreditTransaction({
    type: 'WITHDRAW_REFUND',
    amount: 12,
  }), true);
  assert.equal(isCreditTransaction({
    type: 'SELL_P2P_REFUND',
    amount: 7,
  }), true);
  assert.equal(getTransactionAccentClass({
    type: 'WITHDRAW_REFUND',
    amount: 12,
  }), 'bg-green-600');
  assert.equal(getTransactionAccentClass({
    type: 'SELL_P2P_REFUND',
    amount: 7,
  }), 'bg-green-600');
});

test('frontend auth service consumes emailed auth tokens with POST requests', async (t) => {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return createJsonResponse({ status: 'authenticated', redirectTo: '/play' });
  });
  t.after(() => fetchMock.mock.restore());

  await consumeMagicLink({ token: 'magic-token' });
  await consumeVerificationEmail({ token: 'verify-token' });
  await consumeSuspiciousLogin({ token: 'suspicious-token' });

  assert.deepEqual(
    calls.map((entry) => ({ input: entry.input, method: entry.init?.method, body: entry.init?.body })),
    [
      {
        input: '/api/auth/login/magic-link/consume',
        method: 'POST',
        body: JSON.stringify({ token: 'magic-token' }),
      },
      {
        input: '/api/auth/email/verify/consume',
        method: 'POST',
        body: JSON.stringify({ token: 'verify-token' }),
      },
      {
        input: '/api/auth/login/suspicious/consume',
        method: 'POST',
        body: JSON.stringify({ token: 'suspicious-token' }),
      },
    ],
  );
});

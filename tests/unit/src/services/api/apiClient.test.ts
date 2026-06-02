import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import request, { ApiClientError } from '../../../../../src/services/api/apiClient.ts';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('request refreshes the session and retries when /auth/me returns 401 with a valid refresh cookie', async (t) => {
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    if (url === '/api/auth/refresh') {
      return jsonResponse(200, {
        status: 'authenticated',
      });
    }

    if (calls.filter((entry) => entry === '/api/auth/me').length === 2) {
      return jsonResponse(200, {
        status: 'authenticated',
        user: {
          id: 'user-1',
          email: 'player@example.com',
          username: 'player-one',
        },
      });
    }

    return jsonResponse(401, {
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Access token required',
    });
  });

  t.after(() => fetchMock.mock.restore());

  const result = await request('/auth/me');

  assert.deepEqual(result, {
    status: 'authenticated',
    user: {
      id: 'user-1',
      email: 'player@example.com',
      username: 'player-one',
    },
  });
  assert.deepEqual(calls, ['/api/auth/me', '/api/auth/refresh', '/api/auth/me']);
});

test('request does not refresh public login failures', async (t) => {
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return jsonResponse(401, {
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  t.after(() => fetchMock.mock.restore());

  await assert.rejects(
    request('/auth/login/password', { method: 'POST', body: JSON.stringify({}) }),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 401);
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      return true;
    },
  );

  assert.deepEqual(calls, ['/api/auth/login/password']);
});

test('request does not refresh invalid TOTP setup codes', async (t) => {
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return jsonResponse(401, {
      status: 401,
      code: 'INVALID_TOTP_CODE',
      message: 'Invalid verification code',
    });
  });

  t.after(() => fetchMock.mock.restore());

  await assert.rejects(
    request('/auth/mfa/totp/verify', { method: 'POST', body: JSON.stringify({ code: '000000' }) }),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 401);
      assert.equal(error.code, 'INVALID_TOTP_CODE');
      return true;
    },
  );

  assert.deepEqual(calls, ['/api/auth/mfa/totp/verify']);
});

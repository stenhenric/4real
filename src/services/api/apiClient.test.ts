import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import request, { ApiClientError } from './apiClient.ts';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('request does not refresh the session when /auth/me returns 401', async (t) => {
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    return jsonResponse(401, {
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Access token required',
    });
  });

  t.after(() => fetchMock.mock.restore());

  await assert.rejects(
    request('/auth/me'),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 401);
      assert.equal(error.code, 'UNAUTHENTICATED');
      return true;
    }
  );

  assert.deepEqual(calls, ['/api/auth/me']);
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

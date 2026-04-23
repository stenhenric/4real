import { test, mock } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';

// Mock express NextFunction
const mockNext = () => {};

process.env.JWT_SECRET = 'test-secret';

// Import the middleware
import { authenticateToken, requireAdmin } from './auth.middleware.ts';



test('authenticateToken - missing token', (t) => {
  const req = { cookies: {} } as any;
  const res = {
    status: mock.fn((code) => res),
    json: mock.fn((data) => res)
  } as any;
  const next = mock.fn();

  authenticateToken(req, res, next);

  assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
  assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { error: 'Access token required' });
  assert.strictEqual(next.mock.callCount(), 0);
});

test('authenticateToken - valid token', (t) => {
  const req = { cookies: { token: 'valid-token' } } as any;
  const res = {
    status: mock.fn((code) => res),
    json: mock.fn((data) => res)
  } as any;
  const next = mock.fn();

  const verifyMock = mock.method(jwt, 'verify', (token, secret, callback) => {
    callback(null, { id: 'user123', isAdmin: false });
  });

  authenticateToken(req, res, next);

  assert.strictEqual(next.mock.callCount(), 1);
  assert.deepStrictEqual(req.user, { id: 'user123', isAdmin: false });

  verifyMock.mock.restore();
});

test('authenticateToken - invalid token', (t) => {
  const req = { cookies: { token: 'invalid-token' } } as any;
  const res = {
    status: mock.fn((code) => res),
    json: mock.fn((data) => res)
  } as any;
  const next = mock.fn();

  const verifyMock = mock.method(jwt, 'verify', (token, secret, callback) => {
    callback(new Error('Invalid token'), null);
  });

  authenticateToken(req, res, next);

  assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
  assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { error: 'Invalid token' });
  assert.strictEqual(next.mock.callCount(), 0);

  verifyMock.mock.restore();
});

test('requireAdmin - not an admin', (t) => {
  const req = { user: { id: 'user123', isAdmin: false } } as any;
  const res = {
    status: mock.fn((code) => res),
    json: mock.fn((data) => res)
  } as any;
  const next = mock.fn();

  requireAdmin(req, res, next);

  assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
  assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { error: 'Admin access required' });
  assert.strictEqual(next.mock.callCount(), 0);
});

test('requireAdmin - is an admin', (t) => {
  const req = { user: { id: 'admin123', isAdmin: true } } as any;
  const res = {
    status: mock.fn((code) => res),
    json: mock.fn((data) => res)
  } as any;
  const next = mock.fn();

  requireAdmin(req, res, next);

  assert.strictEqual(next.mock.callCount(), 1);
});

test('requireAdmin - no user on request', (t) => {
  const req = {} as any;
  const res = {
    status: mock.fn((code) => res),
    json: mock.fn((data) => res)
  } as any;
  const next = mock.fn();

  requireAdmin(req, res, next);

  assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
  assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], { error: 'Admin access required' });
  assert.strictEqual(next.mock.callCount(), 0);
});

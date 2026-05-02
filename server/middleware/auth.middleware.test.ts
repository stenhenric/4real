import { test, mock } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { UserService } from '../services/user.service.ts';

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

// Import the middleware
import { authenticateToken, requireAdmin } from './auth.middleware.ts';



test('authenticateToken - missing token', (t) => {
  const req = { cookies: {} } as any;
  const res = {} as any;
  const next = mock.fn((error?: { statusCode?: number; code?: string; message?: string }) => {
    assert.equal(error?.statusCode, 401);
    assert.equal(error?.code, 'UNAUTHENTICATED');
    assert.equal(error?.message, 'Access token required');
  });

  authenticateToken(req, res, next);

  assert.strictEqual(next.mock.callCount(), 1);
});

test('authenticateToken - valid token', async (t) => {
  const req = { cookies: { token: 'valid-token' } } as any;
  const res = {} as any;
  const next = mock.fn(() => {});

  const verifyMock = mock.method(jwt, 'verify', () => ({ id: 'user123', isAdmin: false, tokenVersion: 0 }));
  const authStateMock = mock.method(UserService, 'getAuthState', async () => ({ tokenVersion: 0, isAdmin: false }));

  await new Promise<void>((resolve) => {
    const wrappedNext = mock.fn(() => {
      next();
      resolve();
    });
    authenticateToken(req, res, wrappedNext as any);
  });

  assert.strictEqual(next.mock.callCount(), 1);
  assert.deepStrictEqual(req.user, { id: 'user123', isAdmin: false, tokenVersion: 0 });

  verifyMock.mock.restore();
  authStateMock.mock.restore();
});

test('authenticateToken - invalid token', async (t) => {
  const req = { cookies: { token: 'invalid-token' } } as any;
  const res = {} as any;
  const next = mock.fn((error?: { statusCode?: number; code?: string; message?: string }) => {
    assert.equal(error?.statusCode, 401);
    assert.equal(error?.code, 'INVALID_TOKEN');
    assert.equal(error?.message, 'Invalid token');
  });

  const verifyMock = mock.method(jwt, 'verify', () => {
    throw new Error('Invalid token');
  });

  authenticateToken(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(next.mock.callCount(), 1);

  verifyMock.mock.restore();
});

test('authenticateToken - revoked token', async (t) => {
  const req = { cookies: { token: 'stale-token' } } as any;
  const res = {} as any;
  const next = mock.fn((error?: { statusCode?: number; code?: string; message?: string }) => {
    assert.equal(error?.statusCode, 401);
    assert.equal(error?.code, 'TOKEN_REVOKED');
    assert.equal(error?.message, 'Token revoked');
  });

  const verifyMock = mock.method(jwt, 'verify', () => ({ id: 'user123', isAdmin: false, tokenVersion: 0 }));
  const authStateMock = mock.method(UserService, 'getAuthState', async () => ({ tokenVersion: 1, isAdmin: false }));

  authenticateToken(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(next.mock.callCount(), 1);

  verifyMock.mock.restore();
  authStateMock.mock.restore();
});

test('requireAdmin - not an admin', (t) => {
  const req = { user: { id: 'user123', isAdmin: false } } as any;
  const res = {} as any;
  const next = mock.fn((error?: { statusCode?: number; code?: string; message?: string }) => {
    assert.equal(error?.statusCode, 403);
    assert.equal(error?.code, 'ADMIN_ACCESS_REQUIRED');
    assert.equal(error?.message, 'Admin access required');
  });

  requireAdmin(req, res, next);

  assert.strictEqual(next.mock.callCount(), 1);
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
  const res = {} as any;
  const next = mock.fn((error?: { statusCode?: number; code?: string; message?: string }) => {
    assert.equal(error?.statusCode, 403);
    assert.equal(error?.code, 'ADMIN_ACCESS_REQUIRED');
    assert.equal(error?.message, 'Admin access required');
  });

  requireAdmin(req, res, next);

  assert.strictEqual(next.mock.callCount(), 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildActiveSessionQuery } from './auth-session.service.ts';

test('buildActiveSessionQuery returns fresh active-session filters on every call', () => {
  const first = buildActiveSessionQuery();
  const second = buildActiveSessionQuery();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.absoluteExpiresAt, second.absoluteExpiresAt);
  assert.notStrictEqual(first.idleExpiresAt, second.idleExpiresAt);
  assert.equal(first.revokedAt, null);
  assert.equal(second.revokedAt, null);
  assert(first.absoluteExpiresAt.$gt instanceof Date);
  assert(first.idleExpiresAt.$gt instanceof Date);
  assert(second.absoluteExpiresAt.$gt instanceof Date);
  assert(second.idleExpiresAt.$gt instanceof Date);
});

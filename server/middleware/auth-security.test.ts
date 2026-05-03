import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { decodeBase32 } from '../services/auth-crypto.service.ts';
import { assertValidPassword } from '../services/password-policy.service.ts';
import { createTotpSetup, verifyTotpCode } from '../services/totp.service.ts';

function createTotpCode(secret: string, timestampMs: number) {
  const secretBytes = decodeBase32(secret);
  const counter = Math.floor(timestampMs / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', secretBytes).update(buffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const part1 = hmac[offset] ?? 0;
  const part2 = hmac[offset + 1] ?? 0;
  const part3 = hmac[offset + 2] ?? 0;
  const part4 = hmac[offset + 3] ?? 0;
  const binary = ((part1 & 0x7f) << 24)
    | ((part2 & 0xff) << 16)
    | ((part3 & 0xff) << 8)
    | (part4 & 0xff);

  return (binary % 1_000_000).toString().padStart(6, '0');
}

test('createTotpSetup returns a standards-shaped OTP Auth URL', () => {
  const setup = createTotpSetup({
    issuer: '4real',
    accountName: 'alice@example.com',
  });

  const url = new URL(setup.otpauthUrl);

  assert.equal(url.protocol, 'otpauth:');
  assert.equal(url.hostname, 'totp');
  assert.equal(url.pathname, '/4real%3Aalice%40example.com');
  assert.equal(url.searchParams.get('issuer'), '4real');
  assert.equal(url.searchParams.get('secret'), setup.secret);
  assert.equal(url.searchParams.get('digits'), '6');
  assert.equal(url.searchParams.get('period'), '30');
});

test('verifyTotpCode accepts the current 6-digit code and rejects malformed codes', () => {
  const now = Date.parse('2026-05-02T12:00:00.000Z');
  const setup = createTotpSetup({
    issuer: '4real',
    accountName: 'alice@example.com',
  });
  const code = createTotpCode(setup.secret, now);

  assert.equal(verifyTotpCode(setup.secret, code, now), true);
  assert.equal(verifyTotpCode(setup.secret, '12345', now), false);
  assert.equal(verifyTotpCode(setup.secret, 'ABCDEF', now), false);
});

test('assertValidPassword rejects common and predictable passwords', () => {
  assert.throws(
    () => assertValidPassword('administrator'),
    (error: unknown) => typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'PASSWORD_TOO_COMMON',
  );

  assert.throws(
    () => assertValidPassword('alice-should-not-work', { email: 'alice@example.com' }),
    (error: unknown) => typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'PASSWORD_TOO_PREDICTABLE',
  );

  assert.doesNotThrow(() => {
    assertValidPassword('paper-lobby-stakes-2026', {
      email: 'alice@example.com',
      username: 'alice',
    });
  });
});

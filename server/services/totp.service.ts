import crypto from 'node:crypto';

import { createBase32Secret, decodeBase32 } from './auth-crypto.service.ts';

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALGORITHM = 'sha1';
const WINDOW = 1;

function toCounterBuffer(counter: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  return buffer;
}

function generateOtp(secret: string, timestampMs: number): string {
  const secretBytes = decodeBase32(secret);
  const counter = Math.floor(timestampMs / 1000 / PERIOD_SECONDS);
  const hmac = crypto
    .createHmac(ALGORITHM, secretBytes)
    .update(toCounterBuffer(counter))
    .digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const part1 = hmac[offset] ?? 0;
  const part2 = hmac[offset + 1] ?? 0;
  const part3 = hmac[offset + 2] ?? 0;
  const part4 = hmac[offset + 3] ?? 0;
  const binary = ((part1 & 0x7f) << 24)
    | ((part2 & 0xff) << 16)
    | ((part3 & 0xff) << 8)
    | (part4 & 0xff);
  const otp = binary % (10 ** DIGITS);
  return otp.toString().padStart(DIGITS, '0');
}

export function createTotpSecret(): string {
  return createBase32Secret();
}

export function createTotpSetup(params: { accountName: string; issuer: string }) {
  const secret = createTotpSecret();
  const label = `${params.issuer}:${params.accountName}`;
  const otpauthUrl = new URL(`otpauth://totp/${encodeURIComponent(label)}`);
  otpauthUrl.searchParams.set('secret', secret);
  otpauthUrl.searchParams.set('issuer', params.issuer);
  otpauthUrl.searchParams.set('algorithm', ALGORITHM.toUpperCase());
  otpauthUrl.searchParams.set('digits', String(DIGITS));
  otpauthUrl.searchParams.set('period', String(PERIOD_SECONDS));

  return {
    secret,
    otpauthUrl: otpauthUrl.toString(),
  };
}

export function verifyTotpCode(secret: string, code: string, now = Date.now()): boolean {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const candidate = generateOtp(secret, now + (offset * PERIOD_SECONDS * 1000));
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(normalizedCode))) {
      return true;
    }
  }

  return false;
}

import crypto from 'node:crypto';

import { getEnv } from '../config/env.ts';

const ARGON2_TAG_LENGTH = 32;
const ARGON2_SALT_LENGTH = 16;
const ARGON2_VERSION = 'v=1';
type Argon2Callback = (error: Error | null, derivedKey: Buffer) => void;
type Argon2Function = (
  algorithm: string,
  parameters: {
    message: string;
    nonce: Buffer;
    parallelism: number;
    tagLength: number;
    memory: number;
    passes: number;
  },
  callback: Argon2Callback,
) => void;

const argon2Fn = (crypto as unknown as { argon2: Argon2Function }).argon2;

function base64UrlEncode(value: Buffer): string {
  return value.toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function runArgon2(message: string, salt: Buffer): Promise<Buffer> {
  const env = getEnv();

  return new Promise((resolve, reject) => {
    argon2Fn(
      'argon2id',
      {
        message,
        nonce: salt,
        parallelism: env.AUTH_ARGON2_PARALLELISM,
        tagLength: ARGON2_TAG_LENGTH,
        memory: env.AUTH_ARGON2_MEMORY_KIB,
        passes: env.AUTH_ARGON2_PASSES,
      },
      (error: Error | null, derivedKey: Buffer) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function buildHashString({
  hash,
  salt,
}: {
  hash: Buffer;
  salt: Buffer;
}): string {
  const env = getEnv();

  return [
    'argon2id',
    ARGON2_VERSION,
    `m=${env.AUTH_ARGON2_MEMORY_KIB},t=${env.AUTH_ARGON2_PASSES},p=${env.AUTH_ARGON2_PARALLELISM}`,
    base64UrlEncode(salt),
    base64UrlEncode(hash),
  ].join('$');
}

function parseHashString(value: string) {
  const [algorithm, version, parameters, saltPart, hashPart] = value.split('$');
  if (
    algorithm !== 'argon2id'
    || version !== ARGON2_VERSION
    || !parameters
    || !saltPart
    || !hashPart
  ) {
    throw new Error('Unsupported password hash format');
  }

  const parsedParameters = Object.fromEntries(
    parameters
      .split(',')
      .map((entry) => entry.split('=').map((part) => part.trim()))
      .filter((entry): entry is [string, string] => entry.length === 2),
  );

  const memory = Number(parsedParameters.m);
  const passes = Number(parsedParameters.t);
  const parallelism = Number(parsedParameters.p);

  if (
    !Number.isInteger(memory)
    || !Number.isInteger(passes)
    || !Number.isInteger(parallelism)
    || memory <= 0
    || passes <= 0
    || parallelism <= 0
  ) {
    throw new Error('Unsupported password hash parameters');
  }

  return {
    memory,
    passes,
    parallelism,
    salt: base64UrlDecode(saltPart),
    hash: base64UrlDecode(hashPart),
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(ARGON2_SALT_LENGTH);
  const hash = await runArgon2(password, salt);
  return buildHashString({ hash, salt });
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parseHashString(encodedHash);
  const candidate = await new Promise<Buffer>((resolve, reject) => {
    argon2Fn(
      'argon2id',
      {
        message: password,
        nonce: parsed.salt,
        parallelism: parsed.parallelism,
        tagLength: parsed.hash.length,
        memory: parsed.memory,
        passes: parsed.passes,
      },
      (error: Error | null, derivedKey: Buffer) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });

  return crypto.timingSafeEqual(candidate, parsed.hash);
}

export function needsPasswordRehash(encodedHash: string): boolean {
  try {
    const parsed = parseHashString(encodedHash);
    const env = getEnv();

    return parsed.memory !== env.AUTH_ARGON2_MEMORY_KIB
      || parsed.passes !== env.AUTH_ARGON2_PASSES
      || parsed.parallelism !== env.AUTH_ARGON2_PARALLELISM;
  } catch {
    return true;
  }
}

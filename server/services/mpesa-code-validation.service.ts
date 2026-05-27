import crypto from 'node:crypto';

import type { Redis } from 'ioredis';

import { getEnv } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { getRedisClient } from './redis.service.ts';

export type MpesaCodeValidationReasonCode =
  | 'INVALID_FORMAT'
  | 'INVALID_LENGTH'
  | 'INVALID_CHARACTERS'
  | 'INVALID_DATE_PREFIX'
  | 'INVALID_REAL_DATE'
  | 'DATE_IN_FUTURE'
  | 'DATE_TOO_OLD'
  | 'DATE_OUTSIDE_PAYMENT_WINDOW'
  | 'DUPLICATE_CODE'
  | 'TOO_MANY_ATTEMPTS'
  | 'VALID_PLAUSIBLE'
  | 'NEEDS_MANUAL_REVIEW';

export interface MpesaCodeValidationConfig {
  allowedYears: Map<string, number>;
  timeZone: string;
  allowInternalSpaces: boolean;
  previousDayGraceMinutes: number;
}

export interface MpesaCodeValidationResult {
  status: 'valid' | 'invalid';
  normalizedCode: string;
  reasonCode: MpesaCodeValidationReasonCode;
  decodedDate?: Date;
  decodedLocalDate?: {
    year: number;
    month: number;
    day: number;
  };
}

interface PlainDate {
  year: number;
  month: number;
  day: number;
}

interface AttemptRecord {
  count: number;
  lockedUntilMs?: number;
  expiresAtMs: number;
}

export interface MpesaCodeAttemptResult {
  count: number;
  lockedUntil?: Date;
}

export interface MpesaCodeAttemptDependencies {
  getRedisClient: () => Redis;
  now: () => Date;
}

const MONTH_CODES = new Map([
  ['A', 1],
  ['B', 2],
  ['C', 3],
  ['D', 4],
  ['E', 5],
  ['F', 6],
  ['G', 7],
  ['H', 8],
  ['I', 9],
  ['J', 10],
  ['K', 11],
  ['L', 12],
]);

const DAY_CODES = new Map<string, number>([
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 7],
  ['8', 8],
  ['9', 9],
  ['A', 10],
  ['B', 11],
  ['C', 12],
  ['D', 13],
  ['E', 14],
  ['F', 15],
  ['G', 16],
  ['H', 17],
  ['I', 18],
  ['J', 19],
  ['K', 20],
  ['L', 21],
  ['M', 22],
  ['N', 23],
  ['O', 24],
  ['P', 25],
  ['Q', 26],
  ['R', 27],
  ['S', 28],
  ['T', 29],
  ['U', 30],
  ['V', 31],
]);

const LOCAL_ATTEMPT_RECORDS = new Map<string, AttemptRecord>();
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REDIS_ATTEMPT_PREFIX = 'mpesa-code-attempt:';

let attemptDependencies: MpesaCodeAttemptDependencies = {
  getRedisClient,
  now: () => new Date(),
};

function parseAllowedYears(value: string): Map<string, number> {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowedYears = new Map<string, number>();

  for (const entry of entries) {
    const [rawCode, rawYear] = entry.split(':');
    const code = rawCode?.trim().toUpperCase();
    const year = Number(rawYear);

    if (!code || !/^[A-Z]$/.test(code) || !Number.isInteger(year)) {
      throw new Error('MPESA_CODE_ALLOWED_YEARS must use entries like R:2023,S:2024');
    }

    allowedYears.set(code, year);
  }

  if (allowedYears.size === 0) {
    throw new Error('MPESA_CODE_ALLOWED_YEARS must contain at least one year mapping');
  }

  return allowedYears;
}

export function getMpesaCodeValidationConfig(): MpesaCodeValidationConfig {
  const env = getEnv();

  return {
    allowedYears: parseAllowedYears(env.MPESA_CODE_ALLOWED_YEARS),
    timeZone: env.MPESA_CODE_TIMEZONE,
    allowInternalSpaces: env.MPESA_CODE_ALLOW_INTERNAL_SPACES,
    previousDayGraceMinutes: env.MPESA_CODE_PREVIOUS_DAY_GRACE_MINUTES,
  };
}

export function normalizeMpesaTransactionCode(input: string, allowInternalSpaces = getEnv().MPESA_CODE_ALLOW_INTERNAL_SPACES): string {
  const trimmed = input.trim().toUpperCase();

  return allowInternalSpaces ? trimmed.replace(/ /g, '') : trimmed;
}

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = DATE_FORMATTERS.get(timeZone);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  DATE_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

function getLocalDateParts(date: Date, timeZone: string): PlainDate & { hour: number; minute: number } {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
  };
}

function comparePlainDate(left: PlainDate, right: PlainDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

function addDays(date: PlainDate, days: number): PlainDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * MS_PER_DAY);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function isRealCalendarDate(date: PlainDate): boolean {
  const parsed = new Date(Date.UTC(date.year, date.month - 1, date.day));

  return (
    parsed.getUTCFullYear() === date.year
    && parsed.getUTCMonth() + 1 === date.month
    && parsed.getUTCDate() === date.day
  );
}

function decodedDateToStoredDate(date: PlainDate, timeZone: string): Date {
  if (timeZone === 'Africa/Nairobi') {
    return new Date(Date.UTC(date.year, date.month - 1, date.day) - 3 * 60 * 60 * 1000);
  }

  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function isWithinAllowedWindow(decodedDate: PlainDate, now: Date, timeZone: string, previousDayGraceMinutes: number): boolean {
  const nowLocal = getLocalDateParts(now, timeZone);
  const today = {
    year: nowLocal.year,
    month: nowLocal.month,
    day: nowLocal.day,
  };

  if (comparePlainDate(decodedDate, today) === 0) {
    return true;
  }

  const previousDay = addDays(today, -1);
  const minutesSinceLocalMidnight = nowLocal.hour * 60 + nowLocal.minute;

  return (
    previousDayGraceMinutes > 0
    && minutesSinceLocalMidnight <= previousDayGraceMinutes
    && comparePlainDate(decodedDate, previousDay) === 0
  );
}

function getDateWindowReason(decodedDate: PlainDate, now: Date, timeZone: string): MpesaCodeValidationReasonCode {
  const nowLocal = getLocalDateParts(now, timeZone);
  const today = {
    year: nowLocal.year,
    month: nowLocal.month,
    day: nowLocal.day,
  };
  const comparison = comparePlainDate(decodedDate, today);

  if (comparison > 0) {
    return 'DATE_IN_FUTURE';
  }

  if (comparison < 0) {
    return 'DATE_TOO_OLD';
  }

  return 'DATE_OUTSIDE_PAYMENT_WINDOW';
}

export function hashMpesaTransactionCode(normalizedCode: string): string {
  return crypto.createHash('sha256').update(normalizedCode).digest('hex');
}

export function validateMpesaTransactionCode(params: {
  input: string;
  now?: Date;
  config?: MpesaCodeValidationConfig;
}): MpesaCodeValidationResult {
  const config = params.config ?? getMpesaCodeValidationConfig();
  const normalizedCode = normalizeMpesaTransactionCode(params.input, config.allowInternalSpaces);

  if (normalizedCode.length !== 10) {
    return {
      status: 'invalid',
      normalizedCode,
      reasonCode: 'INVALID_LENGTH',
    };
  }

  if (!/^[A-Z0-9]{10}$/.test(normalizedCode)) {
    return {
      status: 'invalid',
      normalizedCode,
      reasonCode: 'INVALID_CHARACTERS',
    };
  }

  const year = config.allowedYears.get(normalizedCode[0] ?? '');
  const month = MONTH_CODES.get(normalizedCode[1] ?? '');
  const day = DAY_CODES.get(normalizedCode[2] ?? '');

  if (!year || !month || !day) {
    return {
      status: 'invalid',
      normalizedCode,
      reasonCode: 'INVALID_DATE_PREFIX',
    };
  }

  const decodedLocalDate = { year, month, day };

  if (!isRealCalendarDate(decodedLocalDate)) {
    return {
      status: 'invalid',
      normalizedCode,
      reasonCode: 'INVALID_REAL_DATE',
      decodedLocalDate,
    };
  }

  const now = params.now ?? attemptDependencies.now();
  if (!isWithinAllowedWindow(decodedLocalDate, now, config.timeZone, config.previousDayGraceMinutes)) {
    return {
      status: 'invalid',
      normalizedCode,
      reasonCode: getDateWindowReason(decodedLocalDate, now, config.timeZone),
      decodedDate: decodedDateToStoredDate(decodedLocalDate, config.timeZone),
      decodedLocalDate,
    };
  }

  return {
    status: 'valid',
    normalizedCode,
    reasonCode: 'VALID_PLAUSIBLE',
    decodedDate: decodedDateToStoredDate(decodedLocalDate, config.timeZone),
    decodedLocalDate,
  };
}

function getAttemptKey(contextKey: string): string {
  return `${REDIS_ATTEMPT_PREFIX}${crypto.createHash('sha256').update(contextKey).digest('hex')}`;
}

function pruneLocalAttemptRecords(nowMs: number): void {
  for (const [key, record] of LOCAL_ATTEMPT_RECORDS.entries()) {
    if (record.expiresAtMs <= nowMs) {
      LOCAL_ATTEMPT_RECORDS.delete(key);
    }
  }
}

function getLocalAttemptRecord(key: string, nowMs: number): AttemptRecord | null {
  pruneLocalAttemptRecords(nowMs);
  const record = LOCAL_ATTEMPT_RECORDS.get(key);

  return record && record.expiresAtMs > nowMs ? record : null;
}

function setLocalAttemptRecord(key: string, record: AttemptRecord): void {
  LOCAL_ATTEMPT_RECORDS.set(key, record);
}

async function readRedisAttemptRecord(key: string): Promise<AttemptRecord | null> {
  const raw = await attemptDependencies.getRedisClient().get(key);
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as Partial<AttemptRecord>;
  if (
    typeof parsed.count !== 'number'
    || typeof parsed.expiresAtMs !== 'number'
    || (parsed.lockedUntilMs !== undefined && typeof parsed.lockedUntilMs !== 'number')
  ) {
    return null;
  }

  return {
    count: parsed.count,
    expiresAtMs: parsed.expiresAtMs,
    ...(parsed.lockedUntilMs !== undefined ? { lockedUntilMs: parsed.lockedUntilMs } : {}),
  };
}

async function writeRedisAttemptRecord(key: string, record: AttemptRecord): Promise<void> {
  const ttlMs = Math.max(1, record.expiresAtMs - attemptDependencies.now().getTime());
  await attemptDependencies.getRedisClient().set(key, JSON.stringify(record), 'PX', ttlMs);
}

function shouldUseRedisAttempts(): boolean {
  const env = getEnv();

  return env.NODE_ENV !== 'test' && Boolean(env.REDIS_URL);
}

async function withAttemptStore<T>(operation: (nowMs: number, redisEnabled: boolean) => Promise<T>): Promise<T> {
  const redisEnabled = shouldUseRedisAttempts();
  const nowMs = attemptDependencies.now().getTime();

  if (!redisEnabled) {
    return operation(nowMs, false);
  }

  try {
    return await operation(nowMs, true);
  } catch (error) {
    logger.warn('mpesa_code.attempt_store_fallback', { error });
    return operation(nowMs, false);
  }
}

export async function getMpesaCodeAttemptLock(contextKey: string): Promise<MpesaCodeAttemptResult | null> {
  const key = getAttemptKey(contextKey);

  return withAttemptStore(async (nowMs, redisEnabled) => {
    const record = redisEnabled
      ? await readRedisAttemptRecord(key)
      : getLocalAttemptRecord(key, nowMs);
    if (!record || !record.lockedUntilMs || record.lockedUntilMs <= nowMs) {
      return null;
    }

    return {
      count: record.count,
      lockedUntil: new Date(record.lockedUntilMs),
    };
  });
}

export async function recordFailedMpesaCodeAttempt(contextKey: string): Promise<MpesaCodeAttemptResult> {
  const env = getEnv();
  const key = getAttemptKey(contextKey);

  return withAttemptStore(async (nowMs, redisEnabled) => {
    const existing = redisEnabled
      ? await readRedisAttemptRecord(key)
      : getLocalAttemptRecord(key, nowMs);
    const nextCount = (existing?.count ?? 0) + 1;
    const lockedUntilMs = nextCount >= env.MPESA_CODE_MAX_FAILED_ATTEMPTS
      ? nowMs + env.MPESA_CODE_ATTEMPT_LOCK_MS
      : existing?.lockedUntilMs;
    const expiresAtMs = Math.max(
      nowMs + env.MPESA_CODE_ATTEMPT_LOCK_MS,
      lockedUntilMs ?? 0,
    );
    const nextRecord: AttemptRecord = {
      count: nextCount,
      expiresAtMs,
      ...(lockedUntilMs ? { lockedUntilMs } : {}),
    };

    if (redisEnabled) {
      await writeRedisAttemptRecord(key, nextRecord);
    } else {
      setLocalAttemptRecord(key, nextRecord);
    }

    return {
      count: nextCount,
      ...(lockedUntilMs ? { lockedUntil: new Date(lockedUntilMs) } : {}),
    };
  });
}

export async function clearMpesaCodeAttempts(contextKey: string): Promise<void> {
  const key = getAttemptKey(contextKey);

  await withAttemptStore(async (nowMs, redisEnabled) => {
    if (redisEnabled) {
      await attemptDependencies.getRedisClient().del(key);
    } else {
      pruneLocalAttemptRecords(nowMs);
      LOCAL_ATTEMPT_RECORDS.delete(key);
    }
  });
}

export function resetMpesaCodeValidationForTests(): void {
  LOCAL_ATTEMPT_RECORDS.clear();
  DATE_FORMATTERS.clear();
  attemptDependencies = {
    getRedisClient,
    now: () => new Date(),
  };
}

export function setMpesaCodeAttemptDependenciesForTests(overrides: Partial<MpesaCodeAttemptDependencies>): void {
  attemptDependencies = {
    ...attemptDependencies,
    ...overrides,
  };
}

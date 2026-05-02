import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().trim().optional(),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().nonnegative().default(2),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  MONGODB_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  JWT_SECRET: z.string().trim().min(1),
  ALLOWED_ORIGINS: z.string().optional(),
  PUBLIC_APP_ORIGIN: z.string().trim().url().optional(),
  DISABLE_HMR: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
      return false;
    }),
  NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),
  TONCENTER_API_KEY: z.string().trim().optional(),
  HOT_WALLET_MNEMONIC: z.string().trim().optional(),
  HOT_WALLET_VERSION: z.enum(['V4', 'V5R1']).default('V5R1'),
  HOT_WALLET_ADDRESS: z.string().trim().optional(),
  HOT_JETTON_WALLET: z.string().trim().optional(),
  HOT_WALLET_MIN_TON_BALANCE: z.coerce.number().nonnegative().default(1),
  HOT_WALLET_MIN_USDT_BALANCE: z.coerce.number().nonnegative().default(0),
  HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT: z.coerce.number().nonnegative().default(1),
  DEPOSIT_INGESTION_MAX_RETRIES: z.coerce.number().int().positive().default(5),
  REDIS_URL: z.string().trim().url().optional(),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  REDIS_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(250),
  REDIS_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(5_000),
  TELEGRAM_BOT_TOKEN: z.string().trim().optional(),
  TELEGRAM_PROOF_CHANNEL_ID: z.string().trim().optional(),
  TELEGRAM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  TELEGRAM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  TELEGRAM_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),
  PROOF_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  PROOF_ALLOWED_MIME_TYPES: z.string().trim().default('image/jpeg,image/png,image/webp'),
  MERCHANT_MPESA_NUMBER: z.string().trim().optional(),
  MERCHANT_WALLET_ADDRESS: z.string().trim().optional(),
  MERCHANT_INSTRUCTIONS: z.string().trim().optional(),
  MERCHANT_BUY_RATE_KES_PER_USDT: z.coerce.number().positive().optional(),
  MERCHANT_SELL_RATE_KES_PER_USDT: z.coerce.number().positive().optional(),
  VITE_MERCHANT_MPESA_NUMBER: z.string().trim().optional(),
  VITE_MERCHANT_WALLET_ADDRESS: z.string().trim().optional(),
  VITE_MERCHANT_INSTRUCTIONS: z.string().trim().optional(),
  VITE_MERCHANT_BUY_RATE_KES_PER_USDT: z.coerce.number().positive().optional(),
  VITE_MERCHANT_SELL_RATE_KES_PER_USDT: z.coerce.number().positive().optional(),
  VITE_TON_MANIFEST_URL: z.string().trim().url().optional(),
  REQUEST_BODY_LIMIT: z.string().trim().default('100kb'),
  GENERAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  GENERAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(600_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  TONCENTER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  TONCENTER_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  TONCENTER_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),
  DEPENDENCY_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  DEPENDENCY_CIRCUIT_RESET_MS: z.coerce.number().int().positive().default(30_000),
  WAITING_ROOM_TTL_MS: z.coerce.number().int().positive().default(900_000),
  ACTIVE_ROOM_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  COMPLETED_ROOM_TTL_MS: z.coerce.number().int().positive().default(600_000),
  ROOM_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  MATCH_WAITING_EXPIRY_MS: z.coerce.number().int().positive().default(900_000),
  MATCH_ACTIVE_INACTIVITY_MS: z.coerce.number().int().positive().default(900_000),
  TRUST_PROXY: z.string().trim().optional(),
  MAX_WITHDRAWAL_USDT: z.coerce.number().positive().default(10_000),
  DAILY_WITHDRAWAL_LIMIT_USDT: z.coerce.number().positive().default(50_000),
  WITHDRAWAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  WITHDRAWAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  FEATURE_AGGREGATED_BALANCE_SUM: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
      return false;
    }),
  FEATURE_ATOMIC_BALANCE: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
      return false;
    }),
  FEATURE_DISTRIBUTED_LOCK: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
      return false;
    }),
  FEATURE_BULLMQ_JOBS: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
      return false;
    }),
  FEATURE_REDIS_SOCKET_ADAPTER: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
      return false;
    }),
});

export interface AppEnv extends Omit<z.infer<typeof rawEnvSchema>, 'MONGODB_URI' | 'PROOF_ALLOWED_MIME_TYPES'> {
  MONGODB_URI: string;
  allowedOrigins: string[];
  proofAllowedMimeTypes: string[];
}

let cachedEnv: AppEnv | null = null;

function resolveAllowedOrigins(value?: string): string[] {
  const defaults = ['http://localhost:3000', 'http://localhost:5173'];
  const origins = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return origins && origins.length > 0 ? origins : defaults;
}

function resolveProofAllowedMimeTypes(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function hasMongoDatabaseName(uri: string): boolean {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const slashIndex = withoutProtocol.indexOf('/');
  if (slashIndex < 0) {
    return false;
  }

  const databaseName = withoutProtocol
    .slice(slashIndex + 1)
    .split('?')[0] ?? ''
    .trim();

  return databaseName.length > 0;
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = rawEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '));
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long in production');
  }

  const mongoUri = parsed.data.MONGODB_URI ?? (
    parsed.data.NODE_ENV === 'production'
      ? (() => {
          throw new Error('MONGODB_URI must be explicitly configured in production');
        })()
      : 'mongodb://127.0.0.1:27017/4real'
  );

  if (!hasMongoDatabaseName(mongoUri)) {
    throw new Error('MONGODB_URI must include an explicit database name (for example /4real)');
  }

  cachedEnv = {
    ...parsed.data,
    MONGODB_URI: mongoUri,
    allowedOrigins: resolveAllowedOrigins(parsed.data.ALLOWED_ORIGINS),
    proofAllowedMimeTypes: resolveProofAllowedMimeTypes(parsed.data.PROOF_ALLOWED_MIME_TYPES),
  };

  return cachedEnv;
}

export function getTrustProxySetting(): boolean | number | string | undefined {
  const value = getEnv().TRUST_PROXY;

  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);

  return value;
}

export function getPublicAppOrigin(): string {
  const env = getEnv();

  if (env.PUBLIC_APP_ORIGIN) {
    return new URL(env.PUBLIC_APP_ORIGIN).origin;
  }

  if (env.VITE_TON_MANIFEST_URL) {
    return new URL(env.VITE_TON_MANIFEST_URL).origin;
  }

  if (env.NODE_ENV !== 'production') {
    return env.allowedOrigins[0] ?? `http://localhost:${env.PORT}`;
  }

  throw new Error('PUBLIC_APP_ORIGIN or VITE_TON_MANIFEST_URL must be configured in production');
}

export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}

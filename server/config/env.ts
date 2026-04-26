import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().trim().optional(),
  JWT_SECRET: z.string().trim().min(1),
  ALLOWED_ORIGINS: z.string().optional(),
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
  TELEGRAM_BOT_TOKEN: z.string().trim().optional(),
  TELEGRAM_PROOF_CHANNEL_ID: z.string().trim().optional(),
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
  WAITING_ROOM_TTL_MS: z.coerce.number().int().positive().default(900_000),
  ACTIVE_ROOM_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  COMPLETED_ROOM_TTL_MS: z.coerce.number().int().positive().default(600_000),
  ROOM_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  MATCH_WAITING_EXPIRY_MS: z.coerce.number().int().positive().default(900_000),
  MATCH_ACTIVE_INACTIVITY_MS: z.coerce.number().int().positive().default(900_000),
  TRUST_PROXY: z.string().trim().optional(),
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

export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}

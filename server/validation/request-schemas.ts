import { Address } from '@ton/ton';
import { z } from 'zod';

import { getEnv } from '../config/env.ts';

const positiveMoneySchema = z.coerce
  .number()
  .finite()
  .positive('Amount must be greater than 0');
const passwordSchema = z.string().min(12, 'Password must be at least 12 characters long').max(128);
const emailSchema = z.string().trim().email();
const usernameSchema = z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Username must contain only letters, numbers, underscores, or hyphens');
const turnstileTokenSchema = z.string().trim().min(1).optional();

export const registerRequestSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: turnstileTokenSchema,
});

export const loginPasswordRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  turnstileToken: turnstileTokenSchema,
});

export const magicLinkRequestSchema = z.object({
  email: emailSchema,
  redirectTo: z.string().trim().max(2048).optional(),
  turnstileToken: turnstileTokenSchema,
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: turnstileTokenSchema,
});

export const passwordResetRequestSchema = z.object({
  token: z.string().trim().min(1),
  password: passwordSchema,
});

export const emailVerificationResendRequestSchema = z.object({
  email: emailSchema,
});

export const mfaChallengeRequestSchema = z
  .object({
    challengeId: z.string().trim().min(1),
    code: z.string().trim().optional(),
    recoveryCode: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.code && !value.recoveryCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a TOTP code or recovery code',
        path: ['code'],
      });
    }
  });

export const mfaTotpVerifyRequestSchema = z.object({
  setupToken: z.string().trim().min(1),
  code: z.string().trim().length(6),
});

export const mfaDisableRequestSchema = z
  .object({
    code: z.string().trim().optional(),
    recoveryCode: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.code && !value.recoveryCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a TOTP code or recovery code',
        path: ['code'],
      });
    }
  });

export const completeProfileRequestSchema = z.object({
  username: usernameSchema,
});

export const createMatchRequestSchema = z.object({
  wager: z.coerce.number().finite().min(0).max(100_000).default(0),
  isPrivate: z.boolean().optional().default(false),
});

export const createOrderRequestSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  amount: positiveMoneySchema,
  transactionCode: z.string().trim().min(1).optional(),
});

export const updateOrderStatusRequestSchema = z.object({
  status: z.enum(['PENDING', 'DONE', 'REJECTED']),
});

export const updateMerchantConfigRequestSchema = z.object({
  mpesaNumber: z.string().trim().min(1).optional(),
  walletAddress: z.string().trim().min(1).optional(),
  instructions: z.string().trim().min(1).optional(),
  buyRateKesPerUsdt: positiveMoneySchema.optional(),
  sellRateKesPerUsdt: positiveMoneySchema.optional(),
}).superRefine((value, ctx) => {
  if (
    value.mpesaNumber === undefined
    && value.walletAddress === undefined
    && value.instructions === undefined
    && value.buyRateKesPerUsdt === undefined
    && value.sellRateKesPerUsdt === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide at least one merchant config field',
      path: ['mpesaNumber'],
    });
  }
});

export const merchantDepositReconcileRequestSchema = z.object({
  action: z.enum(['credit', 'dismiss']),
  userId: z.string().trim().min(1).optional(),
  note: z.string().trim().max(500).optional(),
});

export const merchantDepositReplayWindowRequestSchema = z.object({
  sinceUnixTime: z.coerce.number().finite().int().nonnegative(),
  untilUnixTime: z.coerce.number().finite().int().nonnegative(),
  dryRun: z.coerce.boolean().optional().default(true),
});

export const withdrawRequestSchema = z.object({
  toAddress: z.string().trim().min(1).refine(
    (value) => {
      try {
        Address.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid TON address format' },
  ),
  amountUsdt: positiveMoneySchema.refine(
    (value) => value <= getEnv().MAX_WITHDRAWAL_USDT,
    { message: 'Amount exceeds maximum withdrawal limit' },
  ),
});

export const prepareTonConnectDepositRequestSchema = z.object({
  memo: z.string().trim().min(1),
  walletAddress: z.string().trim().min(1),
  amountUsdt: positiveMoneySchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginPasswordRequest = z.infer<typeof loginPasswordRequestSchema>;
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type EmailVerificationResendRequest = z.infer<typeof emailVerificationResendRequestSchema>;
export type MfaChallengeRequest = z.infer<typeof mfaChallengeRequestSchema>;
export type MfaTotpVerifyRequest = z.infer<typeof mfaTotpVerifyRequestSchema>;
export type MfaDisableRequest = z.infer<typeof mfaDisableRequestSchema>;
export type CompleteProfileRequest = z.infer<typeof completeProfileRequestSchema>;
export type CreateMatchRequest = z.infer<typeof createMatchRequestSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusRequestSchema>;
export type UpdateMerchantConfigRequest = z.infer<typeof updateMerchantConfigRequestSchema>;
export type MerchantDepositReconcileRequest = z.infer<typeof merchantDepositReconcileRequestSchema>;
export type MerchantDepositReplayWindowRequest = z.infer<typeof merchantDepositReplayWindowRequestSchema>;
export type WithdrawRequest = z.infer<typeof withdrawRequestSchema>;
export type PrepareTonConnectDepositRequest = z.infer<typeof prepareTonConnectDepositRequestSchema>;

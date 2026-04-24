import { z } from 'zod';

const positiveMoneySchema = z.coerce
  .number()
  .finite()
  .positive('Amount must be greater than 0');

const httpUrlSchema = z.string().trim().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Proof URL must use http or https');

export const registerRequestSchema = z.object({
  username: z.string().trim().min(3).max(32),
  email: z.string().trim().email().optional(),
  password: z.string().min(6).max(128),
});

export const loginRequestSchema = z
  .object({
    email: z.string().trim().email().optional(),
    username: z.string().trim().min(1).optional(),
    identifier: z.string().trim().min(1).optional(),
    password: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.username && !value.identifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide an email or username',
        path: ['identifier'],
      });
    }
  });

export const createMatchRequestSchema = z.object({
  wager: z.coerce.number().finite().min(0).max(100_000).default(0),
  isPrivate: z.boolean().optional().default(false),
});

export const createOrderRequestSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  amount: positiveMoneySchema,
  proofImageUrl: httpUrlSchema,
});

export const updateOrderStatusRequestSchema = z.object({
  status: z.enum(['PENDING', 'DONE', 'REJECTED']),
});

export const withdrawRequestSchema = z.object({
  toAddress: z.string().trim().min(1),
  amountUsdt: positiveMoneySchema,
});

export const prepareTonConnectDepositRequestSchema = z.object({
  memo: z.string().trim().min(1),
  walletAddress: z.string().trim().min(1),
  amountUsdt: positiveMoneySchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CreateMatchRequest = z.infer<typeof createMatchRequestSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusRequestSchema>;
export type WithdrawRequest = z.infer<typeof withdrawRequestSchema>;
export type PrepareTonConnectDepositRequest = z.infer<typeof prepareTonConnectDepositRequestSchema>;

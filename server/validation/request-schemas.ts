import { z } from 'zod';

const positiveMoneySchema = z.coerce
  .number()
  .finite()
  .positive('Amount must be greater than 0');
const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long')
  .max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number');

export const registerRequestSchema = z.object({
  username: z.string().trim().min(3).max(32),
  email: z.string().trim().email().optional(),
  password: passwordSchema,
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
export type UpdateMerchantConfigRequest = z.infer<typeof updateMerchantConfigRequestSchema>;
export type WithdrawRequest = z.infer<typeof withdrawRequestSchema>;
export type PrepareTonConnectDepositRequest = z.infer<typeof prepareTonConnectDepositRequestSchema>;

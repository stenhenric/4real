import { z } from 'zod';

const toncenterForwardPayloadSchema = z.object({
  comment: z.string().optional(),
}).strict();

export const toncenterJettonTransferSchema = z.object({
  transaction_hash: z.string(),
  transaction_now: z.number().int().nonnegative(),
  comment: z.string().optional(),
  jetton_master: z.string().nullable().optional(),
  amount: z.union([z.string(), z.number()]),
  source: z.string().nullable().optional(),
  source_owner: z.string().nullable().optional(),
  source_wallet: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  decoded_forward_payload: z.union([
    toncenterForwardPayloadSchema,
    z.array(toncenterForwardPayloadSchema),
    z.null(),
  ]).optional(),
  transaction_aborted: z.boolean().nullable().optional(),
  aborted: z.boolean().nullable().optional(),
}).strict();

export const toncenterTransferListSchema = z.object({
  jetton_transfers: z.array(toncenterJettonTransferSchema),
}).strict();

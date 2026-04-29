import { z } from 'zod';

const toncenterForwardPayloadSchema = z.object({
  comment: z.string().optional(),
}).passthrough();

function normalizeDecodedForwardPayload(
  value: unknown,
): z.infer<typeof toncenterForwardPayloadSchema> | Array<z.infer<typeof toncenterForwardPayloadSchema>> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return { comment: value };
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const parsed = toncenterForwardPayloadSchema.safeParse(entry);
        if (!parsed.success) {
          return null;
        }

        return parsed.data;
      })
      .filter((entry): entry is z.infer<typeof toncenterForwardPayloadSchema> => entry !== null);
  }

  const parsed = toncenterForwardPayloadSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  return null;
}

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
  decoded_forward_payload: z.unknown()
    .transform((value) => normalizeDecodedForwardPayload(value))
    .optional(),
  transaction_aborted: z.boolean().nullable().optional(),
  aborted: z.boolean().nullable().optional(),
}).passthrough();

export const toncenterTransferListSchema = z.object({
  jetton_transfers: z.array(toncenterJettonTransferSchema),
}).passthrough();

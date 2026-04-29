import { z } from 'zod';

export const toncenterJettonWalletBalanceSchema = z.object({
  jetton_wallets: z.array(
    z.object({
      balance: z.union([z.string(), z.number()]).optional(),
    }).passthrough(),
  ),
}).passthrough();

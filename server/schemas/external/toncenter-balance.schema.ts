import { z } from 'zod';

export const toncenterJettonWalletBalanceSchema = z.looseObject({
  jetton_wallets: z.array(
    z.looseObject({
      balance: z.union([z.string(), z.number()]).optional(),
    }),
  ),
});

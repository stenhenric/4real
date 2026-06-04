import { z } from 'zod';

export const telegramSendPhotoResponseSchema = z.looseObject({
  ok: z.boolean(),
  description: z.string().optional(),
  result: z.object({
    message_id: z.number().int(),
    chat: z.looseObject({
      id: z.union([z.number(), z.string()]),
      username: z.string().optional(),
    }),
  }).optional(),
});

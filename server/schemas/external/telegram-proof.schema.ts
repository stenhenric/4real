import { z } from 'zod';

export const telegramSendPhotoResponseSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
  result: z.object({
    message_id: z.number().int(),
    chat: z.object({
      id: z.union([z.number(), z.string()]),
      username: z.string().optional(),
    }).strict(),
  }).optional(),
}).strict();

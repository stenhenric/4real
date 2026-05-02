import { getEnv } from '../config/env.ts';
import type { TelegramOrderProof } from '../models/Order.ts';
import { parseExternalResponse } from '../schemas/external/parse-external-response.ts';
import { telegramSendPhotoResponseSchema } from '../schemas/external/telegram-proof.schema.ts';
import { createDependencyHttpError, runProtectedDependencyCall } from './dependency-resilience.service.ts';
import { serviceUnavailable } from '../utils/http-error.ts';

function buildTelegramMessageUrl(chatId: string, messageId: string, username?: string): string {
  if (username) {
    return `https://t.me/${username}/${messageId}`;
  }

  if (chatId.startsWith('-100')) {
    return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  }

  if (chatId.startsWith('-')) {
    return `https://t.me/c/${chatId.slice(1)}/${messageId}`;
  }

  return `https://t.me/c/${chatId}/${messageId}`;
}

export async function relayOrderProofToTelegram(params: {
  orderType: 'BUY' | 'SELL';
  amount: number;
  fiatCurrency: 'KES';
  exchangeRate: number;
  fiatTotal: number;
  transactionCode: string;
  username: string;
  userId: string;
  mimeType: string;
  filename: string;
  fileBytes: Buffer;
}): Promise<TelegramOrderProof> {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_PROOF_CHANNEL_ID) {
    throw serviceUnavailable(
      'Telegram proof relay is not configured',
      'TELEGRAM_PROOF_RELAY_NOT_CONFIGURED',
    );
  }

  const caption = [
    `4real merchant proof`,
    `Type: ${params.orderType}`,
    `Amount: ${params.amount.toFixed(2)} USDT`,
    `Rate: ${params.exchangeRate.toFixed(2)} ${params.fiatCurrency}/USDT`,
    `Fiat total: ${params.fiatTotal.toFixed(2)} ${params.fiatCurrency}`,
    `M-Pesa code: ${params.transactionCode}`,
    `User: ${params.username}`,
    `User ID: ${params.userId}`,
    `Submitted at: ${new Date().toISOString()}`,
  ].join('\n');

  const form = new FormData();
  form.set('chat_id', env.TELEGRAM_PROOF_CHANNEL_ID);
  form.set('caption', caption);
  form.set(
    'photo',
    new Blob([new Uint8Array(params.fileBytes)], { type: params.mimeType }),
    params.filename,
  );

  const response = await runProtectedDependencyCall({
    dependency: 'telegram',
    retries: env.TELEGRAM_MAX_RETRIES,
    baseDelayMs: env.TELEGRAM_RETRY_BASE_DELAY_MS,
    operation: async () => {
      const nextResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(env.TELEGRAM_REQUEST_TIMEOUT_MS),
      });

      if (!nextResponse.ok && nextResponse.status !== 400) {
        throw createDependencyHttpError('telegram', nextResponse.status);
      }

      return nextResponse;
    },
  });

  const payload = parseExternalResponse(
    telegramSendPhotoResponseSchema,
    await response.json(),
    'telegram.send_photo',
  );
  if (!response.ok || !payload.ok || !payload.result) {
    throw serviceUnavailable(
      payload.description || 'Telegram proof relay failed',
      'TELEGRAM_PROOF_RELAY_FAILED',
    );
  }

  const chatId = String(payload.result.chat.id);
  const messageId = String(payload.result.message_id);

  return {
    provider: 'telegram',
    chatId,
    messageId,
    url: buildTelegramMessageUrl(chatId, messageId, payload.result.chat.username),
  };
}

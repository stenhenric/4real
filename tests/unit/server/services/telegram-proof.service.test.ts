import assert from 'node:assert/strict';
import test from 'node:test';

import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import { relayOrderProofToTelegram } from '../../../../server/services/telegram-proof.service.ts';

function withTelegramEnv(run: () => Promise<void>) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_PROOF_CHANNEL_ID: process.env.TELEGRAM_PROOF_CHANNEL_ID,
    TELEGRAM_REQUEST_TIMEOUT_MS: process.env.TELEGRAM_REQUEST_TIMEOUT_MS,
    TELEGRAM_MAX_RETRIES: process.env.TELEGRAM_MAX_RETRIES,
    TELEGRAM_RETRY_BASE_DELAY_MS: process.env.TELEGRAM_RETRY_BASE_DELAY_MS,
  };

  process.env.NODE_ENV = 'test';
  process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
  process.env.TELEGRAM_PROOF_CHANNEL_ID = '-1001234567890';
  process.env.TELEGRAM_REQUEST_TIMEOUT_MS = '1000';
  process.env.TELEGRAM_MAX_RETRIES = '0';
  process.env.TELEGRAM_RETRY_BASE_DELAY_MS = '1';
  resetEnvCacheForTests();

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCacheForTests();
  });
}

test('relayOrderProofToTelegram sends compact user-facing proof captions', async (t) => {
  let capturedCaption = '';
  const fetchMock = t.mock.method(globalThis, 'fetch', (async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, 'POST');
    assert.ok(init?.body instanceof FormData);
    capturedCaption = String(init.body.get('caption'));

    return new Response(JSON.stringify({
      ok: true,
      result: {
        message_id: 42,
        chat: {
          id: -1001234567890,
          type: 'channel',
          username: 'proofs',
        },
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch);

  await withTelegramEnv(async () => {
    const proof = await relayOrderProofToTelegram({
      orderType: 'BUY',
      amount: '0.200000',
      fiatCurrency: 'KES',
      exchangeRate: '130.000000',
      fiatTotal: '26.000000',
      transactionCode: 'ABC123',
      username: 'alice',
      userId: 'user-1',
      mimeType: 'image/png',
      filename: 'proof.png',
      fileBytes: Buffer.from('proof-bytes'),
    });

    assert.equal(proof.url, 'https://t.me/proofs/42');
  });

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.match(capturedCaption, /^4real order proof$/m);
  assert.match(capturedCaption, /^BUY order from alice$/m);
  assert.match(capturedCaption, /^Amount: 0\.2 USDT$/m);
  assert.match(capturedCaption, /^Rate: 130 KES\/USDT$/m);
  assert.match(capturedCaption, /^Fiat total: 26 KES$/m);
  assert.match(capturedCaption, /^M-Pesa code: ABC123$/m);
  assert.match(capturedCaption, /^User ID: user-1$/m);
  assert.match(capturedCaption, /^Submitted: /m);
  assert.doesNotMatch(capturedCaption, /0\.200000|130\.000000|26\.000000/);
  assert.doesNotMatch(capturedCaption, /Submitted at:/);
});

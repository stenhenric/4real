import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRawMessage,
  resetGmailServiceDependenciesForTests,
  sendEmail,
  setGmailServiceDependenciesForTests,
} from './gmailService.ts';

test('buildRawMessage encodes multipart alternative content and attachments as base64url', () => {
  const raw = buildRawMessage({
    from: 'botandbag@gmail.com',
    to: 'alice@example.com',
    subject: 'Verify your 4real account',
    text: 'Plain body',
    html: '<p>Plain body</p>',
    attachments: [
      {
        filename: 'hello.txt',
        contentType: 'text/plain',
        content: Buffer.from('attachment-body', 'utf8'),
      },
    ],
  });

  const decoded = Buffer.from(raw, 'base64url').toString('utf8');

  assert.match(decoded, /Content-Type: multipart\/mixed;/i);
  assert.match(decoded, /Content-Type: multipart\/alternative;/i);
  assert.match(decoded, /Content-Type: text\/html; charset=utf-8/i);
  assert.match(decoded, /Content-Disposition: attachment; filename="hello.txt"/i);
  assert.doesNotMatch(raw, /\+/);
  assert.doesNotMatch(raw, /\//);
});

test('sendEmail retries transient Gmail failures and only logs the recipient domain', async () => {
  const sendAttempts: string[] = [];
  const infoCalls: Array<Record<string, unknown>> = [];
  const warnCalls: Array<Record<string, unknown>> = [];

  setGmailServiceDependenciesForTests({
    sendRawMessage: async (_client, raw) => {
      sendAttempts.push(raw);
      if (sendAttempts.length === 1) {
        const error = new Error('backend failure') as Error & {
          code?: number;
          errors?: Array<{ reason?: string }>;
        };
        error.code = 503;
        error.errors = [{ reason: 'backendError' }];
        throw error;
      }

      return { id: 'gmail-message-123' };
    },
    sleep: async () => undefined,
    logger: {
      info: (_message: string, context?: Record<string, unknown>) => {
        if (context) {
          infoCalls.push(context);
        }
      },
      warn: (_message: string, context?: Record<string, unknown>) => {
        if (context) {
          warnCalls.push(context);
        }
      },
      error: () => undefined,
      debug: () => undefined,
      fatal: () => undefined,
      child: () => ({
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
        fatal: () => undefined,
        child: () => {
          throw new Error('child logger recursion not expected in test');
        },
      }),
    },
  });

  try {
    await sendEmail({
      emailType: 'notification',
      to: 'alice@example.com',
      subject: 'Subject line',
      text: 'Highly sensitive body',
      html: '<p>Highly sensitive body</p>',
    });
  } finally {
    resetGmailServiceDependenciesForTests();
  }

  assert.equal(sendAttempts.length, 2);
  assert.equal(warnCalls.length, 1);
  assert.equal(infoCalls.length, 1);
  assert.equal(warnCalls[0]?.recipientDomain, 'example.com');
  assert.equal(infoCalls[0]?.recipientDomain, 'example.com');
  assert.equal(infoCalls[0]?.gmailMessageId, 'gmail-message-123');
  assert.doesNotMatch(JSON.stringify({ infoCalls, warnCalls }), /alice@example\.com/i);
  assert.doesNotMatch(JSON.stringify({ infoCalls, warnCalls }), /Highly sensitive body/i);
});

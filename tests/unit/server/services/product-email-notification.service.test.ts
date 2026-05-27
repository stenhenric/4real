import assert from 'node:assert/strict';
import test from 'node:test';

import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import { SYSTEM_COMMISSION_ACCOUNT_ID, User } from '../../../../server/models/User.ts';
import {
  ProductEmailNotificationService,
  resetProductEmailNotificationDependenciesForTests,
  setProductEmailNotificationDependenciesForTests,
} from '../../../../server/services/product-email-notification.service.ts';
import { UserService } from '../../../../server/services/user.service.ts';

type LogEntry = {
  level: string;
  message: string;
  context?: Record<string, unknown>;
};

function createTestLogger(logs: LogEntry[]) {
  return {
    debug: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'debug', message, context }),
    info: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'info', message, context }),
    warn: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'warn', message, context }),
    error: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'error', message, context }),
    fatal: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'fatal', message, context }),
    child: () => createTestLogger(logs),
  };
}

function withProductEmailEnv(run: () => Promise<void> | void) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };

  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_APP_ORIGIN = 'http://127.0.0.1:3000';
  process.env.GOOGLE_CLIENT_ID = 'gmail-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'gmail-client-secret';
  process.env.GOOGLE_REFRESH_TOKEN = 'gmail-refresh-token';
  process.env.GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3000/api/internal/gmail/oauth2/callback';
  process.env.EMAIL_FROM = 'botandbag@gmail.com';
  resetEnvCacheForTests();

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetProductEmailNotificationDependenciesForTests();
    resetEnvCacheForTests();
  });
}

test('findVerifiedMerchantEmailRecipients requires verified admins with a present emailVerifiedAt value', async (t) => {
  let capturedFilter: Record<string, any> | undefined;

  const findMock = t.mock.method(User, 'find', ((filter: Record<string, any>) => {
    capturedFilter = filter;

    return {
      select: (projection: string) => {
        assert.equal(projection, '_id email username');

        return {
          lean: async () => [
            { _id: 'admin-1', email: 'ops@example.com', username: 'ops' },
          ],
        };
      },
    };
  }) as any);

  const recipients = await UserService.findVerifiedMerchantEmailRecipients();

  assert.equal(findMock.mock.callCount(), 1);
  assert.deepEqual(capturedFilter?.emailVerifiedAt, { $exists: true, $ne: null });
  assert.equal(capturedFilter?.isAdmin, true);
  assert.equal(capturedFilter?._id?.$ne?.toString(), SYSTEM_COMMISSION_ACCOUNT_ID);
  assert.deepEqual(recipients, [{ id: 'admin-1', email: 'ops@example.com', username: 'ops' }]);
});

test('sendOrderCreated skips unverified user but sends merchant notification to verified admins excluding system account', async () => {
  const sent: Array<{ to: string; subject: string; text: string; html?: string }> = [];
  const logs: LogEntry[] = [];

  await withProductEmailEnv(async () => {
    setProductEmailNotificationDependenciesForTests({
      findUserById: async () => ({
        id: 'user-1',
        email: 'alice@example.com',
        username: 'alice',
        emailVerifiedAt: null,
      }),
      findVerifiedMerchantEmailRecipients: async () => [
        { id: 'admin-1', email: 'ops@example.com', username: 'ops' },
        { id: SYSTEM_COMMISSION_ACCOUNT_ID, email: 'commission@example.com', username: 'system_commission' },
      ],
      sendNotificationEmail: async (message) => {
        sent.push(message);
      },
      logger: createTestLogger(logs),
    });

    await ProductEmailNotificationService.sendOrderCreated({
      userId: 'user-1',
      orderId: 'order-123',
      orderType: 'BUY',
      amountUsdt: '12.500000',
    });
  });

  assert.deepEqual(sent.map((message) => message.to), ['ops@example.com']);
  assert.match(sent[0]?.text ?? '', /needs merchant review/i);
  assert.match(sent[0]?.html ?? '', /4real/i);
  assert.equal(sent[0]?.text.includes('order_created_merchant'), false);
  assert.equal(sent.some((message) => message.to === 'commission@example.com'), false);

  const skipLog = logs.find((entry) => entry.message === 'product_email.user_notification_skipped');
  assert.equal(skipLog?.context?.scenario, 'order_created_user');
  assert.equal(skipLog?.context?.reason, 'email_unverified');
});

test('sendWithdrawalQueued does not send queued withdrawal emails', async () => {
  const sent: Array<{ to: string; subject: string; text: string; html?: string }> = [];
  const logs: LogEntry[] = [];

  await withProductEmailEnv(async () => {
    setProductEmailNotificationDependenciesForTests({
      findUserById: async () => {
        throw new Error('queued withdrawal should not load the user');
      },
      sendNotificationEmail: async (message) => {
        sent.push(message);
      },
      logger: createTestLogger(logs),
    });

    await ProductEmailNotificationService.sendWithdrawalQueued({
      userId: 'user-2',
      withdrawalId: 'withdrawal-123',
      amountUsdt: '5.000000',
      toAddress: 'EQDdestination',
    });
  });

  assert.equal(sent.length, 0);
  assert.equal(logs.length, 0);
});

test('sendWithdrawalTransition uses the customer bank page instead of API status URLs', async () => {
  const sent: Array<{ to: string; subject: string; text: string; html?: string }> = [];

  await withProductEmailEnv(async () => {
    setProductEmailNotificationDependenciesForTests({
      findUserById: async () => ({
        id: 'user-withdrawal',
        email: 'withdrawal.user@example.com',
        username: 'withdrawal',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      sendNotificationEmail: async (message) => {
        sent.push(message);
      },
    });

    await ProductEmailNotificationService.sendWithdrawalTransition({
      scenario: 'withdrawal_sent_user',
      userId: 'user-withdrawal',
      withdrawalId: 'withdrawal-link',
      amountUsdt: '5.000000',
      toAddress: 'EQDdestination',
      statusUrl: '/api/transactions/withdrawals/withdrawal-link',
    });
  });

  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? '', /View withdrawal\nhttp:\/\/127\.0\.0\.1:3000\/bank/);
  assert.doesNotMatch(sent[0]?.text ?? '', /\/api\/transactions\/withdrawals/);
  assert.doesNotMatch(sent[0]?.html ?? '', /\/api\/transactions\/withdrawals/);
});

test('sendDeposit routes merchant scenarios to admins and user scenarios to verified user', async () => {
  const sent: Array<{ to: string; text: string; html?: string }> = [];

  await withProductEmailEnv(async () => {
    setProductEmailNotificationDependenciesForTests({
      findUserById: async () => ({
        id: 'user-3',
        email: 'carol@example.com',
        username: 'carol',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      findVerifiedMerchantEmailRecipients: async () => [
        { id: 'admin-1', email: 'merchant@example.com', username: 'merchant' },
      ],
      sendNotificationEmail: async (message) => {
        sent.push({ to: message.to, text: message.text, html: message.html });
      },
    });

    await ProductEmailNotificationService.sendDeposit({
      scenario: 'deposit_unmatched_merchant',
      txHash: 'tx-123',
      amountUsdt: '20.000000',
      memoStatus: 'missing',
    });
    await ProductEmailNotificationService.sendDeposit({
      scenario: 'deposit_confirmed_user',
      userId: 'user-3',
      txHash: 'tx-456',
      amountUsdt: '21.000000',
      memoStatus: 'active',
    });
  });

  assert.deepEqual(sent.map((message) => message.to), ['merchant@example.com', 'carol@example.com']);
  assert.match(sent[0]?.text ?? '', /needs merchant review/i);
  assert.match(sent[1]?.text ?? '', /credited to your 4real balance/i);
  assert.match(sent[1]?.html ?? '', /4real/i);
  assert.equal(sent[0]?.text.includes('deposit_unmatched_merchant'), false);
  assert.equal(sent[1]?.text.includes('deposit_confirmed_user'), false);
});

test('sendSecurityAlert delivers branded HTML without exposing developer fields', async () => {
  const sent: Array<{ to: string; subject: string; text: string; html?: string }> = [];

  await withProductEmailEnv(async () => {
    setProductEmailNotificationDependenciesForTests({
      findUserById: async () => ({
        id: 'user-security',
        email: 'security@example.com',
        username: 'security',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      sendNotificationEmail: async (message) => {
        sent.push(message);
      },
    });

    await ProductEmailNotificationService.sendSecurityAlert({
      userId: 'user-security',
      subject: 'Your 4real recovery codes were regenerated',
      summary: 'Your MFA recovery codes were regenerated. If this was not you, reset your password and review your active sessions.',
    });
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, 'security@example.com');
  assert.match(sent[0]?.text ?? '', /reset your password/i);
  assert.match(sent[0]?.html ?? '', /4real/i);
  assert.match(sent[0]?.html ?? '', /background:#F2EFE9/);
  assert.doesNotMatch(sent[0]?.text ?? '', /security_alert_user/);
  assert.doesNotMatch(sent[0]?.html ?? '', /security_alert_user/);
});

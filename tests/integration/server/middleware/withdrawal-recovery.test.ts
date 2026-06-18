import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import express, { type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import { once } from 'node:events';
import mongoose from 'mongoose';

import { getAuthCookieName } from '../../../../server/config/cookies.ts';
import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import { authenticateToken, requireAdmin, requireMfaStepUp, requireVerifiedAccount } from '../../../../server/middleware/auth.middleware.ts';
import { errorHandler } from '../../../../server/middleware/error.middleware.ts';
import { validateBody } from '../../../../server/middleware/validate.middleware.ts';
import { WithdrawalRecoveryController } from '../../../../server/controllers/withdrawal-recovery.controller.ts';
import { withdrawalRecoveryRequestSchema } from '../../../../server/validation/request-schemas.ts';
import { WithdrawalRepository } from '../../../../server/repositories/withdrawal.repository.ts';
import { WithdrawalDailyLimitRepository } from '../../../../server/repositories/withdrawal-daily-limit.repository.ts';
import { ProcessedTransactionRepository } from '../../../../server/repositories/processed-transaction.repository.ts';
import { UserBalanceRepository } from '../../../../server/repositories/user-balance.repository.ts';
import { AuthMfaService } from '../../../../server/services/auth-mfa.service.ts';
import { AuthSessionService } from '../../../../server/services/auth-session.service.ts';
import { AuditService } from '../../../../server/services/audit.service.ts';
import { ProductEmailNotificationService } from '../../../../server/services/product-email-notification.service.ts';
import { TransactionService } from '../../../../server/services/transaction.service.ts';
import { setHotWalletRuntimeForTests } from '../../../../server/services/hot-wallet-runtime.service.ts';
import {
  recoverStuckWithdrawal,
  resetWithdrawalRecoveryDependenciesForTests,
  setWithdrawalRecoveryDependenciesForTests,
} from '../../../../server/services/withdrawal-recovery.service.ts';
import { unauthorized } from '../../../../server/utils/http-error.ts';
import type { AuthenticatedPrincipalDTO } from '../../../../server/types/api.ts';

const HOT_WALLET_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
const HOT_JETTON_WALLET = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

function principal(overrides: Partial<AuthenticatedPrincipalDTO> = {}): AuthenticatedPrincipalDTO {
  return {
    id: 'user-1',
    sessionId: 'session-user',
    deviceId: 'device-user',
    isAdmin: false,
    emailVerified: true,
    usernameComplete: true,
    mfaEnabled: true,
    ...overrides,
  };
}

function createSessionMock() {
  return {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };
}

function registerCleanup(t: TestContext) {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  resetEnvCacheForTests();
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  t.after(() => {
    resetWithdrawalRecoveryDependenciesForTests();
    setHotWalletRuntimeForTests(null);
  });
}

function stuckWithdrawal(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'withdrawal-doc-1',
    withdrawalId: 'wd-stuck-1',
    userId: 'user-1',
    toAddress: HOT_WALLET_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'stuck' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    retries: 0,
    sentAt: new Date('2026-01-01T00:10:00.000Z'),
    seqno: 42,
    ...overrides,
  };
}

test('admin recovery confirms a stuck withdrawal after an on-chain match', async (t) => {
  registerCleanup(t);

  const findMock = mock.method(WithdrawalRepository, 'findByWithdrawalId', async () => stuckWithdrawal());
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const markConfirmedMock = mock.method(WithdrawalRepository, 'markConfirmed', async () => true);
  const recordConfirmedMock = mock.method(UserBalanceRepository, 'recordWithdrawalConfirmed', async () => {});
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  setWithdrawalRecoveryDependenciesForTests({
    findWithdrawalTransferOnChain: async () => ({
      txHash: 'chain-hash-1',
      confirmedAt: new Date('2026-01-01T00:15:00.000Z'),
    }),
  });

  t.after(() => findMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => markConfirmedMock.mock.restore());
  t.after(() => recordConfirmedMock.mock.restore());
  t.after(() => auditMock.mock.restore());
  t.after(() => transitionMock.mock.restore());

  const result = await recoverStuckWithdrawal({
    withdrawalId: 'wd-stuck-1',
    action: 'confirm',
    actorUserId: 'admin-1',
  });

  assert.equal(result.status, 'confirmed');
  assert.equal(result.txHash, 'chain-hash-1');
  assert.equal(processedCreateMock.mock.callCount(), 1);
  assert.equal(markConfirmedMock.mock.callCount(), 1);
  assert.equal(recordConfirmedMock.mock.callCount(), 1);
  assert.equal(auditMock.mock.calls[0].arguments[0]?.actorUserId, 'admin-1');
  assert.equal(transitionMock.mock.calls[0].arguments[0]?.scenario, 'withdrawal_confirmed_user');
});

test('admin recovery confirmation does not record accounting when terminal transition fails', async (t) => {
  registerCleanup(t);

  const findMock = mock.method(WithdrawalRepository, 'findByWithdrawalId', async () => stuckWithdrawal());
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const markConfirmedMock = mock.method(WithdrawalRepository, 'markConfirmed', async () => false);
  const recordConfirmedMock = mock.method(UserBalanceRepository, 'recordWithdrawalConfirmed', async () => {});
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  setWithdrawalRecoveryDependenciesForTests({
    findWithdrawalTransferOnChain: async () => ({
      txHash: 'chain-hash-race',
      confirmedAt: new Date('2026-01-01T00:15:00.000Z'),
    }),
  });

  t.after(() => findMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => markConfirmedMock.mock.restore());
  t.after(() => recordConfirmedMock.mock.restore());
  t.after(() => auditMock.mock.restore());
  t.after(() => transitionMock.mock.restore());

  await assert.rejects(
    recoverStuckWithdrawal({
      withdrawalId: 'wd-stuck-1',
      action: 'confirm',
      actorUserId: 'admin-1',
    }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 409);
      assert.equal((error as { code?: string }).code, 'WITHDRAWAL_RECOVERY_STATE_CHANGED');
      return true;
    },
  );

  assert.equal(markConfirmedMock.mock.callCount(), 1);
  assert.equal(processedCreateMock.mock.callCount(), 0);
  assert.equal(recordConfirmedMock.mock.callCount(), 0);
  assert.equal(auditMock.mock.callCount(), 0);
  assert.equal(transitionMock.mock.callCount(), 0);
});

test('admin recovery refunds a stuck withdrawal only after no on-chain match is found', async (t) => {
  registerCleanup(t);

  const findMock = mock.method(WithdrawalRepository, 'findByWithdrawalId', async () => stuckWithdrawal());
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const markRefundedMock = mock.method(WithdrawalRepository, 'markStuckRefunded', async () => true);
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});
  const releaseReservationMock = mock.method(WithdrawalDailyLimitRepository, 'releaseReservation', async () => true);
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'refund-tx-1' } as any));
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});
  let chainChecks = 0;
  setWithdrawalRecoveryDependenciesForTests({
    findWithdrawalTransferOnChain: async () => {
      chainChecks += 1;
      return null;
    },
  });

  t.after(() => findMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => markRefundedMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => releaseReservationMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  t.after(() => auditMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());

  const result = await recoverStuckWithdrawal({
    withdrawalId: 'wd-stuck-1',
    action: 'refund',
    actorUserId: 'admin-1',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.refunded, true);
  assert.equal(chainChecks, 1);
  assert.equal(markRefundedMock.mock.callCount(), 1);
  assert.equal(refundMock.mock.callCount(), 1);
  assert.equal(releaseReservationMock.mock.callCount(), 1);
  assert.deepEqual(releaseReservationMock.mock.calls[0].arguments.slice(0, 3), [
    'user-1',
    '2026-01-01',
    '1000000',
  ]);
  assert.equal(createTransactionMock.mock.calls[0].arguments[0]?.type, 'WITHDRAW_REFUND');
  assert.equal(auditMock.mock.calls[0].arguments[0]?.eventType, 'withdrawal_refunded');
  assert.equal(auditMock.mock.calls[0].arguments[0]?.actorUserId, 'admin-1');
  assert.equal(transitionMock.mock.calls[0].arguments[0]?.scenario, 'withdrawal_failed_user');
  assert.equal(merchantAlertMock.mock.calls[0].arguments[0]?.scenario, 'withdrawal_failed_merchant');
});

test('admin recovery fails closed when the chain re-check is unavailable before refund', async (t) => {
  registerCleanup(t);

  const findMock = mock.method(WithdrawalRepository, 'findByWithdrawalId', async () => stuckWithdrawal());
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const markRefundedMock = mock.method(WithdrawalRepository, 'markStuckRefunded', async () => true);
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'refund-tx-1' } as any));
  setWithdrawalRecoveryDependenciesForTests({
    findWithdrawalTransferOnChain: async () => {
      const error = new Error('toncenter rate limited') as Error & { status?: number };
      error.status = 429;
      throw error;
    },
  });

  t.after(() => findMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => markRefundedMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());

  await assert.rejects(
    recoverStuckWithdrawal({
      withdrawalId: 'wd-stuck-1',
      action: 'refund',
      actorUserId: 'admin-1',
    }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 503);
      assert.equal((error as { code?: string }).code, 'WITHDRAWAL_RECOVERY_CHAIN_CHECK_UNAVAILABLE');
      return true;
    },
  );

  assert.equal(startSessionMock.mock.callCount(), 0);
  assert.equal(markRefundedMock.mock.callCount(), 0);
  assert.equal(refundMock.mock.callCount(), 0);
  assert.equal(createTransactionMock.mock.callCount(), 0);
});

test('admin recovery repeated confirm and refund actions are idempotent for terminal states', async (t) => {
  registerCleanup(t);

  const findMock = mock.method(WithdrawalRepository, 'findByWithdrawalId', async (withdrawalId) => {
    if (withdrawalId === 'wd-confirmed') {
      return stuckWithdrawal({
        withdrawalId,
        status: 'confirmed',
        txHash: 'chain-confirmed',
        confirmedAt: new Date('2026-01-01T00:15:00.000Z'),
      });
    }

    return stuckWithdrawal({
      withdrawalId,
      status: 'failed',
      lastError: 'Admin refunded stuck withdrawal after chain re-check found no matching transfer',
    });
  });
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});
  const markConfirmedMock = mock.method(WithdrawalRepository, 'markConfirmed', async () => true);
  const markRefundedMock = mock.method(WithdrawalRepository, 'markStuckRefunded', async () => true);

  t.after(() => findMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => markConfirmedMock.mock.restore());
  t.after(() => markRefundedMock.mock.restore());

  const confirmed = await recoverStuckWithdrawal({
    withdrawalId: 'wd-confirmed',
    action: 'confirm',
    actorUserId: 'admin-1',
  });
  const refunded = await recoverStuckWithdrawal({
    withdrawalId: 'wd-refunded',
    action: 'refund',
    actorUserId: 'admin-1',
  });

  assert.equal(confirmed.idempotent, true);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(refunded.idempotent, true);
  assert.equal(refunded.status, 'failed');
  assert.equal(refundMock.mock.callCount(), 0);
  assert.equal(markConfirmedMock.mock.callCount(), 0);
  assert.equal(markRefundedMock.mock.callCount(), 0);
});

test('admin recovery prevents refund after confirmation and confirmation after refund', async (t) => {
  registerCleanup(t);

  const findMock = mock.method(WithdrawalRepository, 'findByWithdrawalId', async (withdrawalId) => (
    withdrawalId === 'wd-confirmed'
      ? stuckWithdrawal({ withdrawalId, status: 'confirmed', txHash: 'chain-confirmed' })
      : stuckWithdrawal({ withdrawalId, status: 'failed' })
  ));

  t.after(() => findMock.mock.restore());

  await assert.rejects(
    recoverStuckWithdrawal({
      withdrawalId: 'wd-confirmed',
      action: 'refund',
      actorUserId: 'admin-1',
    }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 409);
      assert.equal((error as { code?: string }).code, 'WITHDRAWAL_RECOVERY_ALREADY_CONFIRMED');
      return true;
    },
  );

  await assert.rejects(
    recoverStuckWithdrawal({
      withdrawalId: 'wd-refunded',
      action: 'confirm',
      actorUserId: 'admin-1',
    }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 409);
      assert.equal((error as { code?: string }).code, 'WITHDRAWAL_RECOVERY_ALREADY_REFUNDED');
      return true;
    },
  );
});

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function startRecoveryRouteApp(t: TestContext, params: {
  principals: Record<string, AuthenticatedPrincipalDTO>;
  freshStepUpSessions?: string[];
}) {
  const freshStepUpSessions = new Set(params.freshStepUpSessions ?? []);
  t.mock.method(AuthSessionService, 'validateAccessToken', async (token: string) => {
    const mappedPrincipal = params.principals[token];
    if (!mappedPrincipal) {
      throw unauthorized('Invalid token', 'INVALID_TOKEN');
    }

    return {
      principal: mappedPrincipal,
      sessionDocument: {},
    } as unknown as Awaited<ReturnType<typeof AuthSessionService.validateAccessToken>>;
  });
  t.mock.method(AuthSessionService, 'getMfaStepUpExpiry', async (sessionId: string) => (
    freshStepUpSessions.has(sessionId) ? new Date(Date.now() + 60_000) : null
  ));
  t.mock.method(AuthMfaService, 'createChallenge', async () => 'challenge-step-up');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post(
    '/api/admin/withdrawals/:withdrawalId/recover',
    authenticateToken,
    requireVerifiedAccount,
    requireAdmin,
    requireMfaStepUp,
    validateBody(withdrawalRecoveryRequestSchema),
    asyncRoute(WithdrawalRecoveryController.recover as RequestHandler),
  );
  app.use(errorHandler);

  const server = app.listen(0);
  t.after(() => {
    server.close();
  });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

function authHeaders(token: string) {
  return {
    Cookie: `${getAuthCookieName()}=${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson(response: Response) {
  return response.json() as Promise<{ code?: string; ok?: boolean }>;
}

test('withdrawal recovery admin route rejects non-admin users', async (t) => {
  const baseUrl = await startRecoveryRouteApp(t, {
    principals: {
      user: principal(),
    },
  });

  const response = await fetch(`${baseUrl}/api/admin/withdrawals/wd-stuck-1/recover`, {
    method: 'POST',
    headers: authHeaders('user'),
    body: JSON.stringify({ action: 'refund' }),
  });

  assert.equal(response.status, 403);
  assert.equal((await parseJson(response)).code, 'ADMIN_ACCESS_REQUIRED');
});

test('withdrawal recovery admin route rejects admins without MFA step-up', async (t) => {
  const baseUrl = await startRecoveryRouteApp(t, {
    principals: {
      admin: principal({
        id: 'admin-1',
        sessionId: 'session-admin',
        isAdmin: true,
      }),
    },
  });

  const response = await fetch(`${baseUrl}/api/admin/withdrawals/wd-stuck-1/recover`, {
    method: 'POST',
    headers: authHeaders('admin'),
    body: JSON.stringify({ action: 'refund' }),
  });

  assert.equal(response.status, 403);
  assert.equal((await parseJson(response)).code, 'MFA_REQUIRED');
});

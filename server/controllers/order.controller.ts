import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { ClientSession } from 'mongoose';

import { getEnv, getPublicAppOrigin } from '../config/env.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { serializeOrder } from '../serializers/api.ts';
import { CacheKeys, invalidateCacheKeys } from '../services/cache.service.ts';
import { executeIdempotentMutationV2 } from '../services/idempotency.service.ts';
import { getMerchantConfig } from '../services/merchant-config.service.ts';
import {
  clearMpesaCodeAttempts,
  getMpesaCodeAttemptLock,
  hashMpesaTransactionCode,
  recordFailedMpesaCodeAttempt,
  validateMpesaTransactionCode,
  type MpesaCodeValidationReasonCode,
  type MpesaCodeValidationResult,
} from '../services/mpesa-code-validation.service.ts';
import { OrderService } from '../services/order.service.ts';
import { enqueueOrderProofRelay, settleOrderProofRelay } from '../services/order-proof-relay.service.ts';
import { UserService } from '../services/user.service.ts';
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
import { getRequiredIdempotencyKey } from '../utils/idempotency.ts';
import {
  KES_SCALE,
  RATE_SCALE,
  USDT_SCALE,
  formatKesAmount,
  multiplyScaledAmounts,
  parseRate,
  parseUsdtAmount,
} from '../utils/money.ts';
import { matchesDeclaredImageType, parseMultipartForm } from '../utils/multipart.ts';
import { badRequest, notFound, payloadTooLarge, serviceUnavailable, unsupportedMediaType } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';
import {
  createOrderRequestSchema,
  type UpdateOrderStatusRequest,
} from '../validation/request-schemas.ts';

const MPESA_TRANSACTION_CODE_GENERIC_MESSAGE =
  "We couldn't match this transaction code to the expected payment time. Please check the code and try again.";
const MPESA_TRANSACTION_CODE_LOCKED_MESSAGE =
  'Too many transaction code attempts. Please wait and try again, or contact support for manual review.';

function buildProofStorageKey(params: {
  userId: string;
  requestHash: string;
  checksumSha256: string;
}): string {
  return `order-proofs/${params.userId}/${params.requestHash}/${params.checksumSha256}`;
}

function createMerchantActionUrl(): string {
  return new URL('/merchant/orders', getPublicAppOrigin()).toString();
}

function createMpesaCodeAttemptContext(params: {
  userId: string;
  amount: string;
  fiatCurrency: string;
  fiatTotal: string;
}): string {
  return [
    'mpesa-code',
    params.userId,
    'BUY',
    params.amount,
    params.fiatCurrency,
    params.fiatTotal,
  ].join(':');
}

async function rejectManualMpesaCodeSubmission(params: {
  reasonCode: MpesaCodeValidationReasonCode;
  userId: string;
  requestId?: string | undefined;
  attemptContext: string;
  normalizedCode?: string | undefined;
}): Promise<never> {
  const attemptResult = await recordFailedMpesaCodeAttempt(params.attemptContext);
  const locked = attemptResult.lockedUntil !== undefined;

  logger.warn('mpesa_code.validation_rejected', {
    userId: params.userId,
    requestId: params.requestId,
    reasonCode: params.reasonCode,
    attemptCount: attemptResult.count,
    lockedUntil: attemptResult.lockedUntil?.toISOString(),
    ...(params.normalizedCode ? { mpesaCodeHash: hashMpesaTransactionCode(params.normalizedCode) } : {}),
  });

  throw badRequest(
    locked ? MPESA_TRANSACTION_CODE_LOCKED_MESSAGE : MPESA_TRANSACTION_CODE_GENERIC_MESSAGE,
    locked ? 'MPESA_TRANSACTION_CODE_LOCKED' : 'MPESA_TRANSACTION_CODE_INVALID',
  );
}

export class OrderController {
  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const orders = await OrderService.getOrders(req.user.id);
    res.json(orders.map((order) => serializeOrder(order)));
  }

  static async getMerchantConfig(_req: Request, res: Response): Promise<void> {
    res.json(await getMerchantConfig());
  }

  static async createOrder(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const env = getEnv();
    const userId = req.user.id;
    const idempotencyKey = getRequiredIdempotencyKey(req);
    const { fields, files } = await parseMultipartForm(req, {
      maxBytes: env.PROOF_MAX_BYTES + 64 * 1024,
    });
    const parsedBody = createOrderRequestSchema.parse(fields);
    const merchantConfig = await getMerchantConfig();
    const proofImage = files.proofImage;
    const amountRaw = parseUsdtAmount(parsedBody.amount);
    const rawTransactionCode = fields.transactionCode ?? parsedBody.transactionCode ?? '';
    let mpesaValidation: MpesaCodeValidationResult | undefined;
    let mpesaCodeAttemptContext: string | undefined;

    if (parsedBody.type === 'BUY' && amountRaw < parseUsdtAmount('1')) {
      throw badRequest('Minimum BUY amount is 1 USDT', 'BUY_ORDER_MINIMUM_NOT_MET');
    }

    if (parsedBody.type === 'SELL') {
      if (amountRaw < parseUsdtAmount('2')) {
        throw badRequest('Minimum SELL amount is 2 USDT', 'SELL_ORDER_MINIMUM_NOT_MET');
      }
      if (!parsedBody.mpesaNumber) {
        throw badRequest('M-Pesa phone number is required for SELL orders', 'MPESA_NUMBER_REQUIRED');
      }
      if (!parsedBody.mpesaName) {
        throw badRequest('M-Pesa registered name is required for SELL orders', 'MPESA_NAME_REQUIRED');
      }
    }

    if (parsedBody.type === 'BUY') {
      if (!parsedBody.transactionCode) {
        throw badRequest('Transaction code is required', 'TRANSACTION_CODE_REQUIRED');
      }

      if (!proofImage) {
        throw badRequest('Proof image is required', 'PROOF_IMAGE_REQUIRED');
      }

      if (proofImage.size === 0) {
        throw badRequest('Proof image is empty', 'PROOF_IMAGE_EMPTY');
      }

      if (proofImage.size > env.PROOF_MAX_BYTES) {
        throw payloadTooLarge('Proof image exceeds the configured limit', 'PROOF_IMAGE_TOO_LARGE');
      }

      if (!env.proofAllowedMimeTypes.includes(proofImage.contentType)) {
        throw unsupportedMediaType('Unsupported proof image type', 'UNSUPPORTED_PROOF_IMAGE_TYPE');
      }

      if (!matchesDeclaredImageType(proofImage.contentType, proofImage.data)) {
        throw unsupportedMediaType('Proof image content does not match the declared image type', 'PROOF_IMAGE_SIGNATURE_MISMATCH');
      }
    }

    const exchangeRate = parsedBody.type === 'BUY'
      ? merchantConfig.buyRateKesPerUsdt
      : merchantConfig.sellRateKesPerUsdt;

    if (parseRate(exchangeRate) <= 0n) {
      throw serviceUnavailable('Merchant rate is not configured', 'MERCHANT_RATE_NOT_CONFIGURED');
    }

    const fiatTotal = formatKesAmount(multiplyScaledAmounts({
      leftRaw: amountRaw,
      leftScale: USDT_SCALE,
      rightRaw: parseRate(exchangeRate),
      rightScale: RATE_SCALE,
      resultScale: KES_SCALE,
    }));

    if (parsedBody.type === 'BUY') {
      mpesaCodeAttemptContext = createMpesaCodeAttemptContext({
        userId,
        amount: parsedBody.amount,
        fiatCurrency: merchantConfig.fiatCurrency,
        fiatTotal,
      });

      const existingLock = await getMpesaCodeAttemptLock(mpesaCodeAttemptContext);
      if (existingLock) {
        logger.warn('mpesa_code.validation_rejected', {
          userId,
          requestId: res.locals.requestId,
          reasonCode: 'TOO_MANY_ATTEMPTS',
          attemptCount: existingLock.count,
          lockedUntil: existingLock.lockedUntil?.toISOString(),
        });
        throw badRequest(MPESA_TRANSACTION_CODE_LOCKED_MESSAGE, 'MPESA_TRANSACTION_CODE_LOCKED');
      }

      mpesaValidation = validateMpesaTransactionCode({
        input: rawTransactionCode,
      });

      if (mpesaValidation.status !== 'valid') {
        await rejectManualMpesaCodeSubmission({
          reasonCode: mpesaValidation.reasonCode,
          userId,
          requestId: res.locals.requestId,
          attemptContext: mpesaCodeAttemptContext,
          normalizedCode: mpesaValidation.normalizedCode,
        });
      }
    }

    const user = await UserService.findById(userId);
    if (!user) {
      throw notFound('User not found', 'USER_NOT_FOUND');
    }

    const proofDigest = proofImage
      ? crypto.createHash('sha256').update(proofImage.data).digest('hex')
      : undefined;
    const proofRelay = parsedBody.type === 'BUY' && proofImage
      ? {
          orderType: parsedBody.type,
          amount: parsedBody.amount,
          fiatCurrency: merchantConfig.fiatCurrency,
          exchangeRate,
          fiatTotal,
          transactionCode: mpesaValidation?.normalizedCode ?? parsedBody.transactionCode ?? '',
          username: user.username ?? user.email.split('@')[0] ?? 'player',
          userId: user._id.toString(),
          mimeType: proofImage.contentType,
          filename: proofImage.filename,
          fileBytes: proofImage.data,
        }
      : undefined;
    const result = await executeIdempotentMutationV2({
      userId,
      routeKey: 'orders:create',
      idempotencyKey,
      requestPayload: {
        type: parsedBody.type,
        amount: parsedBody.amount,
        transactionCode: parsedBody.transactionCode,
        transactionCodeNormalized: mpesaValidation?.normalizedCode,
        fiatCurrency: merchantConfig.fiatCurrency,
        exchangeRate,
        fiatTotal,
        proofDigest,
        proofMimeType: proofImage?.contentType,
        mpesaNumber: parsedBody.mpesaNumber,
        mpesaName: parsedBody.mpesaName,
      },
      execute: async ({ requestHash, session }: { requestHash: string; session: ClientSession }) => {
        if (
          parsedBody.type === 'BUY'
          && mpesaValidation
          && env.MPESA_CODE_DUPLICATE_POLICY === 'reject'
        ) {
          const existingOrder = await OrderService.findByNormalizedTransactionCode(
            mpesaValidation.normalizedCode,
            session,
          );
          if (existingOrder) {
            await rejectManualMpesaCodeSubmission({
              reasonCode: 'DUPLICATE_CODE',
              userId,
              requestId: res.locals.requestId,
              attemptContext: mpesaCodeAttemptContext ?? createMpesaCodeAttemptContext({
                userId,
                amount: parsedBody.amount,
                fiatCurrency: merchantConfig.fiatCurrency,
                fiatTotal,
              }),
              normalizedCode: mpesaValidation.normalizedCode,
            });
          }
        }

        const order = await OrderService.createOrder({
          userId: user._id,
          type: parsedBody.type,
          amount: parsedBody.amount,
          ...(proofImage && proofDigest ? {
            proofUpload: {
              checksumSha256: proofDigest,
              mimeType: proofImage.contentType,
              sizeBytes: proofImage.size,
              storageKey: buildProofStorageKey({
                userId: user._id.toString(),
                requestHash,
                checksumSha256: proofDigest,
              }),
              uploaderUserId: user._id,
              createdAt: new Date(),
            },
          } : {}),
          proofRelayQueued: Boolean(proofRelay),
          ...(mpesaValidation ? {
            transactionCode: mpesaValidation.normalizedCode,
            transactionCodeOriginal: rawTransactionCode.trim(),
            transactionCodeNormalized: mpesaValidation.normalizedCode,
            mpesaCodeValidationReason: mpesaValidation.reasonCode,
            ...(mpesaValidation.decodedDate ? { mpesaCodeDecodedDate: mpesaValidation.decodedDate } : {}),
          } : parsedBody.transactionCode ? { transactionCode: parsedBody.transactionCode } : {}),
          ...(parsedBody.mpesaNumber ? { mpesaNumber: parsedBody.mpesaNumber } : {}),
          ...(parsedBody.mpesaName ? { mpesaName: parsedBody.mpesaName } : {}),
          fiatCurrency: merchantConfig.fiatCurrency,
          exchangeRate,
          fiatTotal,
          ...(res.locals.requestId ? { requestId: res.locals.requestId as string } : {}),
          session,
        });

        if (mpesaCodeAttemptContext) {
          await clearMpesaCodeAttempts(mpesaCodeAttemptContext);
        }

        if (proofRelay) {
          await enqueueOrderProofRelay({
            userId: user._id.toString(),
            routeKey: 'orders:create',
            requestHash,
            orderId: order._id.toString(),
            relay: proofRelay,
            session,
          });
        }

        return {
          statusCode: 201,
          body: serializeOrder(order),
        };
      },
    });

    let responseBody = result.body;
    if (proofRelay) {
      try {
        const proof = await settleOrderProofRelay({
          userId: user._id.toString(),
          routeKey: 'orders:create',
          requestHash: result.requestHash,
        });
        if (proof) {
          responseBody = {
            ...responseBody,
            proof,
          };
        }
      } catch (error) {
        logger.error('order.proof_relay_immediate_settlement_failed', {
          userId: user._id.toString(),
          requestHash: result.requestHash,
          error,
        });
      }
    }

    if (!result.replayed) {
      await invalidateCacheKeys([CacheKeys.merchantDashboard()]);
      ProductEmailNotificationService.sendOrderCreated({
        userId: user._id.toString(),
        orderId: responseBody._id,
        orderType: responseBody.type,
        amountUsdt: responseBody.amount,
        username: user.username ?? user.email.split('@')[0] ?? 'player',
        actionUrl: createMerchantActionUrl(),
        ...(responseBody.fiatCurrency ? { fiatCurrency: responseBody.fiatCurrency } : {}),
        ...(responseBody.fiatTotal ? { fiatTotal: responseBody.fiatTotal } : {}),
        ...(responseBody.exchangeRate ? { exchangeRate: responseBody.exchangeRate } : {}),
        ...(responseBody.transactionCode ? { transactionCode: responseBody.transactionCode } : {}),
        ...(responseBody.mpesaNumber ? { mpesaNumber: responseBody.mpesaNumber } : {}),
        ...(responseBody.mpesaName ? { mpesaName: responseBody.mpesaName } : {}),
      }).catch((error) => {
        logger.error('order.notification_delivery_failed', {
          orderId: responseBody._id,
          userId: user._id.toString(),
          error,
        });
      });
    }
    res.status(result.statusCode).json(responseBody);
  }

  static async updateOrder(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);

    const { status } = req.body as UpdateOrderStatusRequest;
    const orderId = req.params.id;
    if (!orderId) {
      throw notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    const order = await OrderService.updateOrderStatus(
      orderId,
      status,
      req.user.id,
      res.locals.requestId,
    );

    if (!order) {
      throw notFound('Order not found', 'ORDER_NOT_FOUND');
    }

    await invalidateCacheKeys([CacheKeys.merchantDashboard()]);
    if (
      order.statusTransitionApplied === true
      && (order.status === 'DONE' || order.status === 'REJECTED')
    ) {
      await ProductEmailNotificationService.sendOrderFinalized({
        userId: order.userId.toString(),
        orderId: order._id.toString(),
        orderType: order.type,
        amountUsdt: order.amount,
        status: order.status,
        ...(order.fiatCurrency ? { fiatCurrency: order.fiatCurrency } : {}),
        ...(order.fiatTotal ? { fiatTotal: order.fiatTotal } : {}),
        ...(order.exchangeRate ? { exchangeRate: order.exchangeRate } : {}),
        ...(order.transactionCode ? { transactionCode: order.transactionCode } : {}),
      });
    }
    res.json(serializeOrder(order, { includePayoutDetails: true }));
  }
}

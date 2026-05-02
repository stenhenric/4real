import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { ClientSession } from 'mongoose';

import { getEnv } from '../config/env.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { serializeOrder } from '../serializers/api.ts';
import { executeIdempotentMutationV2 } from '../services/idempotency.service.ts';
import { getMerchantConfig } from '../services/merchant-config.service.ts';
import { OrderService } from '../services/order.service.ts';
import { enqueueOrderProofRelay, settleOrderProofRelay } from '../services/order-proof-relay.service.ts';
import { UserService } from '../services/user.service.ts';
import { getRequiredIdempotencyKey } from '../utils/idempotency.ts';
import { parseMultipartForm } from '../utils/multipart.ts';
import { badRequest, notFound, payloadTooLarge, serviceUnavailable, unsupportedMediaType } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';
import {
  createOrderRequestSchema,
  type UpdateOrderStatusRequest,
} from '../validation/request-schemas.ts';

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export class OrderController {
  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const orders = await OrderService.getOrders(req.user.id, req.user.isAdmin);
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

    if (parsedBody.type === 'BUY' && parsedBody.amount < 1) {
      throw badRequest('Minimum BUY amount is 1 USDT', 'BUY_ORDER_MINIMUM_NOT_MET');
    }

    if (parsedBody.type === 'SELL' && parsedBody.amount < 2) {
      throw badRequest('Minimum SELL amount is 2 USDT', 'SELL_ORDER_MINIMUM_NOT_MET');
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
    }

    const exchangeRate = parsedBody.type === 'BUY'
      ? merchantConfig.buyRateKesPerUsdt
      : merchantConfig.sellRateKesPerUsdt;

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      throw serviceUnavailable('Merchant rate is not configured', 'MERCHANT_RATE_NOT_CONFIGURED');
    }

    const user = await UserService.findById(userId);
    if (!user) {
      throw notFound('User not found', 'USER_NOT_FOUND');
    }

    const fiatTotal = roundMoney(parsedBody.amount * exchangeRate);
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
          transactionCode: parsedBody.transactionCode ?? '',
          username: user.username,
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
        fiatCurrency: merchantConfig.fiatCurrency,
        exchangeRate,
        fiatTotal,
        proofDigest,
        proofMimeType: proofImage?.contentType,
      },
      execute: async ({ requestHash, session }: { requestHash: string; session: ClientSession }) => {
        const order = await OrderService.createOrder({
          userId: user._id,
          type: parsedBody.type,
          amount: parsedBody.amount,
          proofRelayQueued: Boolean(proofRelay),
          ...(parsedBody.transactionCode ? { transactionCode: parsedBody.transactionCode } : {}),
          fiatCurrency: merchantConfig.fiatCurrency,
          exchangeRate,
          fiatTotal,
          ...(res.locals.requestId ? { requestId: res.locals.requestId as string } : {}),
          session,
        });

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

    res.json(serializeOrder(order));
  }
}

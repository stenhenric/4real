import crypto from 'node:crypto';
import type { Request, Response } from 'express';

import { getEnv } from '../config/env.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { serializeOrder } from '../serializers/api.ts';
import { executeIdempotentMutation } from '../services/idempotency.service.ts';
import { getMerchantConfig } from '../services/merchant-config.service.ts';
import { OrderService } from '../services/order.service.ts';
import { relayOrderProofToTelegram } from '../services/telegram-proof.service.ts';
import { UserService } from '../services/user.service.ts';
import { getRequiredIdempotencyKey } from '../utils/idempotency.ts';
import { parseMultipartForm } from '../utils/multipart.ts';
import { badRequest, notFound, payloadTooLarge, serviceUnavailable, unauthorized, unsupportedMediaType } from '../utils/http-error.ts';
import {
  createOrderRequestSchema,
  type UpdateOrderStatusRequest,
} from '../validation/request-schemas.ts';

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export class OrderController {
  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
    }

    const orders = await OrderService.getOrders(req.user.id, req.user.isAdmin);
    res.json(orders.map((order) => serializeOrder(order)));
  }

  static async getMerchantConfig(_req: Request, res: Response): Promise<void> {
    res.json(await getMerchantConfig());
  }

  static async createOrder(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
    }

    const env = getEnv();
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

    const user = await UserService.findById(req.user.id);
    if (!user) {
      throw notFound('User not found', 'USER_NOT_FOUND');
    }

    const fiatTotal = roundMoney(parsedBody.amount * exchangeRate);
    const proofDigest = proofImage
      ? crypto.createHash('sha256').update(proofImage.data).digest('hex')
      : undefined;
    const result = await executeIdempotentMutation({
      userId: req.user.id,
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
      execute: async () => {
        const proof = parsedBody.type === 'BUY' && proofImage
          ? await relayOrderProofToTelegram({
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
            })
          : undefined;

        const order = await OrderService.createOrder({
          userId: user._id,
          type: parsedBody.type,
          amount: parsedBody.amount,
          proof,
          transactionCode: parsedBody.transactionCode,
          fiatCurrency: merchantConfig.fiatCurrency,
          exchangeRate,
          fiatTotal,
          requestId: res.locals.requestId,
        });

        return {
          statusCode: 201,
          body: serializeOrder(order),
        };
      },
    });

    res.status(result.statusCode).json(result.body);
  }

  static async updateOrder(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
    }

    const { status } = req.body as UpdateOrderStatusRequest;
    const order = await OrderService.updateOrderStatus(
      req.params.id,
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

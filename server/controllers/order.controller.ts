import { Request, Response } from 'express';

import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { OrderService } from '../services/order.service.ts';
import { getMerchantConfig } from '../services/merchant-config.service.ts';
import { UserService } from '../services/user.service.ts';
import { badRequest, notFound, unauthorized } from '../utils/http-error.ts';
import type { CreateOrderRequest, UpdateOrderStatusRequest } from '../validation/request-schemas.ts';

export class OrderController {
  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated');
    }

    const orders = await OrderService.getOrders(req.user.id, req.user.isAdmin);
    res.json(orders);
  }

  static getMerchantConfig(_req: Request, res: Response): void {
    res.json(getMerchantConfig());
  }

  static async createOrder(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated');
    }

    const { type, amount, proofImageUrl } = req.body as CreateOrderRequest;

    if (type === 'BUY' && amount < 1) {
      throw badRequest('Minimum BUY amount is 1 USDT');
    }

    if (type === 'SELL' && amount < 2) {
      throw badRequest('Minimum SELL amount is 2 USDT');
    }

    const user = await UserService.findById(req.user.id);
    if (!user) {
      throw notFound('User not found');
    }

    if (type === 'SELL') {
      const updatedUser = await UserService.deductBalanceSafely(user._id.toString(), amount);
      if (!updatedUser) {
        throw badRequest('Insufficient balance');
      }
    }

    const order = await OrderService.createOrder({
      userId: user._id,
      type,
      amount,
      proofImageUrl,
      status: 'PENDING',
    });
    res.status(201).json(order);
  }

  static async updateOrder(req: Request, res: Response): Promise<void> {
    const { status } = req.body as UpdateOrderStatusRequest;
    const order = await OrderService.updateOrderStatus(req.params.id, status);

    if (!order) {
      throw notFound('Order not found');
    }

    res.json(order);
  }
}

import { Order } from '../models/Order.ts';
import type { IOrder } from '../models/Order.ts';
import mongoose from 'mongoose';
import { UserService } from './user.service.ts';
import { TransactionService } from './transaction.service.ts';
import { badRequest } from '../utils/http-error.ts';

export class OrderService {
  static async createOrder(orderData: Partial<IOrder>): Promise<IOrder> {
    const session = await mongoose.startSession();
    let savedOrder: IOrder | null = null;

    try {
      await session.withTransaction(async () => {
        const userId = orderData.userId?.toString();
        if (!userId) {
          throw badRequest('Order user is required');
        }

        if (orderData.type === 'SELL') {
          const updatedUser = await UserService.deductBalanceSafely(userId, orderData.amount ?? 0, session);
          if (!updatedUser) {
            throw badRequest('Insufficient balance');
          }
        }

        const createdOrders = await Order.create([orderData], { session });
        savedOrder = createdOrders[0] ?? null;

        if (!savedOrder) {
          throw new Error('Unable to create order');
        }

        await TransactionService.createTransaction({
          userId: savedOrder.userId as unknown as string,
          type: savedOrder.type === 'BUY' ? 'BUY_P2P' : 'SELL_P2P',
          amount: savedOrder.type === 'BUY' ? savedOrder.amount : -savedOrder.amount,
          status: 'PENDING',
          referenceId: savedOrder._id.toString(),
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    if (!savedOrder) {
      throw new Error('Unable to create order');
    }

    return savedOrder;
  }

  static async getOrders(userId: string, isAdmin: boolean): Promise<IOrder[]> {
    const filter = isAdmin ? {} : { userId: new mongoose.Types.ObjectId(userId) };
    return Order.find(filter).sort({ createdAt: -1 }).populate('userId', 'username').select('-__v');
  }

  static async updateOrderStatus(orderId: string, status: 'PENDING' | 'DONE' | 'REJECTED'): Promise<IOrder | null> {
    const session = await mongoose.startSession();
    let savedOrder: IOrder | null = null;

    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(orderId, undefined, { session });
        if (!order) {
          savedOrder = null;
          return;
        }

        if (order.status === status) {
          savedOrder = order;
          return;
        }

        if (order.status !== 'PENDING') {
          throw badRequest('Order status is final');
        }

        if (status === 'DONE' && order.type === 'BUY') {
          await UserService.updateBalance(order.userId.toString(), order.amount, session);
        }

        if (status === 'REJECTED' && order.type === 'SELL') {
          await UserService.updateBalance(order.userId.toString(), order.amount, session);
        }

        order.status = status;
        savedOrder = await order.save({ session });

        await TransactionService.updateTransactionStatusByReference(
          order._id.toString(),
          status === 'DONE' ? 'COMPLETED' : status,
          session,
        );
      });
    } finally {
      await session.endSession();
    }

    return savedOrder;
  }
}

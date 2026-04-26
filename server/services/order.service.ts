import mongoose from 'mongoose';

import { Order } from '../models/Order.ts';
import type { IOrder, TelegramOrderProof } from '../models/Order.ts';
import { badRequest } from '../utils/http-error.ts';
import { AuditService } from './audit.service.ts';
import { TransactionService } from './transaction.service.ts';
import { UserService } from './user.service.ts';

export class OrderService {
  static async createOrder({
    userId,
    type,
    amount,
    proof,
    transactionCode,
    fiatCurrency,
    exchangeRate,
    fiatTotal,
    requestId,
  }: {
    userId: mongoose.Types.ObjectId;
    type: 'BUY' | 'SELL';
    amount: number;
    proof?: TelegramOrderProof;
    transactionCode?: string;
    fiatCurrency: 'KES';
    exchangeRate: number;
    fiatTotal: number;
    requestId?: string;
  }): Promise<IOrder> {
    const session = await mongoose.startSession();
    let savedOrder: IOrder | null = null;

    try {
      await session.withTransaction(async () => {
        const userIdString = userId.toString();

        if (type === 'SELL') {
          const updatedUser = await UserService.deductBalanceSafely(userIdString, amount, session);
          if (!updatedUser) {
            throw badRequest('Insufficient balance', 'INSUFFICIENT_BALANCE');
          }
        }

        const createdOrders = await Order.create([{
          userId,
          type,
          amount,
          proof,
          transactionCode,
          fiatCurrency,
          exchangeRate,
          fiatTotal,
          status: 'PENDING',
        }], { session });
        savedOrder = createdOrders[0] ?? null;

        if (!savedOrder) {
          throw new Error('Unable to create order');
        }

        await TransactionService.createTransaction({
          userId: savedOrder.userId.toString(),
          type: savedOrder.type === 'BUY' ? 'BUY_P2P' : 'SELL_P2P',
          amount: savedOrder.type === 'BUY' ? savedOrder.amount : -savedOrder.amount,
          status: 'PENDING',
          referenceId: savedOrder._id.toString(),
          session,
        });

        await AuditService.record({
          eventType: 'order_created',
          actorUserId: savedOrder.userId.toString(),
          targetUserId: savedOrder.userId.toString(),
          resourceType: 'order',
          resourceId: savedOrder._id.toString(),
          requestId,
          metadata: {
            type: savedOrder.type,
            amount: savedOrder.amount,
            transactionCode: savedOrder.transactionCode,
            fiatCurrency: savedOrder.fiatCurrency,
            exchangeRate: savedOrder.exchangeRate,
            fiatTotal: savedOrder.fiatTotal,
            proofProvider: savedOrder.proof?.provider,
            proofUrl: savedOrder.proof?.url,
          },
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

  static async updateOrderStatus(
    orderId: string,
    status: 'PENDING' | 'DONE' | 'REJECTED',
    actorUserId?: string,
    requestId?: string,
  ): Promise<IOrder | null> {
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
          throw badRequest('Order status is final', 'ORDER_STATUS_FINAL');
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

        if (status === 'DONE' || status === 'REJECTED') {
          await AuditService.record({
            eventType: status === 'DONE' ? 'order_approved' : 'order_rejected',
            actorUserId,
            targetUserId: order.userId.toString(),
            resourceType: 'order',
            resourceId: order._id.toString(),
            requestId,
            metadata: {
              type: order.type,
              amount: order.amount,
              status,
            },
            session,
          });
        }
      });
    } finally {
      await session.endSession();
    }

    return savedOrder;
  }
}

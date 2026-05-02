import mongoose from 'mongoose';

import { Order } from '../models/Order.ts';
import type { IOrder, TelegramOrderProof } from '../models/Order.ts';
import { badRequest, internalServerError } from '../utils/http-error.ts';
import { AuditService } from './audit.service.ts';
import { TransactionService } from './transaction.service.ts';
import { UserService } from './user.service.ts';

export class OrderService {
  static async createOrder({
    userId,
    type,
    amount,
    proof,
    proofRelayQueued,
    transactionCode,
    fiatCurrency,
    exchangeRate,
    fiatTotal,
    requestId,
    session,
  }: {
    userId: mongoose.Types.ObjectId;
    type: 'BUY' | 'SELL';
    amount: number;
    proof?: TelegramOrderProof | undefined;
    proofRelayQueued?: boolean | undefined;
    transactionCode?: string | undefined;
    fiatCurrency: 'KES';
    exchangeRate: number;
    fiatTotal: number;
    requestId?: string | undefined;
    session?: mongoose.ClientSession | undefined;
  }): Promise<IOrder> {
    let savedOrder: IOrder | null = null;
    const runCreateOrder = async (activeSession: mongoose.ClientSession) => {
      const userIdString = userId.toString();

      if (type === 'SELL') {
        const updatedUser = await UserService.deductBalanceSafely(userIdString, amount, activeSession);
        if (!updatedUser) {
          throw badRequest('Insufficient balance', 'INSUFFICIENT_BALANCE');
        }
      }

      const createdOrders = await Order.create([{
        userId,
        type,
        amount,
        fiatCurrency,
        exchangeRate,
        fiatTotal,
        status: 'PENDING',
        ...(proof ? { proof } : {}),
        ...(transactionCode ? { transactionCode } : {}),
      }], { session: activeSession });
      savedOrder = createdOrders[0] ?? null;

      if (!savedOrder) {
        throw internalServerError('Unable to create order', 'ORDER_CREATION_FAILED');
      }

      await TransactionService.createTransaction({
        userId: savedOrder.userId.toString(),
        type: savedOrder.type === 'BUY' ? 'BUY_P2P' : 'SELL_P2P',
        amount: savedOrder.type === 'BUY' ? savedOrder.amount : -savedOrder.amount,
        status: 'PENDING',
        referenceId: savedOrder._id.toString(),
        session: activeSession,
      });

      await AuditService.record({
        eventType: 'order_created',
        actorUserId: savedOrder.userId.toString(),
        targetUserId: savedOrder.userId.toString(),
        resourceType: 'order',
        resourceId: savedOrder._id.toString(),
        ...(requestId ? { requestId } : {}),
        metadata: {
          type: savedOrder.type,
          amount: savedOrder.amount,
          transactionCode: savedOrder.transactionCode,
          fiatCurrency: savedOrder.fiatCurrency,
          exchangeRate: savedOrder.exchangeRate,
          fiatTotal: savedOrder.fiatTotal,
          proofProvider: savedOrder.proof?.provider,
          proofUrl: savedOrder.proof?.url,
          proofRelayQueued: proofRelayQueued === true,
        },
        session: activeSession,
      });
    };

    if (session) {
      await runCreateOrder(session);
    } else {
      const ownSession = await mongoose.startSession();
      try {
        await ownSession.withTransaction(async () => {
          await runCreateOrder(ownSession);
        });
      } finally {
        await ownSession.endSession();
      }
    }

    if (!savedOrder) {
      throw internalServerError('Unable to create order', 'ORDER_CREATION_FAILED');
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
    actorUserId?: string | undefined,
    requestId?: string | undefined,
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

        if (status === 'REJECTED' && order.type === 'SELL') {
          await TransactionService.createTransaction({
            userId: order.userId.toString(),
            type: 'SELL_P2P_REFUND',
            amount: order.amount,
            referenceId: order._id.toString(),
            session,
          });
        }

        if (status === 'DONE' || status === 'REJECTED') {
          await AuditService.record({
            eventType: status === 'DONE' ? 'order_approved' : 'order_rejected',
            ...(actorUserId ? { actorUserId } : {}),
            targetUserId: order.userId.toString(),
            resourceType: 'order',
            resourceId: order._id.toString(),
            ...(requestId ? { requestId } : {}),
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

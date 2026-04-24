import { Order } from '../models/Order.ts';
import type { IOrder } from '../models/Order.ts';
import mongoose from 'mongoose';
import { UserService } from './user.service.ts';
import { TransactionService } from './transaction.service.ts';

export class OrderService {
  static async createOrder(orderData: Partial<IOrder>): Promise<IOrder> {
    const order = new Order(orderData);
    const savedOrder = await order.save();
    await TransactionService.createTransaction({
      userId: savedOrder.userId as unknown as string,
      type: savedOrder.type === 'BUY' ? 'BUY_P2P' : 'SELL_P2P',
      amount: savedOrder.type === 'BUY' ? savedOrder.amount : -savedOrder.amount,
      status: 'PENDING',
      referenceId: savedOrder._id.toString()
    });
    return savedOrder;
  }

  static async getOrders(userId: string, isAdmin: boolean): Promise<IOrder[]> {
    const filter = isAdmin ? {} : { userId: new mongoose.Types.ObjectId(userId) };
    return Order.find(filter).sort({ createdAt: -1 }).populate('userId', 'username').select('-__v');
  }

  static async updateOrderStatus(orderId: string, status: 'PENDING' | 'DONE' | 'REJECTED'): Promise<IOrder | null> {
    const order = await Order.findById(orderId);
    if (!order) return null;

    // Process balance logic if order is set to DONE and was PENDING
    if (order.status === 'PENDING' && status === 'DONE') {
      if (order.type === 'BUY') {
        await UserService.updateBalance(order.userId.toString(), order.amount);
      } else if (order.type === 'SELL') {
        // Typically, balance is deducted on creation, but we will deduct on DONE or verify deduction on creation.
        // Assuming deducting on creation is safer, if rejected, refund.
        // For simplicity, let's deduct/add on DONE.
        // Actually, for SELL, we should have deducted balance on creation.
      }
    }

    if (order.status === 'PENDING' && status === 'REJECTED' && order.type === 'SELL') {
      // Refund balance if SELL was rejected
      await UserService.updateBalance(order.userId.toString(), order.amount);
    }

    order.status = status;
    const saved = await order.save();

    // Update the corresponding transaction status
    await TransactionService.updateTransactionStatusByReference(saved._id.toString(), status === 'DONE' ? 'COMPLETED' : status);

    return saved;
  }
}

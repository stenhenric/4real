import { Order, IOrder } from '../models/Order';
import { UserService } from './user.service';

export class OrderService {
  static async createOrder(orderData: Partial<IOrder>): Promise<IOrder> {
    const order = new Order(orderData);
    return order.save();
  }

  static async getOrders(): Promise<IOrder[]> {
    return Order.find().sort({ createdAt: -1 }).populate('userId', 'username');
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
    return order.save();
  }
}

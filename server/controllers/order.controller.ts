import { Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { UserService } from '../services/user.service';

export class OrderController {
  static async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const orders = await OrderService.getOrders();
      res.json(orders);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async createOrder(req: any, res: Response): Promise<void> {
    try {
      const { type, amount, proofImageUrl } = req.body;
      const user = await UserService.findById(req.user.id);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (type === 'SELL') {
        const updatedUser = await UserService.deductBalanceSafely(user._id.toString(), amount);
        if (!updatedUser) {
          res.status(400).json({ error: 'Insufficient balance' });
          return;
        }
      }

      const order = await OrderService.createOrder({
        userId: req.user.id,
        type,
        amount,
        proofImageUrl,
        status: 'PENDING'
      });
      res.status(201).json(order);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async updateOrder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const order = await OrderService.updateOrderStatus(id, status);
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      res.json(order);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

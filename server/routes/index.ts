import type { Express } from 'express';

import authRoutes from './auth.routes.ts';
import matchesRoutes from './matches.routes.ts';
import ordersRoutes from './orders.routes.ts';
import transactionsRoutes from './transactions.routes.ts';
import usersRoutes from './users.routes.ts';

export function registerApiRoutes(app: Express): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/matches', matchesRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/transactions', transactionsRoutes);
}

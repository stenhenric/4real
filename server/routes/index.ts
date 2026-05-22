import type { Express } from 'express';
import type { RequestHandler } from 'express';

import adminRoutes from './admin.routes.ts';
import authRoutes from './auth.routes.ts';
import matchesRoutes from './matches.routes.ts';
import ordersRoutes from './orders.routes.ts';
import transactionsRoutes from './transactions.routes.ts';
import usersRoutes from './users.routes.ts';
import { UserController } from '../controllers/user.controller.ts';
import { asyncHandler } from '../utils/async-handler.ts';

export function registerPublicCacheableApiRoutes(app: Express, publicCacheableGetRateLimiter: RequestHandler): void {
  app.get(
    '/api/users/leaderboard',
    publicCacheableGetRateLimiter,
    asyncHandler(UserController.getLeaderboard),
  );
}

export function registerApiRoutes(app: Express): void {
  app.use('/api/admin', adminRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/matches', matchesRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/transactions', transactionsRoutes);
}

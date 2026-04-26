import type { Response } from 'express';

import type { BackgroundJobState } from '../services/background-jobs.service.ts';
import { MerchantDashboardService } from '../services/merchant-dashboard.service.ts';
import { getMerchantConfig, updateMerchantConfig } from '../services/merchant-config.service.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import type { UpdateMerchantConfigRequest } from '../validation/request-schemas.ts';

function getBackgroundJobs(req: AuthRequest): BackgroundJobState | null {
  const backgroundJobs = req.app.locals.statusProvider?.getBackgroundJobs?.();
  return backgroundJobs && typeof backgroundJobs === 'object'
    ? backgroundJobs as BackgroundJobState
    : null;
}

export class MerchantAdminController {
  static async getConfig(_req: AuthRequest, res: Response): Promise<void> {
    res.json(await getMerchantConfig());
  }

  static async updateConfig(req: AuthRequest, res: Response): Promise<void> {
    const updatedConfig = await updateMerchantConfig(req.body as UpdateMerchantConfigRequest);
    res.json(updatedConfig);
  }

  static async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    const dashboard = await MerchantDashboardService.getDashboard(getBackgroundJobs(req));
    res.json(dashboard);
  }

  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    const typeParam = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : 'ALL';
    const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'PENDING';
    const pageParam = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const pageSizeParam = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : 25;

    const type = typeParam === 'BUY' || typeParam === 'SELL' ? typeParam : 'ALL';
    const status = statusParam === 'PENDING' || statusParam === 'DONE' || statusParam === 'REJECTED'
      ? statusParam
      : 'ALL';
    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.min(100, Math.max(10, Math.floor(pageSizeParam)))
      : 25;

    const orders = await MerchantDashboardService.getOrderDesk({
      page,
      pageSize,
      status,
      type,
    });

    res.json(orders);
  }
}

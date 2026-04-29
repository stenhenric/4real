import type { Response } from 'express';

import type { BackgroundJobState } from '../services/background-jobs.service.ts';
import {
  listMerchantDepositReviews,
  reconcileMerchantDeposit,
  replayDepositWindow,
} from '../services/deposit-ingestion.service.ts';
import { MerchantDashboardService } from '../services/merchant-dashboard.service.ts';
import { getMerchantConfig, updateMerchantConfig } from '../services/merchant-config.service.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import type {
  MerchantDepositReconcileRequest,
  MerchantDepositReplayWindowRequest,
  UpdateMerchantConfigRequest,
} from '../validation/request-schemas.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';

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
    const body = req.body as UpdateMerchantConfigRequest;
    const updatedConfig = await updateMerchantConfig({
      ...(body.mpesaNumber !== undefined ? { mpesaNumber: body.mpesaNumber } : {}),
      ...(body.walletAddress !== undefined ? { walletAddress: body.walletAddress } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
      ...(body.buyRateKesPerUsdt !== undefined ? { buyRateKesPerUsdt: body.buyRateKesPerUsdt } : {}),
      ...(body.sellRateKesPerUsdt !== undefined ? { sellRateKesPerUsdt: body.sellRateKesPerUsdt } : {}),
    });
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

  static async getDeposits(req: AuthRequest, res: Response): Promise<void> {
    const statusParam = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : 'open';
    const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const status = statusParam === 'resolved' ? 'resolved' : 'open';
    const limit = Number.isFinite(limitParam)
      ? Math.min(200, Math.max(1, Math.floor(limitParam)))
      : 50;

    const deposits = await listMerchantDepositReviews({ status, limit });
    res.json(deposits);
  }

  static async reconcileDeposit(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);

    const body = req.body as MerchantDepositReconcileRequest;
    const result = await reconcileMerchantDeposit({
      txHash: req.params.txHash ?? '',
      action: body.action,
      ...(body.userId ? { userId: body.userId } : {}),
      ...(body.note ? { note: body.note } : {}),
      actorUserId: req.user.id,
    });
    res.json(result);
  }

  static async replayDepositWindow(req: AuthRequest, res: Response): Promise<void> {
    const body = req.body as MerchantDepositReplayWindowRequest;
    const result = await replayDepositWindow({
      sinceUnixTime: body.sinceUnixTime,
      untilUnixTime: body.untilUnixTime,
      dryRun: body.dryRun ?? true,
    });
    res.json(result);
  }
}

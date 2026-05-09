import type { Response } from 'express';

import type { BackgroundJobState } from '../services/background-jobs.service.ts';
import {
  listMerchantDepositReviews,
  reconcileMerchantDeposit,
  replayDepositWindow,
} from '../services/deposit-ingestion.service.ts';
import { MerchantDashboardService } from '../services/merchant-dashboard.service.ts';
import { getMerchantConfig, updateMerchantConfig } from '../services/merchant-config.service.ts';
import { CacheKeys, CACHE_TTLS, getOrPopulateJson } from '../services/cache.service.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import type {
  MerchantDepositReconcileRequest,
  MerchantDepositReplayWindowRequest,
  UpdateMerchantConfigRequest,
} from '../validation/request-schemas.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { badRequest } from '../utils/http-error.ts';

type MerchantOrderTypeFilter = 'ALL' | 'BUY' | 'SELL';
type MerchantOrderStatusFilter = 'ALL' | 'PENDING' | 'DONE' | 'REJECTED';

function readRequiredScalarQueryValue(
  req: AuthRequest,
  key: string,
  errorMessage: string,
  errorCode: string,
): string | undefined {
  const value = req.query[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw badRequest(errorMessage, errorCode);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw badRequest(errorMessage, errorCode);
  }

  return normalized;
}

function parseMerchantOrderType(req: AuthRequest): MerchantOrderTypeFilter {
  const value = readRequiredScalarQueryValue(
    req,
    'type',
    'Invalid merchant order type filter',
    'INVALID_MERCHANT_ORDER_TYPE',
  );
  if (!value) {
    return 'ALL';
  }

  const normalized = value.toUpperCase();
  if (normalized === 'ALL' || normalized === 'BUY' || normalized === 'SELL') {
    return normalized;
  }

  throw badRequest('Invalid merchant order type filter', 'INVALID_MERCHANT_ORDER_TYPE');
}

function parseMerchantOrderStatus(req: AuthRequest): MerchantOrderStatusFilter {
  const value = readRequiredScalarQueryValue(
    req,
    'status',
    'Invalid merchant order status filter',
    'INVALID_MERCHANT_ORDER_STATUS',
  );
  if (!value) {
    return 'PENDING';
  }

  const normalized = value.toUpperCase();
  if (normalized === 'ALL' || normalized === 'PENDING' || normalized === 'DONE' || normalized === 'REJECTED') {
    return normalized;
  }

  throw badRequest('Invalid merchant order status filter', 'INVALID_MERCHANT_ORDER_STATUS');
}

function parsePositivePageNumber(
  req: AuthRequest,
  key: 'page' | 'pageSize',
  {
    defaultValue,
    min,
    max,
    errorMessage,
    errorCode,
  }: {
    defaultValue: number;
    min: number;
    max: number;
    errorMessage: string;
    errorCode: string;
  },
): number {
  const value = readRequiredScalarQueryValue(req, key, errorMessage, errorCode);
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw badRequest(errorMessage, errorCode);
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

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
    assertAuthenticated(req);
    const body = req.body as UpdateMerchantConfigRequest;
    const updatedConfig = await updateMerchantConfig({
      ...(body.mpesaNumber !== undefined ? { mpesaNumber: body.mpesaNumber } : {}),
      ...(body.walletAddress !== undefined ? { walletAddress: body.walletAddress } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
      ...(body.buyRateKesPerUsdt !== undefined ? { buyRateKesPerUsdt: body.buyRateKesPerUsdt } : {}),
      ...(body.sellRateKesPerUsdt !== undefined ? { sellRateKesPerUsdt: body.sellRateKesPerUsdt } : {}),
    }, {
      actorUserId: req.user.id,
      ...(typeof res.locals.requestId === 'string' ? { requestId: res.locals.requestId } : {}),
    });
    res.json(updatedConfig);
  }

  static async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    const { value: dashboard } = await getOrPopulateJson({
      key: CacheKeys.merchantDashboard(),
      ttlSeconds: CACHE_TTLS.merchantDashboard,
      loader: async () => MerchantDashboardService.getDashboard(getBackgroundJobs(req)),
    });
    res.json(dashboard);
  }

  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    const type = parseMerchantOrderType(req);
    const status = parseMerchantOrderStatus(req);
    const page = parsePositivePageNumber(req, 'page', {
      defaultValue: 1,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      errorMessage: 'Invalid merchant order page',
      errorCode: 'INVALID_MERCHANT_ORDER_PAGE',
    });
    const pageSize = parsePositivePageNumber(req, 'pageSize', {
      defaultValue: 25,
      min: 10,
      max: 100,
      errorMessage: 'Invalid merchant order page size',
      errorCode: 'INVALID_MERCHANT_ORDER_PAGE_SIZE',
    });

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

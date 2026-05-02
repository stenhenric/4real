import mongoose from 'mongoose';

import { getEnv } from '../config/env.ts';
import { SYSTEM_COMMISSION_ACCOUNT_ID } from "../models/User.ts";
import { Order } from '../models/Order.ts';
import { getMongoCollection } from '../repositories/mongo.repository.ts';
import type { DepositDocument } from '../repositories/deposit.repository.ts';
import type { UnmatchedDepositDocument } from '../repositories/unmatched-deposit.repository.ts';
import type { WithdrawalDocument, WithdrawalStatus } from '../repositories/withdrawal.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { getMerchantConfig } from './merchant-config.service.ts';
import { getHotWalletRuntime } from './hot-wallet-runtime.service.ts';
import type { BackgroundJobState, JobSnapshot } from './background-jobs.service.ts';
import { getHotWalletTonBalance, getHotWalletUsdtBalanceRaw } from './withdrawal-engine.ts';
import type {
  MerchantAlertDTO,
  MerchantDashboardDTO,
  MerchantJobKey,
  MerchantJobStatusDTO,
  MerchantOrderDeskItemDTO,
  MerchantOrderDeskResponseDTO,
  OrderUserDTO,
} from '../types/api.ts';
import { trustFilter } from '../utils/trusted-filter.ts';

interface MerchantDashboardOrderUser {
  _id: mongoose.Types.ObjectId;
  username: string;
  createdAt?: Date;
}

interface MerchantDashboardOrderDocument {
  _id: mongoose.Types.ObjectId;
  userId: MerchantDashboardOrderUser | mongoose.Types.ObjectId | string;
  type: 'BUY' | 'SELL';
  amount: number;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  proof?: MerchantOrderDeskItemDTO['proof'];
  transactionCode?: MerchantOrderDeskItemDTO['transactionCode'];
  fiatCurrency?: MerchantOrderDeskItemDTO['fiatCurrency'];
  exchangeRate?: MerchantOrderDeskItemDTO['exchangeRate'];
  fiatTotal?: MerchantOrderDeskItemDTO['fiatTotal'];
  createdAt: Date;
}

interface UserOrderStats {
  doneCount: number;
  doneVolume: number;
}

interface BalanceSnapshot {
  tonBalanceTon: number | null;
  onChainUsdtBalanceUsdt: number | null;
  error?: string;
}

interface WithdrawalCounts {
  queued: number;
  processing: number;
  sent: number;
  stuck: number;
  failed: number;
  confirmed: number;
}

const DEPOSITS_COLLECTION = 'deposits';
const UNMATCHED_DEPOSITS_COLLECTION = 'unmatched_deposits';
const WITHDRAWALS_COLLECTION = 'withdrawals';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const JOB_LABELS: Record<MerchantJobKey, string> = {
  depositPoller: 'Deposit poller',
  orderProofRelay: 'Order proof relay',
  withdrawalWorker: 'Withdrawal worker',
  withdrawalConfirmation: 'Withdrawal confirmation',
  hotWalletMonitor: 'Hot wallet monitor',
  staleMatchExpiry: 'Stale match expiry',
};

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function usdtRawToNumber(value: bigint | string | number): number {
  return Number(BigInt(value) / 1_000_000n) + Number(BigInt(value) % 1_000_000n) / 1_000_000;
}

function tonRawToNumber(value: bigint): number {
  return Number(value) / 1_000_000_000;
}

function toOrderUser(userId: MerchantDashboardOrderDocument['userId']): OrderUserDTO {
  if (userId && typeof userId === 'object' && '_id' in userId && 'username' in userId) {
    return {
      id: userId._id.toString(),
      username: userId.username,
    };
  }

  return {
    id: String(userId ?? ''),
    username: 'Unknown user',
  };
}

function getUserCreatedAt(order: MerchantDashboardOrderDocument): Date | null {
  const userId = order.userId;
  if (userId && typeof userId === 'object' && 'createdAt' in userId && userId.createdAt instanceof Date) {
    return userId.createdAt;
  }

  return null;
}

function getWaitMinutes(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60_000));
}

function compareIsoDates(a?: string, b?: string): number {
  const aTime = a ? Date.parse(a) : Number.NEGATIVE_INFINITY;
  const bTime = b ? Date.parse(b) : Number.NEGATIVE_INFINITY;
  return aTime - bTime;
}

function getJobState(snapshot: JobSnapshot): MerchantJobStatusDTO['state'] {
  if (!snapshot.enabled) {
    return 'critical';
  }

  const failureIsLatest = compareIsoDates(snapshot.lastFailedAt, snapshot.lastSucceededAt) > 0;
  if (failureIsLatest || snapshot.lastError) {
    return 'warning';
  }

  return 'healthy';
}

function buildJobStatuses(backgroundJobs: BackgroundJobState | null): MerchantJobStatusDTO[] {
  const fallbacks: BackgroundJobState = backgroundJobs ?? {
    depositPoller: { enabled: false, lastError: 'Status unavailable' },
    orderProofRelay: { enabled: false, lastError: 'Status unavailable' },
    withdrawalWorker: { enabled: false, lastError: 'Status unavailable' },
    withdrawalConfirmation: { enabled: false, lastError: 'Status unavailable' },
    hotWalletMonitor: { enabled: false, lastError: 'Status unavailable' },
    staleMatchExpiry: { enabled: false, lastError: 'Status unavailable' },
  };

  return (Object.keys(JOB_LABELS) as MerchantJobKey[]).map((key) => {
    const snapshot = fallbacks[key];
    return {
      key,
      label: JOB_LABELS[key],
      enabled: snapshot.enabled,
      state: getJobState(snapshot),
      ...(snapshot.lastStartedAt ? { lastStartedAt: snapshot.lastStartedAt } : {}),
      ...(snapshot.lastSucceededAt ? { lastSucceededAt: snapshot.lastSucceededAt } : {}),
      ...(snapshot.lastFailedAt ? { lastFailedAt: snapshot.lastFailedAt } : {}),
      ...(snapshot.lastError ? { lastError: snapshot.lastError } : {}),
    };
  });
}

function evaluateRisk(order: MerchantDashboardOrderDocument, userStats: UserOrderStats | null, now: Date) {
  const waitMinutes = getWaitMinutes(order.createdAt, now);
  const userCreatedAt = getUserCreatedAt(order);
  const accountAgeHours = userCreatedAt
    ? (now.getTime() - userCreatedAt.getTime()) / (60 * 60 * 1000)
    : null;
  const averageDoneAmount = userStats && userStats.doneCount > 0
    ? userStats.doneVolume / userStats.doneCount
    : null;

  const riskFlags: string[] = [];
  let score = 0;

  if (order.amount >= 5_000) {
    riskFlags.push('Large ticket size');
    score += 4;
  } else if (order.amount >= 1_000) {
    riskFlags.push('Elevated ticket size');
    score += 2;
  }

  if (userStats?.doneCount === 0) {
    riskFlags.push('First completed trade pending');
    score += 1;
  }

  if (averageDoneAmount !== null && order.amount >= Math.max(averageDoneAmount * 3, 500)) {
    riskFlags.push('Above user historical average');
    score += 2;
  }

  if (accountAgeHours !== null && accountAgeHours < 24) {
    riskFlags.push('New account');
    score += 2;
  } else if (accountAgeHours !== null && accountAgeHours < 7 * 24) {
    riskFlags.push('Recent account');
    score += 1;
  }

  if (waitMinutes >= 60) {
    riskFlags.push('Pending over 60 minutes');
    score += 2;
  } else if (waitMinutes >= 15) {
    riskFlags.push('Pending over 15 minutes');
    score += 1;
  }

  const riskLevel = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';

  return {
    riskFlags,
    riskLevel,
    waitMinutes,
  } as const;
}

async function getOrderStats(userIds: mongoose.Types.ObjectId[]): Promise<Map<string, UserOrderStats>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const stats = await Order.aggregate<{
    _id: mongoose.Types.ObjectId;
    doneCount: number;
    doneVolume: number;
  }>([
    { $match: { userId: { $in: userIds } } },
    {
      $group: {
        _id: '$userId',
        doneCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0],
          },
        },
        doneVolume: {
          $sum: {
            $cond: [{ $eq: ['$status', 'DONE'] }, '$amount', 0],
          },
        },
      },
    },
  ]);

  return new Map(
    stats.map((entry) => [
      entry._id.toString(),
      {
        doneCount: entry.doneCount,
        doneVolume: entry.doneVolume,
      },
    ]),
  );
}

async function fetchOrders(options: {
  filter: Record<string, unknown>;
  page?: number;
  pageSize?: number;
}) {
  const query = Order.find(options.filter)
    .sort({ createdAt: -1 })
    .populate('userId', 'username createdAt')
    .select('userId type amount status proof transactionCode fiatCurrency exchangeRate fiatTotal createdAt');

  if (options.page !== undefined && options.pageSize !== undefined) {
    query.skip((options.page - 1) * options.pageSize).limit(options.pageSize);
  }

  const orders = await query.lean<MerchantDashboardOrderDocument[]>();
  const userIds = orders
    .map((order) => order.userId)
    .filter((userId): userId is MerchantDashboardOrderUser => Boolean(userId && typeof userId === 'object' && '_id' in userId))
    .map((user) => user._id);
  const userStats = await getOrderStats(userIds);
  const now = new Date();

  const items = orders.map<MerchantOrderDeskItemDTO>((order) => {
    const user = toOrderUser(order.userId);
    const orderUserId = user.id;
    const risk = evaluateRisk(order, userStats.get(orderUserId) ?? null, now);

    return {
      id: order._id.toString(),
      user,
      type: order.type,
      amount: roundMoney(order.amount),
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      waitMinutes: risk.waitMinutes,
      riskLevel: risk.riskLevel,
      riskFlags: risk.riskFlags,
      ...(order.proof ? { proof: order.proof } : {}),
      ...(order.transactionCode ? { transactionCode: order.transactionCode } : {}),
      ...(order.fiatCurrency ? { fiatCurrency: order.fiatCurrency } : {}),
      ...(order.exchangeRate !== undefined ? { exchangeRate: order.exchangeRate } : {}),
      ...(order.fiatTotal !== undefined ? { fiatTotal: order.fiatTotal } : {}),
    };
  });

  return {
    items,
    now,
  };
}

async function getRecentDepositsSince(since: Date): Promise<DepositDocument[]> {
  return getMongoCollection<DepositDocument>(DEPOSITS_COLLECTION)
    .find({ txTime: { $gte: since } })
    .project<DepositDocument>({
      txHash: 1,
      amountRaw: 1,
      amountDisplay: 1,
      txTime: 1,
      status: 1,
      userId: 1,
      comment: 1,
      senderJettonWallet: 1,
      senderAddress: 1,
      createdAt: 1,
    })
    .sort({ txTime: -1 })
    .toArray();
}

async function getRecentWithdrawalsSince(since: Date): Promise<WithdrawalDocument[]> {
  return getMongoCollection<WithdrawalDocument>(WITHDRAWALS_COLLECTION)
    .find({ createdAt: { $gte: since } })
    .project<WithdrawalDocument>({
      withdrawalId: 1,
      userId: 1,
      toAddress: 1,
      amountRaw: 1,
      amountDisplay: 1,
      status: 1,
      createdAt: 1,
      retries: 1,
      startedAt: 1,
      sentAt: 1,
      confirmedAt: 1,
      updatedAt: 1,
      seqno: 1,
      txHash: 1,
      lastError: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();
}

async function getRecentUnmatchedDeposits(limit: number): Promise<UnmatchedDepositDocument[]> {
  return getMongoCollection<UnmatchedDepositDocument>(UNMATCHED_DEPOSITS_COLLECTION)
    .find({ resolved: { $ne: true } })
    .project<UnmatchedDepositDocument>({
      txHash: 1,
      receivedRaw: 1,
      comment: 1,
      senderJettonWallet: 1,
      senderOwnerAddress: 1,
      txTime: 1,
      recordedAt: 1,
      resolved: 1,
      memoStatus: 1,
      candidateUserId: 1,
    })
    .sort({ recordedAt: -1 })
    .limit(limit)
    .toArray();
}

async function getWithdrawalCounts(): Promise<WithdrawalCounts> {
  const rows = await getMongoCollection<WithdrawalDocument>(WITHDRAWALS_COLLECTION)
    .aggregate<{ _id: WithdrawalStatus; count: number }>([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const counts: WithdrawalCounts = {
    queued: 0,
    processing: 0,
    sent: 0,
    stuck: 0,
    failed: 0,
    confirmed: 0,
  };

  for (const row of rows) {
    counts[row._id] = row.count;
  }

  return counts;
}

async function getBalanceSnapshot(): Promise<BalanceSnapshot> {
  try {
    const runtime = getHotWalletRuntime();
    const [tonBalanceRaw, onChainUsdtRaw] = await Promise.all([
      getHotWalletTonBalance(runtime.hotWalletAddress),
      getHotWalletUsdtBalanceRaw(runtime.hotWalletAddress),
    ]);

    return {
      tonBalanceTon: roundMoney(tonRawToNumber(tonBalanceRaw)),
      onChainUsdtBalanceUsdt: onChainUsdtRaw === null ? null : roundMoney(usdtRawToNumber(onChainUsdtRaw)),
    };
  } catch (error) {
    return {
      tonBalanceTon: null,
      onChainUsdtBalanceUsdt: null,
      error: error instanceof Error ? error.message : 'Unable to load on-chain balances',
    };
  }
}

function buildVolumeSeries(orders: Array<{ createdAt: Date; amount: number }>, now: Date) {
  const bucketCount = 6;
  const bucketSizeMs = DAY_IN_MS / bucketCount;
  const dayStart = now.getTime() - DAY_IN_MS;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStartMs = dayStart + index * bucketSizeMs;
    return {
      bucketStart: new Date(bucketStartMs).toISOString(),
      bucketLabel: new Date(bucketStartMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      completedVolumeUsdt: 0,
      completedCount: 0,
    };
  });

  for (const order of orders) {
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((order.createdAt.getTime() - dayStart) / bucketSizeMs)),
    );
    const bucket = buckets[bucketIndex];
    if (!bucket) {
      continue;
    }
    bucket.completedVolumeUsdt = roundMoney(bucket.completedVolumeUsdt + order.amount);
    bucket.completedCount += 1;
  }

  return buckets;
}

function sortAlerts(alerts: MerchantAlertDTO[]): MerchantAlertDTO[] {
  const weights = { critical: 3, warning: 2, info: 1 };

  return alerts.sort((a, b) => {
    const severityDelta = weights[b.severity] - weights[a.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
}

export class MerchantDashboardService {
  static async getDashboard(backgroundJobs: BackgroundJobState | null): Promise<MerchantDashboardDTO> {
    const now = new Date();
    const since24h = new Date(now.getTime() - DAY_IN_MS);
    const runtime = getHotWalletRuntime();
    const jobStatuses = buildJobStatuses(backgroundJobs);

    const [
      pendingOrdersResult,
      doneOrders,
      deposits24h,
      withdrawals24h,
      recentUnmatchedDeposits,
      unresolvedDepositCount,
      withdrawalCounts,
      customerLiabilityUsdtRaw,
      balanceSnapshot,
      systemCommissionBalance,
      merchantConfig,
    ] = await Promise.all([
      fetchOrders({ filter: { status: 'PENDING' as const } }),
      Order.find(trustFilter({ status: 'DONE' as const, createdAt: { $gte: since24h } }))
        .select('amount createdAt')
        .sort({ createdAt: 1 })
        .lean<Array<{ amount: number; createdAt: Date }>>(),
      getRecentDepositsSince(since24h),
      getRecentWithdrawalsSince(since24h),
      getRecentUnmatchedDeposits(5),
      getMongoCollection<UnmatchedDepositDocument>(UNMATCHED_DEPOSITS_COLLECTION)
        .countDocuments({ resolved: { $ne: true } }),
      getWithdrawalCounts(),
      UserBalanceRepository.sumBalanceRawForLedger({ excludeUserIds: [SYSTEM_COMMISSION_ACCOUNT_ID] }),
      getBalanceSnapshot(),
      UserBalanceRepository.findByUserId(SYSTEM_COMMISSION_ACCOUNT_ID),
      getMerchantConfig(),
    ]);

    const pendingOrders = pendingOrdersResult.items
      .sort((a, b) => {
        const riskWeight = { high: 3, medium: 2, low: 1 };
        const riskDelta = riskWeight[b.riskLevel] - riskWeight[a.riskLevel];
        if (riskDelta !== 0) {
          return riskDelta;
        }

        return b.waitMinutes - a.waitMinutes;
      });

    const pendingOrderCount = pendingOrders.length;
    const highRiskPendingOrderCount = pendingOrders.filter((order) => order.riskLevel === 'high').length;
    const pendingBuyVolumeUsdt = roundMoney(
      pendingOrders
        .filter((order) => order.type === 'BUY')
        .reduce((total, order) => total + order.amount, 0),
    );
    const pendingSellVolumeUsdt = roundMoney(
      pendingOrders
        .filter((order) => order.type === 'SELL')
        .reduce((total, order) => total + order.amount, 0),
    );
    const completedVolume24hUsdt = roundMoney(
      doneOrders.reduce((total, order) => total + order.amount, 0),
    );
    const oldestPendingMinutes = pendingOrders.length > 0
      ? Math.max(...pendingOrders.map((order) => order.waitMinutes))
      : null;
    const depositFlow24hUsdt = roundMoney(
      deposits24h.reduce((total, deposit) => total + Number(deposit.amountDisplay), 0),
    );
    const withdrawalFlow24hUsdt = roundMoney(
      withdrawals24h.reduce((total, withdrawal) => total + Number(withdrawal.amountDisplay), 0),
    );
    const ledgerUsdtBalanceUsdt = roundMoney(usdtRawToNumber(customerLiabilityUsdtRaw));
    const usdtDeltaUsdt = balanceSnapshot.onChainUsdtBalanceUsdt === null
      ? null
      : roundMoney(balanceSnapshot.onChainUsdtBalanceUsdt - ledgerUsdtBalanceUsdt);
    const systemCommissionUsdt = roundMoney(
      usdtRawToNumber(UserBalanceRepository.getBalanceRaw(systemCommissionBalance)),
    );

    const alerts: MerchantAlertDTO[] = [];
    const env = getEnv();

    if (balanceSnapshot.error) {
      alerts.push({
        id: 'balance-fetch-error',
        severity: 'warning',
        category: 'liquidity',
        title: 'On-chain balance check unavailable',
        description: balanceSnapshot.error,
        targetPath: '/merchant/liquidity',
      });
    }

    if (balanceSnapshot.tonBalanceTon !== null && balanceSnapshot.tonBalanceTon < env.HOT_WALLET_MIN_TON_BALANCE) {
      alerts.push({
        id: 'low-ton-balance',
        severity: 'critical',
        category: 'liquidity',
        title: 'Hot wallet TON balance below threshold',
        description: `Available gas balance is ${balanceSnapshot.tonBalanceTon.toFixed(2)} TON, below the configured ${env.HOT_WALLET_MIN_TON_BALANCE.toFixed(2)} TON minimum.`,
        metric: `${balanceSnapshot.tonBalanceTon.toFixed(2)} TON`,
        targetPath: '/merchant/liquidity',
      });
    }

    if (
      balanceSnapshot.onChainUsdtBalanceUsdt !== null
      && balanceSnapshot.onChainUsdtBalanceUsdt < env.HOT_WALLET_MIN_USDT_BALANCE
    ) {
      alerts.push({
        id: 'low-usdt-balance',
        severity: 'warning',
        category: 'liquidity',
        title: 'Hot wallet USDT reserve below threshold',
        description: `On-chain reserve is ${balanceSnapshot.onChainUsdtBalanceUsdt.toFixed(2)} USDT, below the configured ${env.HOT_WALLET_MIN_USDT_BALANCE.toFixed(2)} USDT minimum.`,
        metric: `${balanceSnapshot.onChainUsdtBalanceUsdt.toFixed(2)} USDT`,
        targetPath: '/merchant/liquidity',
      });
    }

    if (usdtDeltaUsdt !== null) {
      if (usdtDeltaUsdt < 0) {
        alerts.push({
          id: 'ledger-shortfall',
          severity: 'critical',
          category: 'liquidity',
          title: 'Ledger exceeds on-chain USDT reserves',
          description: `Customer ledger liabilities exceed the hot wallet reserve by ${Math.abs(usdtDeltaUsdt).toFixed(2)} USDT.`,
          metric: `${Math.abs(usdtDeltaUsdt).toFixed(2)} USDT`,
          targetPath: '/merchant/liquidity',
        });
      } else if (usdtDeltaUsdt > env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT) {
        alerts.push({
          id: 'ledger-mismatch',
          severity: 'warning',
          category: 'liquidity',
          title: 'Hot wallet reserve and ledger diverge',
          description: `The reserve is ahead of the internal ledger by ${usdtDeltaUsdt.toFixed(2)} USDT, above the configured tolerance of ${env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT.toFixed(2)} USDT.`,
          metric: `${usdtDeltaUsdt.toFixed(2)} USDT`,
          targetPath: '/merchant/liquidity',
        });
      }
    }

    if (withdrawalCounts.failed > 0) {
      alerts.push({
        id: 'failed-withdrawals',
        severity: 'critical',
        category: 'withdrawals',
        title: 'Withdrawals failed permanently',
        description: `${withdrawalCounts.failed} withdrawal request${withdrawalCounts.failed === 1 ? '' : 's'} exhausted retries and needs investigation.`,
        metric: String(withdrawalCounts.failed),
        targetPath: '/merchant/liquidity',
      });
    }

    if (withdrawalCounts.stuck > 0) {
      alerts.push({
        id: 'stuck-withdrawals',
        severity: 'warning',
        category: 'withdrawals',
        title: 'Withdrawals are awaiting confirmation',
        description: `${withdrawalCounts.stuck} withdrawal request${withdrawalCounts.stuck === 1 ? '' : 's'} marked as stuck and should be reviewed.`,
        metric: String(withdrawalCounts.stuck),
        targetPath: '/merchant/liquidity',
      });
    }

    if (unresolvedDepositCount > 0) {
      alerts.push({
        id: 'unmatched-deposits',
        severity: 'warning',
        category: 'deposits',
        title: 'Unmatched deposits need manual review',
        description: `${unresolvedDepositCount} deposit${unresolvedDepositCount === 1 ? '' : 's'} arrived without an active memo or with an expired memo.`,
        metric: String(unresolvedDepositCount),
        targetPath: '/merchant/deposits',
      });
    }

    for (const job of jobStatuses) {
      if (job.state === 'critical') {
        alerts.push({
          id: `job-${job.key}-critical`,
          severity: 'critical',
          category: 'operations',
          title: `${job.label} is unavailable`,
          description: job.lastError ?? 'The worker is disabled or has not reported a healthy state.',
          targetPath: '/merchant/liquidity',
          ...(job.lastFailedAt ? { createdAt: job.lastFailedAt } : {}),
        });
      } else if (job.state === 'warning') {
        alerts.push({
          id: `job-${job.key}-warning`,
          severity: 'warning',
          category: 'operations',
          title: `${job.label} reported a recent problem`,
          description: job.lastError ?? 'The worker has recent failures and should be checked.',
          targetPath: '/merchant/liquidity',
          ...(job.lastFailedAt ? { createdAt: job.lastFailedAt } : {}),
        });
      }
    }

    for (const order of pendingOrders.filter((candidate) => candidate.riskLevel !== 'low').slice(0, 3)) {
      alerts.push({
        id: `order-${order.id}`,
        severity: order.riskLevel === 'high' ? 'critical' : 'warning',
        category: 'orders',
        title: `${order.type} order needs manual review`,
        description: `${order.user.username} submitted ${order.amount.toFixed(2)} USDT. ${order.riskFlags.join(', ')}.`,
        createdAt: order.createdAt,
        metric: `${order.amount.toFixed(2)} USDT`,
        targetPath: '/merchant/orders',
      });
    }

    for (const deposit of recentUnmatchedDeposits.slice(0, 2)) {
      alerts.push({
        id: `deposit-${deposit.txHash}`,
        severity: 'info',
        category: 'deposits',
        title: 'Recent deposit is waiting for memo reconciliation',
        description: `Unmatched deposit ${usdtRawToNumber(deposit.receivedRaw).toFixed(2)} USDT with memo "${deposit.comment || 'empty'}".`,
        createdAt: deposit.recordedAt.toISOString(),
        targetPath: '/merchant/deposits',
      });
    }

    return {
      generatedAt: now.toISOString(),
      overview: {
        pendingOrderCount,
        highRiskPendingOrderCount,
        pendingBuyVolumeUsdt,
        pendingSellVolumeUsdt,
        completedVolume24hUsdt,
        completedTrades24h: doneOrders.length,
        oldestPendingMinutes,
        volumeSeries: buildVolumeSeries(doneOrders, now),
      },
      actionQueue: pendingOrders.slice(0, 8),
      liquidity: {
        hotWalletAddress: runtime.hotWalletAddress,
        hotJettonWallet: runtime.hotJettonWallet,
        merchantConfig,
        tonBalanceTon: balanceSnapshot.tonBalanceTon,
        onChainUsdtBalanceUsdt: balanceSnapshot.onChainUsdtBalanceUsdt,
        ledgerUsdtBalanceUsdt,
        usdtDeltaUsdt,
        depositFlow24hUsdt,
        withdrawalFlow24hUsdt,
        queuedWithdrawalCount: withdrawalCounts.queued,
        processingWithdrawalCount: withdrawalCounts.processing + withdrawalCounts.sent,
        stuckWithdrawalCount: withdrawalCounts.stuck,
        failedWithdrawalCount: withdrawalCounts.failed,
        unresolvedDepositCount,
        jobs: jobStatuses,
        systemCommissionUsdt,
        ...(balanceSnapshot.error ? { balanceError: balanceSnapshot.error } : {}),
      },
      alerts: sortAlerts(alerts),
    };
  }

  static async getOrderDesk(options: {
    page: number;
    pageSize: number;
    status: 'ALL' | 'PENDING' | 'DONE' | 'REJECTED';
    type: 'ALL' | 'BUY' | 'SELL';
  }): Promise<MerchantOrderDeskResponseDTO> {
    const filter: Record<string, unknown> = {};

    if (options.status !== 'ALL') {
      filter.status = options.status;
    }

    if (options.type !== 'ALL') {
      filter.type = options.type;
    }

    const [total, ordersResult] = await Promise.all([
      Order.countDocuments(filter),
      fetchOrders({
        filter,
        page: options.page,
        pageSize: options.pageSize,
      }),
    ]);

    return {
      filters: {
        page: options.page,
        pageSize: options.pageSize,
        status: options.status,
        type: options.type,
      },
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
      },
      orders: ordersResult.items,
    };
  }
}

export interface JwtUser {
  id: string;
  isAdmin: boolean;
  tokenVersion: number;
}

export interface ApiErrorDTO {
  code: string;
  message: string;
  details?: unknown;
}

export interface UserStatsDTO {
  wins: number;
  losses: number;
  draws: number;
}

export interface UserDTO {
  id: string;
  username: string;
  email: string;
  balance: number;
  elo: number;
  isAdmin: boolean;
  stats: UserStatsDTO;
}

export interface UserProfileDTO {
  id: string;
  username: string;
  elo: number;
  stats: UserStatsDTO;
}

export interface LeaderboardUserDTO {
  id: string;
  username: string;
  elo: number;
}

export interface AuthResponseDTO {
  user: UserDTO;
}

export interface MatchMoveDTO {
  userId: string;
  col: number;
  row: number;
}

export interface MatchDTO {
  _id?: string;
  roomId: string;
  p1Username: string;
  p2Username?: string;
  player1Id: string;
  player2Id?: string;
  status: 'waiting' | 'active' | 'completed';
  winnerId?: string;
  wager: number;
  isPrivate: boolean;
  moveHistory: MatchMoveDTO[];
  projectedWinnerAmount?: number;
  commissionRate?: number;
  settlementReason?: 'winner' | 'draw' | 'waiting_expired' | 'active_expired' | 'resigned';
  lastActivityAt?: string;
  createdAt?: string;
  inviteUrl?: string;
}

export interface OrderUserDTO {
  id: string;
  username: string;
}

export interface TelegramOrderProofDTO {
  provider: 'telegram';
  url: string;
  messageId: string;
  chatId: string;
}

export type FiatCurrency = 'KES';

export interface OrderDTO {
  _id: string;
  userId: string | OrderUserDTO;
  type: 'BUY' | 'SELL';
  amount: number;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  proof?: TelegramOrderProofDTO;
  transactionCode?: string;
  fiatCurrency?: FiatCurrency;
  exchangeRate?: number;
  fiatTotal?: number;
  createdAt: string;
}

export type MerchantRiskLevel = 'low' | 'medium' | 'high';
export type MerchantAlertSeverity = 'critical' | 'warning' | 'info';
export type MerchantAlertCategory = 'orders' | 'liquidity' | 'operations' | 'deposits' | 'withdrawals';
export type MerchantJobKey =
  | 'depositPoller'
  | 'withdrawalWorker'
  | 'withdrawalConfirmation'
  | 'hotWalletMonitor'
  | 'staleMatchExpiry';

export interface MerchantVolumePointDTO {
  bucketStart: string;
  bucketLabel: string;
  completedVolumeUsdt: number;
  completedCount: number;
}

export interface MerchantOrderDeskItemDTO {
  id: string;
  user: OrderUserDTO;
  type: 'BUY' | 'SELL';
  amount: number;
  status: OrderDTO['status'];
  createdAt: string;
  waitMinutes: number;
  proof?: TelegramOrderProofDTO;
  transactionCode?: string;
  fiatCurrency?: FiatCurrency;
  exchangeRate?: number;
  fiatTotal?: number;
  riskLevel: MerchantRiskLevel;
  riskFlags: string[];
}

export interface MerchantOverviewDTO {
  pendingOrderCount: number;
  highRiskPendingOrderCount: number;
  pendingBuyVolumeUsdt: number;
  pendingSellVolumeUsdt: number;
  completedVolume24hUsdt: number;
  completedTrades24h: number;
  oldestPendingMinutes: number | null;
  volumeSeries: MerchantVolumePointDTO[];
}

export interface MerchantJobStatusDTO {
  key: MerchantJobKey;
  label: string;
  enabled: boolean;
  state: 'healthy' | 'warning' | 'critical';
  lastStartedAt?: string;
  lastSucceededAt?: string;
  lastFailedAt?: string;
  lastError?: string;
}

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'WITHDRAW_REFUND'
  | 'MATCH_WIN'
  | 'MATCH_LOSS'
  | 'MATCH_DRAW'
  | 'MATCH_REFUND'
  | 'MATCH_WAGER'
  | 'BUY_P2P'
  | 'SELL_P2P'
  | 'SELL_P2P_REFUND';

export type TransactionStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'DONE'
  | 'queued'
  | 'processing'
  | 'sent'
  | 'confirmed'
  | 'stuck'
  | 'failed';

export interface TransactionDTO {
  _id: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  createdAt: string;
  referenceId?: string;
}

export interface DepositMemoDTO {
  memo: string;
  address: string;
  instructions: string;
  expiresIn: string;
}

export interface WithdrawRequestDTO {
  toAddress: string;
  amountUsdt: number;
}

export interface WithdrawalRequestAcceptedDTO {
  success: true;
  message: string;
  status: 'queued';
  withdrawalId: string;
  statusUrl: string;
}

export interface WithdrawalStatusDTO {
  withdrawalId: string;
  status: 'queued' | 'processing' | 'sent' | 'confirmed' | 'stuck' | 'failed';
  amountUsdt: number;
  toAddress: string;
  createdAt: string;
  updatedAt?: string;
  txHash?: string;
  lastError?: string;
}

export interface MerchantConfigDTO {
  mpesaNumber: string;
  walletAddress: string;
  instructions: string;
  fiatCurrency: FiatCurrency;
  buyRateKesPerUsdt: number;
  sellRateKesPerUsdt: number;
}

export interface UpdateMerchantConfigRequestDTO {
  mpesaNumber?: string;
  walletAddress?: string;
  instructions?: string;
  buyRateKesPerUsdt?: number;
  sellRateKesPerUsdt?: number;
}

export interface MerchantLiquidityDTO {
  hotWalletAddress: string;
  hotJettonWallet: string;
  merchantConfig: MerchantConfigDTO;
  tonBalanceTon: number | null;
  onChainUsdtBalanceUsdt: number | null;
  ledgerUsdtBalanceUsdt: number;
  usdtDeltaUsdt: number | null;
  depositFlow24hUsdt: number;
  withdrawalFlow24hUsdt: number;
  queuedWithdrawalCount: number;
  processingWithdrawalCount: number;
  stuckWithdrawalCount: number;
  failedWithdrawalCount: number;
  unresolvedDepositCount: number;
  jobs: MerchantJobStatusDTO[];
  balanceError?: string;
  systemCommissionUsdt: number;
}

export interface MerchantAlertDTO {
  id: string;
  severity: MerchantAlertSeverity;
  category: MerchantAlertCategory;
  title: string;
  description: string;
  createdAt?: string;
  targetPath?: string;
  metric?: string;
}

export interface MerchantDashboardDTO {
  generatedAt: string;
  overview: MerchantOverviewDTO;
  actionQueue: MerchantOrderDeskItemDTO[];
  liquidity: MerchantLiquidityDTO;
  alerts: MerchantAlertDTO[];
}

export interface MerchantOrderDeskResponseDTO {
  filters: {
    type: 'ALL' | 'BUY' | 'SELL';
    status: 'ALL' | OrderDTO['status'];
    page: number;
    pageSize: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  orders: MerchantOrderDeskItemDTO[];
}

export type MerchantDepositMemoStatus = 'missing' | 'inactive' | 'active';
export type MerchantDepositResolutionStatus = 'open' | 'credited' | 'dismissed';
export type MerchantDepositReplayDecision =
  | 'credit'
  | 'already_processed'
  | 'already_unmatched_open'
  | 'unmatched'
  | 'rejected';

export interface MerchantDepositReviewItemDTO {
  txHash: string;
  amountRaw: string;
  amountUsdt: number;
  comment: string;
  senderJettonWallet: string | null;
  senderOwnerAddress: string | null;
  txTime: string;
  recordedAt: string;
  memoStatus: MerchantDepositMemoStatus;
  candidateUserId?: string | null;
  candidateUsername?: string | null;
  resolutionStatus: MerchantDepositResolutionStatus;
  resolvedAt?: string;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
  resolvedUserId?: string | null;
}

export interface MerchantDepositReconcileRequestDTO {
  action: 'credit' | 'dismiss';
  userId?: string;
  note?: string;
}

export interface MerchantDepositReplayRequestDTO {
  sinceUnixTime: number;
  untilUnixTime: number;
  dryRun?: boolean;
}

export interface MerchantDepositReplayTransferResultDTO {
  txHash: string;
  decision: MerchantDepositReplayDecision;
  amountRaw: string;
  amountUsdt: number;
  comment: string;
  memoStatus: MerchantDepositMemoStatus;
  candidateUserId?: string | null;
  candidateUsername?: string | null;
  senderJettonWallet: string | null;
  senderOwnerAddress: string | null;
  txTime: string;
  reason?: string;
}

export interface MerchantDepositReplayResultDTO {
  dryRun: boolean;
  sinceUnixTime: number;
  untilUnixTime: number;
  transfers: MerchantDepositReplayTransferResultDTO[];
}

export interface PreparedTonConnectDepositDTO {
  memo: string;
  address: string;
  amountUsdt: number;
  amountRaw: string;
  userJettonWalletAddress: string;
  transaction: {
    validUntil: number;
    messages: Array<{
      address: string;
      amount: string;
      payload: string;
    }>;
  };
}

export interface AuthenticatedPrincipalDTO {
  id: string;
  isAdmin: boolean;
  sessionId: string;
  deviceId: string;
  emailVerified: boolean;
  usernameComplete: boolean;
  mfaEnabled: boolean;
}

export interface ApiErrorDTO {
  code: string;
  message: string;
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  details?: unknown;
}

export type UsdtAmountString = string;
export type KesAmountString = string;
export type RateString = string;
export type TonAmountString = string;

export interface UserStatsDTO {
  wins: number;
  losses: number;
  draws: number;
}

export interface UserDTO {
  id: string;
  username: string;
  email: string;
  balance: UsdtAmountString;
  elo: number;
  isAdmin: boolean;
  stats: UserStatsDTO;
  emailVerifiedAt?: string;
  hasPassword?: boolean;
  mfaEnabled?: boolean;
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

export interface SessionListItemDTO {
  id: string;
  deviceId: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

export type AuthStatus =
  | 'authenticated'
  | 'profile_incomplete'
  | 'pending_email_verification'
  | 'requires_mfa'
  | 'magic_link_sent'
  | 'password_reset_requested'
  | 'password_reset_complete'
  | 'email_verification_sent'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'sessions_revoked'
  | 'logged_out'
  | 'success';

export interface AuthResponseDTO {
  status: AuthStatus;
  message?: string;
  user?: UserDTO;
  session?: SessionListItemDTO;
  sessions?: SessionListItemDTO[];
  nextStep?: 'verify_email' | 'mfa_challenge' | 'complete_profile';
  challengeId?: string;
  challengeReason?: 'suspicious_login' | 'sensitive_action';
  redirectTo?: string;
  email?: string;
  previewUrl?: string;
  recoveryCodes?: string[];
  setupToken?: string;
  totpSecret?: string;
  otpauthUrl?: string;
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
  wager: UsdtAmountString;
  isPrivate: boolean;
  moveHistory: MatchMoveDTO[];
  projectedWinnerAmount?: UsdtAmountString;
  commissionRate?: RateString;
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
  amount: UsdtAmountString;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  proof?: TelegramOrderProofDTO;
  transactionCode?: string;
  fiatCurrency?: FiatCurrency;
  exchangeRate?: RateString;
  fiatTotal?: KesAmountString;
  createdAt: string;
}

export type MerchantRiskLevel = 'low' | 'medium' | 'high';
export type MerchantAlertSeverity = 'critical' | 'warning' | 'info';
export type MerchantAlertCategory = 'orders' | 'liquidity' | 'operations' | 'deposits' | 'withdrawals';
export type MerchantJobKey =
  | 'depositPoller'
  | 'orderProofRelay'
  | 'withdrawalWorker'
  | 'withdrawalConfirmation'
  | 'hotWalletMonitor'
  | 'staleMatchExpiry';

export interface MerchantVolumePointDTO {
  bucketStart: string;
  bucketLabel: string;
  completedVolumeUsdt: UsdtAmountString;
  completedCount: number;
}

export interface MerchantOrderDeskItemDTO {
  id: string;
  user: OrderUserDTO;
  type: 'BUY' | 'SELL';
  amount: UsdtAmountString;
  status: OrderDTO['status'];
  createdAt: string;
  waitMinutes: number;
  proof?: TelegramOrderProofDTO;
  transactionCode?: string;
  fiatCurrency?: FiatCurrency;
  exchangeRate?: RateString;
  fiatTotal?: KesAmountString;
  riskLevel: MerchantRiskLevel;
  riskFlags: string[];
}

export interface MerchantOverviewDTO {
  pendingOrderCount: number;
  highRiskPendingOrderCount: number;
  pendingBuyVolumeUsdt: UsdtAmountString;
  pendingSellVolumeUsdt: UsdtAmountString;
  completedVolume24hUsdt: UsdtAmountString;
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
  amount: UsdtAmountString;
  status: TransactionStatus;
  createdAt: string;
  referenceId?: string;
}

export interface TransactionFeedDTO {
  items: TransactionDTO[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DepositMemoDTO {
  memo: string;
  address: string;
  instructions: string;
  expiresIn: string;
}

export interface WithdrawRequestDTO {
  toAddress: string;
  amountUsdt: UsdtAmountString;
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
  amountUsdt: UsdtAmountString;
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
  buyRateKesPerUsdt: RateString;
  sellRateKesPerUsdt: RateString;
}

export interface UpdateMerchantConfigRequestDTO {
  mpesaNumber?: string;
  walletAddress?: string;
  instructions?: string;
  buyRateKesPerUsdt?: RateString;
  sellRateKesPerUsdt?: RateString;
}

export interface MerchantLiquidityDTO {
  hotWalletAddress: string;
  hotJettonWallet: string;
  merchantConfig: MerchantConfigDTO;
  tonBalanceTon: TonAmountString | null;
  onChainUsdtBalanceUsdt: UsdtAmountString | null;
  ledgerUsdtBalanceUsdt: UsdtAmountString;
  usdtDeltaUsdt: UsdtAmountString | null;
  depositFlow24hUsdt: UsdtAmountString;
  withdrawalFlow24hUsdt: UsdtAmountString;
  queuedWithdrawalCount: number;
  processingWithdrawalCount: number;
  stuckWithdrawalCount: number;
  failedWithdrawalCount: number;
  unresolvedDepositCount: number;
  jobs: MerchantJobStatusDTO[];
  balanceError?: string;
  systemCommissionUsdt: UsdtAmountString;
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
  amountUsdt: UsdtAmountString;
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
  amountUsdt: UsdtAmountString;
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
  amountUsdt: UsdtAmountString;
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

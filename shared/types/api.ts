export interface JwtUser {
  id: string;
  isAdmin: boolean;
  tokenVersion: number;
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
  balance: number;
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
  createdAt?: string;
}

export interface OrderDTO {
  _id: string;
  userId: string | { username: string };
  type: 'BUY' | 'SELL';
  amount: number;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  proofImageUrl?: string;
  createdAt: string;
}

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'MATCH_WIN'
  | 'MATCH_LOSS'
  | 'MATCH_DRAW'
  | 'MATCH_WAGER'
  | 'BUY_P2P'
  | 'SELL_P2P';

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
  deepLink?: string;
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

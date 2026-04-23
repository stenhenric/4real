export interface UserDTO {
  id: string;
  username: string;
  email: string;
  balance: number;
  elo: number;
  isAdmin: boolean;
  stats?: { wins: number; losses: number; draws: number };
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

export interface TransactionDTO {
  _id: string;
  type: string;
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'DONE' | 'sent' | 'queued' | 'failed';
  createdAt: string;
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

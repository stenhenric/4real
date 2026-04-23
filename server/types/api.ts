export interface JwtUser {
  id: string;
  isAdmin: boolean;
}

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

export interface WithdrawRequestDTO {
  toAddress: string;
  amountUsdt: number;
}

export interface DepositMemoDTO {
  memo: string;
  address: string;
  instructions: string;
  expiresIn: string;
}

export interface MatchMoveDTO {
  userId: string;
  col: number;
  row: number;
}

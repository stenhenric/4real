export const WITHDRAWAL_RESUME_STORAGE_KEY = '4real:withdrawal-resume-draft';
export const WITHDRAWAL_RESUME_TTL_MS = 10 * 60 * 1000;

export type WithdrawalResumeStep = 'form' | 'review';

export interface WithdrawalResumeDraft {
  version: 1;
  flow: 'withdrawal';
  asset: 'USDT';
  network: 'TON';
  step: WithdrawalResumeStep;
  amountUsdt: string;
  toAddress: string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  resumeAfterMfa: boolean;
}

type WithdrawalResumeLoadResult =
  | { status: 'ready'; draft: WithdrawalResumeDraft }
  | { status: 'missing' }
  | { status: 'expired'; message: string }
  | { status: 'invalid'; message: string };

function validateTonAddress(value: string) {
  return /^(?:EQ|UQ)[A-Za-z0-9_-]{46}$/.test(value.trim());
}

function isWithdrawalResumeDraft(value: unknown): value is WithdrawalResumeDraft {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const draft = value as Partial<WithdrawalResumeDraft>;
  return (
    draft.version === 1
    && draft.flow === 'withdrawal'
    && draft.asset === 'USDT'
    && draft.network === 'TON'
    && (draft.step === 'form' || draft.step === 'review')
    && typeof draft.amountUsdt === 'string'
    && draft.amountUsdt.trim().length > 0
    && typeof draft.toAddress === 'string'
    && validateTonAddress(draft.toAddress)
    && typeof draft.idempotencyKey === 'string'
    && draft.idempotencyKey.trim().length > 0
    && typeof draft.createdAt === 'string'
    && !Number.isNaN(Date.parse(draft.createdAt))
    && typeof draft.expiresAt === 'string'
    && !Number.isNaN(Date.parse(draft.expiresAt))
    && typeof draft.resumeAfterMfa === 'boolean'
  );
}

export function createWithdrawalResumeDraft(params: {
  amountUsdt: string;
  toAddress: string;
  step: WithdrawalResumeStep;
  idempotencyKey: string;
  createdAtMs?: number;
}): WithdrawalResumeDraft {
  const createdAtMs = params.createdAtMs ?? Date.now();
  return {
    version: 1,
    flow: 'withdrawal',
    asset: 'USDT',
    network: 'TON',
    step: params.step,
    amountUsdt: params.amountUsdt,
    toAddress: params.toAddress.trim(),
    idempotencyKey: params.idempotencyKey,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + WITHDRAWAL_RESUME_TTL_MS).toISOString(),
    resumeAfterMfa: true,
  };
}

export function saveWithdrawalResumeDraft(storage: Pick<Storage, 'setItem'>, draft: WithdrawalResumeDraft) {
  storage.setItem(WITHDRAWAL_RESUME_STORAGE_KEY, JSON.stringify(draft));
}

export function clearWithdrawalResumeDraft(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(WITHDRAWAL_RESUME_STORAGE_KEY);
}

export function loadWithdrawalResumeDraft(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  nowMs = Date.now(),
): WithdrawalResumeLoadResult {
  const rawDraft = storage.getItem(WITHDRAWAL_RESUME_STORAGE_KEY);
  if (!rawDraft) {
    return { status: 'missing' };
  }

  let parsedDraft: unknown;
  try {
    parsedDraft = JSON.parse(rawDraft);
  } catch {
    clearWithdrawalResumeDraft(storage);
    return {
      status: 'invalid',
      message: 'We could not safely restore that withdrawal. Please review the affected details.',
    };
  }

  if (!isWithdrawalResumeDraft(parsedDraft)) {
    clearWithdrawalResumeDraft(storage);
    return {
      status: 'invalid',
      message: 'We could not safely restore that withdrawal. Please review the affected details.',
    };
  }

  if (Date.parse(parsedDraft.expiresAt) <= nowMs) {
    clearWithdrawalResumeDraft(storage);
    return {
      status: 'expired',
      message: 'Your withdrawal review expired. Please review the amount and destination again.',
    };
  }

  return { status: 'ready', draft: parsedDraft };
}

export function buildWithdrawalMfaReturnPath() {
  return '/bank?view=withdraw&flow=withdrawal';
}

export function getBrowserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

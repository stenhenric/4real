import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WITHDRAWAL_RESUME_TTL_MS,
  buildWithdrawalMfaReturnPath,
  createWithdrawalResumeDraft,
  loadWithdrawalResumeDraft,
  saveWithdrawalResumeDraft,
} from '../../../../../src/features/bank/withdrawalResume.ts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('withdrawal MFA resume draft', () => {
  it('stores the safe withdrawal context needed to resume the review step', () => {
    const storage = new MemoryStorage();
    const now = Date.parse('2026-05-28T10:00:00.000Z');
    const draft = createWithdrawalResumeDraft({
      amountUsdt: '5.000000',
      toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      step: 'review',
      idempotencyKey: 'idem-withdrawal-1',
      createdAtMs: now,
    });

    saveWithdrawalResumeDraft(storage, draft);

    assert.deepEqual(loadWithdrawalResumeDraft(storage, now + 1_000), {
      status: 'ready',
      draft,
    });
  });

  it('treats expired withdrawal context as recoverable without trusting stale data', () => {
    const storage = new MemoryStorage();
    const now = Date.parse('2026-05-28T10:00:00.000Z');
    saveWithdrawalResumeDraft(storage, createWithdrawalResumeDraft({
      amountUsdt: '5.000000',
      toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      step: 'review',
      idempotencyKey: 'idem-withdrawal-2',
      createdAtMs: now,
    }));

    assert.deepEqual(loadWithdrawalResumeDraft(storage, now + WITHDRAWAL_RESUME_TTL_MS + 1), {
      status: 'expired',
      message: 'Your withdrawal review expired. Please review the amount and destination again.',
    });
    assert.equal(storage.length, 0);
  });

  it('rejects invalid saved context instead of resuming unsafe data', () => {
    const storage = new MemoryStorage();
    storage.setItem('4real:withdrawal-resume-draft', JSON.stringify({
      version: 1,
      flow: 'withdrawal',
      asset: 'USDT',
      network: 'TON',
      step: 'review',
      amountUsdt: '5.000000',
      toAddress: 'not-a-ton-address',
      idempotencyKey: 'idem-withdrawal-3',
      createdAt: '2026-05-28T10:00:00.000Z',
      expiresAt: '2026-05-28T10:10:00.000Z',
      resumeAfterMfa: true,
    }));

    assert.deepEqual(loadWithdrawalResumeDraft(storage, Date.parse('2026-05-28T10:01:00.000Z')), {
      status: 'invalid',
      message: 'We could not safely restore that withdrawal. Please review the affected details.',
    });
    assert.equal(storage.length, 0);
  });

  it('builds a bank withdrawal return path with flow context for MFA', () => {
    assert.equal(buildWithdrawalMfaReturnPath(), '/bank?view=withdraw&flow=withdrawal');
  });
});

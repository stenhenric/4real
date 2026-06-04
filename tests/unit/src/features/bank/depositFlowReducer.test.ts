import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialDepositFlowState,
  depositFlowReducer,
} from '../../../../../src/features/bank/depositFlowReducer.ts';
import type { DepositMemoDTO } from '../../../../../src/types/api.ts';

const memo: DepositMemoDTO = {
  memo: 'deposit-memo',
  address: 'EQaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  instructions: 'Send exactly with memo',
  expiresIn: '15m',
  expiresAt: '2026-01-01T00:15:00.000Z',
};

describe('depositFlowReducer', () => {
  it('starts at the amount step with no pending work', () => {
    assert.deepEqual(createInitialDepositFlowState(), {
      step: 'amount',
      depositAmount: '',
      amountError: null,
      reviewAmount: null,
      paymentDetails: null,
      loadingDetails: false,
      sendingTransaction: false,
    });
  });

  it('keeps amount edits as a full reset to the amount step', () => {
    const reviewed = depositFlowReducer(createInitialDepositFlowState(), {
      type: 'DETAILS_READY',
      data: memo,
      amountUsdt: '12.000000',
    });

    assert.deepEqual(depositFlowReducer(reviewed, { type: 'AMOUNT_CHANGED', value: '13' }), {
      step: 'amount',
      depositAmount: '13',
      amountError: null,
      reviewAmount: null,
      paymentDetails: null,
      loadingDetails: false,
      sendingTransaction: false,
    });
  });

  it('records validation errors without leaving a later step active', () => {
    const state = depositFlowReducer(createInitialDepositFlowState(), {
      type: 'AMOUNT_INVALID',
      message: 'Deposit amount must be greater than zero.',
    });

    assert.equal(state.step, 'amount');
    assert.equal(state.amountError, 'Deposit amount must be greater than zero.');
    assert.equal(state.reviewAmount, null);
  });

  it('moves through review and payment-detail request transitions', () => {
    const reviewed = depositFlowReducer(createInitialDepositFlowState(), {
      type: 'REVIEW_READY',
      amountUsdt: '10.000000',
    });
    assert.equal(reviewed.step, 'review');
    assert.equal(reviewed.reviewAmount, '10.000000');
    assert.equal(reviewed.amountError, null);

    const loading = depositFlowReducer(reviewed, { type: 'DETAILS_REQUESTED' });
    assert.equal(loading.loadingDetails, true);

    const ready = depositFlowReducer(loading, {
      type: 'DETAILS_READY',
      data: memo,
      amountUsdt: '10.000000',
    });
    assert.equal(ready.step, 'details');
    assert.deepEqual(ready.paymentDetails, { data: memo, amountUsdt: '10.000000' });
    assert.equal(ready.loadingDetails, false);
  });

  it('clears loading flags for failed detail and transaction attempts', () => {
    const loadingDetails = depositFlowReducer(createInitialDepositFlowState(), { type: 'DETAILS_REQUESTED' });
    assert.equal(depositFlowReducer(loadingDetails, { type: 'DETAILS_FAILED' }).loadingDetails, false);

    const sending = depositFlowReducer(createInitialDepositFlowState(), { type: 'TRANSACTION_STARTED' });
    assert.equal(sending.sendingTransaction, true);
    assert.equal(depositFlowReducer(sending, { type: 'TRANSACTION_FAILED' }).sendingTransaction, false);
  });

  it('moves to pending after a sent transaction and can reset to amount entry', () => {
    const details = depositFlowReducer(createInitialDepositFlowState(), {
      type: 'DETAILS_READY',
      data: memo,
      amountUsdt: '20.000000',
    });
    const pending = depositFlowReducer(
      depositFlowReducer(details, { type: 'TRANSACTION_STARTED' }),
      { type: 'TRANSACTION_SENT' },
    );

    assert.equal(pending.step, 'pending');
    assert.equal(pending.sendingTransaction, false);

    const reset = depositFlowReducer(pending, { type: 'RESET_TO_AMOUNT' });
    assert.equal(reset.step, 'amount');
    assert.equal(reset.reviewAmount, null);
    assert.equal(reset.paymentDetails, null);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialWithdrawalFlowState,
  withdrawalFlowReducer,
  type WithdrawalFieldErrors,
} from '../../../../../src/features/bank/withdrawalFlowReducer.ts';
import type { WithdrawalRequestAcceptedDTO, WithdrawalStatusDTO } from '../../../../../src/types/api.ts';

const accepted: WithdrawalRequestAcceptedDTO = {
  success: true,
  message: 'Queued',
  status: 'queued',
  withdrawalId: 'wd-1',
  statusUrl: '/transactions/withdraw/wd-1/status',
};

const status: WithdrawalStatusDTO = {
  withdrawalId: 'wd-1',
  status: 'processing',
  amountUsdt: '2.000000',
  toAddress: 'EQaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('withdrawalFlowReducer', () => {
  it('starts with a blank form and no impossible status state', () => {
    assert.deepEqual(createInitialWithdrawalFlowState(), {
      step: 'form',
      amount: '',
      toAddress: '',
      fieldErrors: {},
      reviewAmount: null,
      loading: false,
      acceptedWithdrawal: null,
      withdrawalStatus: null,
      statusError: null,
    });
  });

  it('prefills a connected wallet only while the form address is blank', () => {
    const prefilled = withdrawalFlowReducer(createInitialWithdrawalFlowState(), {
      type: 'CONNECTED_WALLET_PREFILLED',
      toAddress: 'EQconnected',
    });
    assert.equal(prefilled.toAddress, 'EQconnected');

    const edited = withdrawalFlowReducer(prefilled, { type: 'FIELD_CHANGED', field: 'toAddress', value: 'EQmanual' });
    assert.equal(
      withdrawalFlowReducer(edited, { type: 'CONNECTED_WALLET_PREFILLED', toAddress: 'EQignored' }).toAddress,
      'EQmanual',
    );
  });

  it('keeps validation failures on the form step', () => {
    const errors: WithdrawalFieldErrors = { amount: 'Too small', toAddress: 'Invalid address' };
    const next = withdrawalFlowReducer(createInitialWithdrawalFlowState(), {
      type: 'VALIDATION_FAILED',
      fieldErrors: errors,
    });

    assert.equal(next.step, 'form');
    assert.deepEqual(next.fieldErrors, errors);
  });

  it('moves to review with a normalized amount and clears stale status errors', () => {
    const failed = withdrawalFlowReducer(createInitialWithdrawalFlowState(), {
      type: 'STATUS_FAILED',
      message: 'Status unavailable.',
    });
    const reviewed = withdrawalFlowReducer(failed, { type: 'REVIEW_READY', amountUsdt: '2.000000' });

    assert.equal(reviewed.step, 'review');
    assert.equal(reviewed.reviewAmount, '2.000000');
    assert.equal(reviewed.statusError, null);
  });

  it('field edits return later steps to a clean form state', () => {
    const statusState = withdrawalFlowReducer(createInitialWithdrawalFlowState(), {
      type: 'SUBMIT_ACCEPTED',
      acceptedWithdrawal: accepted,
      withdrawalStatus: status,
    });
    const edited = withdrawalFlowReducer(statusState, { type: 'FIELD_CHANGED', field: 'amount', value: '3' });

    assert.equal(edited.step, 'form');
    assert.equal(edited.amount, '3');
    assert.equal(edited.acceptedWithdrawal, null);
    assert.equal(edited.withdrawalStatus, null);
    assert.equal(edited.reviewAmount, null);
  });

  it('models submit and status polling success and failure transitions', () => {
    const loading = withdrawalFlowReducer(createInitialWithdrawalFlowState(), { type: 'SUBMIT_STARTED' });
    assert.equal(loading.loading, true);

    const acceptedState = withdrawalFlowReducer(loading, {
      type: 'SUBMIT_ACCEPTED',
      acceptedWithdrawal: accepted,
      withdrawalStatus: status,
    });
    assert.equal(acceptedState.step, 'status');
    assert.equal(acceptedState.loading, false);
    assert.equal(acceptedState.acceptedWithdrawal, accepted);

    const failedStatus = withdrawalFlowReducer(acceptedState, { type: 'STATUS_FAILED', message: 'Retry later.' });
    assert.equal(failedStatus.statusError, 'Retry later.');
    assert.equal(
      withdrawalFlowReducer(failedStatus, { type: 'STATUS_RECEIVED', withdrawalStatus: status }).statusError,
      null,
    );

    assert.equal(withdrawalFlowReducer(loading, { type: 'SUBMIT_FAILED' }).loading, false);
  });

  it('hydrates MFA resume details and preserves retry/cancel errors without side effects', () => {
    const ready = withdrawalFlowReducer(createInitialWithdrawalFlowState(), {
      type: 'MFA_RESUME_READY',
      amountUsdt: '5.000000',
      toAddress: status.toAddress,
      step: 'review',
    });

    assert.equal(ready.amount, '5.000000');
    assert.equal(ready.toAddress, status.toAddress);
    assert.equal(ready.reviewAmount, '5.000000');
    assert.equal(ready.step, 'review');

    assert.equal(
      withdrawalFlowReducer(ready, {
        type: 'MFA_FAILED',
        message: 'Verification failed. Your withdrawal details are still here.',
      }).statusError,
      'Verification failed. Your withdrawal details are still here.',
    );

    assert.equal(
      withdrawalFlowReducer(ready, {
        type: 'MFA_CANCELLED',
        message: 'Verification was cancelled. Your withdrawal details are still here.',
      }).statusError,
      'Verification was cancelled. Your withdrawal details are still here.',
    );
  });

  it('can reset to the editable form without erasing current field values', () => {
    const ready = withdrawalFlowReducer(createInitialWithdrawalFlowState(), {
      type: 'MFA_RESUME_READY',
      amountUsdt: '5.000000',
      toAddress: status.toAddress,
      step: 'review',
    });
    const reset = withdrawalFlowReducer(ready, { type: 'RESET_TO_FORM' });

    assert.equal(reset.step, 'form');
    assert.equal(reset.amount, '5.000000');
    assert.equal(reset.toAddress, status.toAddress);
    assert.equal(reset.reviewAmount, null);
  });
});

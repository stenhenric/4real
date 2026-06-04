import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialMerchantTradeState,
  merchantTradeReducer,
} from '../../../../../src/features/bank/merchantTradeReducer.ts';

const proof = { name: 'proof.png', size: 100, lastModified: 1 } as File;

describe('merchantTradeReducer', () => {
  it('starts on the buy tab with an empty form', () => {
    assert.deepEqual(createInitialMerchantTradeState(), {
      activeTab: 'buy',
      amount: '',
      proofImage: null,
      transactionCode: '',
      paymentConfirmed: false,
      mpesaNumber: '',
      mpesaName: '',
      loading: false,
    });
  });

  it('resets trade form fields when tabs change', () => {
    const filled = merchantTradeReducer(createInitialMerchantTradeState(), {
      type: 'BUY_PROOF_SELECTED',
      proofImage: proof,
    });
    const confirmed = merchantTradeReducer(filled, { type: 'PAYMENT_CONFIRMED' });
    const next = merchantTradeReducer(confirmed, { type: 'TAB_CHANGED', tab: 'sell' });

    assert.equal(next.activeTab, 'sell');
    assert.equal(next.proofImage, null);
    assert.equal(next.paymentConfirmed, false);
  });

  it('amount edits clear proof, code, and confirmation state', () => {
    let state = merchantTradeReducer(createInitialMerchantTradeState(), { type: 'BUY_PROOF_SELECTED', proofImage: proof });
    state = merchantTradeReducer(state, { type: 'BUY_CODE_CHANGED', value: 'ABC123' });
    state = merchantTradeReducer(state, { type: 'PAYMENT_CONFIRMED' });

    assert.deepEqual(merchantTradeReducer(state, { type: 'AMOUNT_CHANGED', value: '15' }), {
      activeTab: 'buy',
      amount: '15',
      proofImage: null,
      transactionCode: '',
      paymentConfirmed: false,
      mpesaNumber: '',
      mpesaName: '',
      loading: false,
    });
  });

  it('updates buy and sell details independently', () => {
    let state = merchantTradeReducer(createInitialMerchantTradeState(), { type: 'BUY_PROOF_SELECTED', proofImage: proof });
    state = merchantTradeReducer(state, { type: 'BUY_CODE_CHANGED', value: 'XYZ789' });
    state = merchantTradeReducer(state, {
      type: 'SELL_DETAILS_CHANGED',
      mpesaNumber: '0712345678',
      mpesaName: 'Ada Lovelace',
    });

    assert.equal(state.proofImage, proof);
    assert.equal(state.transactionCode, 'XYZ789');
    assert.equal(state.mpesaNumber, '0712345678');
    assert.equal(state.mpesaName, 'Ada Lovelace');
  });

  it('models submit started, failed, succeeded, and manual reset', () => {
    const loading = merchantTradeReducer(createInitialMerchantTradeState(), { type: 'SUBMIT_STARTED' });
    assert.equal(loading.loading, true);

    assert.equal(merchantTradeReducer(loading, { type: 'SUBMIT_FAILED' }).loading, false);

    const filled = merchantTradeReducer(loading, { type: 'AMOUNT_CHANGED', value: '44' });
    const succeeded = merchantTradeReducer(filled, { type: 'SUBMIT_SUCCEEDED' });
    assert.equal(succeeded.loading, false);
    assert.equal(succeeded.amount, '');

    const confirmed = merchantTradeReducer(filled, { type: 'PAYMENT_CONFIRMED' });
    const reset = merchantTradeReducer(confirmed, { type: 'RESET' });
    assert.equal(reset.paymentConfirmed, false);
    assert.equal(reset.activeTab, 'buy');
  });
});

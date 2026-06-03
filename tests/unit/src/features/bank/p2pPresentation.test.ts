import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatP2pOrderReference,
  getP2pCompactSummary,
  getP2pOrderStatusLabel,
  getP2pTradeRequirements,
  getP2pTradeSummary,
  getPendingP2pOrders,
  isSellAmountWithinAvailableBalance,
} from '../../../../../src/features/bank/p2pPresentation.ts';
import type { OrderDTO } from '../../../../../src/types/api.ts';

function order(overrides: Partial<OrderDTO> = {}): OrderDTO {
  return {
    _id: 'order_1234567890abcdef',
    userId: 'user-1',
    type: 'BUY',
    amount: '10.000000',
    status: 'PENDING',
    fiatCurrency: 'KES',
    exchangeRate: '138.000000',
    fiatTotal: '1380.00',
    createdAt: '2026-06-03T04:12:00.000Z',
    ...overrides,
  };
}

describe('P2P presentation helpers', () => {
  it('maps order statuses to normal-user labels', () => {
    assert.equal(getP2pOrderStatusLabel('PENDING'), 'Pending');
    assert.equal(getP2pOrderStatusLabel('DONE'), 'Completed');
    assert.equal(getP2pOrderStatusLabel('REJECTED'), 'Failed');
  });

  it('formats order references without exposing raw TX prefixes', () => {
    assert.equal(formatP2pOrderReference('order_1234567890abcdef'), 'Order order_12345');
  });

  it('counts pending P2P orders', () => {
    assert.deepEqual(getPendingP2pOrders([
      order({ _id: 'pending-buy', status: 'PENDING' }),
      order({ _id: 'done-sell', type: 'SELL', status: 'DONE' }),
    ]).map((item) => item._id), ['pending-buy']);
  });

  it('shows missing buy requirements in the order a user can satisfy them', () => {
    assert.deepEqual(getP2pTradeRequirements({
      type: 'buy',
      hasValidAmount: true,
      rateConfigured: true,
      paymentConfirmed: true,
      hasTransactionCode: false,
      hasProofImage: false,
    }), [
      'Enter your M-Pesa transaction code.',
      'Upload your M-Pesa payment screenshot.',
    ]);
  });

  it('shows sell amount availability before review', () => {
    assert.equal(isSellAmountWithinAvailableBalance('124.500000', '124.500000'), true);
    assert.equal(isSellAmountWithinAvailableBalance('124.500000', '124.500001'), false);
  });

  it('uses normal-user trade summaries', () => {
    assert.equal(getP2pTradeSummary(order({ type: 'BUY' })), 'Buy USDT');
    assert.equal(getP2pTradeSummary(order({ type: 'SELL' })), 'Sell USDT');
  });

  it('builds compact mobile summary labels without repeating card logic', () => {
    assert.deepEqual(getP2pCompactSummary({
      availableBalance: '124.500000',
      pendingOrderCount: 2,
      merchantConfig: {
        mpesaNumber: '123456',
        walletAddress: 'UQWallet',
        instructions: 'Use M-Pesa.',
        fiatCurrency: 'KES',
        buyRateKesPerUsdt: '138.000000',
        sellRateKesPerUsdt: '136.000000',
      },
    }), {
      availableBalance: '124.5',
      pendingOrders: '2',
      buyRate: '138 KES',
      sellRate: '136 KES',
    });
  });
});

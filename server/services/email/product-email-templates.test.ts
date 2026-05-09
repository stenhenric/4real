import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDepositEmail,
  buildMerchantAlertEmail,
  buildOrderEmail,
  buildWithdrawalEmail,
} from './productEmailTemplates.ts';

test('buildOrderEmail formats order notifications and escapes HTML fields', () => {
  const merchantEmail = buildOrderEmail({
    scenario: 'order_created_merchant',
    orderType: 'BUY',
    orderId: 'order-123',
    amountUsdt: '250',
    fiatCurrency: 'KES',
    fiatTotal: '32,500',
    exchangeRate: '130',
    transactionCode: 'TX-456',
    username: '<alice>',
    actionUrl: 'https://example.com/orders/order-123',
  });

  assert.equal(merchantEmail.subject, 'New BUY order needs merchant review');
  assert.match(merchantEmail.text, /250/);
  assert.match(merchantEmail.text, /Fiat currency: KES/);
  assert.match(merchantEmail.text, /Action: https:\/\/example\.com\/orders\/order-123/);
  assert.match(merchantEmail.text, /TX-456/);
  assert.match(merchantEmail.html, /&lt;alice&gt;/);
  assert.match(merchantEmail.html, /href="https:\/\/example\.com\/orders\/order-123"/);
  assert.doesNotMatch(merchantEmail.html, /<alice>/);

  const userEmail = buildOrderEmail({
    scenario: 'order_approved_user',
    orderType: 'SELL',
    orderId: 'order-789',
    amountUsdt: '125',
    transactionCode: 'TX-999',
    username: 'alice',
  });

  assert.equal(userEmail.subject, 'Your SELL order was approved');
  assert.match(userEmail.text, /order-789/);
  assert.doesNotMatch(userEmail.text, /Fiat currency:/);

  assert.equal(
    buildOrderEmail({
      scenario: 'order_created_user',
      orderType: 'BUY',
      orderId: 'order-456',
      amountUsdt: '150',
      transactionCode: 'TX-111',
      username: 'bob',
    }).subject,
    'Your BUY order was submitted',
  );
  assert.equal(
    buildOrderEmail({
      scenario: 'order_rejected_user',
      orderType: 'SELL',
      orderId: 'order-987',
      amountUsdt: '175',
      transactionCode: 'TX-222',
      username: 'carol',
    }).subject,
    'Your SELL order was rejected',
  );
});

test('buildDepositEmail formats deposit notifications and escapes HTML fields', () => {
  const confirmedEmail = buildDepositEmail({
    scenario: 'deposit_confirmed_user',
    txHash: 'tx-123',
    amountUsdt: '75',
    memo: 'memo-456',
    memoStatus: 'active',
    username: 'alice',
    senderAddress: 'EQ-sender',
  });

  assert.equal(confirmedEmail.subject, 'Your 4real deposit was credited');
  assert.match(confirmedEmail.text, /75/);
  assert.match(confirmedEmail.text, /memo-456/);
  assert.match(confirmedEmail.text, /Memo status: active/);

  const unmatchedEmail = buildDepositEmail({
    scenario: 'deposit_unmatched_merchant',
    txHash: 'tx-456',
    amountUsdt: '80',
    memo: '<missing>',
    username: 'bob',
    note: '',
    reason: null,
  });

  assert.equal(unmatchedEmail.subject, 'Unmatched deposit needs review');
  assert.match(unmatchedEmail.html, /&lt;missing&gt;/);
  assert.doesNotMatch(unmatchedEmail.html, /<missing>/);
  assert.doesNotMatch(unmatchedEmail.text, /Note:/);
  assert.doesNotMatch(unmatchedEmail.text, /Reason:/);

  assert.equal(
    buildDepositEmail({
      scenario: 'deposit_reconciled_user',
      txHash: 'tx-789',
      amountUsdt: '85',
      memo: 'memo-789',
      username: 'carol',
    }).subject,
    'Your deposit was credited after review',
  );
  assert.equal(
    buildDepositEmail({
      scenario: 'deposit_dismissed_merchant',
      txHash: 'tx-987',
      amountUsdt: '90',
      memo: 'memo-987',
      username: 'dave',
    }).subject,
    'Deposit review was dismissed',
  );
  assert.equal(
    buildDepositEmail({
      scenario: 'deposit_rejected_merchant',
      txHash: 'tx-654',
      amountUsdt: '95',
      memo: 'memo-654',
      username: 'erin',
    }).subject,
    'Incoming deposit was rejected',
  );
});

test('buildWithdrawalEmail formats withdrawal notifications and escapes HTML fields', () => {
  const queuedEmail = buildWithdrawalEmail({
    scenario: 'withdrawal_queued_user',
    withdrawalId: 'withdrawal-123',
    amountUsdt: '40',
    toAddress: 'EQ-address',
    statusUrl: 'https://example.com/withdrawals/withdrawal-123',
    seqno: 1,
  });

  assert.equal(queuedEmail.subject, 'Your withdrawal is queued');
  assert.match(queuedEmail.text, /withdrawal-123/);
  assert.match(queuedEmail.text, /Status URL: https:\/\/example\.com\/withdrawals\/withdrawal-123/);
  assert.match(queuedEmail.text, /Seqno: 1/);

  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_sent_user',
      withdrawalId: 'withdrawal-456',
      amountUsdt: '45',
      toAddress: 'EQ-address-2',
      txHash: 'tx-456',
    }).subject,
    'Your withdrawal was sent',
  );
  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_confirmed_user',
      withdrawalId: 'withdrawal-789',
      amountUsdt: '50',
      toAddress: 'EQ-address-3',
    }).subject,
    'Your withdrawal is confirmed',
  );

  const stuckMerchantEmail = buildWithdrawalEmail({
    scenario: 'withdrawal_stuck_merchant',
    withdrawalId: 'withdrawal-987',
    amountUsdt: '55',
    toAddress: '<bad-address>',
    lastError: '<stuck>',
  });

  assert.equal(stuckMerchantEmail.subject, 'Withdrawal needs merchant review');
  assert.match(stuckMerchantEmail.html, /&lt;bad-address&gt;/);
  assert.match(stuckMerchantEmail.html, /&lt;stuck&gt;/);
  assert.doesNotMatch(stuckMerchantEmail.html, /<bad-address>/);

  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_failed_user',
      withdrawalId: 'withdrawal-654',
      amountUsdt: '60',
      toAddress: 'EQ-address-4',
    }).subject,
    'Your withdrawal failed and was refunded',
  );
  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_stuck_user',
      withdrawalId: 'withdrawal-321',
      amountUsdt: '65',
      toAddress: 'EQ-address-5',
    }).subject,
    'Your withdrawal needs review',
  );
  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_failed_merchant',
      withdrawalId: 'withdrawal-111',
      amountUsdt: '70',
      toAddress: 'EQ-address-6',
    }).subject,
    'Withdrawal failed permanently',
  );
});

test('buildMerchantAlertEmail formats critical alerts and escapes HTML fields', () => {
  const email = buildMerchantAlertEmail({
    severity: 'critical',
    title: '<Low reserve>',
    category: 'liquidity',
    description: 'Reserve fell below threshold',
    metric: 'reserve_usdt=100',
  });

  assert.equal(email.subject, 'Critical merchant alert: <Low reserve>');
  assert.match(email.text, /liquidity/);
  assert.match(email.text, /reserve_usdt=100/);
  assert.match(email.html, /&lt;Low reserve&gt;/);
  assert.doesNotMatch(email.html, /<Low reserve>/);
});

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
    side: 'BUY',
    orderId: 'order-123',
    amount: '250 USDT',
    transactionCode: 'TX-456',
    username: '<alice>',
  });

  assert.equal(merchantEmail.subject, 'New BUY order needs merchant review');
  assert.match(merchantEmail.text, /250 USDT/);
  assert.match(merchantEmail.text, /TX-456/);
  assert.match(merchantEmail.html, /&lt;alice&gt;/);
  assert.doesNotMatch(merchantEmail.html, /<alice>/);

  const userEmail = buildOrderEmail({
    scenario: 'order_approved_user',
    side: 'SELL',
    orderId: 'order-789',
    amount: '125 USDT',
    transactionCode: 'TX-999',
    username: 'alice',
  });

  assert.equal(userEmail.subject, 'Your SELL order was approved');
  assert.match(userEmail.text, /order-789/);
});

test('buildDepositEmail formats deposit notifications and escapes HTML fields', () => {
  const confirmedEmail = buildDepositEmail({
    scenario: 'deposit_confirmed_user',
    depositId: 'deposit-123',
    amount: '75 USDT',
    memo: 'memo-456',
    username: 'alice',
  });

  assert.equal(confirmedEmail.subject, 'Your 4real deposit was credited');
  assert.match(confirmedEmail.text, /75 USDT/);
  assert.match(confirmedEmail.text, /memo-456/);

  const unmatchedEmail = buildDepositEmail({
    scenario: 'deposit_unmatched_merchant',
    depositId: 'deposit-456',
    amount: '80 USDT',
    memo: '<missing>',
    username: 'bob',
  });

  assert.equal(unmatchedEmail.subject, 'Unmatched deposit needs review');
  assert.match(unmatchedEmail.html, /&lt;missing&gt;/);
  assert.doesNotMatch(unmatchedEmail.html, /<missing>/);

  assert.equal(
    buildDepositEmail({
      scenario: 'deposit_reconciled_user',
      depositId: 'deposit-789',
      amount: '85 USDT',
      memo: 'memo-789',
      username: 'carol',
    }).subject,
    'Your deposit was credited after review',
  );
  assert.equal(
    buildDepositEmail({
      scenario: 'deposit_dismissed_merchant',
      depositId: 'deposit-987',
      amount: '90 USDT',
      memo: 'memo-987',
      username: 'dave',
    }).subject,
    'Deposit review was dismissed',
  );
  assert.equal(
    buildDepositEmail({
      scenario: 'deposit_rejected_merchant',
      depositId: 'deposit-654',
      amount: '95 USDT',
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
    amount: '40 USDT',
    destination: 'EQ-address',
    username: 'alice',
  });

  assert.equal(queuedEmail.subject, 'Your withdrawal is queued');
  assert.match(queuedEmail.text, /withdrawal-123/);

  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_sent_user',
      withdrawalId: 'withdrawal-456',
      amount: '45 USDT',
      destination: 'EQ-address-2',
      username: 'bob',
    }).subject,
    'Your withdrawal was sent',
  );
  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_confirmed_user',
      withdrawalId: 'withdrawal-789',
      amount: '50 USDT',
      destination: 'EQ-address-3',
      username: 'carol',
    }).subject,
    'Your withdrawal is confirmed',
  );

  const stuckMerchantEmail = buildWithdrawalEmail({
    scenario: 'withdrawal_stuck_merchant',
    withdrawalId: 'withdrawal-987',
    amount: '55 USDT',
    destination: '<bad-address>',
    username: 'dave',
  });

  assert.equal(stuckMerchantEmail.subject, 'Withdrawal needs merchant review');
  assert.match(stuckMerchantEmail.html, /&lt;bad-address&gt;/);
  assert.doesNotMatch(stuckMerchantEmail.html, /<bad-address>/);

  assert.equal(
    buildWithdrawalEmail({
      scenario: 'withdrawal_failed_user',
      withdrawalId: 'withdrawal-654',
      amount: '60 USDT',
      destination: 'EQ-address-4',
      username: 'erin',
    }).subject,
    'Your withdrawal failed and was refunded',
  );
});

test('buildMerchantAlertEmail formats critical alerts and escapes HTML fields', () => {
  const email = buildMerchantAlertEmail({
    severity: 'critical',
    title: '<Low reserve>',
    category: 'liquidity',
    message: 'Reserve fell below threshold',
  });

  assert.equal(email.subject, 'Critical merchant alert: <Low reserve>');
  assert.match(email.text, /liquidity/);
  assert.match(email.html, /&lt;Low reserve&gt;/);
  assert.doesNotMatch(email.html, /<Low reserve>/);
});

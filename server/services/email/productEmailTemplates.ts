export interface ProductEmailContent {
  subject: string;
  text: string;
  html: string;
}

export type OrderEmailScenario =
  | 'order_created_user'
  | 'order_created_merchant'
  | 'order_approved_user'
  | 'order_rejected_user';

export type DepositEmailScenario =
  | 'deposit_confirmed_user'
  | 'deposit_unmatched_merchant'
  | 'deposit_reconciled_user'
  | 'deposit_dismissed_merchant'
  | 'deposit_rejected_merchant';

export type WithdrawalEmailScenario =
  | 'withdrawal_queued_user'
  | 'withdrawal_sent_user'
  | 'withdrawal_confirmed_user'
  | 'withdrawal_stuck_user'
  | 'withdrawal_failed_user'
  | 'withdrawal_stuck_merchant'
  | 'withdrawal_failed_merchant';

export interface OrderEmailParams {
  scenario: OrderEmailScenario;
  side: 'BUY' | 'SELL';
  orderId: string;
  amount: string;
  transactionCode: string;
  username: string;
}

export interface DepositEmailParams {
  scenario: DepositEmailScenario;
  depositId: string;
  amount: string;
  memo: string;
  username: string;
}

export interface WithdrawalEmailParams {
  scenario: WithdrawalEmailScenario;
  withdrawalId: string;
  amount: string;
  destination: string;
  username: string;
}

export interface MerchantAlertEmailParams {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  category: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderProductEmail(params: {
  heading: string;
  summary: string;
  rows: Array<[string, string]>;
}): string {
  const rows = params.rows
    .map(
      ([label, value]) =>
        `<tr><th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${escapeHtml(label)}</th><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  return [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">',
    `<h1 style="font-size:24px;margin:0 0 16px;">${escapeHtml(params.heading)}</h1>`,
    `<p style="margin:0 0 16px;">${escapeHtml(params.summary)}</p>`,
    '<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px;">',
    '<tbody>',
    rows,
    '</tbody>',
    '</table>',
    '</div>',
  ].join('');
}

function buildText(params: { summary: string; rows: Array<[string, string]> }): string {
  return [params.summary, '', ...params.rows.map(([label, value]) => `${label}: ${value}`)].join('\n');
}

export function buildOrderEmail(params: OrderEmailParams): ProductEmailContent {
  const subjectByScenario: Record<OrderEmailScenario, string> = {
    order_created_user: `Your ${params.side} order was submitted`,
    order_created_merchant: `New ${params.side} order needs merchant review`,
    order_approved_user: `Your ${params.side} order was approved`,
    order_rejected_user: `Your ${params.side} order was rejected`,
  };
  const subject = subjectByScenario[params.scenario];
  const summary = `${params.side} order update for ${params.username}.`;
  const rows: Array<[string, string]> = [
    ['Scenario', params.scenario],
    ['Order ID', params.orderId],
    ['Side', params.side],
    ['Amount', params.amount],
    ['Transaction code', params.transactionCode],
    ['Username', params.username],
  ];

  return {
    subject,
    text: buildText({ summary, rows }),
    html: renderProductEmail({ heading: subject, summary, rows }),
  };
}

export function buildDepositEmail(params: DepositEmailParams): ProductEmailContent {
  const subjectByScenario: Record<DepositEmailScenario, string> = {
    deposit_confirmed_user: 'Your 4real deposit was credited',
    deposit_unmatched_merchant: 'Unmatched deposit needs review',
    deposit_reconciled_user: 'Your deposit was credited after review',
    deposit_dismissed_merchant: 'Deposit review was dismissed',
    deposit_rejected_merchant: 'Incoming deposit was rejected',
  };
  const subject = subjectByScenario[params.scenario];
  const summary = `Deposit update for ${params.username}.`;
  const rows: Array<[string, string]> = [
    ['Scenario', params.scenario],
    ['Deposit ID', params.depositId],
    ['Amount', params.amount],
    ['Memo', params.memo],
    ['Username', params.username],
  ];

  return {
    subject,
    text: buildText({ summary, rows }),
    html: renderProductEmail({ heading: subject, summary, rows }),
  };
}

export function buildWithdrawalEmail(params: WithdrawalEmailParams): ProductEmailContent {
  const subjectByScenario: Record<WithdrawalEmailScenario, string> = {
    withdrawal_queued_user: 'Your withdrawal is queued',
    withdrawal_sent_user: 'Your withdrawal was sent',
    withdrawal_confirmed_user: 'Your withdrawal is confirmed',
    withdrawal_stuck_user: 'Your withdrawal needs review',
    withdrawal_failed_user: 'Your withdrawal failed and was refunded',
    withdrawal_stuck_merchant: 'Withdrawal needs merchant review',
    withdrawal_failed_merchant: 'Withdrawal failed permanently',
  };
  const subject = subjectByScenario[params.scenario];
  const summary = `Withdrawal update for ${params.username}.`;
  const rows: Array<[string, string]> = [
    ['Scenario', params.scenario],
    ['Withdrawal ID', params.withdrawalId],
    ['Amount', params.amount],
    ['Destination', params.destination],
    ['Username', params.username],
  ];

  return {
    subject,
    text: buildText({ summary, rows }),
    html: renderProductEmail({ heading: subject, summary, rows }),
  };
}

export function buildMerchantAlertEmail(params: MerchantAlertEmailParams): ProductEmailContent {
  const severityLabelBySeverity: Record<MerchantAlertEmailParams['severity'], string> = {
    info: 'Info',
    warning: 'Warning',
    critical: 'Critical',
  };
  const severityLabel = severityLabelBySeverity[params.severity];
  const subject = `${severityLabel} merchant alert: ${params.title}`;
  const summary = params.message;
  const rows: Array<[string, string]> = [
    ['Severity', severityLabel],
    ['Category', params.category],
    ['Title', params.title],
    ['Message', params.message],
  ];

  return {
    subject,
    text: buildText({ summary, rows }),
    html: renderProductEmail({ heading: subject, summary, rows }),
  };
}

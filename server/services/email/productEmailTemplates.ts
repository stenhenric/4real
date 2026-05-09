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
  orderId: string;
  orderType: 'BUY' | 'SELL';
  amountUsdt: string;
  fiatCurrency?: 'KES';
  fiatTotal?: string;
  exchangeRate?: string;
  username?: string | null;
  transactionCode?: string | null;
  actionUrl?: string;
}

export interface DepositEmailParams {
  scenario: DepositEmailScenario;
  txHash: string;
  amountUsdt: string;
  memo?: string | null;
  memoStatus?: 'missing' | 'inactive' | 'active';
  username?: string | null;
  senderAddress?: string | null;
  note?: string | null;
  reason?: string | null;
  actionUrl?: string;
}

export interface WithdrawalEmailParams {
  scenario: WithdrawalEmailScenario;
  withdrawalId: string;
  amountUsdt: string;
  toAddress: string;
  statusUrl?: string;
  seqno?: number;
  txHash?: string;
  lastError?: string | null;
  actionUrl?: string;
}

export interface MerchantAlertEmailParams {
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'orders' | 'liquidity' | 'operations' | 'deposits' | 'withdrawals';
  metric?: string;
  actionUrl?: string;
}

interface EmailRow {
  label: string;
  value: string;
  href?: string;
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
  rows: EmailRow[];
}): string {
  const rows = params.rows
    .map(
      (row) =>
        `<tr><th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${escapeHtml(row.label)}</th><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${renderHtmlValue(row)}</td></tr>`,
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

function renderHtmlValue(row: EmailRow): string {
  if (row.href === undefined) {
    return escapeHtml(row.value);
  }

  return `<a href="${escapeHtml(row.href)}">${escapeHtml(row.value)}</a>`;
}

function hasValue(value: string | number | null | undefined): value is string | number {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function row(label: string, value: string | number | null | undefined, href?: string): EmailRow[] {
  if (!hasValue(value)) {
    return [];
  }

  const stringValue = String(value);
  return [{ label, value: stringValue, href }];
}

function buildText(params: { summary: string; rows: EmailRow[] }): string {
  return [params.summary, '', ...params.rows.map((item) => `${item.label}: ${item.value}`)].join('\n');
}

export function buildOrderEmail(params: OrderEmailParams): ProductEmailContent {
  const subjectByScenario: Record<OrderEmailScenario, string> = {
    order_created_user: `Your ${params.orderType} order was submitted`,
    order_created_merchant: `New ${params.orderType} order needs merchant review`,
    order_approved_user: `Your ${params.orderType} order was approved`,
    order_rejected_user: `Your ${params.orderType} order was rejected`,
  };
  const subject = subjectByScenario[params.scenario];
  const summary = `${params.orderType} order update.`;
  const rows: EmailRow[] = [
    ...row('Scenario', params.scenario),
    ...row('Order ID', params.orderId),
    ...row('Order type', params.orderType),
    ...row('Amount USDT', params.amountUsdt),
    ...row('Fiat currency', params.fiatCurrency),
    ...row('Fiat total', params.fiatTotal),
    ...row('Exchange rate', params.exchangeRate),
    ...row('Transaction code', params.transactionCode),
    ...row('Username', params.username),
    ...row('Action', params.actionUrl, params.actionUrl),
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
  const summary = 'Deposit update.';
  const rows: EmailRow[] = [
    ...row('Scenario', params.scenario),
    ...row('Tx hash', params.txHash),
    ...row('Amount USDT', params.amountUsdt),
    ...row('Memo', params.memo),
    ...row('Memo status', params.memoStatus),
    ...row('Username', params.username),
    ...row('Sender address', params.senderAddress),
    ...row('Note', params.note),
    ...row('Reason', params.reason),
    ...row('Action', params.actionUrl, params.actionUrl),
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
  const summary = 'Withdrawal update.';
  const rows: EmailRow[] = [
    ...row('Scenario', params.scenario),
    ...row('Withdrawal ID', params.withdrawalId),
    ...row('Amount USDT', params.amountUsdt),
    ...row('To address', params.toAddress),
    ...row('Status URL', params.statusUrl),
    ...row('Seqno', params.seqno),
    ...row('Tx hash', params.txHash),
    ...row('Last error', params.lastError),
    ...row('Action', params.actionUrl, params.actionUrl),
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
  const summary = params.description;
  const rows: EmailRow[] = [
    ...row('Severity', severityLabel),
    ...row('Category', params.category),
    ...row('Title', params.title),
    ...row('Description', params.description),
    ...row('Metric', params.metric),
    ...row('Action', params.actionUrl, params.actionUrl),
  ];

  return {
    subject,
    text: buildText({ summary, rows }),
    html: renderProductEmail({ heading: subject, summary, rows }),
  };
}

import { formatUserFacingDecimal } from '../../utils/money.ts';

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
  mpesaNumber?: string | null;
  mpesaName?: string | null;
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

export interface SecurityAlertEmailParams {
  subject: string;
  summary: string;
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
  actionUrl?: string | undefined;
  actionLabel?: string | undefined;
}): string {
  const rows = params.rows
    .map(
      (row) =>
        `<tr><th style="text-align:left;padding:10px 12px;border-bottom:1px solid #d1d5db;color:#1A365D;width:38%;vertical-align:top;">${escapeHtml(row.label)}</th><td style="padding:10px 12px;border-bottom:1px solid #d1d5db;color:#1A1A1A;vertical-align:top;">${renderHtmlValue(row)}</td></tr>`,
    )
    .join('');
  const table = rows
    ? [
      '<table style="border-collapse:collapse;width:100%;font-size:14px;background:#ffffff;border:1px solid #d1d5db;">',
      '<tbody>',
      rows,
      '</tbody>',
      '</table>',
    ].join('')
    : '';
  const action = params.actionUrl
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(params.actionUrl)}" style="display:inline-block;background:#1A1A1A;color:#ffffff;padding:12px 18px;text-decoration:none;border:2px solid #1A1A1A;border-radius:8px;font-weight:700;">${escapeHtml(params.actionLabel ?? 'Open 4real')}</a></p>`
    : '';

  return [
    '<div style="margin:0;padding:24px;background:#F2EFE9;color:#1A1A1A;font-family:Arial,sans-serif;line-height:1.6;">',
    '<div style="max-width:640px;margin:0 auto;background:#FBFAF7;border:2px solid #1A1A1A;border-radius:12px;padding:24px;box-shadow:4px 4px 0 rgba(26,26,26,0.10);">',
    '<p style="margin:0 0 10px;color:#1A365D;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">4real</p>',
    `<h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#1A1A1A;">${escapeHtml(params.heading)}</h1>`,
    `<p style="margin:0 0 18px;color:#374151;">${escapeHtml(params.summary)}</p>`,
    table,
    action,
    '<p style="margin:24px 0 0;color:#6b7280;font-size:12px;">This notification was sent by 4real.</p>',
    '</div>',
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

function abbreviateAddress(value: string | null | undefined): string | null | undefined {
  if (!hasValue(value)) {
    return value;
  }

  const address = String(value).trim();
  if (address.length <= 18) {
    return address;
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatDisplayDecimal(value: string | number | null | undefined): string | number | null | undefined {
  if (!hasValue(value)) {
    return value;
  }

  try {
    return formatUserFacingDecimal(value);
  } catch {
    return value;
  }
}

function row(label: string, value: string | number | null | undefined, href?: string): EmailRow[] {
  if (!hasValue(value)) {
    return [];
  }

  const stringValue = String(value);
  if (href === undefined) {
    return [{ label, value: stringValue }];
  }

  return [{ label, value: stringValue, href }];
}

function buildText(params: {
  summary: string;
  rows: EmailRow[];
  actionUrl?: string | undefined;
  actionLabel?: string | undefined;
}): string {
  return [
    params.summary,
    '',
    ...params.rows.map((item) => `${item.label}: ${item.value}`),
    ...(params.actionUrl ? ['', params.actionLabel ?? 'Open 4real', params.actionUrl] : []),
  ].join('\n');
}

function content(params: {
  subject: string;
  summary: string;
  rows: EmailRow[];
  actionUrl?: string | undefined;
  actionLabel?: string | undefined;
}): ProductEmailContent {
  return {
    subject: params.subject,
    text: buildText(params),
    html: renderProductEmail({
      heading: params.subject,
      summary: params.summary,
      rows: params.rows,
      actionUrl: params.actionUrl,
      actionLabel: params.actionLabel,
    }),
  };
}

export function buildOrderEmail(params: OrderEmailParams): ProductEmailContent {
  const subjectByScenario: Record<OrderEmailScenario, string> = {
    order_created_user: `Your ${params.orderType} order was submitted`,
    order_created_merchant: `New ${params.orderType} order needs merchant review`,
    order_approved_user: `Your ${params.orderType} order was approved`,
    order_rejected_user: `Your ${params.orderType} order was rejected`,
  };
  const subject = subjectByScenario[params.scenario];
  const summaryByScenario: Record<OrderEmailScenario, string> = {
    order_created_user: `Your ${params.orderType} order is pending merchant review.`,
    order_created_merchant: `A ${params.orderType} order was submitted and needs merchant review.`,
    order_approved_user: `Your ${params.orderType} order has been approved.`,
    order_rejected_user: `Your ${params.orderType} order was rejected. Any held balance has been released when applicable.`,
  };
  const rows: EmailRow[] = [
    ...row('Order ID', params.orderId),
    ...row('Order type', params.orderType),
    ...row('Amount USDT', formatDisplayDecimal(params.amountUsdt)),
    ...row('Fiat currency', params.fiatCurrency),
    ...row('Fiat total', formatDisplayDecimal(params.fiatTotal)),
    ...row('Exchange rate', formatDisplayDecimal(params.exchangeRate)),
    ...row('Transaction code', params.transactionCode),
    ...row('M-Pesa Number', params.mpesaNumber),
    ...row('M-Pesa Name', params.mpesaName),
    ...row('Username', params.username),
  ];

  return content({
    subject,
    summary: summaryByScenario[params.scenario],
    rows,
    actionUrl: params.actionUrl,
    actionLabel: params.scenario === 'order_created_merchant' ? 'Open order desk' : 'View order',
  });
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
  const summaryByScenario: Record<DepositEmailScenario, string> = {
    deposit_confirmed_user: 'Your USDT deposit was confirmed and credited to your 4real balance.',
    deposit_unmatched_merchant: 'An incoming USDT transfer arrived without an active memo and needs merchant review.',
    deposit_reconciled_user: 'A merchant reviewed your deposit and credited it to your 4real balance.',
    deposit_dismissed_merchant: 'An unmatched deposit review item was dismissed.',
    deposit_rejected_merchant: 'An incoming transfer was rejected during deposit ingestion.',
  };
  const rows: EmailRow[] = [
    ...row('Tx hash', params.txHash),
    ...row('Amount USDT', formatDisplayDecimal(params.amountUsdt)),
    ...row('Memo', params.memo),
    ...row('Memo status', params.memoStatus),
    ...row('Username', params.username),
    ...row('Sender address', abbreviateAddress(params.senderAddress)),
    ...row('Note', params.note),
    ...row('Reason', params.reason),
  ];

  return content({
    subject,
    summary: summaryByScenario[params.scenario],
    rows,
    actionUrl: params.actionUrl,
    actionLabel: params.scenario === 'deposit_unmatched_merchant' ? 'Review deposits' : 'Open deposits',
  });
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
  const summaryByScenario: Record<WithdrawalEmailScenario, string> = {
    withdrawal_queued_user: 'Your withdrawal request is queued for processing.',
    withdrawal_sent_user: 'Your withdrawal was submitted to the TON network and is waiting for confirmation.',
    withdrawal_confirmed_user: 'Your withdrawal was confirmed on-chain.',
    withdrawal_stuck_user: 'Your withdrawal is taking longer than expected and is being reviewed.',
    withdrawal_failed_user: 'Your withdrawal could not be completed and the held balance was refunded.',
    withdrawal_stuck_merchant: 'A withdrawal is waiting on a definitive on-chain outcome and needs review.',
    withdrawal_failed_merchant: 'A withdrawal exhausted retries and was refunded to the user.',
  };
  const isMerchantScenario = params.scenario.endsWith('_merchant');
  const rows: EmailRow[] = [
    ...row('Withdrawal ID', params.withdrawalId),
    ...row('Amount USDT', formatDisplayDecimal(params.amountUsdt)),
    ...row('To address', params.toAddress),
    ...(isMerchantScenario ? row('Seqno', params.seqno) : []),
    ...row('Tx hash', params.txHash),
    ...(isMerchantScenario ? row('Last error', params.lastError) : []),
  ];

  return content({
    subject,
    summary: summaryByScenario[params.scenario],
    rows,
    actionUrl: params.actionUrl,
    actionLabel: isMerchantScenario ? 'Open withdrawal review' : 'View withdrawal',
  });
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
  ];

  return content({
    subject,
    summary,
    rows,
    actionUrl: params.actionUrl,
    actionLabel: 'Open merchant alerts',
  });
}

export function buildSecurityAlertEmail(params: SecurityAlertEmailParams): ProductEmailContent {
  return content({
    subject: params.subject,
    summary: params.summary,
    rows: [],
  });
}

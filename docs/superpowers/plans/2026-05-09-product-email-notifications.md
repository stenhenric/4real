# Product Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build product email templates for merchant/order/deposit/withdrawal scenarios and wire best-effort automatic delivery into successful product flows.

**Architecture:** Add pure product email template builders under `server/services/email`, then add a product notification orchestration service that owns recipient lookup and best-effort delivery. Existing controllers, services, and workers call the notification service only after successful state changes.

**Tech Stack:** TypeScript, Node built-in test runner, Gmail API transport already exposed by `server/services/email/gmailService.ts`, Mongoose user model, Mongo repositories for product flows.

---

## File Structure

- Create `server/services/email/productEmailTemplates.ts`: pure template builders and scenario types.
- Create `server/services/email/product-email-templates.test.ts`: template unit tests.
- Create `server/services/product-email-notification.service.ts`: recipient lookup, delivery orchestration, test dependency injection.
- Create `server/services/product-email-notification.service.test.ts`: notification service unit tests.
- Modify `server/services/user.service.ts`: add verified admin recipient lookup.
- Modify `server/controllers/order.controller.ts`: call order notification methods after successful order creation and status updates.
- Modify `server/services/deposit-ingestion.service.ts`: call deposit notification methods after ingestion and reconciliation outcomes.
- Modify `server/controllers/transaction.controller.ts`: call withdrawal queued notification after non-replayed withdrawal request.
- Modify `server/workers/withdrawal-worker.ts`: call withdrawal transition notifications after sent, confirmed, stuck, and failed updates.
- Modify `package.json`: include new unit test files in `test:unit`.

## Task 1: Product Email Templates

**Files:**
- Create: `server/services/email/productEmailTemplates.ts`
- Create: `server/services/email/product-email-templates.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing template tests**

Create `server/services/email/product-email-templates.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMerchantAlertEmail,
  buildOrderEmail,
  buildDepositEmail,
  buildWithdrawalEmail,
} from './productEmailTemplates.ts';

test('order templates include scenario-specific subject and escaped HTML fields', () => {
  const created = buildOrderEmail({
    scenario: 'order_created_merchant',
    orderId: 'order-123',
    orderType: 'BUY',
    amountUsdt: '12.500000',
    fiatCurrency: 'KES',
    fiatTotal: '1625.00',
    exchangeRate: '130.000000',
    username: '<alice>',
    transactionCode: 'MPESA-123',
    actionUrl: 'http://127.0.0.1:3000/merchant/orders',
  });

  assert.equal(created.subject, 'New BUY order needs merchant review');
  assert.match(created.text, /12\.500000 USDT/);
  assert.match(created.text, /MPESA-123/);
  assert.match(created.html, /&lt;alice&gt;/);
  assert.doesNotMatch(created.html, /<alice>/);

  const approved = buildOrderEmail({
    scenario: 'order_approved_user',
    orderId: 'order-456',
    orderType: 'SELL',
    amountUsdt: '4.000000',
    fiatCurrency: 'KES',
    fiatTotal: '520.00',
    exchangeRate: '130.000000',
  });

  assert.equal(approved.subject, 'Your SELL order was approved');
  assert.match(approved.text, /order-456/);
});

test('deposit templates cover confirmed, unmatched, reconciled, dismissed, and rejected scenarios', () => {
  const confirmed = buildDepositEmail({
    scenario: 'deposit_confirmed_user',
    txHash: 'tx-confirmed',
    amountUsdt: '8.250000',
    memo: 'memo-123',
    username: 'alice',
  });
  assert.equal(confirmed.subject, 'Your 4real deposit was credited');
  assert.match(confirmed.text, /8\.250000 USDT/);
  assert.match(confirmed.html, /memo-123/);

  const unmatched = buildDepositEmail({
    scenario: 'deposit_unmatched_merchant',
    txHash: 'tx-unmatched',
    amountUsdt: '3.000000',
    memo: '<missing>',
    memoStatus: 'missing',
    senderAddress: 'sender-wallet',
    actionUrl: 'http://127.0.0.1:3000/merchant/deposits',
  });
  assert.equal(unmatched.subject, 'Unmatched deposit needs review');
  assert.match(unmatched.text, /missing/);
  assert.match(unmatched.html, /&lt;missing&gt;/);

  const reconciled = buildDepositEmail({
    scenario: 'deposit_reconciled_user',
    txHash: 'tx-reconciled',
    amountUsdt: '3.000000',
    memo: 'memo-old',
    note: 'credited by support',
  });
  assert.equal(reconciled.subject, 'Your deposit was credited after review');

  const dismissed = buildDepositEmail({
    scenario: 'deposit_dismissed_merchant',
    txHash: 'tx-dismissed',
    amountUsdt: '2.000000',
    memo: 'bad-memo',
    note: 'not a customer deposit',
  });
  assert.equal(dismissed.subject, 'Deposit review was dismissed');

  const rejected = buildDepositEmail({
    scenario: 'deposit_rejected_merchant',
    txHash: 'tx-rejected',
    amountUsdt: '1.000000',
    memo: '',
    reason: 'transaction_aborted',
  });
  assert.equal(rejected.subject, 'Incoming deposit was rejected');
});

test('withdrawal templates cover queued, sent, confirmed, stuck, and failed scenarios', () => {
  const queued = buildWithdrawalEmail({
    scenario: 'withdrawal_queued_user',
    withdrawalId: 'wd-queued',
    amountUsdt: '5.000000',
    toAddress: 'EQDestination',
    statusUrl: 'http://127.0.0.1:3000/bank',
  });
  assert.equal(queued.subject, 'Your withdrawal is queued');
  assert.match(queued.text, /wd-queued/);

  const sent = buildWithdrawalEmail({
    scenario: 'withdrawal_sent_user',
    withdrawalId: 'wd-sent',
    amountUsdt: '5.000000',
    toAddress: 'EQDestination',
    seqno: 77,
  });
  assert.equal(sent.subject, 'Your withdrawal was sent');

  const confirmed = buildWithdrawalEmail({
    scenario: 'withdrawal_confirmed_user',
    withdrawalId: 'wd-confirmed',
    amountUsdt: '5.000000',
    toAddress: 'EQDestination',
    txHash: 'tx-withdrawal',
  });
  assert.equal(confirmed.subject, 'Your withdrawal is confirmed');

  const stuck = buildWithdrawalEmail({
    scenario: 'withdrawal_stuck_merchant',
    withdrawalId: 'wd-stuck',
    amountUsdt: '5.000000',
    toAddress: '<bad-address>',
    lastError: 'Expired waiting for confirmation on-chain',
  });
  assert.equal(stuck.subject, 'Withdrawal needs merchant review');
  assert.match(stuck.html, /&lt;bad-address&gt;/);

  const failed = buildWithdrawalEmail({
    scenario: 'withdrawal_failed_user',
    withdrawalId: 'wd-failed',
    amountUsdt: '5.000000',
    toAddress: 'EQDestination',
    lastError: 'provider rejected request',
  });
  assert.equal(failed.subject, 'Your withdrawal failed and was refunded');
});

test('merchant alert template renders alert category and severity', () => {
  const alert = buildMerchantAlertEmail({
    title: '<Low reserve>',
    description: 'Hot wallet reserve is below threshold.',
    severity: 'critical',
    category: 'liquidity',
    metric: '10 USDT',
    actionUrl: 'http://127.0.0.1:3000/merchant/liquidity',
  });

  assert.equal(alert.subject, 'Critical merchant alert: <Low reserve>');
  assert.match(alert.text, /liquidity/);
  assert.match(alert.html, /&lt;Low reserve&gt;/);
});
```

- [ ] **Step 2: Run template tests and verify they fail**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/services/email/product-email-templates.test.ts
```

Expected: `ERR_MODULE_NOT_FOUND` for `productEmailTemplates.ts`.

- [ ] **Step 3: Implement template builders**

Create `server/services/email/productEmailTemplates.ts`:

```ts
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function optionalLine(label: string, value?: string | number | null): string[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [`${label}: ${value}`];
}

function renderEmail(params: {
  subject: string;
  heading: string;
  intro: string;
  lines: string[];
  actionUrl?: string;
  actionLabel?: string;
}): ProductEmailContent {
  const textLines = [
    params.intro,
    '',
    ...params.lines,
    ...(params.actionUrl ? ['', `${params.actionLabel ?? 'Open 4real'}: ${params.actionUrl}`] : []),
  ];
  const detailItems = params.lines
    .map((line) => `<li style="margin:4px 0;">${escapeHtml(line)}</li>`)
    .join('');
  const action = params.actionUrl
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(params.actionUrl)}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 18px;text-decoration:none;border-radius:8px;">${escapeHtml(params.actionLabel ?? 'Open 4real')}</a></p>`
    : '';

  return {
    subject: params.subject,
    text: textLines.join('\n'),
    html: [
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">',
      `<h1 style="font-size:22px;margin:0 0 14px;">${escapeHtml(params.heading)}</h1>`,
      `<p style="margin:0 0 16px;">${escapeHtml(params.intro)}</p>`,
      `<ul style="margin:0;padding-left:20px;">${detailItems}</ul>`,
      action,
      '</div>',
    ].join(''),
  };
}

export function buildOrderEmail(params: OrderEmailParams): ProductEmailContent {
  const baseLines = [
    `Order ID: ${params.orderId}`,
    `Type: ${params.orderType}`,
    `Amount: ${params.amountUsdt} USDT`,
    ...optionalLine('Fiat total', params.fiatTotal && params.fiatCurrency ? `${params.fiatTotal} ${params.fiatCurrency}` : undefined),
    ...optionalLine('Exchange rate', params.exchangeRate),
    ...optionalLine('User', params.username),
    ...optionalLine('Transaction code', params.transactionCode),
  ];

  if (params.scenario === 'order_created_merchant') {
    return renderEmail({
      subject: `New ${params.orderType} order needs merchant review`,
      heading: 'New order needs review',
      intro: `A ${params.orderType} order was submitted and is waiting for merchant action.`,
      lines: baseLines,
      actionUrl: params.actionUrl,
      actionLabel: 'Open order desk',
    });
  }

  if (params.scenario === 'order_approved_user') {
    return renderEmail({
      subject: `Your ${params.orderType} order was approved`,
      heading: 'Order approved',
      intro: `Your ${params.orderType} order has been approved.`,
      lines: baseLines,
    });
  }

  if (params.scenario === 'order_rejected_user') {
    return renderEmail({
      subject: `Your ${params.orderType} order was rejected`,
      heading: 'Order rejected',
      intro: `Your ${params.orderType} order was rejected. Any held balance has been released when applicable.`,
      lines: baseLines,
    });
  }

  return renderEmail({
    subject: `Your ${params.orderType} order was submitted`,
    heading: 'Order submitted',
    intro: `Your ${params.orderType} order is pending merchant review.`,
    lines: baseLines,
    actionUrl: params.actionUrl,
    actionLabel: 'View order',
  });
}

export function buildDepositEmail(params: DepositEmailParams): ProductEmailContent {
  const baseLines = [
    `Transaction hash: ${params.txHash}`,
    `Amount: ${params.amountUsdt} USDT`,
    ...optionalLine('Memo', params.memo),
    ...optionalLine('Memo status', params.memoStatus),
    ...optionalLine('User', params.username),
    ...optionalLine('Sender', params.senderAddress),
    ...optionalLine('Note', params.note),
    ...optionalLine('Reason', params.reason),
  ];

  if (params.scenario === 'deposit_unmatched_merchant') {
    return renderEmail({
      subject: 'Unmatched deposit needs review',
      heading: 'Unmatched deposit',
      intro: 'An incoming USDT transfer arrived without an active memo and needs merchant review.',
      lines: baseLines,
      actionUrl: params.actionUrl,
      actionLabel: 'Review deposits',
    });
  }

  if (params.scenario === 'deposit_reconciled_user') {
    return renderEmail({
      subject: 'Your deposit was credited after review',
      heading: 'Deposit credited',
      intro: 'A merchant reviewed your deposit and credited it to your 4real balance.',
      lines: baseLines,
    });
  }

  if (params.scenario === 'deposit_dismissed_merchant') {
    return renderEmail({
      subject: 'Deposit review was dismissed',
      heading: 'Deposit review dismissed',
      intro: 'A merchant dismissed an unmatched deposit review item.',
      lines: baseLines,
    });
  }

  if (params.scenario === 'deposit_rejected_merchant') {
    return renderEmail({
      subject: 'Incoming deposit was rejected',
      heading: 'Deposit rejected',
      intro: 'An incoming transfer was rejected during deposit ingestion.',
      lines: baseLines,
      actionUrl: params.actionUrl,
      actionLabel: 'Open deposits',
    });
  }

  return renderEmail({
    subject: 'Your 4real deposit was credited',
    heading: 'Deposit credited',
    intro: 'Your USDT deposit was confirmed and credited to your 4real balance.',
    lines: baseLines,
  });
}

export function buildWithdrawalEmail(params: WithdrawalEmailParams): ProductEmailContent {
  const baseLines = [
    `Withdrawal ID: ${params.withdrawalId}`,
    `Amount: ${params.amountUsdt} USDT`,
    `Destination: ${params.toAddress}`,
    ...optionalLine('Seqno', params.seqno),
    ...optionalLine('Transaction hash', params.txHash),
    ...optionalLine('Last error', params.lastError),
  ];

  if (params.scenario === 'withdrawal_sent_user') {
    return renderEmail({
      subject: 'Your withdrawal was sent',
      heading: 'Withdrawal sent',
      intro: 'Your withdrawal was submitted to the TON network and is waiting for confirmation.',
      lines: baseLines,
      actionUrl: params.statusUrl,
      actionLabel: 'View withdrawal',
    });
  }

  if (params.scenario === 'withdrawal_confirmed_user') {
    return renderEmail({
      subject: 'Your withdrawal is confirmed',
      heading: 'Withdrawal confirmed',
      intro: 'Your withdrawal was confirmed on-chain.',
      lines: baseLines,
      actionUrl: params.statusUrl,
      actionLabel: 'View withdrawal',
    });
  }

  if (params.scenario === 'withdrawal_stuck_user' || params.scenario === 'withdrawal_stuck_merchant') {
    return renderEmail({
      subject: params.scenario === 'withdrawal_stuck_merchant'
        ? 'Withdrawal needs merchant review'
        : 'Your withdrawal needs review',
      heading: 'Withdrawal needs review',
      intro: 'The withdrawal is waiting on a definitive on-chain outcome and needs review.',
      lines: baseLines,
      actionUrl: params.actionUrl ?? params.statusUrl,
      actionLabel: params.scenario === 'withdrawal_stuck_merchant' ? 'Open liquidity' : 'View withdrawal',
    });
  }

  if (params.scenario === 'withdrawal_failed_user' || params.scenario === 'withdrawal_failed_merchant') {
    return renderEmail({
      subject: params.scenario === 'withdrawal_failed_merchant'
        ? 'Withdrawal failed permanently'
        : 'Your withdrawal failed and was refunded',
      heading: 'Withdrawal failed',
      intro: params.scenario === 'withdrawal_failed_user'
        ? 'Your withdrawal could not be completed and the held balance was refunded.'
        : 'A withdrawal exhausted retries and was refunded to the user.',
      lines: baseLines,
      actionUrl: params.actionUrl ?? params.statusUrl,
      actionLabel: params.scenario === 'withdrawal_failed_merchant' ? 'Open liquidity' : 'View withdrawal',
    });
  }

  return renderEmail({
    subject: 'Your withdrawal is queued',
    heading: 'Withdrawal queued',
    intro: 'Your withdrawal request is queued for processing.',
    lines: baseLines,
    actionUrl: params.statusUrl,
    actionLabel: 'View withdrawal',
  });
}

export function buildMerchantAlertEmail(params: MerchantAlertEmailParams): ProductEmailContent {
  const severityLabel = params.severity.charAt(0).toUpperCase() + params.severity.slice(1);
  return renderEmail({
    subject: `${severityLabel} merchant alert: ${params.title}`,
    heading: params.title,
    intro: params.description,
    lines: [
      `Severity: ${params.severity}`,
      `Category: ${params.category}`,
      ...optionalLine('Metric', params.metric),
    ],
    actionUrl: params.actionUrl,
    actionLabel: 'Open merchant dashboard',
  });
}
```

- [ ] **Step 4: Run template tests and verify they pass**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/services/email/product-email-templates.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Add the template test to `test:unit`**

Modify the `test:unit` script in `package.json` by adding `server/services/email/product-email-templates.test.ts` after `server/services/email/gmail-service.test.ts`.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add package.json server/services/email/productEmailTemplates.ts server/services/email/product-email-templates.test.ts
git commit -m "feat(email): add product email templates"
```

Expected: commit succeeds.

## Task 2: Product Notification Service

**Files:**
- Create: `server/services/product-email-notification.service.ts`
- Create: `server/services/product-email-notification.service.test.ts`
- Modify: `server/services/user.service.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing notification service tests**

Create `server/services/product-email-notification.service.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import {
  ProductEmailNotificationService,
  resetProductEmailNotificationDependenciesForTests,
  setProductEmailNotificationDependenciesForTests,
} from './product-email-notification.service.ts';

test('sendOrderCreated skips unverified user but sends merchant notification to verified admins', async () => {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const logs: Array<Record<string, unknown>> = [];

  setProductEmailNotificationDependenciesForTests({
    findUserById: async () => ({
      _id: { toString: () => 'user-1' },
      email: 'alice@example.com',
      emailVerifiedAt: null,
      username: 'alice',
    }) as never,
    findVerifiedMerchantRecipients: async () => [
      { id: 'admin-1', email: 'merchant@example.com', username: 'merchant' },
      { id: SYSTEM_COMMISSION_ACCOUNT_ID, email: 'commission@system.local', username: 'system_commission' },
    ],
    sendNotificationEmail: async (params) => {
      sent.push({ to: params.to, subject: params.subject, text: params.text });
    },
    logger: {
      debug: (_message, context) => {
        if (context) logs.push(context);
      },
      warn: (_message, context) => {
        if (context) logs.push(context);
      },
      error: (_message, context) => {
        if (context) logs.push(context);
      },
    },
  });

  try {
    await ProductEmailNotificationService.sendOrderCreated({
      userId: 'user-1',
      orderId: 'order-1',
      orderType: 'BUY',
      amountUsdt: '9.000000',
      fiatCurrency: 'KES',
      fiatTotal: '1170.00',
      exchangeRate: '130.000000',
      username: 'alice',
      transactionCode: 'MPESA-9',
      merchantActionUrl: 'http://127.0.0.1:3000/merchant/orders',
    });
  } finally {
    resetProductEmailNotificationDependenciesForTests();
  }

  assert.deepEqual(sent.map((entry) => entry.to), ['merchant@example.com']);
  assert.equal(sent[0]?.subject, 'New BUY order needs merchant review');
  assert.equal(logs.some((entry) => entry.scenario === 'order_created_user' && entry.reason === 'user_email_unverified'), true);
});

test('delivery failures are swallowed and logged without recipient local part', async () => {
  const logs: Array<Record<string, unknown>> = [];

  setProductEmailNotificationDependenciesForTests({
    findUserById: async () => ({
      _id: { toString: () => 'user-2' },
      email: 'bob@example.com',
      emailVerifiedAt: new Date('2026-05-09T00:00:00.000Z'),
      username: 'bob',
    }) as never,
    findVerifiedMerchantRecipients: async () => [],
    sendNotificationEmail: async () => {
      throw new Error('gmail unavailable');
    },
    logger: {
      debug: () => undefined,
      warn: () => undefined,
      error: (_message, context) => {
        if (context) logs.push(context);
      },
    },
  });

  try {
    await ProductEmailNotificationService.sendWithdrawalQueued({
      userId: 'user-2',
      withdrawalId: 'wd-1',
      amountUsdt: '1.000000',
      toAddress: 'EQDestination',
      statusUrl: 'http://127.0.0.1:3000/api/transactions/withdrawals/wd-1',
    });
  } finally {
    resetProductEmailNotificationDependenciesForTests();
  }

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.scenario, 'withdrawal_queued_user');
  assert.equal(logs[0]?.recipientDomain, 'example.com');
  assert.doesNotMatch(JSON.stringify(logs), /bob@example\.com/i);
});
```

- [ ] **Step 2: Run notification service tests and verify they fail**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/services/product-email-notification.service.test.ts
```

Expected: `ERR_MODULE_NOT_FOUND` for `product-email-notification.service.ts`.

- [ ] **Step 3: Add verified admin lookup to `UserService`**

Modify `server/services/user.service.ts` by adding this method inside `UserService`:

```ts
  static async findVerifiedMerchantEmailRecipients(): Promise<Array<{ id: string; email: string; username?: string | null }>> {
    const users = await User.find(trustFilter({
      isAdmin: true,
      emailVerifiedAt: { $ne: null },
      _id: { $ne: new mongoose.Types.ObjectId(SYSTEM_COMMISSION_ACCOUNT_ID) },
    }))
      .select('email username')
      .lean<Array<{ _id: mongoose.Types.ObjectId; email: string; username?: string | null }>>();

    return users.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      username: user.username ?? null,
    }));
  }
```

- [ ] **Step 4: Implement notification service**

Create `server/services/product-email-notification.service.ts`:

```ts
import type { IUser } from '../models/User.ts';
import { SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import { getPublicAppOrigin } from '../config/env.ts';
import { sendNotificationEmail } from './email/gmailService.ts';
import {
  buildDepositEmail,
  buildMerchantAlertEmail,
  buildOrderEmail,
  buildWithdrawalEmail,
  type DepositEmailParams,
  type MerchantAlertEmailParams,
  type OrderEmailParams,
  type ProductEmailContent,
  type WithdrawalEmailParams,
} from './email/productEmailTemplates.ts';
import { UserService } from './user.service.ts';
import { logger, type Logger } from '../utils/logger.ts';

type ProductEmailLogger = Pick<Logger, 'debug' | 'warn' | 'error'>;

interface MerchantRecipient {
  id: string;
  email: string;
  username?: string | null;
}

interface ProductEmailNotificationDependencies {
  findUserById: typeof UserService.findById;
  findVerifiedMerchantRecipients: typeof UserService.findVerifiedMerchantEmailRecipients;
  sendNotificationEmail: typeof sendNotificationEmail;
  logger: ProductEmailLogger;
}

const defaultDependencies: ProductEmailNotificationDependencies = {
  findUserById: UserService.findById.bind(UserService),
  findVerifiedMerchantRecipients: UserService.findVerifiedMerchantEmailRecipients.bind(UserService),
  sendNotificationEmail,
  logger,
};

const dependencies: ProductEmailNotificationDependencies = {
  ...defaultDependencies,
};

function getRecipientDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] || 'unknown';
}

function absoluteUrl(path: string): string {
  return new URL(path, getPublicAppOrigin()).toString();
}

async function deliver(params: {
  scenario: string;
  recipientClass: 'user' | 'merchant_admin';
  to: string;
  resourceId: string;
  content: ProductEmailContent;
}): Promise<void> {
  try {
    await dependencies.sendNotificationEmail({
      to: params.to,
      subject: params.content.subject,
      text: params.content.text,
      html: params.content.html,
    });
  } catch (error) {
    dependencies.logger.error('product_email.delivery_failed', {
      scenario: params.scenario,
      recipientClass: params.recipientClass,
      recipientDomain: getRecipientDomain(params.to),
      resourceId: params.resourceId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

async function findVerifiedUserRecipient(params: {
  userId: string;
  scenario: string;
  resourceId: string;
}): Promise<IUser | null> {
  try {
    const user = await dependencies.findUserById(params.userId);
    if (!user) {
      dependencies.logger.warn('product_email.user_skipped', {
        scenario: params.scenario,
        resourceId: params.resourceId,
        reason: 'user_not_found',
      });
      return null;
    }

    if (!user.emailVerifiedAt) {
      dependencies.logger.debug('product_email.user_skipped', {
        scenario: params.scenario,
        resourceId: params.resourceId,
        reason: 'user_email_unverified',
      });
      return null;
    }

    return user;
  } catch (error) {
    dependencies.logger.error('product_email.recipient_lookup_failed', {
      scenario: params.scenario,
      resourceId: params.resourceId,
      recipientClass: 'user',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function deliverUser(params: {
  userId: string;
  scenario: string;
  resourceId: string;
  content: ProductEmailContent;
}): Promise<void> {
  const user = await findVerifiedUserRecipient(params);
  if (!user) return;
  await deliver({
    scenario: params.scenario,
    recipientClass: 'user',
    to: user.email,
    resourceId: params.resourceId,
    content: params.content,
  });
}

async function deliverMerchantAdmins(params: {
  scenario: string;
  resourceId: string;
  content: ProductEmailContent;
}): Promise<void> {
  let recipients: MerchantRecipient[];
  try {
    recipients = (await dependencies.findVerifiedMerchantRecipients())
      .filter((recipient) => recipient.id !== SYSTEM_COMMISSION_ACCOUNT_ID);
  } catch (error) {
    dependencies.logger.error('product_email.recipient_lookup_failed', {
      scenario: params.scenario,
      resourceId: params.resourceId,
      recipientClass: 'merchant_admin',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  await Promise.all(recipients.map((recipient) => deliver({
    scenario: params.scenario,
    recipientClass: 'merchant_admin',
    to: recipient.email,
    resourceId: params.resourceId,
    content: params.content,
  })));
}

export class ProductEmailNotificationService {
  static async sendOrderCreated(params: Omit<OrderEmailParams, 'scenario' | 'actionUrl'> & {
    userId: string;
    merchantActionUrl?: string;
  }): Promise<void> {
    await Promise.all([
      deliverUser({
        userId: params.userId,
        scenario: 'order_created_user',
        resourceId: params.orderId,
        content: buildOrderEmail({ ...params, scenario: 'order_created_user' }),
      }),
      deliverMerchantAdmins({
        scenario: 'order_created_merchant',
        resourceId: params.orderId,
        content: buildOrderEmail({
          ...params,
          scenario: 'order_created_merchant',
          actionUrl: params.merchantActionUrl ?? absoluteUrl('/merchant/orders'),
        }),
      }),
    ]);
  }

  static async sendOrderFinalized(params: Omit<OrderEmailParams, 'scenario'> & {
    userId: string;
    status: 'DONE' | 'REJECTED';
  }): Promise<void> {
    const scenario = params.status === 'DONE' ? 'order_approved_user' : 'order_rejected_user';
    await deliverUser({
      userId: params.userId,
      scenario,
      resourceId: params.orderId,
      content: buildOrderEmail({ ...params, scenario }),
    });
  }

  static async sendDeposit(params: DepositEmailParams & { userId?: string }): Promise<void> {
    const resourceId = params.txHash;
    if (params.scenario.endsWith('_merchant')) {
      await deliverMerchantAdmins({
        scenario: params.scenario,
        resourceId,
        content: buildDepositEmail({
          ...params,
          actionUrl: params.actionUrl ?? absoluteUrl('/merchant/deposits'),
        }),
      });
      return;
    }

    if (!params.userId) {
      dependencies.logger.warn('product_email.user_skipped', {
        scenario: params.scenario,
        resourceId,
        reason: 'user_id_missing',
      });
      return;
    }

    await deliverUser({
      userId: params.userId,
      scenario: params.scenario,
      resourceId,
      content: buildDepositEmail(params),
    });
  }

  static async sendWithdrawalQueued(params: Omit<WithdrawalEmailParams, 'scenario'> & { userId: string }): Promise<void> {
    await deliverUser({
      userId: params.userId,
      scenario: 'withdrawal_queued_user',
      resourceId: params.withdrawalId,
      content: buildWithdrawalEmail({ ...params, scenario: 'withdrawal_queued_user' }),
    });
  }

  static async sendWithdrawalTransition(params: Omit<WithdrawalEmailParams, 'scenario'> & {
    userId: string;
    scenario: 'withdrawal_sent_user' | 'withdrawal_confirmed_user' | 'withdrawal_stuck_user' | 'withdrawal_failed_user';
  }): Promise<void> {
    await deliverUser({
      userId: params.userId,
      scenario: params.scenario,
      resourceId: params.withdrawalId,
      content: buildWithdrawalEmail(params),
    });
  }

  static async sendWithdrawalMerchantAlert(params: Omit<WithdrawalEmailParams, 'scenario'> & {
    scenario: 'withdrawal_stuck_merchant' | 'withdrawal_failed_merchant';
  }): Promise<void> {
    await deliverMerchantAdmins({
      scenario: params.scenario,
      resourceId: params.withdrawalId,
      content: buildWithdrawalEmail({
        ...params,
        actionUrl: params.actionUrl ?? absoluteUrl('/merchant/liquidity'),
      }),
    });
  }

  static async sendMerchantAlert(params: MerchantAlertEmailParams): Promise<void> {
    await deliverMerchantAdmins({
      scenario: 'merchant_alert',
      resourceId: params.title,
      content: buildMerchantAlertEmail(params),
    });
  }
}

export function setProductEmailNotificationDependenciesForTests(
  overrides: Partial<ProductEmailNotificationDependencies>,
): void {
  Object.assign(dependencies, overrides);
}

export function resetProductEmailNotificationDependenciesForTests(): void {
  Object.assign(dependencies, defaultDependencies);
}
```

- [ ] **Step 5: Run notification service tests and verify they pass**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/services/product-email-notification.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Add the service test to `test:unit`**

Modify `package.json` by adding `server/services/product-email-notification.service.test.ts` after `server/services/auth-email.service.test.ts`.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add package.json server/services/user.service.ts server/services/product-email-notification.service.ts server/services/product-email-notification.service.test.ts
git commit -m "feat(email): add product notification service"
```

Expected: commit succeeds.

## Task 3: Wire Order Notifications

**Files:**
- Modify: `server/controllers/order.controller.ts`
- Modify: `server/middleware/order-service.test.ts`

- [ ] **Step 1: Write failing order flow tests**

Append tests to `server/middleware/order-service.test.ts` or the existing order controller test section in that file:

```ts
test('updateOrder sends user notification when order is approved', async (t) => {
  const sent: unknown[] = [];
  const notificationMock = t.mock.method(
    ProductEmailNotificationService,
    'sendOrderFinalized',
    async (params) => {
      sent.push(params);
    },
  );
  const updateMock = t.mock.method(OrderService, 'updateOrderStatus', async () => ({
    _id: { toString: () => 'order-123' },
    userId: { toString: () => 'user-123' },
    type: 'BUY',
    amount: '10.000000',
    status: 'DONE',
    fiatCurrency: 'KES',
    fiatTotal: '1300.00',
    exchangeRate: '130.000000',
    createdAt: new Date('2026-05-09T00:00:00.000Z'),
  }) as never);

  const req = {
    user: { id: 'admin-1', isAdmin: true },
    params: { id: 'order-123' },
    body: { status: 'DONE' },
  } as never;
  const res = {
    locals: { requestId: 'req-1' },
    json(payload: unknown) {
      return payload;
    },
  } as never;

  await OrderController.updateOrder(req, res);

  assert.equal(notificationMock.mock.callCount(), 1);
  assert.equal((sent[0] as { status: string }).status, 'DONE');
  assert.equal(updateMock.mock.callCount(), 1);
});
```

Add imports if missing:

```ts
import { OrderController } from '../controllers/order.controller.ts';
import { OrderService } from '../services/order.service.ts';
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
```

- [ ] **Step 2: Run order test and verify it fails**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/order-service.test.ts
```

Expected: the new notification assertion fails because `sendOrderFinalized` is not called.

- [ ] **Step 3: Wire order controller notifications**

Modify `server/controllers/order.controller.ts` imports:

```ts
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
```

After non-replayed order creation and cache invalidation, add:

```ts
    if (!result.replayed) {
      await invalidateCacheKeys([CacheKeys.merchantDashboard()]);
      await ProductEmailNotificationService.sendOrderCreated({
        userId: user._id.toString(),
        orderId: responseBody._id,
        orderType: responseBody.type,
        amountUsdt: responseBody.amount,
        fiatCurrency: responseBody.fiatCurrency,
        fiatTotal: responseBody.fiatTotal,
        exchangeRate: responseBody.exchangeRate,
        username: user.username ?? user.email.split('@')[0] ?? null,
        transactionCode: responseBody.transactionCode,
        merchantActionUrl: createAbsoluteProductUrl('/merchant/orders'),
      });
    }
```

Add helper near existing helper functions:

```ts
function createAbsoluteProductUrl(path: string): string {
  return new URL(path, getEnv().PUBLIC_APP_ORIGIN).toString();
}
```

After `await invalidateCacheKeys([CacheKeys.merchantDashboard()]);` in `updateOrder`, add:

```ts
    if (order.status === 'DONE' || order.status === 'REJECTED') {
      await ProductEmailNotificationService.sendOrderFinalized({
        userId: order.userId.toString(),
        orderId: order._id.toString(),
        orderType: order.type,
        amountUsdt: order.amount,
        status: order.status,
        fiatCurrency: order.fiatCurrency,
        fiatTotal: order.fiatTotal,
        exchangeRate: order.exchangeRate,
        transactionCode: order.transactionCode,
      });
    }
```

- [ ] **Step 4: Run order tests and verify they pass**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/order-service.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add server/controllers/order.controller.ts server/middleware/order-service.test.ts
git commit -m "feat(email): notify order product events"
```

Expected: commit succeeds.

## Task 4: Wire Deposit Notifications

**Files:**
- Modify: `server/services/deposit-ingestion.service.ts`
- Modify: `server/middleware/deposit-reconciliation.test.ts`

- [ ] **Step 1: Write failing deposit notification tests**

Add tests in `server/middleware/deposit-reconciliation.test.ts` for one automatic credit and one unmatched path:

```ts
test('ingestIncomingTransfer sends user notification after active memo credit', async (t) => {
  const sent: unknown[] = [];
  t.mock.method(ProductEmailNotificationService, 'sendDeposit', async (params) => {
    sent.push(params);
  });

  const result = await ingestIncomingTransfer({
    transaction_hash: 'tx-email-credit',
    transaction_now: 1770000000,
    comment: 'active-memo-email',
    jetton_master: USDT_MASTER,
    amount: '2500000',
    source: 'sender-wallet',
    source_owner: 'sender-owner',
  });

  assert.equal(result.decision, 'credit');
  assert.equal((sent[0] as { scenario: string }).scenario, 'deposit_confirmed_user');
  assert.equal((sent[0] as { userId: string }).userId, 'user-email-credit');
});

test('ingestIncomingTransfer sends merchant notification after unmatched deposit is recorded', async (t) => {
  const sent: unknown[] = [];
  t.mock.method(ProductEmailNotificationService, 'sendDeposit', async (params) => {
    sent.push(params);
  });

  const result = await ingestIncomingTransfer({
    transaction_hash: 'tx-email-unmatched',
    transaction_now: 1770000001,
    comment: 'unknown-memo-email',
    jetton_master: USDT_MASTER,
    amount: '3000000',
    source: 'sender-wallet',
    source_owner: 'sender-owner',
  });

  assert.equal(result.decision, 'unmatched');
  assert.equal((sent[0] as { scenario: string }).scenario, 'deposit_unmatched_merchant');
});
```

Add setup documents in the test file using the same repository helpers already used there:

```ts
await DepositMemoRepository.create({
  memo: 'active-memo-email',
  userId: 'user-email-credit',
  expiresAt: new Date(Date.now() + 60_000),
  used: false,
});
```

Add imports if missing:

```ts
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
```

- [ ] **Step 2: Run deposit tests and verify they fail**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/deposit-reconciliation.test.ts
```

Expected: notification assertions fail because deposit notifications are not called.

- [ ] **Step 3: Wire deposit ingestion notifications**

Modify `server/services/deposit-ingestion.service.ts` imports:

```ts
import { ProductEmailNotificationService } from './product-email-notification.service.ts';
```

After `AuditService.record` for `deposit_credit`, add:

```ts
    if (outcome.candidateUserId) {
      await ProductEmailNotificationService.sendDeposit({
        scenario: 'deposit_confirmed_user',
        userId: outcome.candidateUserId,
        txHash: tx.transaction_hash,
        amountUsdt: outcome.amountUsdt,
        memo: outcome.comment,
        senderAddress: outcome.senderOwnerAddress,
      });
    }
```

After unmatched creation and cache invalidation, before returning finalized outcome, add:

```ts
  if (outcome.decision === 'unmatched') {
    await ProductEmailNotificationService.sendDeposit({
      scenario: 'deposit_unmatched_merchant',
      txHash: tx.transaction_hash,
      amountUsdt: outcome.amountUsdt,
      memo: outcome.comment,
      memoStatus: outcome.memoStatus === 'active' ? 'active' : outcome.memoStatus,
      senderAddress: outcome.senderOwnerAddress,
    });
  }
```

In the rejected transfer branch after `AuditService.record`, add:

```ts
        await ProductEmailNotificationService.sendDeposit({
          scenario: 'deposit_rejected_merchant',
          txHash: tx.transaction_hash,
          amountUsdt: resolvedPreview.amountUsdt,
          memo: resolvedPreview.comment,
          reason: resolvedPreview.reason,
          senderAddress: resolvedPreview.senderOwnerAddress,
        });
```

In `reconcileMerchantDeposit`, after credited audit recording, add:

```ts
    await ProductEmailNotificationService.sendDeposit({
      scenario: 'deposit_reconciled_user',
      userId: targetUserId,
      txHash: params.txHash,
      amountUsdt: toUsdtDisplay(existing.receivedRaw),
      memo: existing.comment,
      note: params.note?.trim() || null,
    });
```

After dismissed audit recording, add:

```ts
    await ProductEmailNotificationService.sendDeposit({
      scenario: 'deposit_dismissed_merchant',
      txHash: params.txHash,
      amountUsdt: toUsdtDisplay(existing.receivedRaw),
      memo: existing.comment,
      note: params.note?.trim() || null,
    });
```

- [ ] **Step 4: Run deposit tests and verify they pass**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/deposit-reconciliation.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add server/services/deposit-ingestion.service.ts server/middleware/deposit-reconciliation.test.ts
git commit -m "feat(email): notify deposit product events"
```

Expected: commit succeeds.

## Task 5: Wire Withdrawal Notifications

**Files:**
- Modify: `server/controllers/transaction.controller.ts`
- Modify: `server/workers/withdrawal-worker.ts`
- Modify: `server/middleware/ton-payments.test.ts`

- [ ] **Step 1: Write failing withdrawal tests**

Add a notification assertion to the existing queued withdrawal test in `server/middleware/ton-payments.test.ts`:

```ts
const queuedEmailMock = mock.method(
  ProductEmailNotificationService,
  'sendWithdrawalQueued',
  async () => {},
);
t.after(() => queuedEmailMock.mock.restore());
```

After the handler call assertion, add:

```ts
assert.equal(queuedEmailMock.mock.callCount(), 1);
assert.equal(queuedEmailMock.mock.calls[0].arguments[0].withdrawalId, 'wd-2');
```

Add a notification assertion to the existing `runWithdrawalWorker marks sent withdrawals with seqno` test:

```ts
const sentEmailMock = mock.method(
  ProductEmailNotificationService,
  'sendWithdrawalTransition',
  async () => {},
);
t.after(() => sentEmailMock.mock.restore());
```

After `assert.equal(markSentMock.mock.callCount(), 1);`, add:

```ts
assert.equal(sentEmailMock.mock.callCount(), 1);
assert.equal(sentEmailMock.mock.calls[0].arguments[0].scenario, 'withdrawal_sent_user');
```

Add imports if missing:

```ts
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
```

- [ ] **Step 2: Run withdrawal tests and verify they fail**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/ton-payments.test.ts
```

Expected: new notification call count assertions fail.

- [ ] **Step 3: Wire queued withdrawal notification**

Modify `server/controllers/transaction.controller.ts` imports:

```ts
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
```

After non-replayed cache invalidation in `requestWithdrawalHandler`, add:

```ts
    await ProductEmailNotificationService.sendWithdrawalQueued({
      userId,
      withdrawalId: result.body.withdrawalId,
      amountUsdt,
      toAddress,
      statusUrl: result.body.statusUrl,
    });
```

- [ ] **Step 4: Wire worker transition notifications**

Modify `server/workers/withdrawal-worker.ts` imports:

```ts
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
```

After the existing `logger.info('withdrawal.sent', { withdrawalId: doc.withdrawalId, seqno: submittedWithdrawal.seqno })` block, add:

```ts
        await ProductEmailNotificationService.sendWithdrawalTransition({
          scenario: 'withdrawal_sent_user',
          userId: doc.userId,
          withdrawalId: doc.withdrawalId,
          amountUsdt: doc.amountDisplay,
          toAddress: doc.toAddress,
          seqno: submittedWithdrawal.seqno,
        });
```

In `refundFailedWithdrawal`, after the transaction completes, add:

```ts
  await ProductEmailNotificationService.sendWithdrawalTransition({
    scenario: 'withdrawal_failed_user',
    userId,
    withdrawalId,
    amountUsdt: amountDisplay,
    toAddress: '',
    lastError: errorMessage,
  });
  await ProductEmailNotificationService.sendWithdrawalMerchantAlert({
    scenario: 'withdrawal_failed_merchant',
    withdrawalId,
    amountUsdt: amountDisplay,
    toAddress: '',
    lastError: errorMessage,
  });
```

After `WithdrawalRepository.markConfirmed` in both confirmation paths, add:

```ts
            await ProductEmailNotificationService.sendWithdrawalTransition({
              scenario: 'withdrawal_confirmed_user',
              userId: withdrawal.userId,
              withdrawalId: withdrawal.withdrawalId,
              amountUsdt: withdrawal.amountDisplay,
              toAddress: withdrawal.toAddress,
              txHash: confirmed.txHash,
            });
```

After each successful `WithdrawalRepository.markStuck`, add:

```ts
          await ProductEmailNotificationService.sendWithdrawalTransition({
            scenario: 'withdrawal_stuck_user',
            userId: withdrawal.userId,
            withdrawalId: withdrawal.withdrawalId,
            amountUsdt: withdrawal.amountDisplay,
            toAddress: withdrawal.toAddress,
            lastError: 'Expired waiting for confirmation on-chain',
          });
          await ProductEmailNotificationService.sendWithdrawalMerchantAlert({
            scenario: 'withdrawal_stuck_merchant',
            withdrawalId: withdrawal.withdrawalId,
            amountUsdt: withdrawal.amountDisplay,
            toAddress: withdrawal.toAddress,
            lastError: 'Expired waiting for confirmation on-chain',
          });
```

For stuck branches that use a different error string, pass that exact string as `lastError`.

- [ ] **Step 5: Run withdrawal tests and verify they pass**

Run:

```bash
node --import ./server/test/setup-env.js --test --experimental-strip-types server/middleware/ton-payments.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add server/controllers/transaction.controller.ts server/workers/withdrawal-worker.ts server/middleware/ton-payments.test.ts
git commit -m "feat(email): notify withdrawal product events"
```

Expected: commit succeeds.

## Task 6: Full Verification

**Files:**
- Inspect: all files changed in Tasks 1-5

- [ ] **Step 1: Run focused email tests**

Run:

```bash
npm run test:unit
```

Expected: unit tests pass.

- [ ] **Step 2: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: integration tests pass.

- [ ] **Step 3: Run type checks**

Run:

```bash
npm run lint
```

Expected: TypeScript checks pass.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only files from this plan are changed.

- [ ] **Step 5: Commit verification cleanup if needed**

If test or lint fixes were required, run:

```bash
git add package.json server
git commit -m "fix(email): stabilize product notification wiring"
```

Expected: commit succeeds only when cleanup changes exist.

## Self-Review Notes

- Spec coverage: templates, recipient rules, best-effort delivery, order/deposit/withdrawal wiring, merchant alert builder, and verification are covered by Tasks 1-6.
- Placeholder scan: this plan uses concrete file paths, commands, scenario names, and code snippets.
- Type consistency: scenario strings match the approved design and the service method names used by flow wiring tasks.

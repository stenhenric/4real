import { getPublicAppOrigin } from '../config/env.ts';
import { SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import { logger, type Logger } from '../utils/logger.ts';
import { sendNotificationEmail } from './email/gmailService.ts';
import {
  buildDepositEmail,
  buildMerchantAlertEmail,
  buildOrderEmail,
  buildSecurityAlertEmail,
  buildWithdrawalEmail,
  type DepositEmailParams,
  type MerchantAlertEmailParams,
  type OrderEmailParams,
  type WithdrawalEmailParams,
} from './email/productEmailTemplates.ts';
import { UserService, type VerifiedMerchantEmailRecipient } from './user.service.ts';

type ProductEmailLogger = Pick<Logger, 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'child'>;

interface ProductEmailUser {
  id?: string;
  _id?: { toString: () => string };
  email?: string | null;
  username?: string | null;
  emailVerifiedAt?: Date | string | null;
}

interface ProductEmailNotificationDependencies {
  findUserById: (id: string) => Promise<ProductEmailUser | null>;
  findVerifiedMerchantEmailRecipients: () => Promise<VerifiedMerchantEmailRecipient[]>;
  sendNotificationEmail: typeof sendNotificationEmail;
  logger: ProductEmailLogger;
}

type SendOrderCreatedParams = Omit<OrderEmailParams, 'scenario'> & { userId: string };
type SendOrderFinalizedParams = Omit<OrderEmailParams, 'scenario'> & {
  userId: string;
  status: 'DONE' | 'REJECTED';
};
type SendDepositParams = DepositEmailParams & { userId?: string };
type SendWithdrawalQueuedParams = Omit<WithdrawalEmailParams, 'scenario'> & { userId: string };
type SendWithdrawalTransitionParams = WithdrawalEmailParams & { userId: string };
type SendWithdrawalMerchantAlertParams = WithdrawalEmailParams;
type SendSecurityAlertParams = {
  userId: string;
  subject: string;
  summary: string;
};
type ProductEmailContent = { subject: string; text: string; html?: string };

const defaultDependencies: ProductEmailNotificationDependencies = {
  findUserById: (id) => UserService.findById(id),
  findVerifiedMerchantEmailRecipients: () => UserService.findVerifiedMerchantEmailRecipients(),
  sendNotificationEmail,
  logger,
};

const dependencies: ProductEmailNotificationDependencies = {
  ...defaultDependencies,
};

function getRecipientDomain(email: string | null | undefined): string {
  const domain = email?.trim().toLowerCase().split('@')[1];
  return domain && domain.length > 0 ? domain : 'unknown';
}

function buildMerchantActionUrl(path: string): string {
  return new URL(path, getPublicAppOrigin()).toString();
}

function buildUserBankUrl(): string {
  return new URL('/bank', getPublicAppOrigin()).toString();
}

function getUserId(user: ProductEmailUser): string | undefined {
  return user.id ?? user._id?.toString();
}

function optionalUsername(username: string | null | undefined): { username?: string | null } {
  return username === undefined ? {} : { username };
}

function isSafeErrorCode(value: unknown): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function sanitizeLoggedError(error: unknown): { name: string; code?: string | number | boolean } {
  const safeError = {
    name: error instanceof Error && error.name ? error.name : 'Error',
  } as { name: string; code?: string | number | boolean };

  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (isSafeErrorCode(code)) {
      safeError.code = code;
    }
  }

  return safeError;
}

function logError(message: string, context: Record<string, unknown>): void {
  dependencies.logger.error(message, context);
}

async function deliver(params: {
  scenario: string;
  recipient: { email: string };
  content: ProductEmailContent;
}): Promise<void> {
  try {
    await dependencies.sendNotificationEmail({
      to: params.recipient.email,
      subject: params.content.subject,
      text: params.content.text,
      ...(params.content.html === undefined ? {} : { html: params.content.html }),
    });
  } catch (error) {
    logError('product_email.delivery_failed', {
      scenario: params.scenario,
      recipientDomain: getRecipientDomain(params.recipient.email),
      error: sanitizeLoggedError(error),
    });
  }
}

async function sendToVerifiedUser(params: {
  scenario: string;
  userId: string | undefined;
  render: (user: ProductEmailUser) => ProductEmailContent;
}): Promise<void> {
  if (!params.userId) {
    dependencies.logger.info('product_email.user_notification_skipped', {
      scenario: params.scenario,
      reason: 'missing_user_id',
    });
    return;
  }

  let user: ProductEmailUser | null;
  try {
    user = await dependencies.findUserById(params.userId);
  } catch (error) {
    logError('product_email.user_lookup_failed', {
      scenario: params.scenario,
      userId: params.userId,
      error: sanitizeLoggedError(error),
    });
    return;
  }

  if (!user) {
    dependencies.logger.info('product_email.user_notification_skipped', {
      scenario: params.scenario,
      userId: params.userId,
      reason: 'user_missing',
    });
    return;
  }

  if (!user.email) {
    dependencies.logger.info('product_email.user_notification_skipped', {
      scenario: params.scenario,
      userId: getUserId(user) ?? params.userId,
      reason: 'email_missing',
    });
    return;
  }

  if (!user.emailVerifiedAt) {
    dependencies.logger.info('product_email.user_notification_skipped', {
      scenario: params.scenario,
      userId: getUserId(user) ?? params.userId,
      reason: 'email_unverified',
    });
    return;
  }

  try {
    await deliver({
      scenario: params.scenario,
      recipient: { email: user.email },
      content: params.render(user),
    });
  } catch (error) {
    logError('product_email.render_failed', {
      scenario: params.scenario,
      userId: getUserId(user) ?? params.userId,
      error: sanitizeLoggedError(error),
    });
  }
}

async function sendToMerchantAdmins(params: {
  scenario: string;
  render: (recipient: VerifiedMerchantEmailRecipient) => ProductEmailContent;
}): Promise<void> {
  let recipients: VerifiedMerchantEmailRecipient[];
  try {
    recipients = await dependencies.findVerifiedMerchantEmailRecipients();
  } catch (error) {
    logError('product_email.merchant_recipient_lookup_failed', {
      scenario: params.scenario,
      error: sanitizeLoggedError(error),
    });
    return;
  }

  const tasks = recipients.flatMap((recipient) => {
    if (recipient.id === SYSTEM_COMMISSION_ACCOUNT_ID) {
      return [];
    }

    return [deliverMerchantEmail(params, recipient)];
  });

  await Promise.allSettled(tasks);
}

async function deliverMerchantEmail(
  params: {
    scenario: string;
    render: (recipient: VerifiedMerchantEmailRecipient) => ProductEmailContent;
  },
  recipient: VerifiedMerchantEmailRecipient,
): Promise<void> {
  try {
    await deliver({
      scenario: params.scenario,
      recipient,
      content: params.render(recipient),
    });
  } catch (error) {
    logError('product_email.render_failed', {
      scenario: params.scenario,
      recipientDomain: getRecipientDomain(recipient.email),
      error: sanitizeLoggedError(error),
    });
  }
}

export class ProductEmailNotificationService {
  static async sendSecurityAlert(params: SendSecurityAlertParams): Promise<void> {
    await sendToVerifiedUser({
      scenario: 'security_alert_user',
      userId: params.userId,
      render: () => buildSecurityAlertEmail(params),
    });
  }

  static async sendOrderCreated(params: SendOrderCreatedParams): Promise<void> {
    await sendToVerifiedUser({
      scenario: 'order_created_user',
      userId: params.userId,
      render: (user) => buildOrderEmail({
        ...params,
        scenario: 'order_created_user',
        ...optionalUsername(params.username ?? user.username),
      }),
    });

    await sendToMerchantAdmins({
      scenario: 'order_created_merchant',
      render: (recipient) => buildOrderEmail({
        ...params,
        scenario: 'order_created_merchant',
        actionUrl: params.actionUrl ?? buildMerchantActionUrl('/merchant/orders'),
        ...optionalUsername(params.username ?? recipient.username),
      }),
    });
  }

  static async sendOrderFinalized(params: SendOrderFinalizedParams): Promise<void> {
    const scenario = params.status === 'DONE' ? 'order_approved_user' : 'order_rejected_user';
    await sendToVerifiedUser({
      scenario,
      userId: params.userId,
      render: (user) => buildOrderEmail({
        ...params,
        scenario,
        ...optionalUsername(params.username ?? user.username),
      }),
    });
  }

  static async sendDeposit(params: SendDepositParams): Promise<void> {
    if (params.scenario.endsWith('_merchant')) {
      await sendToMerchantAdmins({
        scenario: params.scenario,
        render: (recipient) => buildDepositEmail({
          ...params,
          actionUrl: params.actionUrl ?? buildMerchantActionUrl('/merchant/deposits'),
          ...optionalUsername(params.username ?? recipient.username),
        }),
      });
      return;
    }

    await sendToVerifiedUser({
      scenario: params.scenario,
      userId: params.userId,
      render: (user) => buildDepositEmail({
        ...params,
        ...optionalUsername(params.username ?? user.username),
      }),
    });
  }

  static async sendWithdrawalQueued(params: SendWithdrawalQueuedParams): Promise<void> {
    void params;
  }

  static async sendWithdrawalTransition(params: SendWithdrawalTransitionParams): Promise<void> {
    await sendToVerifiedUser({
      scenario: params.scenario,
      userId: params.userId,
      render: () => buildWithdrawalEmail({
        ...params,
        actionUrl: params.actionUrl ?? buildUserBankUrl(),
      }),
    });
  }

  static async sendWithdrawalMerchantAlert(params: SendWithdrawalMerchantAlertParams): Promise<void> {
    await sendToMerchantAdmins({
      scenario: params.scenario,
      render: () => buildWithdrawalEmail({
        ...params,
        actionUrl: params.actionUrl ?? buildMerchantActionUrl('/merchant/withdrawals'),
      }),
    });
  }

  static async sendMerchantAlert(params: MerchantAlertEmailParams): Promise<void> {
    await sendToMerchantAdmins({
      scenario: 'merchant_alert',
      render: () => buildMerchantAlertEmail({
        ...params,
        actionUrl: params.actionUrl ?? buildMerchantActionUrl('/merchant/alerts'),
      }),
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

import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { google } from 'googleapis';

import { getEnv } from '../../config/env.ts';
import { recordEmailDelivery } from '../metrics.service.ts';
import { runProtectedDependencyCall } from '../dependency-resilience.service.ts';
import { logger, type Logger } from '../../utils/logger.ts';

const EMAIL_PROVIDER = 'gmail';
const EMAIL_REQUEST_TIMEOUT_MS = 10_000;
const EMAIL_RETRY_COUNT = 2;
const EMAIL_RETRY_BASE_DELAY_MS = 50;
const EMAIL_RETRY_MAX_DELAY_MS = 500;

export type EmailType =
  | 'verification'
  | 'password_reset'
  | 'magic_link'
  | 'suspicious_login'
  | 'notification';

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface EmailMessage {
  emailType: EmailType;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface RawEmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

interface GmailErrorClassification {
  category: 'auth' | 'quota' | 'rate_limit' | 'transient' | 'invalid_request' | 'unknown';
  retryable: boolean;
  statusCode: number | undefined;
  reason: string | undefined;
  message: string;
}

interface GmailServiceDependencies {
  sendRawMessage: (raw: string, timeoutMs: number) => Promise<{ id?: string | null }>;
  sleep: (ms: number) => Promise<void>;
  logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'child'>;
}

function defaultLogger(): GmailServiceDependencies['logger'] {
  return logger;
}

async function defaultSendRawMessage(raw: string, timeoutMs: number): Promise<{ id?: string | null }> {
  const env = getEnv();
  const auth = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.messages.send(
    {
      userId: 'me',
      requestBody: { raw },
    },
    {
      timeout: timeoutMs,
    },
  );

  return { id: response.data.id ?? null };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const defaultDependencies: GmailServiceDependencies = {
  sendRawMessage: defaultSendRawMessage,
  sleep,
  logger: defaultLogger(),
};

const gmailServiceDependencies: GmailServiceDependencies = {
  ...defaultDependencies,
};

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function createBoundary(label: string): string {
  return `${label}-${crypto.randomUUID()}`;
}

function encodeBase64Block(value: Buffer | string): string {
  return Buffer.from(value).toString('base64').replace(/(.{76})/g, '$1\r\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTextAsHtml(text: string): string {
  return `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;margin:0;">${escapeHtml(text)}</pre>`;
}

function escapeQuotedHeaderValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function createMessageId(from: string): string {
  const domain = from.split('@')[1] ?? 'localhost';
  return `<${crypto.randomUUID()}@${domain}>`;
}

function buildTextOnlyBody(message: RawEmailMessage): string {
  return [
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Block(Buffer.from(message.text, 'utf8')),
  ].join('\r\n');
}

function buildAlternativeBody(message: RawEmailMessage): string {
  const boundary = createBoundary('alt');
  const html = message.html ?? renderTextAsHtml(message.text);

  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Block(Buffer.from(message.text, 'utf8')),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Block(Buffer.from(html, 'utf8')),
    `--${boundary}--`,
  ].join('\r\n');
}

function buildMultipartBody(message: RawEmailMessage): string {
  const boundary = createBoundary('mixed');
  const parts = [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    message.html || message.attachments?.length ? buildAlternativeBody(message) : buildTextOnlyBody(message),
  ];

  for (const attachment of message.attachments ?? []) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${escapeQuotedHeaderValue(attachment.filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${escapeQuotedHeaderValue(attachment.filename)}"`,
      '',
      encodeBase64Block(attachment.content),
    );
  }

  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
}

export function buildRawMessage(message: RawEmailMessage): string {
  const mime = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${createMessageId(message.from)}`,
    'MIME-Version: 1.0',
    buildMultipartBody(message),
  ].join('\r\n');

  return Buffer.from(mime, 'utf8').toString('base64url');
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const statusCandidate = (error as { code?: unknown; status?: unknown; response?: { status?: unknown } });
  const codeValue = typeof statusCandidate.code === 'number' ? statusCandidate.code : undefined;
  const statusValue = typeof statusCandidate.status === 'number' ? statusCandidate.status : undefined;
  const responseStatus = typeof statusCandidate.response?.status === 'number' ? statusCandidate.response.status : undefined;

  return codeValue ?? statusValue ?? responseStatus;
}

function extractReason(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    errors?: Array<{ reason?: string }>;
    response?: {
      data?: {
        error?: {
          errors?: Array<{ reason?: string }>;
          status?: string;
        };
      };
    };
  };

  return candidate.errors?.[0]?.reason
    ?? candidate.response?.data?.error?.errors?.[0]?.reason
    ?? candidate.response?.data?.error?.status;
}

export function classifyGmailError(error: unknown): GmailErrorClassification {
  const statusCode = extractStatusCode(error);
  const reason = extractReason(error);
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode === 408 || statusCode === 425 || statusCode === 429) {
    return { category: 'rate_limit', retryable: true, statusCode, reason, message };
  }

  if (typeof statusCode === 'number' && statusCode >= 500) {
    return { category: 'transient', retryable: true, statusCode, reason, message };
  }

  if (reason === 'backendError' || reason === 'internalError') {
    return { category: 'transient', retryable: true, statusCode, reason, message };
  }

  if (reason === 'userRateLimitExceeded' || reason === 'rateLimitExceeded') {
    return { category: 'rate_limit', retryable: true, statusCode, reason, message };
  }

  if (reason === 'dailyLimitExceeded' || reason === 'quotaExceeded') {
    return { category: 'quota', retryable: false, statusCode, reason, message };
  }

  if (statusCode === 401 || reason === 'invalid_grant' || reason === 'authError' || reason === 'invalidCredentials') {
    return { category: 'auth', retryable: false, statusCode, reason, message };
  }

  if (typeof statusCode === 'number' && statusCode >= 400) {
    return { category: 'invalid_request', retryable: false, statusCode, reason, message };
  }

  return { category: 'unknown', retryable: false, statusCode, reason, message };
}

function getRecipientDomain(to: string): string {
  const domain = to.trim().toLowerCase().split('@')[1];
  return domain && domain.length > 0 ? domain : 'unknown';
}

function buildActionEmailHtml(params: {
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
}): string {
  return [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">',
    `<h1 style="font-size:24px;margin-bottom:16px;">${escapeHtml(params.heading)}</h1>`,
    `<p style="margin:0 0 16px;">${escapeHtml(params.body)}</p>`,
    `<p style="margin:0 0 24px;"><a href="${escapeHtml(params.actionUrl)}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:8px;">${escapeHtml(params.actionLabel)}</a></p>`,
    `<p style="margin:0;color:#6b7280;font-size:14px;">If the button does not work, copy this URL into your browser: ${escapeHtml(params.actionUrl)}</p>`,
    '</div>',
  ].join('');
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const env = getEnv();
  const raw = buildRawMessage({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.attachments ? { attachments: message.attachments } : {}),
  });
  const recipientDomain = getRecipientDomain(message.to);
  const startedAt = performance.now();
  let attempt = 0;

  try {
    const result = await runProtectedDependencyCall({
      dependency: 'gmail',
      retries: EMAIL_RETRY_COUNT,
      baseDelayMs: EMAIL_RETRY_BASE_DELAY_MS,
      maxDelayMs: EMAIL_RETRY_MAX_DELAY_MS,
      operation: async () => {
        attempt += 1;
        return gmailServiceDependencies.sendRawMessage(raw, EMAIL_REQUEST_TIMEOUT_MS);
      },
      retryable: (error) => {
        const classification = classifyGmailError(error);
        if (classification.retryable) {
          gmailServiceDependencies.logger.warn('email.delivery_retry', {
            emailType: message.emailType,
            recipientDomain,
            provider: EMAIL_PROVIDER,
            outcome: 'retry',
            category: classification.category,
            attempt,
            statusCode: classification.statusCode,
            reason: classification.reason,
            errorMessage: classification.message,
          });
        }

        return classification.retryable;
      },
    });

    const durationMs = performance.now() - startedAt;
    gmailServiceDependencies.logger.info('email.delivery_succeeded', {
      emailType: message.emailType,
      recipientDomain,
      provider: EMAIL_PROVIDER,
      outcome: 'success',
      category: 'success',
      attempt,
      durationMs,
      gmailMessageId: result.id ?? null,
    });
    recordEmailDelivery({
      emailType: message.emailType,
      provider: EMAIL_PROVIDER,
      outcome: 'success',
      category: 'success',
      recipientDomain,
      attempt,
      durationMs,
    });
  } catch (error) {
    const classification = classifyGmailError(error);
    const durationMs = performance.now() - startedAt;
    gmailServiceDependencies.logger.error('email.delivery_failed', {
      emailType: message.emailType,
      recipientDomain,
      provider: EMAIL_PROVIDER,
      outcome: 'failure',
      category: classification.category,
      attempt: Math.max(attempt, 1),
      durationMs,
      statusCode: classification.statusCode,
      reason: classification.reason,
      errorMessage: classification.message,
    });
    recordEmailDelivery({
      emailType: message.emailType,
      provider: EMAIL_PROVIDER,
      outcome: 'failure',
      category: classification.category,
      recipientDomain,
      attempt: Math.max(attempt, 1),
      durationMs,
    });
    throw error;
  }
}

export async function sendVerificationEmail(params: { to: string; verificationUrl: string }): Promise<void> {
  await sendEmail({
    emailType: 'verification',
    to: params.to,
    subject: 'Verify your 4real account',
    text: [
      'Verify your 4real email address to activate your account.',
      '',
      params.verificationUrl,
    ].join('\n'),
    html: buildActionEmailHtml({
      heading: 'Verify your 4real account',
      body: 'Confirm your email address to activate your account.',
      actionLabel: 'Verify email',
      actionUrl: params.verificationUrl,
    }),
  });
}

export async function sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void> {
  await sendEmail({
    emailType: 'password_reset',
    to: params.to,
    subject: 'Reset your 4real password',
    text: [
      'Use the link below to reset your 4real password.',
      '',
      params.resetUrl,
    ].join('\n'),
    html: buildActionEmailHtml({
      heading: 'Reset your password',
      body: 'Use the button below to choose a new 4real password.',
      actionLabel: 'Reset password',
      actionUrl: params.resetUrl,
    }),
  });
}

export async function sendMagicLinkEmail(params: { to: string; magicLinkUrl: string }): Promise<void> {
  await sendEmail({
    emailType: 'magic_link',
    to: params.to,
    subject: 'Your 4real magic sign-in link',
    text: [
      'Use the link below to sign in to 4real.',
      '',
      params.magicLinkUrl,
    ].join('\n'),
    html: buildActionEmailHtml({
      heading: 'Sign in to 4real',
      body: 'Use this one-time link to complete sign-in in your browser.',
      actionLabel: 'Sign in now',
      actionUrl: params.magicLinkUrl,
    }),
  });
}

export async function sendSuspiciousLoginEmail(params: { to: string; approvalUrl: string }): Promise<void> {
  await sendEmail({
    emailType: 'suspicious_login',
    to: params.to,
    subject: 'Approve your 4real sign-in',
    text: [
      'We blocked a sign-in from a new device. Approve it with the link below.',
      '',
      params.approvalUrl,
    ].join('\n'),
    html: buildActionEmailHtml({
      heading: 'Approve this sign-in',
      body: 'We blocked a sign-in from a new device. Approve it only if it was you.',
      actionLabel: 'Approve sign-in',
      actionUrl: params.approvalUrl,
    }),
  });
}

export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  await sendEmail({
    emailType: 'notification',
    to: params.to,
    subject: params.subject,
    text: params.text,
    ...(params.html ? { html: params.html } : {}),
    ...(params.attachments ? { attachments: params.attachments } : {}),
  });
}

export function setGmailServiceDependenciesForTests(overrides: Partial<GmailServiceDependencies>): void {
  Object.assign(gmailServiceDependencies, overrides);
}

export function resetGmailServiceDependenciesForTests(): void {
  Object.assign(gmailServiceDependencies, defaultDependencies);
}

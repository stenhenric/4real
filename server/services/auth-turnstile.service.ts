import { getEnv } from '../config/env.ts';
import { recordExternalProviderOperation } from './metrics.service.ts';
import { badRequest, serviceUnavailable } from '../utils/http-error.ts';

const TURNSTILE_VERIFY_TIMEOUT_MS = 5_000;

export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<void> {
  const env = getEnv();

  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.NODE_ENV === 'production') {
      throw serviceUnavailable('Bot verification is not configured', 'TURNSTILE_NOT_CONFIGURED');
    }
    return;
  }

  if (!token || token.trim().length === 0) {
    throw badRequest('Bot verification is required', 'TURNSTILE_REQUIRED');
  }

  const body = new URLSearchParams();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token.trim());
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    recordExternalProviderOperation({
      provider: 'turnstile',
      operation: 'siteverify',
      outcome: error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'failure',
      durationMs: performance.now() - startedAt,
    });
    throw error;
  }

  if (!response.ok) {
    recordExternalProviderOperation({
      provider: 'turnstile',
      operation: 'siteverify',
      outcome: 'failure',
      durationMs: performance.now() - startedAt,
    });
    throw serviceUnavailable('Turnstile verification failed', 'TURNSTILE_UNAVAILABLE');
  }

  const payload = await response.json() as { success?: boolean };
  recordExternalProviderOperation({
    provider: 'turnstile',
    operation: 'siteverify',
    outcome: payload.success === true ? 'success' : 'failure',
    durationMs: performance.now() - startedAt,
  });
  if (payload.success !== true) {
    throw badRequest('Bot verification failed', 'TURNSTILE_FAILED');
  }
}

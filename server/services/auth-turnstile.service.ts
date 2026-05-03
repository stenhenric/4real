import { getEnv } from '../config/env.ts';
import { badRequest, serviceUnavailable } from '../utils/http-error.ts';

export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<void> {
  const env = getEnv();

  if (!env.TURNSTILE_SECRET_KEY) {
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

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw serviceUnavailable('Turnstile verification failed', 'TURNSTILE_UNAVAILABLE');
  }

  const payload = await response.json() as { success?: boolean };
  if (payload.success !== true) {
    throw badRequest('Bot verification failed', 'TURNSTILE_FAILED');
  }
}

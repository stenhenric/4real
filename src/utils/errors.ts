import { ApiClientError } from '../services/api/apiClient';

/**
 * Error codes whose server-supplied message is already user-safe and can be
 * shown directly in the UI.  Everything else falls back to the caller-provided
 * fallback string so that raw technical details never reach the user.
 */
const USER_SAFE_CODES = new Set([
  'INVALID_CREDENTIALS',
  'USERNAME_ALREADY_EXISTS',
  'EMAIL_ALREADY_EXISTS',
  'TOKEN_REQUIRED',
  'INVALID_OR_EXPIRED_LINK',
  'TURNSTILE_VERIFICATION_FAILED',
  'MFA_CHALLENGE_EXPIRED',
  'INVALID_TOTP_CODE',
  'RECOVERY_CODE_INVALID',
  'PASSWORD_TOO_WEAK',
  'INVALID_REQUEST_PAYLOAD',
  'SESSION_ID_REQUIRED',
  'GOOGLE_SIGNIN_FAILED',
  'INSUFFICIENT_BALANCE',
  'RESOURCE_ALREADY_EXISTS',
  'INVALID_IDENTIFIER',
  'VALIDATION_FAILED',
]);

/**
 * Converts an unknown caught value into a safe, user-friendly string.
 *
 * - If the error is an `ApiClientError` with a code in `USER_SAFE_CODES`, the
 *   server message is returned as-is (it was written for end-users).
 * - Otherwise the provided `fallback` is returned so that no raw technical
 *   detail ever reaches the UI.
 * - In development (`import.meta.env.DEV`), the original error is logged to
 *   `console.error` so engineers can see the real cause without affecting UX.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error('[getApiErrorMessage]', error);
  }

  if (error instanceof ApiClientError) {
    if (error.code && USER_SAFE_CODES.has(error.code)) {
      return error.message;
    }
  }

  return fallback;
}

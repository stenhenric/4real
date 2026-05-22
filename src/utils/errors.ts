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
  'GOOGLE_ACCOUNT_VERIFICATION_REQUIRED',
  'INSUFFICIENT_BALANCE',
  'RESOURCE_ALREADY_EXISTS',
  'INVALID_IDENTIFIER',
  'VALIDATION_FAILED',
]);

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email, username, or password. Please try again.',
  USERNAME_ALREADY_EXISTS: 'That username is already taken. Please choose another.',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists.',
  TOKEN_REQUIRED: 'A secure verification token is required to complete this action.',
  INVALID_OR_EXPIRED_LINK: 'That link is invalid or has expired. Please request a new one.',
  TURNSTILE_VERIFICATION_FAILED: 'Security check failed. Please try again.',
  MFA_CHALLENGE_EXPIRED: 'Verification challenge expired. Please try again.',
  INVALID_TOTP_CODE: 'Incorrect authenticator code. Please check your app and try again.',
  RECOVERY_CODE_INVALID: 'Invalid recovery code. Please check and try again.',
  PASSWORD_TOO_WEAK: 'Password does not meet safety requirements.',
  INVALID_REQUEST_PAYLOAD: 'Something went wrong. Please check your entry and try again.',
  SESSION_ID_REQUIRED: 'Your session has expired. Please sign in again.',
  GOOGLE_SIGNIN_FAILED: 'Could not complete sign-in with Google. Please try again.',
  GOOGLE_ACCOUNT_VERIFICATION_REQUIRED: 'Verify or recover the existing account before using Google sign-in.',
  INSUFFICIENT_BALANCE: 'You do not have enough funds to complete this transaction.',
  RESOURCE_ALREADY_EXISTS: 'This item already exists.',
  INVALID_IDENTIFIER: 'Incorrect username or email format.',
  VALIDATION_FAILED: 'Please check your details and try again.',
};

/**
 * Converts an unknown caught value into a safe, user-friendly string.
 *
 * - If the error is an `ApiClientError` with a code in `USER_SAFE_CODES`, a
 *   friendly custom message is returned if mapped, or the server message as-is.
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
      return FRIENDLY_ERROR_MESSAGES[error.code] ?? error.message;
    }
  }

  return fallback;
}

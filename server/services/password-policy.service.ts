import { COMMON_PASSWORDS } from '../security/common-passwords.ts';
import { badRequest } from '../utils/http-error.ts';

export function assertValidPassword(password: string, context?: { email?: string; username?: string | null }): void {
  if (password.length < 12) {
    throw badRequest('Password must be at least 12 characters long', 'PASSWORD_TOO_SHORT');
  }

  if (password.length > 128) {
    throw badRequest('Password must be at most 128 characters long', 'PASSWORD_TOO_LONG');
  }

  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    throw badRequest('Choose a less common password', 'PASSWORD_TOO_COMMON');
  }

  if (context?.email) {
    const localPart = context.email.split('@')[0]?.toLowerCase();
    if (localPart && normalized.includes(localPart)) {
      throw badRequest('Password is too easy to guess', 'PASSWORD_TOO_PREDICTABLE');
    }
  }

  if (context?.username) {
    const normalizedUsername = context.username.trim().toLowerCase();
    if (normalizedUsername.length >= 3 && normalized.includes(normalizedUsername)) {
      throw badRequest('Password is too easy to guess', 'PASSWORD_TOO_PREDICTABLE');
    }
  }
}

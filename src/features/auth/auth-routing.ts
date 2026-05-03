import type { AuthResponseDTO } from '../../types/api';

export function sanitizeInternalPath(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  return trimmed;
}

export function getPostAuthPath(response?: Pick<AuthResponseDTO, 'status' | 'nextStep' | 'user'> | null): string {
  if (!response?.user) {
    return '/play';
  }

  if (
    response.nextStep === 'complete_profile'
    || response.status === 'profile_incomplete'
    || response.user.username.trim().length === 0
  ) {
    return '/auth/complete-profile';
  }

  return '/play';
}

export function buildVerifyEmailPath(params?: {
  email?: string | null;
  error?: string | null;
}) {
  const search = new URLSearchParams();

  if (params?.email) {
    search.set('email', params.email);
  }

  if (params?.error) {
    search.set('error', params.error);
  }

  const query = search.toString();
  return query ? `/auth/verify-email?${query}` : '/auth/verify-email';
}

export function buildMfaChallengePath(params: {
  challengeId: string;
  challengeReason?: 'suspicious_login' | 'sensitive_action' | null;
  returnTo?: string | null;
}) {
  const search = new URLSearchParams();
  search.set('challengeId', params.challengeId);

  if (params.challengeReason) {
    search.set('reason', params.challengeReason);
  }

  const safeReturnTo = sanitizeInternalPath(params.returnTo);
  if (safeReturnTo) {
    search.set('returnTo', safeReturnTo);
  }

  return `/auth/mfa?${search.toString()}`;
}

export function isHandledAuthRedirectCode(code?: string | null) {
  return (
    code === 'MFA_REQUIRED'
    || code === 'MFA_SETUP_REQUIRED'
    || code === 'PROFILE_COMPLETION_REQUIRED'
    || code === 'EMAIL_VERIFICATION_REQUIRED'
  );
}

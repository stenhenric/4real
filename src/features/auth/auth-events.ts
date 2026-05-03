export const AUTH_REDIRECT_EVENT = '4real:auth-redirect-required';
export const SESSION_EXPIRED_EVENT = '4real:session-expired';

export type AuthRedirectCode =
  | 'MFA_REQUIRED'
  | 'MFA_SETUP_REQUIRED'
  | 'PROFILE_COMPLETION_REQUIRED'
  | 'EMAIL_VERIFICATION_REQUIRED';

export interface AuthRedirectEventDetail {
  code: AuthRedirectCode;
  message: string;
  nextStep?: string | undefined;
  challengeId?: string | undefined;
  challengeReason?: 'suspicious_login' | 'sensitive_action' | undefined;
  returnTo?: string | undefined;
}

export function dispatchAuthRedirect(detail: AuthRedirectEventDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<AuthRedirectEventDetail>(AUTH_REDIRECT_EVENT, { detail }));
}

export function dispatchSessionExpired() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

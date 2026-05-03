import request from './api/apiClient.ts';
import type { AuthResponseDTO } from '../types/api';

interface PasswordLoginRequest {
  email: string;
  password: string;
  turnstileToken?: string;
}

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  turnstileToken?: string;
}

interface MagicLinkRequest {
  email: string;
  redirectTo?: string;
  turnstileToken?: string;
}

interface ResetPasswordRequest {
  token: string;
  password: string;
}

interface MfaChallengeRequest {
  challengeId: string;
  code?: string;
  recoveryCode?: string;
}

interface VerifyTotpRequest {
  setupToken: string;
  code: string;
}

interface DisableMfaRequest {
  code?: string;
  recoveryCode?: string;
}

interface CompleteProfileRequest {
  username: string;
}

interface TokenConsumeRequest {
  token: string;
}

export function getCurrentUser(signal?: AbortSignal) {
  return request<AuthResponseDTO>('/auth/me', signal ? { signal } : undefined);
}

export function loginPassword(payload: PasswordLoginRequest) {
  return request<AuthResponseDTO>('/auth/login/password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function registerAccount(payload: RegisterRequest) {
  return request<AuthResponseDTO>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestMagicLink(payload: MagicLinkRequest) {
  return request<AuthResponseDTO>('/auth/login/magic-link/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function consumeMagicLink(payload: TokenConsumeRequest) {
  return request<AuthResponseDTO>('/auth/login/magic-link/consume', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestGoogleOAuthRedirect(redirectTo?: string) {
  const query = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : '';
  return request<AuthResponseDTO>(`/auth/oauth/google/start${query}`);
}

export function resendVerificationEmail(email: string) {
  return request<AuthResponseDTO>('/auth/email/verify/resend', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function consumeVerificationEmail(payload: TokenConsumeRequest) {
  return request<AuthResponseDTO>('/auth/email/verify/consume', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function consumeSuspiciousLogin(payload: TokenConsumeRequest) {
  return request<AuthResponseDTO>('/auth/login/suspicious/consume', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestPasswordReset(email: string, turnstileToken?: string) {
  return request<AuthResponseDTO>('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email, turnstileToken }),
  });
}

export function resetPassword(payload: ResetPasswordRequest) {
  return request<AuthResponseDTO>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function completeMfaChallenge(payload: MfaChallengeRequest) {
  return request<AuthResponseDTO>('/auth/mfa/challenge', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function completeProfile(payload: CompleteProfileRequest) {
  return request<AuthResponseDTO>('/auth/profile/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getSessions(signal?: AbortSignal) {
  return request<AuthResponseDTO>('/auth/sessions', signal ? { signal } : undefined);
}

export function revokeSession(sessionId: string) {
  return request<AuthResponseDTO>(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

export function revokeOtherSessions() {
  return request<AuthResponseDTO>('/auth/sessions/revoke-others', {
    method: 'POST',
  });
}

export function startTotpSetup() {
  return request<AuthResponseDTO>('/auth/mfa/totp/setup', {
    method: 'POST',
  });
}

export function verifyTotpSetup(payload: VerifyTotpRequest) {
  return request<AuthResponseDTO>('/auth/mfa/totp/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function disableMfa(payload: DisableMfaRequest) {
  return request<AuthResponseDTO>('/auth/mfa/disable', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function regenerateRecoveryCodes() {
  return request<AuthResponseDTO>('/auth/mfa/recovery-codes/regenerate', {
    method: 'POST',
  });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export function refreshSession() {
  return request<AuthResponseDTO>('/auth/refresh', { method: 'POST', skipAuthRefresh: true });
}

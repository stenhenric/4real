import request from './api/apiClient';
import type { AuthResponseDTO } from '../types/api';

interface AuthCredentials {
  username: string;
  password: string;
}

export function getCurrentUser(signal?: AbortSignal) {
  return request<AuthResponseDTO>('/auth/me', { signal });
}

export function login(credentials: AuthCredentials) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export function register(credentials: AuthCredentials) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

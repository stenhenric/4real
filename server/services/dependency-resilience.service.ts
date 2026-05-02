import { getEnv } from '../config/env.ts';
import { serviceUnavailable } from '../utils/http-error.ts';

interface DependencyState {
  consecutiveFailures: number;
  circuitOpenedUntil?: number;
  lastError?: string;
  lastFailureAt?: string;
}

interface RetryableDependencyError extends Error {
  retryable?: boolean;
  status?: number;
  code?: string;
}

const dependencyStates = new Map<string, DependencyState>();

function getDependencyState(name: string): DependencyState {
  const existing = dependencyStates.get(name);
  if (existing) {
    return existing;
  }

  const created: DependencyState = { consecutiveFailures: 0 };
  dependencyStates.set(name, created);
  return created;
}

function toDependencyCodePrefix(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function isRetryableNodeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as RetryableDependencyError).code;
  return code === 'ETIMEDOUT'
    || code === 'ECONNRESET'
    || code === 'ECONNREFUSED'
    || code === 'ENOTFOUND'
    || code === 'EAI_AGAIN'
    || error.name === 'AbortError'
    || error.name === 'TimeoutError';
}

export function isRetryableDependencyError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'retryable' in error) {
    return Boolean((error as RetryableDependencyError).retryable);
  }

  return isRetryableNodeError(error);
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createDependencyHttpError(
  dependency: string,
  status: number,
  message?: string,
): RetryableDependencyError {
  const error = new Error(message ?? `${dependency} request failed with status ${status}`) as RetryableDependencyError;
  error.status = status;
  error.code = `${toDependencyCodePrefix(dependency)}_HTTP_${status}`;
  error.retryable = isRetryableHttpStatus(status);
  return error;
}

function resetDependencyState(name: string): void {
  dependencyStates.set(name, { consecutiveFailures: 0 });
}

function recordDependencyFailure(name: string, error: unknown): void {
  const state = getDependencyState(name);
  state.consecutiveFailures += 1;
  state.lastError = error instanceof Error ? error.message : String(error);
  state.lastFailureAt = new Date().toISOString();

  if (state.consecutiveFailures >= getEnv().DEPENDENCY_FAILURE_THRESHOLD) {
    state.circuitOpenedUntil = Date.now() + getEnv().DEPENDENCY_CIRCUIT_RESET_MS;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runProtectedDependencyCall<T>(params: {
  dependency: string;
  operation: () => Promise<T>;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryable?: (error: unknown) => boolean;
}): Promise<T> {
  const state = getDependencyState(params.dependency);
  const now = Date.now();

  if (state.circuitOpenedUntil && state.circuitOpenedUntil > now) {
    throw serviceUnavailable(
      `${params.dependency} circuit is open`,
      `${toDependencyCodePrefix(params.dependency)}_CIRCUIT_OPEN`,
      {
        dependency: params.dependency,
        retryAt: new Date(state.circuitOpenedUntil).toISOString(),
      },
    );
  }

  const retries = params.retries ?? 0;
  const baseDelayMs = params.baseDelayMs ?? 500;
  const maxDelayMs = params.maxDelayMs ?? 30_000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await params.operation();
      resetDependencyState(params.dependency);
      return result;
    } catch (error) {
      const shouldRetry = (params.retryable ?? isRetryableDependencyError)(error);

      if (shouldRetry && attempt < retries) {
        const delayMs = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
        await sleep(delayMs);
        continue;
      }

      recordDependencyFailure(params.dependency, error);
      throw error;
    }
  }

  throw new Error(`Dependency call for ${params.dependency} exhausted unexpectedly`);
}

export function getDependencyStateSnapshot(): Record<string, DependencyState> {
  return Object.fromEntries(
    [...dependencyStates.entries()].map(([key, value]) => [
      key,
      { ...value },
    ]),
  );
}

export function resetDependencyStateForTests(): void {
  dependencyStates.clear();
}

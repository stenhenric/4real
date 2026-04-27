import crypto from 'node:crypto';

import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';
import { conflict } from '../utils/http-error.ts';

interface IdempotentMutationResult<TBody> {
  statusCode: number;
  body: TBody;
}

interface ExecuteIdempotentMutationOptions<TBody> {
  userId: string;
  routeKey: string;
  idempotencyKey: string;
  requestPayload: unknown;
  execute: (context: { requestHash: string }) => Promise<IdempotentMutationResult<TBody>>;
}

export interface IdempotentMutationResponse<TBody> extends IdempotentMutationResult<TBody> {
  replayed: boolean;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return JSON.stringify(value.toString('base64'));
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
  }

  return JSON.stringify(String(value));
}

export function hashIdempotencyPayload(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(stableSerialize(value))
    .digest('hex');
}

function replayStoredResponse<TBody>(stored: {
  requestHash: string;
  status: 'processing' | 'completed';
  responseStatusCode?: number;
  responseBody?: unknown;
}, requestHash: string): IdempotentMutationResponse<TBody> {
  if (stored.requestHash !== requestHash) {
    throw conflict(
      'Idempotency key already used with a different request payload',
      'IDEMPOTENCY_KEY_REUSED',
    );
  }

  if (stored.status !== 'completed' || stored.responseStatusCode === undefined) {
    throw conflict(
      'A request with this idempotency key is already in progress',
      'IDEMPOTENT_REQUEST_IN_PROGRESS',
    );
  }

  return {
    statusCode: stored.responseStatusCode,
    body: stored.responseBody as TBody,
    replayed: true,
  };
}

export async function executeIdempotentMutation<TBody>({
  userId,
  routeKey,
  idempotencyKey,
  requestPayload,
  execute,
}: ExecuteIdempotentMutationOptions<TBody>): Promise<IdempotentMutationResponse<TBody>> {
  const requestHash = hashIdempotencyPayload(requestPayload);
  const existing = await IdempotencyKeyRepository.findByKey(userId, routeKey, idempotencyKey);
  if (existing) {
    return replayStoredResponse<TBody>(existing, requestHash);
  }

  try {
    await IdempotencyKeyRepository.createProcessing({
      userId,
      routeKey,
      idempotencyKey,
      requestHash,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const stored = await IdempotencyKeyRepository.findByKey(userId, routeKey, idempotencyKey);
      if (stored) {
        return replayStoredResponse<TBody>(stored, requestHash);
      }
    }

    throw error;
  }

  try {
    const response = await execute({ requestHash });
    await IdempotencyKeyRepository.markCompleted(
      userId,
      routeKey,
      idempotencyKey,
      response.statusCode,
      response.body,
    );

    return {
      ...response,
      replayed: false,
    };
  } catch (error) {
    await IdempotencyKeyRepository.deleteProcessing(userId, routeKey, idempotencyKey, requestHash);
    throw error;
  }
}

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';
import { conflict } from '../utils/http-error.ts';
import { HttpError } from '../utils/http-error.ts';

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

interface ExecuteIdempotentMutationV2Options<TBody> {
  userId: string;
  routeKey: string;
  idempotencyKey: string;
  requestPayload: unknown;
  execute: (context: { requestHash: string; session: ClientSession }) => Promise<IdempotentMutationResult<TBody>>;
}

export interface IdempotentMutationResponse<TBody> extends IdempotentMutationResult<TBody> {
  replayed: boolean;
}

export class IdempotencyConflictError extends HttpError {
  constructor(message = 'A request with this idempotency key is already in progress') {
    super(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS', message);
    this.name = 'IdempotencyConflictError';
  }
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
  let existing = await IdempotencyKeyRepository.findByKey(userId, routeKey, idempotencyKey);
  
  if (existing && existing.status === 'processing') {
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > 5 * 60 * 1000) {
      await IdempotencyKeyRepository.deleteProcessing(userId, routeKey, idempotencyKey, existing.requestHash);
      existing = null;
    }
  }

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

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

export async function executeIdempotentMutationV2<TBody>({
  userId,
  routeKey,
  idempotencyKey,
  requestPayload,
  execute,
}: ExecuteIdempotentMutationV2Options<TBody>): Promise<IdempotentMutationResponse<TBody>> {
  const requestHash = hashIdempotencyPayload(requestPayload);
  const session = await mongoose.startSession();
  let response: IdempotentMutationResponse<TBody> | null = null;

  try {
    await session.withTransaction(async () => {
      let existing: Awaited<ReturnType<typeof IdempotencyKeyRepository.claimOrGetExisting>> | null = null;

      try {
        existing = await IdempotencyKeyRepository.claimOrGetExisting({
          userId,
          routeKey,
          idempotencyKey,
          requestHash,
        }, session);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        existing = await IdempotencyKeyRepository.findByKey(userId, routeKey, idempotencyKey, session);
      }

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw conflict(
            'Idempotency key already used with a different request payload',
            'IDEMPOTENCY_KEY_REUSED',
          );
        }

        if (existing.status === 'completed' && existing.responseStatusCode !== undefined) {
          response = {
            statusCode: existing.responseStatusCode,
            body: existing.responseBody as TBody,
            replayed: true,
          };
          return;
        }

        throw new IdempotencyConflictError();
      }

      const executed = await execute({ requestHash, session });
      const markedCompleted = await IdempotencyKeyRepository.markCompletedIfProcessing({
        userId,
        routeKey,
        idempotencyKey,
        requestHash,
      }, executed.statusCode, executed.body, session);

      if (!markedCompleted) {
        throw new Error('Failed to atomically mark idempotency completion');
      }

      response = {
        ...executed,
        replayed: false,
      };
    });
  } finally {
    await session.endSession();
  }

  if (!response) {
    throw new Error('Idempotent mutation did not produce a response');
  }

  return response;
}

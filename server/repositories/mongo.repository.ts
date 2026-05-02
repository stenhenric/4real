import mongoose from 'mongoose';

import { recordMongoOperation } from '../services/metrics.service.ts';

export function getMongoDb(): mongoose.mongo.Db {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database not connected');
  }

  return db;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof value === 'object' && 'then' in value);
}

function isCursorLike(value: unknown): value is { toArray: () => Promise<unknown[]> } {
  return Boolean(
    value
      && typeof value === 'object'
      && 'toArray' in value
      && typeof (value as { toArray?: unknown }).toArray === 'function',
  );
}

function wrapCursor<TCursor extends object>(cursor: TCursor, collectionName: string, operation: string): TCursor {
  return new Proxy(cursor, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        const startedAt = performance.now();

        try {
          const result = value.apply(target, args);

          if (isPromiseLike(result)) {
            return Promise.resolve(result).then(
              (resolved) => {
                recordMongoOperation({
                  collection: collectionName,
                  operation,
                  durationMs: performance.now() - startedAt,
                });
                return resolved;
              },
              (error) => {
                recordMongoOperation({
                  collection: collectionName,
                  operation,
                  durationMs: performance.now() - startedAt,
                });
                throw error;
              },
            );
          }

          if (isCursorLike(result)) {
            return wrapCursor(result, collectionName, operation);
          }

          return result;
        } catch (error) {
          recordMongoOperation({
            collection: collectionName,
            operation,
            durationMs: performance.now() - startedAt,
          });
          throw error;
        }
      };
    },
  });
}

function wrapResult<T>(collectionName: string, operation: string, result: T): T {
  if (isPromiseLike(result)) {
    const startedAt = performance.now();
    return Promise.resolve(result).then(
      (resolved) => {
        recordMongoOperation({
          collection: collectionName,
          operation,
          durationMs: performance.now() - startedAt,
        });
        return resolved;
      },
      (error) => {
        recordMongoOperation({
          collection: collectionName,
          operation,
          durationMs: performance.now() - startedAt,
        });
        throw error;
      },
    ) as T;
  }

  if (isCursorLike(result)) {
    return wrapCursor(result, collectionName, operation) as T;
  }

  return result;
}

export function getMongoCollection<TSchema extends object>(name: string): mongoose.mongo.Collection<TSchema> {
  const collection = getMongoDb().collection<TSchema>(name);

  return new Proxy(collection, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        try {
          const result = value.apply(target, args);
          return wrapResult(name, String(property), result);
        } catch (error) {
          recordMongoOperation({
            collection: name,
            operation: String(property),
            durationMs: 0,
          });
          throw error;
        }
      };
    },
  });
}

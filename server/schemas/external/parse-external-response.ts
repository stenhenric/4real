import type { ZodType } from 'zod';

import { logger } from '../../utils/logger.ts';

export class ExternalSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalSchemaError';
  }
}

export function parseExternalResponse<T>(schema: ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.error('external_schema_mismatch', {
      alert: 'external_schema_mismatch',
      source,
      issues: result.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.join('.'),
      })),
    });
    throw new ExternalSchemaError(`Invalid external response from ${source}`);
  }

  return result.data;
}

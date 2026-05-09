import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { OneTimeToken } from '../models/OneTimeToken.ts';
import { OneTimeTokenService } from './one-time-token.service.ts';

function withSanitizeFilterEnabled(t: TestContext): void {
  const previous = mongoose.get('sanitizeFilter');
  mongoose.set('sanitizeFilter', true);
  t.after(() => {
    mongoose.set('sanitizeFilter', previous);
  });
}

test('revokeActiveTokensForUser active-token operators survive mongoose sanitizeFilter', async (t) => {
  withSanitizeFilterEnabled(t);

  const originalUpdateMany = OneTimeToken.updateMany.bind(OneTimeToken);
  let capturedFilter: Record<string, any> | undefined;

  t.mock.method(OneTimeToken, 'updateMany', async (filter: Record<string, any>, update: Record<string, any>) => {
    capturedFilter = filter;
    mongoose.sanitizeFilter(filter);
    originalUpdateMany(filter, update).cast(OneTimeToken);
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null } as any;
  });

  await OneTimeTokenService.revokeActiveTokensForUser(new mongoose.Types.ObjectId().toString(), ['magic_link']);

  assert(capturedFilter);
  assert.deepEqual(capturedFilter.type.$in, ['magic_link']);
  assert(capturedFilter.expiresAt.$gt instanceof Date);
});

test('consume active-token operators survive mongoose sanitizeFilter', async (t) => {
  withSanitizeFilterEnabled(t);

  const originalFindOneAndUpdate = OneTimeToken.findOneAndUpdate.bind(OneTimeToken);
  let capturedFilter: Record<string, any> | undefined;

  t.mock.method(
    OneTimeToken,
    'findOneAndUpdate',
    async (filter: Record<string, any>, update: Record<string, any>, options: Record<string, any>) => {
      capturedFilter = filter;
      mongoose.sanitizeFilter(filter);
      originalFindOneAndUpdate(filter, update, options).cast(OneTimeToken);
      return {
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        type: 'magic_link',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
      } as any;
    },
  );

  const document = await OneTimeTokenService.consume('magic_link', 'raw-token');

  assert.equal(document.type, 'magic_link');
  assert(capturedFilter);
  assert(capturedFilter.expiresAt.$gt instanceof Date);
});

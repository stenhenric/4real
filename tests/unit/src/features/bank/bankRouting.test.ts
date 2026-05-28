import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getBankViewFromSearchParams,
  updateBankViewSearch,
} from '../../../../../src/features/bank/bankRouting.ts';

describe('bank view routing', () => {
  it('opens the withdrawal panel from a return URL', () => {
    assert.equal(getBankViewFromSearchParams(new URLSearchParams('view=withdraw&flow=withdrawal')), 'withdraw');
  });

  it('falls back to the portal for unknown bank views', () => {
    assert.equal(getBankViewFromSearchParams(new URLSearchParams('view=unknown')), 'portal');
  });

  it('clears one-time MFA status flags while switching bank views', () => {
    assert.equal(
      updateBankViewSearch(new URLSearchParams('mfa=cancelled&flow=withdrawal'), 'withdraw'),
      '?flow=withdrawal&view=withdraw',
    );
  });

  it('clears withdrawal flow context when switching to unrelated bank views', () => {
    assert.equal(
      updateBankViewSearch(new URLSearchParams('view=withdraw&flow=withdrawal&mfa=failed'), 'deposit'),
      '?view=deposit',
    );
  });
});

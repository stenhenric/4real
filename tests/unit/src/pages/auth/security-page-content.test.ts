import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SECURITY_PAGE_COPY } from '../../../../../src/pages/auth/security-page-content.ts';

describe('security page copy', () => {
  it('uses user-facing account protection labels', () => {
    assert.equal(SECURITY_PAGE_COPY.summary.mfa, 'Two-factor authentication');
    assert.equal(SECURITY_PAGE_COPY.summary.device, 'Current device');
    assert.equal(SECURITY_PAGE_COPY.states.off, 'Off');
    assert.equal(SECURITY_PAGE_COPY.states.on, 'On');
    assert.equal(SECURITY_PAGE_COPY.states.active, 'Active');
  });

  it('does not expose technical OTP setup wording', () => {
    const visibleCopy = JSON.stringify(SECURITY_PAGE_COPY);

    assert.doesNotMatch(visibleCopy, /OTP Auth URL/i);
    assert.doesNotMatch(visibleCopy, /\bsecret\b/i);
    assert.doesNotMatch(visibleCopy, /\bTracked\b/i);
    assert.doesNotMatch(visibleCopy, /This browser/i);
    assert.doesNotMatch(visibleCopy, /"Two-Factor Auth"/i);
    assert.doesNotMatch(visibleCopy, /Not set/i);
  });
});

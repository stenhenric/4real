import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWalletAddressForCopy,
  formatWalletAddressForDisplay,
} from '../../../../../src/features/bank/walletAddressPresentation.ts';

describe('wallet address presentation', () => {
  it('converts raw TON wallet addresses to full user-friendly UQ display', () => {
    assert.equal(
      formatWalletAddressForDisplay('0:6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f'),
      'UQBvb29vb29vb29vb29vb29vb29vb29vb29vb29vb29vb3J8',
    );
    assert.equal(
      formatWalletAddressForDisplay('UQ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJ'),
      'UQ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJ',
    );
  });

  it('copies the same full user-friendly value shown in the UI', () => {
    assert.equal(
      formatWalletAddressForCopy('0:1111111111111111111111111111111111111111111111111111111111111111'),
      'UQAREREREREREREREREREREREREREREREREREREREREREbvW',
    );
  });

  it('keeps short or invalid placeholder values stable', () => {
    assert.equal(formatWalletAddressForDisplay('UQshort'), 'UQshort');
    assert.equal(formatWalletAddressForDisplay('0:6tygh-placeholder-address'), '0:6tygh-placeholder-address');
    assert.equal(formatWalletAddressForDisplay(''), '');
  });
});

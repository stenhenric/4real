import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSessionDeviceLabel } from '../../../../../src/pages/auth/session-device-label.ts';

test('formatSessionDeviceLabel summarizes Chrome on desktop', () => {
  assert.equal(formatSessionDeviceLabel({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  }), 'Chrome desktop');
});

test('formatSessionDeviceLabel summarizes Chrome on mobile', () => {
  assert.equal(formatSessionDeviceLabel({
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
  }), 'Chrome mobile');
});

test('formatSessionDeviceLabel handles missing user agent', () => {
  assert.equal(formatSessionDeviceLabel({ userAgent: null }), 'Unknown device');
});

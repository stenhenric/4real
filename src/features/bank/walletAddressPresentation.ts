const RAW_TON_ADDRESS_PATTERN = /^(-?\d+):([0-9a-f]{64})$/i;
const FRIENDLY_TON_ADDRESS_PATTERN = /^[A-Za-z0-9_-]{48}$/;
const TON_FRIENDLY_TAG_NON_BOUNCEABLE = 0x51;
const TON_FRIENDLY_ADDRESS_LENGTH = 36;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;

  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }

  return crc;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triplet = (first << 16) | (second << 8) | third;
    const remaining = bytes.length - index;

    output += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
    output += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
    output += remaining > 1 ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=';
    output += remaining > 2 ? BASE64_ALPHABET[triplet & 0x3f] : '=';
  }

  return output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bytes: number[] = [];

  for (let index = 0; index < padded.length; index += 4) {
    const chunk = padded.slice(index, index + 4);
    const values = [...chunk].map((char) => char === '=' ? -1 : BASE64_ALPHABET.indexOf(char));

    if (values.some((entry) => entry < -1)) {
      return null;
    }

    const triplet = ((values[0] ?? 0) << 18)
      | ((values[1] ?? 0) << 12)
      | (((values[2] ?? 0) & 0x3f) << 6)
      | ((values[3] ?? 0) & 0x3f);

    bytes.push((triplet >> 16) & 0xff);
    if (values[2] !== -1) {
      bytes.push((triplet >> 8) & 0xff);
    }
    if (values[3] !== -1) {
      bytes.push(triplet & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function encodeFriendlyAddress(workchain: number, hash: Uint8Array): string | null {
  if (!Number.isInteger(workchain) || workchain < -128 || workchain > 127 || hash.length !== 32) {
    return null;
  }

  const body = new Uint8Array(34);
  body[0] = TON_FRIENDLY_TAG_NON_BOUNCEABLE;
  body[1] = workchain < 0 ? 256 + workchain : workchain;
  body.set(hash, 2);

  const checksum = crc16Xmodem(body);
  const address = new Uint8Array(TON_FRIENDLY_ADDRESS_LENGTH);
  address.set(body, 0);
  address[34] = (checksum >> 8) & 0xff;
  address[35] = checksum & 0xff;

  return bytesToBase64Url(address);
}

function normalizeRawAddress(value: string): string | null {
  const match = RAW_TON_ADDRESS_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [, workchain, hash] = match;
  if (workchain === undefined || hash === undefined) {
    return null;
  }

  return encodeFriendlyAddress(Number(workchain), hexToBytes(hash));
}

function normalizeFriendlyAddress(value: string): string | null {
  if (!FRIENDLY_TON_ADDRESS_PATTERN.test(value)) {
    return null;
  }

  const address = base64UrlToBytes(value);
  if (!address || address.length !== TON_FRIENDLY_ADDRESS_LENGTH) {
    return null;
  }

  const body = address.slice(0, 34);
  const checksumHigh = address[34];
  const checksumLow = address[35];
  const workchainByte = body[1];

  if (checksumHigh === undefined || checksumLow === undefined || workchainByte === undefined) {
    return null;
  }

  const checksum = (checksumHigh << 8) | checksumLow;
  if (crc16Xmodem(body) !== checksum) {
    return null;
  }

  const workchain = workchainByte === 0xff ? -1 : workchainByte;
  return encodeFriendlyAddress(workchain, body.slice(2, 34));
}

export function formatWalletAddressForDisplay(address: string | null | undefined): string {
  const value = address?.trim() ?? '';

  if (!value) {
    return '';
  }

  return normalizeRawAddress(value) ?? normalizeFriendlyAddress(value) ?? value;
}

export function formatWalletAddressForCopy(address: string | null | undefined): string {
  return formatWalletAddressForDisplay(address);
}

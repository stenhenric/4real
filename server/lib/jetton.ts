import { Address, JettonMaster } from '@ton/ton';

import { JettonWalletCacheRepository } from '../repositories/jetton-wallet-cache.repository.ts';
import { createTonClient } from './ton-client.ts';

export const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';

interface JettonPayloadCommentLike {
  comment?: string;
}

interface JettonTransferCommentLike {
  comment?: string;
  decoded_forward_payload?: JettonPayloadCommentLike | JettonPayloadCommentLike[] | null;
}

export async function deriveJettonWallet(ownerAddress: string) {
  const client = createTonClient();
  const master = client.open(JettonMaster.create(Address.parse(USDT_MASTER)));
  const walletAddr = await master.getWalletAddress(Address.parse(ownerAddress));
  return walletAddr.toString({ bounceable: true });
}

export function normalizeAddress(addr: string) {
  try {
    return Address.parse(addr).toRawString();
  } catch {
    return null;
  }
}

export function addressesEqual(a: string, b: string) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return na !== null && na === nb;
}

export function extractJettonTransferComment(transfer: JettonTransferCommentLike): string {
  if (typeof transfer.comment === 'string') {
    return transfer.comment;
  }

  const payload = transfer.decoded_forward_payload;
  if (Array.isArray(payload)) {
    const match = payload.find((entry) => typeof entry?.comment === 'string');
    return match?.comment ?? '';
  }

  if (payload && typeof payload.comment === 'string') {
    return payload.comment;
  }

  return '';
}

export async function getOrDeriveJettonWallet(ownerAddress: string) {
  const normalizedOwnerAddress = normalizeAddress(ownerAddress);
  const normalizedJettonMaster = normalizeAddress(USDT_MASTER);

  const cached = await JettonWalletCacheRepository.findByOwnerAndMaster(
    normalizedOwnerAddress,
    normalizedJettonMaster,
  );
  if (cached) return cached.jettonWallet;

  const walletStr = await deriveJettonWallet(ownerAddress);

  await JettonWalletCacheRepository.upsert({
    ownerAddress: normalizedOwnerAddress,
    jettonMaster: normalizedJettonMaster,
    jettonWallet: walletStr,
    derivedAt: new Date(),
  });

  return walletStr;
}

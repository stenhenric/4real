import { Address, JettonMaster } from '@ton/ton';
import { createTonClient } from './ton-client';
import mongoose from 'mongoose';

export const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';

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

export async function getOrDeriveJettonWallet(ownerAddress: string) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const cached = await db.collection('jetton_wallet_cache').findOne({
    ownerAddress: normalizeAddress(ownerAddress),
    jettonMaster: normalizeAddress(USDT_MASTER),
  });
  if (cached) return cached.jettonWallet;

  const walletStr = await deriveJettonWallet(ownerAddress);

  await db.collection('jetton_wallet_cache').insertOne({
    ownerAddress: normalizeAddress(ownerAddress),
    jettonMaster: normalizeAddress(USDT_MASTER),
    jettonWallet: walletStr,
    derivedAt: new Date(),
  });

  return walletStr;
}

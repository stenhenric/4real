import { TonClient, WalletContractV5R1, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

import { getEnv } from '../config/env.ts';

const ENDPOINT = {
  mainnet: 'https://toncenter.com/api/v2/jsonRPC',
  testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

const BASE_URL = {
  mainnet: 'https://toncenter.com',
  testnet: 'https://testnet.toncenter.com',
};

export function createTonClient() {
  const env = getEnv();
  const network = env.NETWORK;
  return new TonClient({
    endpoint: ENDPOINT[network] ?? ENDPOINT.mainnet,
    apiKey: env.TONCENTER_API_KEY,
  });
}

export function getToncenterBaseUrl() {
  const env = getEnv();
  return BASE_URL[env.NETWORK] ?? BASE_URL.mainnet;
}

export async function getHotWallet() {
  const env = getEnv();
  if (!env.HOT_WALLET_MNEMONIC) {
      throw new Error('HOT_WALLET_MNEMONIC not set');
  }
  const mnemonic = env.HOT_WALLET_MNEMONIC.split(' ');
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const WalletContract = env.HOT_WALLET_VERSION === 'V4'
    ? WalletContractV4
    : WalletContractV5R1;
  const wallet = WalletContract.create({ workchain: 0, publicKey: keyPair.publicKey });
  return { wallet, keyPair };
}

import { TonClient, WalletContractV5R1, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import dotenv from 'dotenv';

dotenv.config();

const ENDPOINT = {
  mainnet: 'https://toncenter.com/api/v2/jsonRPC',
  testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

export function createTonClient() {
  const network = (process.env.NETWORK as 'mainnet' | 'testnet') || 'mainnet';
  return new TonClient({
    endpoint: ENDPOINT[network] ?? ENDPOINT.mainnet,
    apiKey: process.env.TONCENTER_API_KEY,
  });
}

export async function getHotWallet() {
  if (!process.env.HOT_WALLET_MNEMONIC) {
      throw new Error('HOT_WALLET_MNEMONIC not set');
  }
  const mnemonic = process.env.HOT_WALLET_MNEMONIC.split(' ');
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const WalletContract = process.env.HOT_WALLET_VERSION === 'V4'
    ? WalletContractV4
    : WalletContractV5R1;
  const wallet = WalletContract.create({ workchain: 0, publicKey: keyPair.publicKey });
  return { wallet, keyPair };
}

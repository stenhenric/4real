import { beginCell, internal, toNano, Address, SendMode, TonClient, WalletContractV5R1, WalletContractV4 } from '@ton/ton';
import { getHotWallet } from '../lib/ton-client';
import dotenv from 'dotenv';

dotenv.config();

export function buildJettonTransferBody(amountRaw: string, destination: string, responseAddress: Address, comment: string) {
  const forwardPayload = beginCell()
    .storeUint(0, 32)
    .storeStringTail(comment)
    .endCell();

  return beginCell()
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(0, 64)
    .storeCoins(BigInt(amountRaw))
    .storeAddress(Address.parse(destination))
    .storeAddress(responseAddress)
    .storeBit(0)
    .storeCoins(toNano('0.05'))
    .storeBit(1)
    .storeRef(forwardPayload)
    .endCell();
}

export async function sendUsdtWithdrawal({ toAddress, amountRaw, withdrawalId, hotJettonWallet }: { toAddress: string, amountRaw: string, withdrawalId: string, hotJettonWallet: string }) {
  const { wallet, keyPair } = await getHotWallet();
  const TONCENTER_ENDPOINT = process.env.NETWORK === 'testnet' ? 'https://testnet.toncenter.com/api/v2/jsonRPC' : 'https://toncenter.com/api/v2/jsonRPC';
  const client = new TonClient({
      endpoint: TONCENTER_ENDPOINT,
      apiKey: process.env.TONCENTER_API_KEY
  });
  const contract = client.open(wallet);

  const body = buildJettonTransferBody(
    amountRaw,
    toAddress,
    wallet.address,
    `wd-${withdrawalId}`,
  );

  const seqno = await contract.getSeqno();

  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [
      internal({
        to: Address.parse(hotJettonWallet),
        value: toNano('0.07'),
        bounce: true,
        body,
      }),
    ],
  });

  await pollUntilSeqnoChanges(contract, seqno, 90_000);

  return seqno;
}

interface SeqnoContract {
  getSeqno: () => Promise<number>;
}

async function pollUntilSeqnoChanges(contract: SeqnoContract, initialSeqno: number, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2500);
    try {
      const current = await contract.getSeqno();
      if (current > initialSeqno) return current;
    } catch (err: unknown) {
      // API hiccup — keep trying
      console.warn('API hiccup while polling seqno:', err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`Seqno stuck at ${initialSeqno} after ${timeoutMs}ms`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

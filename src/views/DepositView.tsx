import React, { useState } from 'react';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchyButton } from '../components/SketchyButton';
import { ArrowDownRight, Copy, CheckCircle } from 'lucide-react';
import request from '../lib/api/apiClient';
import { useToast } from '../lib/ToastContext';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { beginCell, Address, toNano } from '@ton/ton';
import type { DepositMemoDTO } from '../types/api';


const DepositView: React.FC = () => {
  const [memoData, setMemoData] = useState<(DepositMemoDTO & { deepLink?: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [depositAmount, setDepositAmount] = useState('10'); // Default to 10 USDT
  const [sendingTransaction, setSendingTransaction] = useState(false);

  const handleDepositTonConnect = async () => {
    if (!wallet) {
      addToast('Please connect your wallet first', 'error');
      return;
    }
    if (!memoData) {
      addToast('Please generate a memo first', 'error');
      return;
    }

    setSendingTransaction(true);
    try {
      const usdtMaster = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'); // Official USDT Master
      const destination = Address.parse(memoData.address);
      const amountNano = toNano(depositAmount); // USDT has 6 decimals, but standard TON functions might expect 9. Let's assume toNano works for 9, we need to be careful if USDT is 6. Wait, the prompt says amount in nanoUSDT.

      // Let's implement the standard Jetton transfer payload
      const forwardPayload = beginCell()
        .storeUint(0, 32) // Text comment opcode
        .storeStringTail(memoData.memo)
        .endCell();

      // Get user's Jetton wallet address (in a real app, this should be fetched from the contract or backend,
      // but for TonConnect we send the transaction to the user's jetton wallet address. Since we don't know it,
      // it's complicated. Actually, standard TonConnect for Jettons sends to the USER'S Jetton Wallet.
      // Wait, let's ask the backend for the Jetton wallet address, or we need to calculate it.
      // Let's create a placeholder or fetch it if needed. The prompt says: "Is the USDT Jetton master address and the user's Jetton wallet address resolved correctly before sending?"
      // So we need to fetch it.

      // We will make an API call to get the user's Jetton wallet address
      const res = await fetch(`https://toncenter.com/api/v3/jetton/wallets?owner_address=${wallet.account.address}&jetton_address=${usdtMaster.toString()}`);
      const jettonWalletData = await res.json();

      if (!jettonWalletData || !jettonWalletData.jetton_wallets || jettonWalletData.jetton_wallets.length === 0) {
          throw new Error("Could not find your USDT wallet on TON. Make sure you have USDT.");
      }

      const userJettonWalletAddress = jettonWalletData.jetton_wallets[0].address;

      const body = beginCell()
        .storeUint(0xf8a7ea5, 32) // op: transfer
        .storeUint(0, 64) // query_id
        .storeCoins(Math.floor(Number(depositAmount) * 1000000)) // amount in nanoUSDT (USDT has 6 decimals)
        .storeAddress(destination) // destination
        .storeAddress(Address.parse(wallet.account.address)) // response_destination
        .storeBit(0) // no custom payload
        .storeCoins(toNano('0.01')) // forward_ton_amount
        .storeBit(1) // we store forwardPayload as a reference
        .storeRef(forwardPayload)
        .endCell();

      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
          {
            address: userJettonWalletAddress,
            amount: toNano('0.05').toString(), // 0.05 TON for gas
            payload: body.toBoc().toString('base64')
          }
        ]
      };

      await tonConnectUI.sendTransaction(transaction);
      addToast('Transaction sent successfully! Waiting for confirmation...', 'success');
    } catch (error: unknown) {
      console.error(error);
      addToast(error instanceof Error ? error.message : 'Transaction failed', 'error');
    } finally {
      setSendingTransaction(false);
    }
  };


  const handleGenerateMemo = async () => {
    setLoading(true);
    try {
      const data = await request('/transactions/deposit/memo', { method: 'POST' });
      setMemoData(data);
      addToast('Deposit memo generated successfully!', 'success');
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Failed to generate memo', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('Copied to clipboard!', 'success');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <SketchyContainer roughness={1} className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <ArrowDownRight size={32} className="text-green-700" />
          </div>
          <div>
            <h2 className="text-3xl font-bold italic tracking-tighter uppercase">Deposit TON</h2>
            <p className="text-sm font-mono opacity-60">Generate a unique memo for automated deposit</p>
          </div>
        </div>

        {!memoData ? (
          <div className="text-center py-8">
            <p className="mb-6 opacity-70 italic">
              Generate a unique memo. Send TON to the provided address with the memo to automatically fund your account.
            </p>
            <SketchyButton onClick={handleGenerateMemo} disabled={loading} className="w-full text-xl py-4">
              {loading ? 'Generating...' : 'Generate Deposit Address & Memo'}
            </SketchyButton>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
              <h3 className="font-bold text-yellow-800 uppercase tracking-tight mb-2 flex items-center gap-2">
                ⚠️ Important Instructions
              </h3>
              <p className="text-sm text-yellow-900 font-mono">
                {memoData.instructions}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest">Deposit Address</label>
                <div className="flex">
                  <input
                    type="text"
                    readOnly
                    value={memoData.address}
                    className="flex-1 text-sm font-mono bg-black/5 border-2 border-black/10 rounded-l p-3 focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(memoData.address)}
                    className="bg-ink-black text-white px-4 rounded-r hover:bg-black/80 transition-colors flex items-center gap-2"
                  >
                    <Copy size={16} /> Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest">Required Memo (Comment)</label>
                <div className="flex">
                  <input
                    type="text"
                    readOnly
                    value={memoData.memo}
                    className="flex-1 text-lg font-mono font-bold bg-green-50 border-2 border-green-500 text-green-800 rounded-l p-3 focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(memoData.memo)}
                    className="bg-green-700 text-white px-4 rounded-r hover:bg-green-800 transition-colors flex items-center gap-2"
                  >
                    <Copy size={16} /> Copy
                  </button>
                </div>
                <p className="text-xs text-red-500 font-bold mt-1 ml-1">
                  * You MUST include this memo, otherwise your funds will be lost.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-center gap-2 text-sm font-mono opacity-50">
              <CheckCircle size={16} className="text-green-600" />
              Expires in: {memoData.expiresIn}
            </div>


              <div className="mt-6 flex flex-col gap-4">
                <div className="bg-white p-4 rounded border-2 border-black/10 shadow-sm">
                  <h4 className="font-bold uppercase tracking-widest text-xs opacity-60 mb-2">TonConnect Deposit</h4>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="flex-1 bg-black/5 border border-black/10 rounded p-2 focus:outline-none font-mono"
                      placeholder="USDT Amount"
                    />
                  </div>
                  <button
                    onClick={handleDepositTonConnect}
                    disabled={!wallet || sendingTransaction}
                    className={`w-full font-bold py-3 px-4 rounded text-center transition-colors shadow-md border-2 border-black ${
                      !wallet || sendingTransaction
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {sendingTransaction ? 'Sending...' : 'Deposit via TonConnect'}
                  </button>
                  {!wallet && (
                    <p className="text-xs text-red-500 mt-2 text-center">Please connect your wallet first</p>
                  )}
                </div>

                <a

                  href={memoData.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded text-center transition-colors shadow-md border-2 border-black"
                >
                  Pay with Tonkeeper (1-Click)
                </a>
              </div>
          </div>
        )}
      </SketchyContainer>
    </div>
  );
};

export default DepositView;

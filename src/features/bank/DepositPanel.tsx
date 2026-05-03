import { useState } from 'react';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { ArrowDownRight, CheckCircle, Copy } from 'lucide-react';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { useToast } from '../../app/ToastProvider';
import { createDepositMemo, prepareTonConnectDeposit } from '../../services/transactions.service';
import type { DepositMemoDTO } from '../../types/api';

const DEPOSIT_ADDRESS_ID = 'deposit-address';
const DEPOSIT_MEMO_ID = 'deposit-memo';
const TONCONNECT_AMOUNT_ID = 'tonconnect-amount';

const DepositPanel = () => {
  const [memoData, setMemoData] = useState<DepositMemoDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('10');
  const [sendingTransaction, setSendingTransaction] = useState(false);
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const connectedWalletAddress = useTonAddress();
  const copyToClipboard = useCopyToClipboard();
  const { addToast } = useToast();

  const handleDepositTonConnect = async () => {
    if (!wallet) {
      addToast('Please connect your wallet first', 'error');
      return;
    }

    if (!memoData) {
      addToast('Please generate a memo first', 'error');
      return;
    }
    if (!connectedWalletAddress) {
      addToast('Please connect your wallet first', 'error');
      return;
    }

    setSendingTransaction(true);

    try {
      const amountUsdt = Number(depositAmount);
      if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
        throw new Error('Please enter a valid deposit amount.');
      }

      const prepared = await prepareTonConnectDeposit({
        memo: memoData.memo,
        walletAddress: connectedWalletAddress,
        amountUsdt: amountUsdt.toFixed(6),
      });

      await tonConnectUI.sendTransaction(prepared.transaction);
      addToast('Transaction sent successfully! Waiting for confirmation...', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Transaction failed', 'error');
    } finally {
      setSendingTransaction(false);
    }
  };

  const handleGenerateMemo = async () => {
    setLoading(true);

    try {
      const data = await createDepositMemo();
      setMemoData(data);
      addToast('Deposit memo generated successfully!', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to generate memo', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <SketchyContainer roughness={1} className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <ArrowDownRight size={32} className="text-green-700" />
          </div>
          <div>
            <h2 className="text-3xl font-bold italic tracking-tighter uppercase">Deposit USDT</h2>
            <p className="text-sm font-mono opacity-60">Use TonConnect or a wallet that supports USDT jetton comments</p>
          </div>
        </div>

        {!memoData ? (
          <div className="text-center py-8">
            <p className="mb-6 opacity-70 italic">
              Generate a unique memo, then send USDT on TON with that memo to automatically fund your account.
            </p>
            <SketchyButton
              className="w-full text-xl py-4"
              disabled={loading}
              onClick={handleGenerateMemo}
            >
              {loading ? 'Generating...' : 'Generate Deposit Address & Memo'}
            </SketchyButton>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
              <h3 className="font-bold text-yellow-800 uppercase tracking-tight mb-2 flex items-center gap-2">
                ⚠️ Important Instructions
              </h3>
              <p className="text-sm text-yellow-900 font-mono">{memoData.instructions}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
                  htmlFor={DEPOSIT_ADDRESS_ID}
                >
                  Deposit Address
                </label>
                <div className="flex">
                  <input
                    className="flex-1 text-sm font-mono bg-black/5 border-2 border-black/10 rounded-l p-3 focus:outline-none"
                    id={DEPOSIT_ADDRESS_ID}
                    readOnly
                    type="text"
                    value={memoData.address}
                  />
                  <button
                    className="bg-ink-black text-white px-4 rounded-r hover:bg-black/80 transition-colors flex items-center gap-2"
                    onClick={() => void copyToClipboard(memoData.address)}
                    type="button"
                  >
                    <Copy size={16} /> Copy
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
                  htmlFor={DEPOSIT_MEMO_ID}
                >
                  Required Memo (Comment)
                </label>
                <div className="flex">
                  <input
                    className="flex-1 text-lg font-mono font-bold bg-green-50 border-2 border-green-500 text-green-800 rounded-l p-3 focus:outline-none"
                    id={DEPOSIT_MEMO_ID}
                    readOnly
                    type="text"
                    value={memoData.memo}
                  />
                  <button
                    className="bg-green-700 text-white px-4 rounded-r hover:bg-green-800 transition-colors flex items-center gap-2"
                    onClick={() => void copyToClipboard(memoData.memo)}
                    type="button"
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
              <span aria-live="polite">Expires in: {memoData.expiresIn}</span>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div className="bg-white p-4 rounded border-2 border-black/10 shadow-sm">
                <h4 className="font-bold uppercase tracking-widest text-xs opacity-60 mb-2">
                  TonConnect Deposit
                </h4>
                <p className="text-xs font-mono opacity-60 mb-3">
                  Recommended.
                </p>
                <div className="flex gap-2 mb-4">
                  <input
                    aria-label="USDT Amount"
                    className="flex-1 bg-black/5 border border-black/10 rounded p-2 focus:outline-none font-mono"
                    id={TONCONNECT_AMOUNT_ID}
                    inputMode="decimal"
                    onChange={(event) => setDepositAmount(event.target.value)}
                    placeholder="USDT Amount"
                    type="number"
                    value={depositAmount}
                  />
                </div>
                <button
                  aria-describedby={!wallet ? 'wallet-connect-required' : undefined}
                  className={`w-full font-bold py-3 px-4 rounded text-center transition-colors shadow-md border-2 border-black ${
                    !wallet || sendingTransaction
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-ink-blue hover:opacity-90 text-white'
                  }`}
                  disabled={!wallet || sendingTransaction}
                  onClick={handleDepositTonConnect}
                  type="button"
                >
                  {sendingTransaction ? 'Sending...' : 'Deposit via TonConnect'}
                </button>
                {!wallet && (
                  <p className="text-xs text-red-500 mt-2 text-center" id="wallet-connect-required">
                  Please connect your wallet first
                </p>
              )}
              </div>
            </div>
          </div>
        )}
      </SketchyContainer>
    </div>
  );
};

export default DepositPanel;

import { useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { ArrowDownRight, CheckCircle } from 'lucide-react';
import { SketchyButton } from '../../components/SketchyButton';
import { CopyField } from '../../components/ui/CopyField';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { useToast } from '../../app/ToastProvider';
import { createDepositMemo, prepareTonConnectDeposit } from '../../services/transactions.service';
import type { DepositMemoDTO } from '../../types/api';
import { getApiErrorMessage } from '../../utils/errors';

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
      addToast('Connect your wallet first.', 'error');
      return;
    }

    if (!memoData) {
      addToast('Generate a memo first.', 'error');
      return;
    }
    if (!connectedWalletAddress) {
      addToast('Connect your wallet first.', 'error');
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
      addToast('Transaction sent. Awaiting confirmation.', 'success');
    } catch (error) {
      addToast(getApiErrorMessage(error, 'Transaction failed. Please try again.'), 'error');
    } finally {
      setSendingTransaction(false);
    }
  };

  const handleGenerateMemo = async () => {
    setLoading(true);

    try {
      const data = await createDepositMemo();
      setMemoData(data);
      addToast('Deposit memo generated.', 'success');
    } catch (error) {
      addToast(getApiErrorMessage(error, 'Could not generate memo. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rough-border flex h-16 w-16 items-center justify-center bg-success-bg">
              <ArrowDownRight size={32} className="text-success-text" />
            </div>
            <div>
              <h2 className="text-3xl font-bold italic tracking-tighter uppercase">Deposit USDT</h2>
              <p className="text-sm font-mono opacity-60">Use TonConnect or a wallet that supports USDT jetton comments</p>
            </div>
          </div>
          <div className="shrink-0 sm:pt-1">
            <TonConnectButton />
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
            <div className="rough-border bg-warning-bg border-warning-border p-4">
              <h3 className="font-bold text-warning-text uppercase tracking-tight mb-2 flex items-center gap-2">
                <span aria-hidden="true">⚠️</span> Important Instructions
              </h3>
              <p className="text-sm text-warning-text font-mono">{memoData.instructions}</p>
            </div>

            <div className="space-y-4">
              <CopyField
                id={DEPOSIT_ADDRESS_ID}
                label="Deposit Address"
                onCopy={() => void copyToClipboard(memoData.address)}
                value={memoData.address}
              />

              <div>
                <CopyField
                  id={DEPOSIT_MEMO_ID}
                  label="Required Memo (Comment)"
                  onCopy={() => void copyToClipboard(memoData.memo)}
                  value={memoData.memo}
                  valueClassName="bg-success-bg text-success-text border-success-border"
                />
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
              <div className="bg-white p-4 border-2 border-black/10 shadow-sm">
                <h4 className="font-bold uppercase tracking-widest text-xs opacity-60 mb-2">
                  TonConnect Deposit
                </h4>
                <p className="text-xs font-mono opacity-60 mb-3">
                  Recommended.
                </p>
                <div className="flex gap-2 mb-4">
                  <input
                    aria-label="USDT Amount"
                    className="flex-1 bg-black/5 border border-black/10 p-2 focus:outline-none font-mono"
                    id={TONCONNECT_AMOUNT_ID}
                    inputMode="decimal"
                    onChange={(event) => setDepositAmount(event.target.value)}
                    placeholder="USDT Amount"
                    type="number"
                    value={depositAmount}
                  />
                </div>
                <SketchyButton
                  aria-describedby={!wallet ? 'wallet-connect-required' : undefined}
                  className={`w-full font-bold py-3 px-4 text-center transition-colors shadow-md border-2 border-black ${
                    !wallet || sendingTransaction
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-ink-blue hover:opacity-90 text-white'
                  }`}
                  disabled={!wallet || sendingTransaction}
                  fill={!wallet || sendingTransaction ? '#d1d5db' : 'var(--color-ink-blue)'}
                  onClick={handleDepositTonConnect}
                  type="button"
                >
                  {sendingTransaction ? 'Sending...' : 'Deposit via TonConnect'}
                </SketchyButton>
                {!wallet && (
                  <p className="text-xs text-red-500 mt-2 text-center" id="wallet-connect-required">
                  Please connect your wallet first
                </p>
              )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositPanel;

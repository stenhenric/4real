import { useEffect, useState, type FormEvent } from 'react';
import { TonConnectButton, useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import { ArrowUpRight } from 'lucide-react';
import { ApiClientError } from '../../services/api/apiClient';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { createWithdrawal } from '../../services/transactions.service';
import { formatMoneyValue } from '../../utils/exact-money.ts';
import { getApiErrorMessage } from '../../utils/errors';

const WITHDRAW_AMOUNT_ID = 'withdraw-amount';
const WITHDRAW_ADDRESS_ID = 'withdraw-address';

const WithdrawPanel = () => {
  const { userData, refreshUser } = useAuth();
  const { addToast } = useToast();
  const wallet = useTonWallet();
  const connectedWalletAddress = useTonAddress();
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connectedWalletAddress) {
      setToAddress(connectedWalletAddress);
    }
  }, [connectedWalletAddress]);

  const handleWithdraw = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      addToast('Enter a valid amount.', 'error');
      return;
    }

    if (!toAddress) {
      addToast('Enter a valid TON address.', 'error');
      return;
    }

    setLoading(true);

    try {
      await createWithdrawal({ amountUsdt: Number(amount).toFixed(6), toAddress });
      addToast('Withdrawal queued.', 'success');
      setAmount('');
      setToAddress(connectedWalletAddress || '');
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      addToast(getApiErrorMessage(error, 'Withdrawal failed. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rough-border flex h-16 w-16 items-center justify-center bg-danger-bg">
              <ArrowUpRight size={32} className="text-danger-text" />
            </div>
            <div>
              <h2 className="text-3xl font-bold italic tracking-tighter uppercase">Withdraw USDT</h2>
              <p className="text-sm font-mono opacity-60">Send USDT from your balance to a TON wallet address</p>
            </div>
          </div>
          <div className="shrink-0 sm:pt-1">
            <TonConnectButton />
          </div>
        </div>

        <div className="mb-8 p-4 bg-black/5 border border-black/10 flex justify-between items-center">
          <span className="font-bold uppercase tracking-widest text-sm opacity-60">Available Balance:</span>
          <span className="text-2xl font-bold font-mono text-ink-blue">
            {formatMoneyValue(userData?.balance)} USDT
          </span>
        </div>

        <form className="space-y-6" onSubmit={handleWithdraw}>
          <div>
            <label
              className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
              htmlFor={WITHDRAW_AMOUNT_ID}
            >
              Withdrawal Amount (USDT)
            </label>
            <div className="relative">
              <input
                className="w-full text-4xl font-bold bg-transparent border-b-2 border-black/20 focus:border-black p-2 transition-colors"
                id={WITHDRAW_AMOUNT_ID}
                min="0.01"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                value={amount}
              />
              <span className="absolute right-2 bottom-3 text-xl opacity-30 font-bold">USDT</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-end">
              <label
                className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
                htmlFor={WITHDRAW_ADDRESS_ID}
              >
                Destination TON Address
              </label>
              {wallet && (
                <SketchyButton
                  className="text-[10px] font-bold uppercase text-white px-2 py-1 mb-1"
                  fill="var(--color-ink-blue)"
                  onClick={() => setToAddress(connectedWalletAddress)}
                  type="button"
                >
                  Auto-fill connected wallet
                </SketchyButton>
              )}
            </div>
            <input
              className="w-full text-lg font-mono bg-transparent border-b-2 border-black/20 focus:border-black p-2 transition-colors"
              id={WITHDRAW_ADDRESS_ID}
              onChange={(event) => setToAddress(event.target.value)}
              placeholder="EQ..."
              required
              type="text"
              value={toAddress}
            />
          </div>

          <SketchyButton className="w-full text-xl py-4 mt-4" disabled={loading} type="submit">
            {loading ? 'Processing...' : 'Request Withdrawal'}
          </SketchyButton>
        </form>
      </div>
    </div>
  );
};

export default WithdrawPanel;

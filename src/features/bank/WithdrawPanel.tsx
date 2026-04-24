import { useEffect, useState, type FormEvent } from 'react';
import { useTonWallet } from '@tonconnect/ui-react';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { createWithdrawal } from '../../services/transactions.service';

const WITHDRAW_AMOUNT_ID = 'withdraw-amount';
const WITHDRAW_ADDRESS_ID = 'withdraw-address';

const WithdrawPanel = () => {
  const { userData, refreshUser } = useAuth();
  const { addToast } = useToast();
  const wallet = useTonWallet();
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wallet?.account?.address) {
      setToAddress(wallet.account.address);
    }
  }, [wallet]);

  const handleWithdraw = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      addToast('Please enter a valid amount', 'error');
      return;
    }

    if (!toAddress) {
      addToast('Please enter a valid TON address', 'error');
      return;
    }

    setLoading(true);

    try {
      await createWithdrawal({ amountUsdt: Number(amount), toAddress });
      addToast('Withdrawal queued successfully. Track it in transaction history.', 'success');
      setAmount('');
      setToAddress('');
      await refreshUser();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Withdrawal failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <SketchyContainer roughness={1} className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <ArrowUpRight size={32} className="text-red-700" />
          </div>
          <div>
            <h2 className="text-3xl font-bold italic tracking-tighter uppercase">Withdraw USDT</h2>
            <p className="text-sm font-mono opacity-60">Send USDT from your balance to a TON wallet address</p>
          </div>
        </div>

        <div className="mb-8 p-4 bg-black/5 rounded border border-black/10 flex justify-between items-center">
          <span className="font-bold uppercase tracking-widest text-sm opacity-60">Available Balance:</span>
          <span className="text-2xl font-bold font-mono text-ink-blue">
            {userData?.balance?.toFixed(2) || '0.00'} USDT
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
                <button
                  className="text-[10px] font-bold uppercase bg-ink-blue text-white px-2 py-1 rounded hover:bg-blue-600 mb-1"
                  onClick={() => setToAddress(wallet.account.address)}
                  type="button"
                >
                  Auto-fill connected wallet
                </button>
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
      </SketchyContainer>
    </div>
  );
};

export default WithdrawPanel;

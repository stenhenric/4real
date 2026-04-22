import React, { useState } from 'react';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchyButton } from '../components/SketchyButton';
import { ArrowDownRight, Copy, CheckCircle } from 'lucide-react';
import request from '../lib/api/apiClient';
import { useToast } from '../lib/ToastContext';

const DepositView: React.FC = () => {
  const [memoData, setMemoData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handleGenerateMemo = async () => {
    setLoading(true);
    try {
      const data = await request('/transactions/deposit/memo', { method: 'POST' });
      setMemoData(data);
      addToast('Deposit memo generated successfully!', 'success');
    } catch (error: any) {
      addToast(error.message || 'Failed to generate memo', 'error');
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
          </div>
        )}
      </SketchyContainer>
    </div>
  );
};

export default DepositView;

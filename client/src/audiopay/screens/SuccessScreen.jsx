import { useState } from 'react'
import { formatAmount, getBalance, getPendingTokens, settlePendingTokens } from '../audio-pay-module/index.js'
import { useWalletStore } from '../../store/walletStore'

export function SuccessScreen({ payment, onDone }) {
  const { recipientName, amount, token } = payment
  const wallet = useWalletStore(state => state);
  const [settling, setSettling]   = useState(false)
  const [settled, setSettled]     = useState(false)
  const [settledCount, setCount]  = useState(0)
  const pending = getPendingTokens().length

  async function handleSettle() {
    setSettling(true)
    const result = await settlePendingTokens()
    setCount(result.settled)
    setSettled(true)
    setSettling(false)
  }

  return (
    <main className="min-h-screen pb-20 w-full relative bg-background">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none -mr-20 -mt-20"></div>

      <div className="pt-24 px-4 lg:px-10 max-w-3xl mx-auto space-y-8 relative z-10 flex flex-col min-h-[calc(100vh-80px)] items-center">
        
        {/* Success animation */}
        <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-primary flex items-center justify-center relative mt-10" style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}>
          <div className="absolute inset-0 rounded-full" style={{ animation: 'ringPulse 1.5s ease-out 0.3s' }}></div>
          <span className="material-symbols-outlined text-5xl text-primary font-bold">check</span>
        </div>

        {/* Main message */}
        <div className="text-center" style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}>
          <h2 className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-2">Payment Sent</h2>
          <p className="font-mono text-5xl font-medium text-white tracking-tight leading-none mb-3">{formatAmount(amount)}</p>
          <p className="text-sm text-slate-400">to <span className="font-mono font-medium text-primary tracking-wider">{recipientName}</span></p>
        </div>

        {/* Token reference card */}
        <div className="w-full bg-[#0d0d15]/60 backdrop-blur-xl border border-outline-variant/15 rounded-2xl overflow-hidden mt-6" style={{ animation: 'fadeUp 0.4s ease 0.3s both' }}>
          <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant/10">
            <span className="text-[13px] text-slate-400">Token ID</span>
            <span className="font-mono text-[13px] text-white max-w-[55%] text-right break-all">{token.id.toUpperCase()}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant/10">
            <span className="text-[13px] text-slate-400">Status</span>
            <span className={`font-mono text-[13px] ${settled ? 'text-primary' : 'text-amber-500'}`}>
              {settled ? 'Settled ✓' : 'Pending Settlement'}
            </span>
          </div>
          <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant/10">
            <span className="text-[13px] text-slate-400">Wallet Balance</span>
            <span className="font-mono text-[13px] text-white">{formatAmount((wallet?.confirmed_bal - (wallet?.locked_bal || 0) + (wallet?.unconfirmed_received || 0)) / 100 || 0)}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-4">
            <span className="text-[13px] text-slate-400">Time</span>
            <span className="font-mono text-[13px] text-white">{new Date().toLocaleTimeString('en-IN')}</span>
          </div>
        </div>

        {/* Settlement info */}
        {!settled && (
          <div className="w-full bg-surface-high border border-outline-variant/15 rounded-xl p-5" style={{ animation: 'fadeUp 0.4s ease 0.4s both' }}>
            <p className="text-[13px] font-bold text-slate-400 mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">lightbulb</span> About settlement
            </p>
            <p className="text-[13px] text-slate-400 leading-relaxed">
              The token is secured from your pre-funded balance. The recipient's bank account
              will be credited when either device connects to the internet.
              {pending > 1 ? ` You have ${pending} pending tokens total.` : ''}
            </p>
          </div>
        )}

        {settled && (
          <div className="w-full bg-primary/5 border border-primary/30 rounded-xl p-5" style={{ animation: 'fadeUp 0.4s ease 0.4s both' }}>
            <p className="text-[13px] font-bold text-primary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">verified</span> Settlement complete
            </p>
            <p className="text-[13px] text-slate-400 leading-relaxed">
              {settledCount} token{settledCount !== 1 ? 's' : ''} settled. Money is on its way to the recipient's bank account.
            </p>
          </div>
        )}

        <div className="flex-1" />

        {/* Actions */}
        <div className="w-full flex flex-col gap-3 mt-8 pb-4" style={{ animation: 'fadeUp 0.4s ease 0.5s both' }}>
          {!settled && pending > 0 && (
            <button
              className={`w-full py-4 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold tracking-wide active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${settling ? 'opacity-60 pointer-events-none' : ''}`}
              onClick={handleSettle}
            >
              {settling && <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>}
              {settling ? 'Settling…' : `Settle Now (${pending} pending)`}
            </button>
          )}

          <button onClick={onDone} className="w-full py-4 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-black tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform">
            Done
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          0%   { transform: scale(0.5); opacity: 0; }
          70%  { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ringPulse {
          0%   { box-shadow: 0 0 0 0 rgba(108, 92, 231, 0.4); }
          70%  { box-shadow: 0 0 0 24px rgba(108, 92, 231, 0); }
          100% { box-shadow: 0 0 0 0 rgba(108, 92, 231, 0); }
        }
        @keyframes fadeUp {
          0%   { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  )
}

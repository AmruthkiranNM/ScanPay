import { useState, useEffect } from 'react'
import { getUser, saveUser, formatAmount } from '../audio-pay-module/index.js'
import { useWalletStore } from '../../store/walletStore'

export function HomeScreen({ onSend, onReceive }) {
  const user = getUser()
  const { wallet, loadWalletState } = useWalletStore()
  
  useEffect(() => {
    loadWalletState();
  }, [loadWalletState]);

  const balance = wallet 
    ? (wallet.confirmed_bal - (wallet.locked_bal || 0) + (wallet.unconfirmed_received || 0)) / 100 
    : 0;
  const [showSetup, setShowSetup] = useState(!user)
  const [name, setName]           = useState('')
  const [nameError, setNameError] = useState('')

  function handleSetup() {
    const trimmed = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (trimmed.length < 2) {
      setNameError('Enter at least 2 characters')
      return
    }
    saveUser({ name: trimmed, createdAt: Date.now() })
    setShowSetup(false)
  }

  if (showSetup) {
    return (
      <main className="min-h-screen w-full flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none -ml-20 -mb-20"></div>
        
        <div className="material-symbols-outlined text-primary text-5xl mb-2 relative z-10">contactless</div>
        <h1 className="text-4xl font-black text-white font-display tracking-tight relative z-10 mb-2">AudioPay</h1>
        <p className="text-slate-400 font-body text-sm mb-10 relative z-10">Pay with sound. No internet needed.</p>

        <div className="w-full max-w-md bg-[#0d0d15]/60 backdrop-blur-xl border border-outline-variant/15 rounded-2xl p-6 relative z-10">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Your display name</label>
          <input
            className={`w-full bg-surface-high border ${nameError ? 'border-error' : 'border-outline-variant/20'} rounded-xl px-4 py-4 text-white font-mono text-xl outline-none focus:border-primary/50 transition-colors tracking-widest`}
            placeholder="e.g. RAMU"
            maxLength={8}
            value={name}
            onChange={e => { setName(e.target.value.toUpperCase()); setNameError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSetup()}
          />
          {nameError && <p className="text-error text-xs mt-2 font-medium">{nameError}</p>}
          <p className="text-slate-500 text-xs mt-3">This name will be broadcast when you receive payments</p>

          <button onClick={handleSetup} className="w-full mt-6 py-4 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-black tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform">
            Get Started →
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-20 w-full relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none -mr-20 -mt-20"></div>
      
      <header className="fixed top-14 lg:top-0 right-0 lg:left-64 left-0 h-16 lg:h-20 bg-background/80 backdrop-blur-xl border-b border-outline-variant/15 px-4 lg:px-10 flex items-center justify-between z-30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-2xl">contactless</span>
          <h2 className="text-xl font-bold text-white tracking-tight">AudioPay</h2>
        </div>
        <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
          {user.name[0]}
        </div>
      </header>

      <div className="pt-36 lg:pt-28 px-4 lg:px-10 max-w-3xl mx-auto space-y-8 relative z-10">
        
        <div className="bg-gradient-to-br from-[#0d0d15]/80 to-[#1f1f30]/80 backdrop-blur-xl border border-outline-variant/20 rounded-3xl p-8 relative overflow-hidden shadow-[0_40px_64px_-12px_rgba(0,0,0,0.4)]">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/20 blur-[60px] rounded-full -mr-10 -mt-10 pointer-events-none"></div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Wallet Balance</p>
          <p className="text-5xl font-mono font-medium text-white tracking-tight mb-6">{formatAmount(balance)}</p>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-bold text-primary tracking-widest uppercase">Pre-Funded</span>
            <span className="text-xs font-mono text-slate-400">{user.name}</span>
          </div>
        </div>

        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">What do you want to do?</p>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={onSend} className="bg-[#0d0d15]/60 backdrop-blur-xl border border-outline-variant/15 hover:border-primary/30 rounded-2xl p-6 flex flex-col items-center gap-2 transition-all active:scale-[0.98] group">
            <span className="material-symbols-outlined text-4xl text-slate-300 group-hover:text-primary transition-colors">wifi_tethering</span>
            <span className="text-lg font-bold text-white mt-2">Send</span>
            <span className="text-xs text-slate-500">Scan sound → pay</span>
          </button>
          
          <button onClick={onReceive} className="bg-primary/5 backdrop-blur-xl border border-primary/20 hover:bg-primary/10 rounded-2xl p-6 flex flex-col items-center gap-2 transition-all active:scale-[0.98] group">
            <span className="material-symbols-outlined text-4xl text-primary">graphic_eq</span>
            <span className="text-lg font-bold text-white mt-2">Receive</span>
            <span className="text-xs text-slate-500">Broadcast your ID</span>
          </button>
        </div>

        <div className="bg-[#0d0d15]/60 backdrop-blur-xl border border-outline-variant/15 rounded-2xl p-6 mt-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-5">How it works</p>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary mt-0.5">1</div>
              <p className="text-sm text-slate-400 leading-relaxed">Receiver taps <b className="text-white">Receive</b> — phone broadcasts a sound tone with their ID</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary mt-0.5">2</div>
              <p className="text-sm text-slate-400 leading-relaxed">Sender taps <b className="text-white">Send</b> — phone listens, instantly catches the tone</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary mt-0.5">3</div>
              <p className="text-sm text-slate-400 leading-relaxed">Sender enters amount + PIN — payment queued, settles when online</p>
            </div>
          </div>
        </div>
        
      </div>
    </main>
  )
}

import { useState, useEffect, useRef } from 'react'
import { startListening } from '../audio-pay-module/index.js'
import { createOutgoingToken, getBalance, formatAmount } from '../audio-pay-module/index.js'
import { useWalletStore } from '../../store/walletStore'

export function SenderScreen({ onBack, onSuccess }) {
  const wallet = useWalletStore(state => state);
  // phase: 'scanning' | 'confirm' | 'processing' | 'error'
  const [phase, setPhase]         = useState('scanning')
  const [detectedName, setName]   = useState('')
  const [amount, setAmount]       = useState('')
  const [pin, setPin]             = useState('')
  const [signalLevel, setLevel]   = useState(-80)
  const [barHeights, setBarHeights] = useState(Array(24).fill(4))
  const [errors, setErrors]       = useState({})
  const [statusMsg, setStatus]    = useState('Listening for payment tone…')

  const listenerRef = useRef(null)
  const barAnimRef  = useRef(null)

  // Animate idle bars even without real signal
  useEffect(() => {
    function animateIdle() {
      setBarHeights(prev =>
        prev.map((h, i) => {
          const noise = (Math.random() - 0.5) * 6
          const base  = 4 + Math.sin(Date.now() / 400 + i * 0.7) * 3
          return Math.max(3, Math.min(32, base + noise))
        })
      )
      barAnimRef.current = requestAnimationFrame(animateIdle)
    }
    if (phase === 'scanning') {
      barAnimRef.current = requestAnimationFrame(animateIdle)
    }
    return () => cancelAnimationFrame(barAnimRef.current)
  }, [phase])

  // Start microphone listener as soon as screen mounts
  useEffect(() => {
    if (phase !== 'scanning') return

    let stopped = false

    async function init() {
      listenerRef.current = await startListening(
        (payload) => {
          if (stopped) return
          if (payload && payload.length >= 2) {
            setName(payload.toUpperCase())
            setPhase('confirm')
            setStatus('')
            listenerRef.current?.stop()
          }
        },
        (status) => {
          if (stopped) return
          if (status === 'listening')  setStatus('Listening for payment tone…')
          if (status === 'receiving') {
            setStatus('Signal detected! Decoding…')
            // Spike bars for visual feedback
            setBarHeights(Array(24).fill(0).map(() => 12 + Math.random() * 30))
          }
          if (status === 'error')     setStatus('Microphone access denied. Check browser permissions.')
        },
        (db) => {
          if (stopped) return
          setLevel(db)
        }
      )
    }

    init()

    return () => {
      stopped = true
      listenerRef.current?.stop()
    }
  }, [phase])

  function validate() {
    const errs = {}
    const amt  = parseFloat(amount)
    const availableBalance = (wallet?.confirmed_bal - (wallet?.locked_bal || 0) + (wallet?.unconfirmed_received || 0)) / 100 || 0;
    if (!amount || isNaN(amt) || amt <= 0)              errs.amount = 'Enter a valid amount'
    if (amt > availableBalance)                              errs.amount = 'Insufficient balance'
    if (!pin || pin.length < 4 || pin.length > 6)       errs.pin    = 'PIN must be 4–6 digits'
    if (!/^\d+$/.test(pin))                             errs.pin    = 'PIN must be numeric'
    return errs
  }

  function handlePay() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setPhase('processing')

    // Simulate 1.5s processing (UPI auth)
    setTimeout(() => {
      try {
        const token = createOutgoingToken({
          recipientName: detectedName,
          amount:        parseFloat(amount),
          pin,           // handled in-memory only, never persisted
        })
        // Clear PIN from memory immediately
        setPin('')
        onSuccess?.({ recipientName: detectedName, amount: parseFloat(amount), token })
      } catch (err) {
        setErrors({ general: err.message })
        setPhase('confirm')
      }
    }, 1500)
  }

  function rescan() {
    setPhase('scanning')
    setName('')
    setAmount('')
    setPin('')
    setErrors({})
  }

  // ─── Scanning screen ─────────────────────────────────────────────────────────
  if (phase === 'scanning') {
    return (
      <main className="min-h-screen pb-20 w-full relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none -mr-20 -mt-20"></div>

        <header className="fixed top-14 lg:top-0 right-0 lg:left-64 left-0 h-16 lg:h-20 bg-background/80 backdrop-blur-xl border-b border-outline-variant/15 px-4 lg:px-10 flex items-center gap-4 z-30">
          <button onClick={() => { listenerRef.current?.stop(); onBack() }} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors">
            <span className="material-symbols-outlined text-slate-400">arrow_back</span>
          </button>
          <h2 className="text-xl font-bold text-white tracking-tight">Send Payment</h2>
        </header>

        <div className="pt-36 lg:pt-28 px-4 lg:px-10 max-w-3xl mx-auto space-y-6 relative z-10 flex flex-col min-h-[calc(100vh-140px)]">
          <div>
            <p className="text-sm text-slate-400">Hold phone close to receiver</p>
          </div>

          <div className="bg-[#0d0d15]/60 backdrop-blur-xl border border-outline-variant/15 rounded-3xl p-10 flex flex-col items-center justify-center gap-8 relative min-h-[300px] overflow-hidden">
            <div className="absolute top-[40%] left-1/2 w-24 h-24 rounded-full border border-primary/60 opacity-50 pointer-events-none" style={{ animation: 'pulse1 2s ease-out infinite' }} />
            <div className="absolute top-[40%] left-1/2 w-24 h-24 rounded-full border border-primary/30 opacity-30 pointer-events-none" style={{ animation: 'pulse2 2s ease-out infinite', animationDelay: '0.6s' }} />

            <div className="text-5xl relative z-10">📡</div>

            <div className="flex items-center gap-1 h-10">
              {barHeights.map((h, i) => (
                <div
                  key={i}
                  className="w-1 rounded-sm min-h-[3px] transition-all duration-75"
                  style={{
                    height: h,
                    background: h > 20 ? 'var(--color-primary)' : `color-mix(in srgb, var(--color-primary) ${Math.floor((h / 32) * 99 + 10)}%, transparent)`
                  }}
                />
              ))}
            </div>

            <div className="text-center mt-2 relative z-10">
              <p className="text-sm text-white mb-2">{statusMsg}</p>
              <p className="text-xs text-slate-500">Ask the receiver to tap "Start Broadcasting"</p>
            </div>
          </div>

          <div className="bg-surface border border-outline-variant/15 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-500 min-w-[36px]">Signal</span>
            <div className="flex-1 h-1 bg-surface-high rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-100 ease-linear"
                style={{
                  width: `${Math.max(0, Math.min(100, (signalLevel + 80) / 30 * 100))}%`,
                  background: signalLevel > -50 ? 'var(--color-primary)' : 'var(--color-outline-variant)'
                }}
              />
            </div>
            <span className="text-[11px] font-mono text-slate-500 min-w-[44px] text-right">{Math.round(signalLevel)} dB</span>
          </div>

          <div className="flex-1" />

          <button
            className="w-full py-2 text-xs text-slate-500 border border-slate-700/50 rounded-lg hover:bg-white/5 mt-4"
            onClick={() => { listenerRef.current?.stop(); setName('RAMU'); setPhase('confirm') }}
          >
            [Demo] Skip scan → pay RAMU
          </button>
        </div>
        <style>{`
          @keyframes pulse1 {
            0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.5; }
            100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0; }
          }
          @keyframes pulse2 {
            0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.3; }
            100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
          }
        `}</style>
      </main>
    )
  }

  // ─── Payment confirmation form ────────────────────────────────────────────────
  if (phase === 'confirm' || phase === 'processing') {
    const processing = phase === 'processing'

    return (
      <main className="min-h-screen pb-20 w-full relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none -mr-20 -mt-20"></div>

        <header className="fixed top-14 lg:top-0 right-0 lg:left-64 left-0 h-16 lg:h-20 bg-background/80 backdrop-blur-xl border-b border-outline-variant/15 px-4 lg:px-10 flex items-center justify-between z-30">
          <div className="flex items-center gap-4">
            <button onClick={rescan} disabled={processing} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors disabled:opacity-50">
              <span className="material-symbols-outlined text-slate-400">arrow_back</span>
            </button>
            <h2 className="text-xl font-bold text-white tracking-tight">Confirm Payment</h2>
          </div>
        </header>

        <div className="pt-36 lg:pt-28 px-4 lg:px-10 max-w-3xl mx-auto space-y-6 relative z-10 flex flex-col min-h-[calc(100vh-140px)]">
          <div>
            <p className="text-sm text-slate-400">Paying to detected receiver</p>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary text-primary font-black text-xl flex items-center justify-center flex-shrink-0">
              {detectedName[0] || '?'}
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-0.5">Paying to</p>
              <p className="font-mono text-xl font-medium text-white tracking-[0.08em]">{detectedName}</p>
              <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">graphic_eq</span> Detected via audio tone
              </p>
            </div>
          </div>

          <div className="bg-surface border border-outline-variant/15 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-xs text-slate-500">Available Balance</span>
            <span className="font-mono text-sm text-white">{formatAmount((wallet?.confirmed_bal - (wallet?.locked_bal || 0) + (wallet?.unconfirmed_received || 0)) / 100 || 0)}</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Amount (₹)</label>
            <div className="relative flex items-center">
              <span className="absolute left-4 font-mono text-2xl text-slate-500 pointer-events-none">₹</span>
              <input
                className={`w-full bg-surface-high border ${errors.amount ? 'border-error' : 'border-outline-variant/20'} rounded-xl pl-10 pr-4 py-4 text-white font-mono text-3xl font-medium outline-none focus:border-primary/50 transition-colors`}
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={e => { setAmount(e.target.value); setErrors(p => ({ ...p, amount: '' })) }}
                disabled={processing}
                autoFocus
              />
            </div>
            {errors.amount && <p className="text-xs text-error font-medium mt-1">{errors.amount}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">UPI PIN</label>
            <input
              className={`w-full bg-surface-high border ${errors.pin ? 'border-error' : 'border-outline-variant/20'} rounded-xl px-4 py-4 text-white font-mono text-2xl outline-none focus:border-primary/50 transition-colors tracking-[0.3em]`}
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErrors(p => ({ ...p, pin: '' })) }}
              disabled={processing}
              autoComplete="off"
            />
            {errors.pin && <p className="text-xs text-error font-medium mt-1">{errors.pin}</p>}
            <p className="text-[11px] text-slate-500 mt-1">PIN is never stored or transmitted to any server</p>
          </div>

          {errors.general && (
            <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 text-[13px] text-error">
              {errors.general}
            </div>
          )}

          <div className="flex-1" />

          <div className="mt-4">
            <button
              className={`w-full py-4 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-black tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${processing ? 'opacity-60 pointer-events-none' : ''}`}
              onClick={handlePay}
              disabled={processing}
            >
              {processing && <span className="material-symbols-outlined animate-spin">progress_activity</span>}
              {processing ? 'Processing…' : `Pay ${amount ? formatAmount(parseFloat(amount) || 0) : ''}`.trim()}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return null
}

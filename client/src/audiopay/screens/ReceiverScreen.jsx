import { useState, useEffect, useRef, useCallback } from 'react'
import { startBroadcasting, getBroadcastDuration } from '../audio-pay-module/index.js'
import { getUser, getBalance, formatAmount } from '../audio-pay-module/index.js'
import { useWalletStore } from '../../store/walletStore'

const BROADCAST_PAUSE = 1000  // ms between broadcast cycles

export function ReceiverScreen({ onBack, onPaymentReceived }) {
  const user = getUser()
  const wallet = useWalletStore(state => state);
  const [phase, setPhase] = useState('idle')  // 'idle' | 'broadcasting' | 'received'
  const [cycleCount, setCycleCount]   = useState(0)
  const [progress, setProgress]       = useState(0)  // 0–1 for current cycle
  const [incomingPayment, setIncoming] = useState(null)

  const broadcasterRef = useRef(null)
  const animFrameRef   = useRef(null)
  const cycleStartRef  = useRef(null)
  const cycleDuration  = user ? getBroadcastDuration(user.name) : 2000

  const startBroadcast = useCallback(() => {
    if (!user) return

    setPhase('broadcasting')
    setCycleCount(0)
    setProgress(0)

    broadcasterRef.current = startBroadcasting(
      user.name,
      BROADCAST_PAUSE,
      () => {
        setCycleCount(c => c + 1)
        cycleStartRef.current = Date.now()
      }
    )

    // Animate progress bar per cycle
    cycleStartRef.current = Date.now()
    function animate() {
      const elapsed = Date.now() - (cycleStartRef.current || Date.now())
      const totalStep = cycleDuration + BROADCAST_PAUSE
      setProgress(Math.min(elapsed / totalStep, 1))
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
  }, [user, cycleDuration])

  function stopBroadcast() {
    broadcasterRef.current?.stop()
    cancelAnimationFrame(animFrameRef.current)
    setPhase('idle')
    setProgress(0)
  }

  // Simulated incoming payment for demo — in production this arrives via backend notification
  function simulateReceive() {
    const payment = { senderName: 'DEMO', amount: 50, tokenId: 'demo_' + Date.now() }
    setIncoming(payment)
    setPhase('received')
    stopBroadcast()
    onPaymentReceived?.(payment)
  }

  useEffect(() => {
    return () => {
      broadcasterRef.current?.stop()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  if (!user) return null

  return (
    <main className="min-h-screen pb-20 w-full relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none -mr-20 -mt-20"></div>

      <header className="fixed top-14 lg:top-0 right-0 lg:left-64 left-0 h-16 lg:h-20 bg-background/80 backdrop-blur-xl border-b border-outline-variant/15 px-4 lg:px-10 flex items-center gap-4 z-30">
        <button onClick={() => { stopBroadcast(); onBack() }} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors">
          <span className="material-symbols-outlined text-slate-400">arrow_back</span>
        </button>
        <h2 className="text-xl font-bold text-white tracking-tight">Receive Payment</h2>
      </header>

      <div className="pt-36 lg:pt-28 px-4 lg:px-10 max-w-3xl mx-auto space-y-6 relative z-10 flex flex-col min-h-[calc(100vh-140px)]">
        <div>
          <p className="text-sm text-slate-400">Hold your phone near the sender's phone</p>
        </div>

        <div className="bg-[#0d0d15]/60 backdrop-blur-xl border border-outline-variant/15 rounded-3xl p-10 flex flex-col items-center justify-center gap-6 relative min-h-[300px]">
          {phase === 'broadcasting' && (
            <>
              <div className="absolute top-[40%] left-1/2 w-28 h-28 rounded-full border-2 border-primary opacity-0 pointer-events-none" style={{ animation: 'ripple 2.4s ease-out infinite', animationDelay: '0s' }} />
              <div className="absolute top-[40%] left-1/2 w-28 h-28 rounded-full border-2 border-primary opacity-0 pointer-events-none" style={{ animation: 'ripple 2.4s ease-out infinite', animationDelay: '0.6s' }} />
              <div className="absolute top-[40%] left-1/2 w-28 h-28 rounded-full border-2 border-primary opacity-0 pointer-events-none" style={{ animation: 'ripple 2.4s ease-out infinite', animationDelay: '1.2s' }} />
              <div className="absolute top-[40%] left-1/2 w-28 h-28 rounded-full border-2 border-primary opacity-0 pointer-events-none" style={{ animation: 'ripple 2.4s ease-out infinite', animationDelay: '1.8s' }} />
            </>
          )}

          <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all relative z-10 ${phase === 'broadcasting' ? 'border-2 border-primary shadow-[0_0_40px_rgba(108,92,231,0.3)] bg-[radial-gradient(circle,rgba(108,92,231,0.15)_0%,transparent_70%)]' : 'border-2 border-outline-variant/20 bg-surface-high'}`}>
            <span className="text-5xl material-symbols-outlined text-primary">
              {phase === 'idle'         && 'mic'}
              {phase === 'broadcasting' && 'podcasts'}
              {phase === 'received'     && 'check_circle'}
            </span>
          </div>

          <div className="text-center flex flex-col items-center gap-1 mt-2">
            {phase === 'idle' && (
              <>
                <p className="text-[13px] text-slate-400 uppercase tracking-widest font-bold">Ready to broadcast</p>
                <p className="text-xs text-slate-500">Tap start to begin transmitting</p>
              </>
            )}
            {phase === 'broadcasting' && (
              <>
                <p className="text-[13px] text-slate-400 uppercase tracking-widest font-bold">Broadcasting as</p>
                <p className="font-mono text-3xl font-medium text-primary tracking-[0.1em] mt-1">{user.name}</p>
                <p className="text-xs text-slate-500 mt-1">Cycle {cycleCount} · Stay within 1–2 metres</p>
              </>
            )}
            {phase === 'received' && incomingPayment && (
              <>
                <p className="text-[13px] text-emerald-400 uppercase tracking-widest font-bold">Payment received!</p>
                <p className="font-mono text-3xl font-medium text-white tracking-[0.1em] mt-1">{formatAmount(incomingPayment.amount)}</p>
                <p className="text-xs text-slate-500 mt-1">from {incomingPayment.senderName} · pending settlement</p>
              </>
            )}
          </div>

          {phase === 'broadcasting' && (
            <div className="w-full max-w-xs h-1 bg-surface-high rounded-full overflow-hidden mt-2">
              <div className="h-full bg-primary rounded-full transition-all duration-100 ease-linear" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>

        <div className="bg-surface border border-outline-variant/15 rounded-xl px-5 py-4 flex items-center justify-between">
          <div className="flex flex-col items-center flex-1">
            <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">Broadcasting as</span>
            <span className="font-mono text-[15px] font-medium text-white">{user.name}</span>
          </div>
          <div className="w-[1px] h-8 bg-outline-variant/20 mx-4" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">Wallet balance</span>
            <span className="font-mono text-[15px] font-medium text-white">{formatAmount((wallet?.confirmed_bal - (wallet?.locked_bal || 0) + (wallet?.unconfirmed_received || 0)) / 100 || 0)}</span>
          </div>
        </div>

        <div className="bg-surface-high border border-outline-variant/15 rounded-xl p-5">
          <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-3">Instructions</p>
          <div className="text-[13px] text-slate-400 leading-relaxed space-y-1">
            <p>1. Tap <b className="text-primary">Start Broadcasting</b> below</p>
            <p>2. The sender opens AudioPay → Send</p>
            <p>3. Their phone will catch your tone automatically</p>
            <p>4. They enter the amount and confirm</p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-3 mt-4">
          {phase === 'idle' && (
            <button onClick={startBroadcast} className="w-full py-4 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-black tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform">
              Start Broadcasting
            </button>
          )}
          {phase === 'broadcasting' && (
            <>
              <button onClick={stopBroadcast} className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold tracking-wide active:scale-[0.98] transition-transform">
                Stop Broadcasting
              </button>
              <button onClick={simulateReceive} className="w-full py-2 text-xs text-slate-500 border border-slate-700/50 rounded-lg hover:bg-white/5">
                [Demo] Simulate incoming ₹50
              </button>
            </>
          )}
          {phase === 'received' && (
            <button onClick={() => { setPhase('idle'); setIncoming(null) }} className="w-full py-4 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-black tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform">
              Receive Another
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ripple {
          0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
        }
      `}</style>
    </main>
  )
}

/**
 * QRScreen.jsx
 *
 * TWO MODES:
 * 1. P2P Receive (existing behaviour) — navigated from Send flow with qrData/txnId/expiresAt
 * 2. Merchant Pay — navigated from a QR scan with { mode:'merchant_pay', merchantPayload }
 *    Customer enters amount → confirms → POST /api/merchant/pay
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { unlockFunds } from '../services/walletService';
import { useWalletStore } from '../store/walletStore';
import { deletePendingTxn, savePendingTxn } from '../services/storageService';
import { payMerchant } from '../services/apiService';
import { notifyPaymentSent } from '../services/notificationService';

const fmt = (p) => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function QRScreen() {
  const navigate   = useNavigate();
  const { state }  = useLocation();
  const { loadWalletState, updateBalance, confirmed_bal, locked_bal } = useWalletStore();

  // ── Mode detection ───────────────────────────────────────────────────
  const isMerchantPay = state?.mode === 'merchant_pay';
  const merchantPayload = isMerchantPay ? (() => {
    try { return JSON.parse(state.merchantPayload); } catch { return null; }
  })() : null;

  // ── P2P state ────────────────────────────────────────────────────────
  const { qrData, txnId, expiresAt, amount: p2pAmount, recipientName } = state || {};
  const [timeLeft, setTimeLeft] = useState(60);

  // ── Merchant Pay state ───────────────────────────────────────────────
  const [merchantAmount, setMerchantAmount] = useState('');
  const [note, setNote]                     = useState('');
  const [paying, setPaying]                 = useState(false);
  const [paid, setPaid]                     = useState(false);
  const [error, setError]                   = useState('');

  // ── P2P timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isMerchantPay) return;
    const interval = setInterval(() => {
      const now  = Math.floor(Date.now() / 1000);
      const left = Math.max(0, (expiresAt || now + 60) - now);
      setTimeLeft(left);
      if (left <= 0) { clearInterval(interval); handleCancel(); }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── P2P cancel ───────────────────────────────────────────────────────
  const handleCancel = async () => {
    await unlockFunds(p2pAmount || 0);
    if (txnId) await deletePendingTxn(txnId);
    await loadWalletState();
    navigate('/home', { replace: true });
  };

  // ── Merchant Pay submit ───────────────────────────────────────────────
  const handleMerchantPay = async () => {
    const amountPaise = Math.round(parseFloat(merchantAmount) * 100);
    if (!amountPaise || amountPaise <= 0) return setError('Enter a valid amount');
    const spendable = confirmed_bal - locked_bal;
    if (amountPaise > spendable) return setError(`Insufficient balance. Available: ${fmt(spendable)}`);
    if (!merchantPayload?.userId) return setError('Invalid merchant QR. Please scan again.');

    setPaying(true);
    setError('');
    try {
      const res = await payMerchant({
        merchantUserId: merchantPayload.userId,
        amount: amountPaise,
        note,
      });
      await updateBalance({ confirmed_bal: res.wallet.confirmed_bal, locked_bal: res.wallet.locked_bal || 0 });

      // Save to IndexedDB so it shows in History and Dashboard
      const txnId = res.paymentId || ('mp-' + Date.now());
      await savePendingTxn({
        id: txnId,
        type: 'sent',
        amount: amountPaise,
        recipientName: res.merchantName || merchantPayload?.name || 'Merchant',
        to_user_id: merchantPayload.userId,
        status: 'confirmed',
        mode: 'merchant_qr',
        created_at: Math.floor(Date.now() / 1000),
        note: note || '',
      });

      // Push real notification
      await notifyPaymentSent(amountPaise, res.merchantName || merchantPayload?.name || 'Merchant');

      await loadWalletState();
      setPaid(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
    }
    setPaying(false);
  };

  // ─────────────────────────────────────────────────────────────────────
  // MERCHANT PAY MODE
  // ─────────────────────────────────────────────────────────────────────
  if (isMerchantPay) {
    if (paid) {
      return (
        <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-8 gap-6">
          <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-emerald-400">check_circle</span>
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-black text-white mb-2">Payment Sent!</h2>
            <p className="text-slate-400">{fmt(Math.round(parseFloat(merchantAmount) * 100))} paid to <strong className="text-white">{merchantPayload?.name}</strong></p>
          </div>
          <button onClick={() => navigate('/home', { replace: true })} className="w-full max-w-xs py-4 rounded-2xl bg-gradient-to-r from-primary-container to-primary text-white font-bold text-sm tracking-wide">
            Back to Home
          </button>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-background flex flex-col">
        <header className="flex items-center gap-4 px-6 pt-8 pb-4 flex-shrink-0">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5">
            <span className="material-symbols-outlined text-slate-400">arrow_back</span>
          </button>
          <h2 className="text-xl font-bold text-white">Pay Merchant</h2>
        </header>

        <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-6">
          {/* Merchant Info */}
          <div className="bg-[#0d0d15]/80 rounded-2xl border border-outline-variant/20 p-6 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-primary">store</span>
            </div>
            <h3 className="text-xl font-black text-white">{merchantPayload?.name || 'Merchant'}</h3>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Verified Merchant</span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl text-slate-500 font-bold">₹</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={merchantAmount}
                onChange={e => { setMerchantAmount(e.target.value); setError(''); }}
                className="w-full bg-[#0d0d15]/80 border border-outline-variant/20 rounded-2xl pl-10 pr-5 py-5 text-3xl font-black text-white placeholder-slate-700 focus:outline-none focus:border-primary/40 focus:bg-[#0d0d15]"
              />
            </div>
            <p className="text-xs text-slate-600">Available: {fmt(confirmed_bal - locked_bal)}</p>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Note (optional)</label>
            <input
              type="text"
              placeholder="What's this for?"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-[#0d0d15]/80 border border-outline-variant/20 rounded-2xl px-5 py-4 text-white placeholder-slate-700 focus:outline-none focus:border-primary/40"
            />
          </div>

          {error && (
            <div className="bg-error/10 border border-error/20 rounded-xl px-4 py-3 text-error text-sm font-medium">
              {error}
            </div>
          )}

          {/* Quick Amounts */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Quick Select</p>
            <div className="flex gap-2 flex-wrap">
              {[10, 20, 50, 100, 200, 500].map(amt => (
                <button key={amt} onClick={() => { setMerchantAmount(String(amt)); setError(''); }}
                  className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white hover:bg-primary/10 hover:border-primary/20 transition-colors">
                  ₹{amt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pay Button */}
        <div className="px-6 pb-8 flex-shrink-0">
          <button
            onClick={handleMerchantPay}
            disabled={paying || !merchantAmount}
            className="w-full py-5 rounded-2xl bg-gradient-to-r from-primary-container to-primary text-white font-black text-base tracking-wide shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            {paying ? (
              <>
                <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                Processing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl">payments</span>
                Pay {merchantAmount ? fmt(Math.round(parseFloat(merchantAmount) * 100)) : 'Now'}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // P2P QR RECEIVE MODE (original behaviour — preserved exactly)
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      <header className="flex items-center gap-4 px-6 pt-8 pb-4">
        <button onClick={() => navigate('/home', { replace: true })} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5">
          <span className="material-symbols-outlined text-slate-400">arrow_back</span>
        </button>
        <h2 className="text-xl font-bold text-white">Payment QR</h2>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="bg-white p-5 rounded-2xl shadow-[0_0_60px_rgba(108,92,231,0.3)]">
          {qrData
            ? <QRCodeSVG value={qrData} size={200} level="M" fgColor="#1a0050" bgColor="#ffffff" />
            : <div className="w-[200px] h-[200px] flex items-center justify-center text-slate-500 text-sm">No QR Data</div>
          }
        </div>

        <div className="text-center">
          <p className="text-sm text-slate-400 font-medium">Paying to <span className="text-white font-bold">{recipientName || '—'}</span></p>
          <p className="text-4xl font-black text-white tracking-tight mt-2">{fmt(p2pAmount || 0)}</p>
          <p className="text-xs font-mono text-slate-600 mt-1">TXN·{(txnId || '—').slice(0, 8).toUpperCase()}</p>
        </div>

        {/* Countdown */}
        <div className="w-full max-w-xs space-y-2">
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${(timeLeft / 60) * 100}%`, background: timeLeft < 10 ? 'var(--color-error)' : 'var(--color-primary)' }}
            />
          </div>
          <p className={`text-center text-xs font-mono font-bold ${timeLeft < 10 ? 'text-error' : 'text-slate-500'}`}>Expires in {timeLeft}s</p>
        </div>

        <div className="w-full max-w-xs bg-tertiary/10 border border-tertiary/20 rounded-xl px-4 py-3 text-xs text-amber-400 font-medium leading-relaxed">
          {fmt(p2pAmount || 0)} locked from your balance. Auto-unlocks on expiry.
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => navigate('/home', { replace: true })} className="w-full py-4 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-bold text-sm tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform">
            Done
          </button>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => navigator.share?.({ title: 'Pay me via PocketPay' })}
              className="flex-1 py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-xs uppercase tracking-widest"
            >
              Share QR
            </button>
            <button onClick={handleCancel} className="flex-1 py-3 rounded-xl bg-error/10 border border-error/20 text-error font-bold text-xs uppercase tracking-widest">
              Cancel Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

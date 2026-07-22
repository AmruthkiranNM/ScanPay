import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletStore } from '../store/walletStore';
import { getAllTxns } from '../services/storageService';
import { runSync } from '../services/syncService';
import { hasToken } from '../services/apiService';

const fmt = (p) => '₹' + (p / 100).toLocaleString('en-IN');

export default function Home() {
  const navigate = useNavigate();
  const { user, confirmed_bal, locked_bal, unconfirmed_received, isOnline, loadWalletState, updateBalance } = useWalletStore();
  const [txns, setTxns] = useState([]);
  const [stats, setStats] = useState({ sent: 0, received: 0, spendTotal: 0, bars: [5,5,5,5,5,5,5] });

  const refresh = async () => { await loadWalletState(); await loadTxns(); };

  // Trigger a sync + wallet update when Home mounts (if online)
  const syncAndRefresh = async () => {
    if (!navigator.onLine || !hasToken()) return;
    try {
      const result = await runSync();
      if (result.serverWallet) {
        const all = await getAllTxns();
        const localLocked = all.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount, 0);
        const localUnconfirmed = all.filter(t => t.status === 'unconfirmed_received').reduce((sum, t) => sum + t.amount, 0);
        await updateBalance({
          confirmed_bal: result.serverWallet.confirmed_bal,
          locked_bal: localLocked,
          unconfirmed_received: localUnconfirmed,
        });
      }
      await loadWalletState();
      await loadTxns();
      if (result.confirmed + result.failed > 0) {
        window.dispatchEvent(new CustomEvent('pp-sync-complete', { detail: result }));
      }
    } catch (e) {
      console.log('[Home] sync-on-mount skipped:', e.message);
    }
  };

  useEffect(() => {
    refresh();
    syncAndRefresh(); // Sync pending txns when dashboard loads
    // Refresh when page becomes visible, focused, or after sync/payment events
    const onVisChange = () => { if (document.visibilityState === 'visible') { refresh(); syncAndRefresh(); } };
    const onFocus = () => refresh();
    const onSync = () => refresh();
    const onNotif = () => refresh();
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pp-sync-complete', onSync);
    window.addEventListener('pp-notification', onNotif);
    // Periodic refresh every 5s to catch any missed updates
    const interval = setInterval(refresh, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pp-sync-complete', onSync);
      window.removeEventListener('pp-notification', onNotif);
      clearInterval(interval);
    };
  }, []);
  const loadTxns = async () => { 
    const all = await getAllTxns(); 
    setTxns([...all].sort((a, b) => b.created_at - a.created_at).slice(0, 4)); 
    
    // Calculate stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime() / 1000;
    
    let sentMonth = 0;
    let recMonth = 0;
    const dailySpend = [0,0,0,0,0,0,0];
    
    all.forEach(t => {
      if (t.created_at >= startOfMonth) {
        if (t.type === 'sent') sentMonth += t.amount;
        if (t.type === 'received') recMonth += t.amount;
      }
      if (t.type === 'sent') {
         const daysAgo = Math.floor((todayEnd - t.created_at) / 86400);
         if (daysAgo >= 0 && daysAgo < 7) {
            dailySpend[6 - daysAgo] += t.amount;
         }
      }
    });

    const maxSpend = Math.max(...dailySpend, 100); 
    const bars = dailySpend.map(s => Math.max(4, Math.round((s / maxSpend) * 100)));
    setStats({ sent: sentMonth, received: recMonth, spendTotal: dailySpend.reduce((a,b)=>a+b,0), bars });
  };

  const spendable = confirmed_bal - locked_bal;
  const initial = (user?.name || 'U')[0].toUpperCase();
  
  const dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const dayLabels = Array.from({length: 7}).map((_, i) => {
    if (i === 6) return 'TODAY';
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return dayNames[d.getDay()];
  });

  return (
    <main className="min-h-screen pb-20 w-full">
    {/* Top App Bar */}
    <header className="fixed top-14 lg:top-0 right-0 lg:left-64 left-0 h-16 lg:h-20 bg-background/80 backdrop-blur-xl border-b border-outline-variant/15 px-4 lg:px-10 flex justify-between items-center z-30">
    <h2 className="text-xl font-bold text-white font-headline tracking-tight">Dashboard Overview</h2>
    <div className="flex items-center gap-6">
    <div className="relative group">
    <button className="hover:bg-white/5 rounded-full p-2 transition-colors relative" onClick={() => navigate('/notifications')}>
    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">notifications</span>
    <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
    </button>
    </div>
    <button className="hover:bg-white/5 rounded-full p-2 transition-colors" onClick={() => navigate('/settings')}>
    <span className="material-symbols-outlined text-slate-400 hover:text-primary">settings</span>
    </button>
    <div className="h-8 w-[1px] bg-outline-variant/20"></div>
    <div className="flex items-center gap-3">
    <span className="text-sm font-medium text-on-surface-variant">Hello, {user?.name || 'User'}</span>
    <div onClick={() => navigate('/profile')} className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-container to-primary flex items-center justify-center text-white font-bold cursor-pointer">{initial}</div>
    </div>
    </div>
    </header>

    <div className="pt-36 lg:pt-28 px-4 lg:px-10 max-w-7xl mx-auto space-y-8">
    {/* Offline Banner */}
    {!isOnline && (
      <div className="bg-tertiary/10 border-l-4 border-tertiary p-4 rounded-r-xl flex items-center gap-4">
      <span className="material-symbols-outlined text-tertiary" style={{fontVariationSettings: "'FILL' 1"}}>warning</span>
      <div>
      <p className="text-sm font-bold text-tertiary-fixed-dim uppercase tracking-wider">Offline Mode Active</p>
      <p className="text-xs text-on-surface-variant">Your transaction data is being synced locally. Connect to internet to update real-time vault status.</p>
      </div>
      </div>
    )}

    {/* Hero Section: Balance & Stats */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div className="lg:col-span-2 bg-[#0d0d15]/60 backdrop-blur-xl rounded-2xl p-8 relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-[0_40px_64px_-12px_rgba(0,0,0,0.4)] border-t border-l border-outline-variant/15">
    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full -mr-20 -mt-20"></div>
    <div className="relative z-10">
    <div className="flex justify-between items-start">
    <div>
    <p className="label-md uppercase tracking-[0.2em] text-slate-500 font-bold text-xs mb-2">Total Balance</p>
    <h3 className="text-6xl font-black tracking-tighter text-white font-display">
    <span className="text-primary-fixed-dim opacity-50 text-4xl mr-1">₹</span>{((confirmed_bal - locked_bal + (unconfirmed_received || 0)) / 100).toLocaleString('en-IN')}<span className="text-3xl font-medium opacity-70">.00</span>
    </h3>
    </div>
    <div className="bg-primary/10 px-3 py-1 rounded-full border border-primary/20 flex items-center gap-2">
    <span className={`w-2 h-2 ${isOnline ? 'bg-primary animate-pulse' : 'bg-tertiary'} rounded-full`}></span>
    <span className={`text-[10px] font-bold ${isOnline ? 'text-primary' : 'text-tertiary'} uppercase tracking-widest`}>{isOnline ? 'Online' : 'Offline'}</span>
    </div>
    </div>
    <div className="grid grid-cols-3 gap-8 mt-12">
    <div>
    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Spendable</p>
    <p className="text-xl font-bold text-white">{fmt(spendable)}</p>
    </div>
    <div>
    <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-1">Locked</p>
    <p className="text-xl font-bold text-tertiary">{fmt(locked_bal)}</p>
    </div>
    <div>
    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Unconfirmed</p>
    <p className="text-xl font-bold text-emerald-500">{fmt(unconfirmed_received || 0)}</p>
    </div>
    </div>
    </div>
    <div className="relative z-10 flex gap-4 mt-8">
    <button onClick={() => navigate('/send')} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-bold text-sm tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform">
        Send Assets
    </button>
    <button onClick={() => navigate('/receive')} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm tracking-wide hover:bg-white/10 active:scale-[0.98] transition-transform">
        Generate Invoice
    </button>
    <button onClick={() => navigate('/audiopay')} className="flex-1 py-3 rounded-xl bg-white/5 border border-primary/30 text-primary font-bold text-sm tracking-wide hover:bg-primary/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
        <span className="material-symbols-outlined text-lg">contactless</span>
        AudioPay
    </button>
    </div>
    </div>

    <div className="flex flex-col gap-6">
    <div className="bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 rounded-2xl p-6 flex flex-col justify-between h-1/2">
    <div>
    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Sent This Month</p>
    <h4 className="text-3xl font-bold text-error">{fmt(stats.sent)}</h4>
    </div>
    <div className="flex items-center gap-2 text-error/60 text-xs font-medium">
    <span className="material-symbols-outlined text-sm">trending_up</span>
    <span>Spending trend</span>
    </div>
    </div>
    <div className="bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 rounded-2xl p-6 flex flex-col justify-between h-1/2">
    <div>
    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Received</p>
    <h4 className="text-3xl font-bold text-emerald-400">{fmt(stats.received)}</h4>
    </div>
    <div className="flex items-center gap-2 text-emerald-400/60 text-xs font-medium">
    <span className="material-symbols-outlined text-sm">trending_down</span>
    <span>Inflow trend</span>
    </div>
    </div>
    </div>
    </div>

    {/* Quick Actions Toolbar */}
    <div className="flex items-center justify-between gap-4 overflow-x-auto pb-2 scrollbar-hide">
    <button onClick={() => navigate('/send')} className="flex flex-col items-center gap-3 min-w-[100px] p-6 rounded-2xl bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 hover:bg-primary-container/20 group transition-all">
    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">send</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">Send</span>
    </button>
    <button onClick={() => navigate('/receive')} className="flex flex-col items-center gap-3 min-w-[100px] p-6 rounded-2xl bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 hover:bg-primary-container/20 group transition-all">
    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">download</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">Receive</span>
    </button>
    <button onClick={() => navigate('/add-money')} className="flex flex-col items-center gap-3 min-w-[100px] p-6 rounded-2xl bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 hover:bg-primary-container/20 group transition-all">
    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">add_circle</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">Add</span>
    </button>
    <button onClick={() => navigate('/withdraw')} className="flex flex-col items-center gap-3 min-w-[100px] p-6 rounded-2xl bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 hover:bg-primary-container/20 group transition-all">
    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">account_balance_wallet</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">Withdraw</span>
    </button>
    <button onClick={() => navigate('/history')} className="flex flex-col items-center gap-3 min-w-[100px] p-6 rounded-2xl bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 hover:bg-primary-container/20 group transition-all">
    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">list_alt</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">History</span>
    </button>
    </div>

    {/* Bento Content Grid */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div className="lg:col-span-2 bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 rounded-2xl p-8">
    <div className="flex justify-between items-end mb-10">
    <div>
    <h5 className="text-white font-bold text-lg mb-1">Weekly Activity</h5>
    <p className="text-xs text-slate-500">Transaction volume analysis</p>
    </div>
    <div className="flex gap-2">
    <span className="px-3 py-1 rounded-full bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border border-white/5">Weekly</span>
    <span className="px-3 py-1 rounded-full bg-primary/10 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/10">Daily</span>
    </div>
    </div>
    <div className="flex items-end justify-between h-48 gap-4 px-2">
    {stats.bars.map((h, i) => (
      <div key={i} className="flex flex-col items-center gap-4 flex-1 h-full justify-end">
      <div className={`w-full rounded-t-lg transition-all ${i === 6 ? 'bg-gradient-to-t from-primary-container to-primary shadow-[0_0_20px_rgba(108,92,231,0.3)]' : 'bg-white/5 hover:bg-white/10'}`} style={{height: `${h}%`}}></div>
      <span className={`text-[10px] font-bold ${i === 6 ? 'text-primary' : 'text-slate-600'}`}>{dayLabels[i]}</span>
      </div>
    ))}
    </div>
    </div>

    {/* Recent Transactions */}
    <div className="bg-[#0d0d15]/60 backdrop-blur-xl border-t border-l border-outline-variant/15 rounded-2xl p-8 flex flex-col">
    <div className="flex justify-between items-center mb-8 gap-4">
    <h5 className="text-white font-bold text-lg truncate">Transactions</h5>
    <span onClick={() => navigate('/history')} className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline cursor-pointer flex-shrink-0">View All</span>
    </div>
    <div className="space-y-6 flex-1">
    {txns.length === 0 ? (
      <div className="text-center text-slate-500 text-sm py-4">No transactions yet</div>
    ) : txns.map(tx => (
      <div key={tx.id} onClick={() => navigate(`/history/${tx.id}`)} className="flex items-center gap-4 cursor-pointer hover:bg-white/5 p-2 -m-2 rounded-xl transition-colors">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'sent' ? 'bg-error/10 text-error' : 'bg-emerald-500/10 text-emerald-500'}`}>
      <span className="material-symbols-outlined text-xl">{tx.type === 'sent' ? 'call_made' : 'call_received'}</span>
      </div>
      <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-white truncate">{tx.recipientName || 'Payment'}</p>
      <p className="text-xs text-slate-500">{new Date(tx.created_at * 1000).toLocaleTimeString()}</p>
      </div>
      <div className="text-right">
      <p className={`text-sm font-bold ${tx.type === 'sent' ? 'text-white' : 'text-emerald-400'}`}>
        {tx.type === 'sent' ? '-' : '+'}{fmt(tx.amount)}
      </p>
      <p className="text-[10px] text-slate-600 uppercase">{tx.status}</p>
      </div>
      </div>
    ))}
    </div>
    <button onClick={() => navigate('/history')} className="w-full mt-8 py-3 rounded-xl border border-outline-variant/20 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-colors">
        Full History
    </button>
    </div>
    </div>
    </div>
    </main>
  );
}

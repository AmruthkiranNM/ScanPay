import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWalletStore } from '../store/walletStore';

const WALLET_NAV = [
  { path: '/home',      label: 'Dashboard',  icon: 'dashboard' },
  { path: '/send',      label: 'Send Money', icon: 'payments' },
  { path: '/receive',   label: 'Receive',    icon: 'download' },
  { path: '/add-money', label: 'Add Money',  icon: 'add_card' },
];

const TOOLS_NAV = [
  { path: '/history',       label: 'History',   icon: 'history' },
  { path: '/audiopay',      label: 'AudioPay',  icon: 'contactless' },
  { path: '/notifications', label: 'Activity',  icon: 'notifications' },
  { path: '/merchant',      label: 'Merchant',  icon: 'storefront' },
];

// Mobile bottom nav items (most-used only)
const MOBILE_NAV = [
  { path: '/home',     label: 'Home',    icon: 'dashboard' },
  { path: '/send',     label: 'Send',    icon: 'payments' },
  { path: '/scan',     label: 'Scan',    icon: 'qr_code_scanner', isCTA: true },
  { path: '/history',  label: 'History', icon: 'history' },
  { path: '/merchant', label: 'Merchant',icon: 'storefront' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isOnline } = useWalletStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = location.pathname;
  const initial = (user?.name || 'U')[0].toUpperCase();

  const NavItem = ({ item, onClick }) => {
    const isActive = current === item.path;
    return (
      <li>
        <button
          onClick={() => { navigate(item.path); onClick?.(); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition-all duration-200 ${
            isActive ? 'text-primary bg-primary/10' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <span className="material-symbols-outlined text-xl" style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
            {item.icon}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider flex-1 text-left">{item.label}</span>
        </button>
      </li>
    );
  };

  const SidebarContent = ({ onClose }) => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-container to-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>credit_card</span>
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-white">PocketPay</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Midnight Vault</p>
        </div>
      </div>

      {/* Scan CTA — prominent on mobile drawer */}
      <button
        onClick={() => { navigate('/scan'); onClose?.(); }}
        className="w-full mb-6 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-primary-container to-primary text-white font-black text-sm tracking-wide shadow-lg shadow-primary/20 active:scale-95 transition-all"
      >
        <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
        Scan QR Code
      </button>

      <nav className="flex-1 space-y-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-3 px-2">Wallet</p>
          <ul className="space-y-1">
            {WALLET_NAV.map(item => <NavItem key={item.path} item={item} onClick={onClose} />)}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-3 px-2">Tools</p>
          <ul className="space-y-1">
            {TOOLS_NAV.map(item => <NavItem key={item.path} item={item} onClick={onClose} />)}
          </ul>
        </div>
      </nav>

      {/* User footer */}
      <div className="pt-6 mt-6 border-t border-outline-variant/10">
        <div className="flex items-center gap-3 px-2 cursor-pointer group" onClick={() => { navigate('/settings'); onClose?.(); }}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-container to-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0 group-hover:scale-105 transition-transform">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
          <button className="text-slate-600 hover:text-primary transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-xl">settings</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── DESKTOP SIDEBAR (≥ lg) ──────────────────────────────── */}
      <aside className="hidden lg:flex h-screen w-64 fixed left-0 top-0 overflow-y-auto bg-[#1b1b26] border-r border-outline-variant/10 flex-col py-8 px-6 z-50">
        <SidebarContent />
      </aside>

      {/* ── MOBILE TOP BAR (< lg) ───────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#1b1b26]/95 backdrop-blur-xl border-b border-outline-variant/10 flex items-center justify-between px-4 z-40">
        <button onClick={() => setMobileOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5">
          <span className="material-symbols-outlined text-white">menu</span>
        </button>
        <span className="text-white font-black text-lg">PocketPay</span>
        <button onClick={() => navigate('/scan')} className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary/20">
          <span className="material-symbols-outlined text-primary text-xl">qr_code_scanner</span>
        </button>
      </div>

      {/* ── MOBILE DRAWER (< lg) ────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          {/* Drawer */}
          <div className="relative w-72 max-w-[85vw] bg-[#1b1b26] h-full flex flex-col py-8 px-6 overflow-y-auto shadow-2xl animate-[slideInLeft_0.2s_ease-out]">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* ── MOBILE BOTTOM NAV (< lg) ─────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#1b1b26]/95 backdrop-blur-xl border-t border-outline-variant/10 flex items-center justify-around px-2 z-40">
        {MOBILE_NAV.map(item => {
          const isActive = current === item.path;
          if (item.isCTA) {
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center w-14 h-14 -mt-5 rounded-full bg-gradient-to-br from-primary-container to-primary shadow-lg shadow-primary/30 active:scale-90 transition-all">
                <span className="material-symbols-outlined text-white text-2xl">qr_code_scanner</span>
              </button>
            );
          }
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-0.5 py-2 px-3 flex-1 active:scale-90 transition-all">
              <span className={`material-symbols-outlined text-xl ${isActive ? 'text-primary' : 'text-slate-600'}`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {item.icon}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? 'text-primary' : 'text-slate-600'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

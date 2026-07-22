import { useEffect } from 'react';
import { RouterProvider, createHashRouter, Outlet } from 'react-router-dom';
import { useWalletStore } from './store/walletStore';
import { ToastContainer } from './components/Toast';
import Sidebar from './components/Sidebar';
import { startConnectivityWatcher } from './services/syncService';
import { notifySyncComplete } from './services/notificationService';

import Splash from './screens/Splash';
import Register from './screens/Register';
import OTPVerify from './screens/OTPVerify';
import PinSetup from './screens/PinSetup';
import RecoveryPhrase from './screens/RecoveryPhrase';
import Login from './screens/Login';
import Recovery from './screens/Recovery';
import Home from './screens/Home';
import Send from './screens/Send';
import SendConfirm from './screens/SendConfirm';
import QRScreen from './screens/QRScreen';
import Receive from './screens/Receive';
import History from './screens/History';
import TxnDetail from './screens/TxnDetail';
import AddMoney from './screens/AddMoney';
import Withdraw from './screens/Withdraw';
import Merchant from './screens/Merchant';
import SyncScreen from './screens/SyncScreen';
import Notifications from './screens/Notifications';
import Profile from './screens/Profile';
import Settings from './screens/Settings';

import ScanQR from './screens/ScanQR';
import SecureContextBanner from './components/SecureContextBanner';
import AudioPayApp from './audiopay/App';

// Auth screens render centered without sidebar
function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-card"><Outlet /></div>
    </div>
  );
}

// Full-screen layout (no sidebar) — used for camera/QR screens on mobile
function FullScreenLayout() {
  return <Outlet />;
}

// Dashboard screens render with sidebar
function DashboardLayout() {
  return (
    <div className="flex w-full min-h-screen bg-background text-on-background relative">
      <Sidebar />
      {/* lg: offset sidebar width, mobile: top bar + bottom nav padding */}
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col relative pt-14 lg:pt-0 pb-16 lg:pb-0">
        <Outlet />
      </div>
    </div>
  );
}

const router = createHashRouter([
  // Auth flow — no sidebar
  { element: <AuthLayout />, children: [
    { path: '/', element: <Splash /> },
    { path: '/register', element: <Register /> },
    { path: '/otp', element: <OTPVerify /> },
    { path: '/pin-setup', element: <PinSetup /> },
    { path: '/recovery-phrase', element: <RecoveryPhrase /> },
    { path: '/login', element: <Login /> },
    { path: '/recovery', element: <Recovery /> },
  ]},
  // Full-screen flows — camera, QR, payment confirmations
  { element: <FullScreenLayout />, children: [
    { path: '/receive', element: <Receive /> },
    { path: '/scan', element: <ScanQR /> },
    { path: '/qr', element: <QRScreen /> },
    { path: '/send/qr', element: <QRScreen /> },
  ]},
  // Dashboard — with sidebar
  { element: <DashboardLayout />, children: [
    { path: '/home', element: <Home /> },
    { path: '/send', element: <Send /> },
    { path: '/send/confirm', element: <SendConfirm /> },
    { path: '/history', element: <History /> },
    { path: '/history/:id', element: <TxnDetail /> },
    { path: '/add-money', element: <AddMoney /> },
    { path: '/withdraw', element: <Withdraw /> },
    { path: '/merchant', element: <Merchant /> },
    { path: '/sync', element: <SyncScreen /> },
    { path: '/notifications', element: <Notifications /> },
    { path: '/profile', element: <Profile /> },
    { path: '/settings', element: <Settings /> },
    { path: '/audiopay', element: <AudioPayApp /> },
  ]},
]);

export default function App() {
  const { theme, loadUserProfile, loadWalletState, setOnline, updateBalance } = useWalletStore();

  useEffect(() => {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    loadUserProfile();
    loadWalletState();
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // ── Auto-sync: fires when device goes back online ──────────────────
  useEffect(() => {
    const cleanup = startConnectivityWatcher(async (result) => {
      console.log('[Auto-Sync] Completed:', result);
      // Update wallet balance from server response
      if (result.serverWallet) {
        await updateBalance({
          confirmed_bal: result.serverWallet.confirmed_bal,
          locked_bal: result.serverWallet.locked_bal || 0,
          nonce: result.serverWallet.nonce_counter || 0,
          unconfirmed_received: 0, // Server balance is authoritative — clear local unconfirmed
        });
      }
      await loadWalletState();
      // Push a real notification
      await notifySyncComplete(result.confirmed, result.failed, result.serverWallet?.confirmed_bal);
      // Fire custom event so SyncScreen/Dashboard can refresh
      window.dispatchEvent(new Event('pp-sync-complete'));
    });
    return cleanup;
  }, []);

  return (
    <>
      <SecureContextBanner />
      <RouterProvider router={router} />
      <ToastContainer />
    </>
  );
}

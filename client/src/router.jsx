import { createHashRouter } from 'react-router-dom';
import Splash from './screens/Splash';
import Register from './screens/Register';
import OTPVerify from './screens/OTPVerify';
import PinSetup from './screens/PinSetup';
import RecoveryPhrase from './screens/RecoveryPhrase';
import Login from './screens/Login';
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
import Recovery from './screens/Recovery';

export const router = createHashRouter([
  { path: '/',                  element: <Splash /> },
  { path: '/register',          element: <Register /> },
  { path: '/otp',               element: <OTPVerify /> },
  { path: '/pin-setup',         element: <PinSetup /> },
  { path: '/recovery-phrase',   element: <RecoveryPhrase /> },
  { path: '/login',             element: <Login /> },
  { path: '/home',              element: <Home /> },
  { path: '/send',              element: <Send /> },
  { path: '/send/confirm',      element: <SendConfirm /> },
  { path: '/send/qr',           element: <QRScreen /> },
  { path: '/receive',           element: <Receive /> },
  { path: '/history',           element: <History /> },
  { path: '/history/:id',       element: <TxnDetail /> },
  { path: '/add-money',         element: <AddMoney /> },
  { path: '/withdraw',          element: <Withdraw /> },
  { path: '/merchant',          element: <Merchant /> },
  { path: '/sync',              element: <SyncScreen /> },
  { path: '/notifications',     element: <Notifications /> },
  { path: '/profile',           element: <Profile /> },
  { path: '/settings',          element: <Settings /> },
  { path: '/recovery',          element: <Recovery /> },
]);

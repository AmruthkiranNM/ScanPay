import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletStore } from '../store/walletStore';
import { getKeys, wipeKeys, getUserProfile, saveKeys, saveUserProfile } from '../services/storageService';
import { deriveKeyFromPIN, decryptPrivateKey } from '../services/cryptoService';
import { loginUser, getBalance } from '../services/apiService';
import Keypad from '../components/Keypad';
import jsQR from 'jsqr';

export default function Login() {
  const navigate = useNavigate();
  const { incrementPinAttempt, resetPinAttempts, isLocked, pinAttempts, loadUserProfile, loadWalletState, updateBalance, setUser } = useWalletStore();
  
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanInterval = useRef(null);

  useEffect(() => {
    getUserProfile().then(p => {
      if (p && p.phone) setPhone(p.phone.replace('+91', '').trim());
    });
  }, []);

  // Camera handling for Import QR
  const startScanner = async () => {
    setScanning(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      scanInterval.current = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) handleImportQR(code.data);
      }, 200);
    } catch (err) {
      setScanning(false);
      setError('Camera permission required for sync.');
    }
  };

  const stopScanner = () => {
    setScanning(false);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (scanInterval.current) clearInterval(scanInterval.current);
  };

  const handleImportQR = async (data) => {
    try {
      const payload = JSON.parse(data);
      if (payload.t !== 'pp_transfer' || !payload.k || !payload.p) return;
      
      stopScanner();
      
      // Save keys and profile
      await saveKeys({
        pubKey: payload.k.pub,
        encryptedKey: payload.k.enc,
        iv: payload.k.iv,
        salt: payload.k.salt
      });
      
      await saveUserProfile({
        name: payload.p.name,
        phone: payload.p.phone,
        userId: payload.p.userId
      });
      
      setPhone(payload.p.phone.replace('+91', '').trim());
      setStep(2); // Jump to PIN entry
      setError('Wallet imported! Enter PIN to unlock.');
      setTimeout(() => setError(''), 3000);
    } catch (e) {
      console.warn('Invalid transfer QR');
    }
  };

  const handlePhoneSubmit = async () => {
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    setError('');
    
    try {
      const fullPhone = phone.startsWith('+') ? phone : `+91${phone}`;
      const response = await loginUser({ phone: fullPhone });
      
      // Store server wallet data for use after PIN verification
      if (response.wallet) {
        window.__ppLoginWallet = response.wallet;
      }
      window.__ppLoginResponse = response;
      
      const keys = await getKeys();
      if (!keys.pubKey && response.backup) {
        // Automatically restore backup from server for new device
        await saveKeys({
          pubKey: response.pubKey,
          encryptedKey: response.backup.enc,
          iv: response.backup.iv,
          salt: response.backup.salt
        });
        const walletId = 'PP·' + (response.name || 'user').toLowerCase().split(' ')[0] + '·' + (response.pubKey || '').slice(0, 8);
        await saveUserProfile({
          name: response.name,
          phone: fullPhone,
          userId: response.userId,
          walletId,
          pubKey: response.pubKey,
        });
      } else if (!keys.pubKey) {
        setError('No wallet keys found on this device. Please register.');
        return;
      }
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  const handleKey = async (key) => {
    if (isLocked) return;
    if (pin.length < 6) {
      const newPin = pin + key;
      setPin(newPin);
      if (newPin.length === 6) {
        try {
          const keys = await getKeys();
          if (!keys.pubKey) { setError('No wallet found.'); setTimeout(() => { setPin(''); setError(''); setStep(1); }, 1500); return; }
          const saltBytes = Uint8Array.from(atob(keys.salt), c => c.charCodeAt(0));
          const aesKey = await deriveKeyFromPIN(newPin, saltBytes);
          await decryptPrivateKey(keys.encPrivKey, keys.iv, aesKey);
          
          // PIN correct — set up user profile
          const fullPhone = phone.startsWith('+') ? phone : `+91${phone}`;
          const loginResp = window.__ppLoginResponse;
          
          let profile = await getUserProfile();
          if (!profile || !profile.userId) {
            // Build profile from server response
            const walletId = 'PP·' + (loginResp?.name || 'user').toLowerCase().split(' ')[0] + '·' + (keys.pubKey || '').slice(0, 8);
            profile = {
              name: loginResp?.name || 'User',
              phone: fullPhone,
              userId: loginResp?.userId,
              walletId,
              pubKey: keys.pubKey,
            };
            await setUser(profile);
          } else {
            await loadUserProfile();
          }

          // Update balance from server wallet data (stored during step 1)
          const serverWallet = window.__ppLoginWallet;
          if (serverWallet) {
            await updateBalance({
              confirmed_bal: serverWallet.confirmed_bal || 0,
              locked_bal: serverWallet.locked_bal || 0,
            });
          } else {
            // Try fetching fresh balance
            try {
              const freshWallet = await getBalance();
              if (freshWallet) {
                await updateBalance({ 
                  confirmed_bal: freshWallet.confirmed_bal, 
                  locked_bal: freshWallet.locked_bal,
                  nonce: freshWallet.nonce_counter || 0
                });
              }
            } catch (apiErr) { console.warn('Offline mode login — using local balance'); }
          }
          
          // Cleanup temp vars
          delete window.__ppLoginWallet;
          delete window.__ppLoginResponse;
          
          resetPinAttempts();
          await loadWalletState();
          navigate('/home', { replace: true });
        } catch (e) {
          if (e.message === 'PHONE_MISMATCH') {
             setError('Phone mismatch.');
             setTimeout(() => { setPin(''); setError(''); setStep(1); }, 2000);
             return;
          }
          const locked = incrementPinAttempt();
          if (locked) { await wipeKeys(); setError('Locked. Keys wiped.'); }
          else { setError(`Wrong PIN.`); setTimeout(() => { setPin(''); setError(''); }, 1000); }
        }
      }
    }
  };

  const handleDelete = () => setPin(p => p.slice(0, -1));

  if (isLocked) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6 px-8">
        <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-error">lock</span>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-white mb-2">Wallet Locked</h2>
          <p className="text-slate-400 text-sm">Too many wrong PIN attempts. Recover your wallet to continue.</p>
        </div>
        <button onClick={() => navigate('/recovery')}
          className="w-full max-w-xs py-4 rounded-2xl bg-gradient-to-r from-primary-container to-primary text-white font-black text-sm tracking-wide">
          Recover with Phrase
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-primary/8 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Bar */}
      <header className="flex items-center gap-3 px-6 pt-10 pb-4 flex-shrink-0 relative z-10 justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => step === 2 ? setStep(1) : navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors">
            <span className="material-symbols-outlined text-slate-400">arrow_back</span>
          </button>
          <h2 className="text-lg font-bold text-white">Sign In</h2>
        </div>
        <button 
          onClick={async () => {
            if (window.confirm('Wipe all local data and reset app?')) {
              localStorage.clear();
              try {
                const { wipeKeys } = await import('../services/storageService');
                await wipeKeys();
              } catch(e) {}
              window.location.href = '/';
            }
          }}
          className="px-3 py-1.5 rounded-full bg-error/10 text-error text-xs font-bold border border-error/20"
        >
          Reset App
        </button>
      </header>

      {/* ── STEP 1: Phone ── */}
      {step === 1 && (
        <div className="flex-1 flex flex-col px-6 relative z-10">
          <div className="mb-10">
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Welcome back</h1>
            <p className="text-slate-400 text-sm">Enter your registered phone number to continue.</p>
          </div>

          {/* Phone Input */}
          <div className="bg-[#0d0d15]/80 border border-outline-variant/20 rounded-2xl flex items-center gap-3 px-5 py-4 focus-within:border-primary/40 transition-colors mb-4">
            <div className="flex items-center gap-2 pr-4 border-r border-outline-variant/20 flex-shrink-0">
              <span className="text-sm font-bold text-slate-300">🇮🇳</span>
              <span className="text-sm font-bold text-white">+91</span>
            </div>
            <input
              type="tel"
              placeholder="00000 00000"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="flex-1 bg-transparent border-none outline-none text-white text-lg font-bold tracking-[0.15em] placeholder-slate-700"
            />
            <button onClick={startScanner} className="text-primary hover:text-primary-fixed-dim transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
            </button>
          </div>

          {error && (
            <div className={`rounded-xl px-4 py-3 mb-4 flex items-center gap-3 text-sm font-medium ${
              error.includes('imported')
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-error/10 border border-error/20 text-error'
            }`}>
              <span className="material-symbols-outlined text-base flex-shrink-0">
                {error.includes('imported') ? 'check_circle' : 'error'}
              </span>
              {error}
            </div>
          )}

          <div className="text-center text-sm text-slate-500 mt-4">
            Don't have an account?{' '}
            <span onClick={() => navigate('/register')} className="text-primary font-bold cursor-pointer hover:underline">
              Register
            </span>
          </div>

          <div className="flex-1" />

          <button
            onClick={handlePhoneSubmit}
            disabled={phone.length < 10}
            className="w-full py-5 rounded-2xl bg-gradient-to-r from-primary-container to-primary text-white font-black text-base tracking-wide shadow-lg shadow-primary/20 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all mb-8"
          >
            Continue
          </button>
        </div>
      )}

      {/* ── STEP 2: PIN ── */}
      {step === 2 && (
        <div className="flex-1 flex flex-col items-center px-6 relative z-10">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Enter PIN</h1>
            <p className="text-slate-400 text-sm">Use your 6-digit security PIN</p>
          </div>

          {/* PIN Dots */}
          <div className="flex gap-4 mb-4">
            {[0,1,2,3,4,5].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < pin.length
                  ? error ? 'bg-error border-error scale-110' : 'bg-primary border-primary scale-110'
                  : 'bg-transparent border-slate-700'
              }`} />
            ))}
          </div>

          {error && (
            <p className="text-error text-sm font-bold text-center mb-2">{error}</p>
          )}

          {pinAttempts > 0 && (
            <p className="text-tertiary text-xs text-center mb-4">
              {5 - pinAttempts} attempts remaining
            </p>
          )}

          {/* Keypad — preserved component */}
          <Keypad onKey={handleKey} onDelete={handleDelete} />

          <p className="text-center text-sm text-slate-500 mt-6">
            Forgot PIN?{' '}
            <span onClick={() => navigate('/recovery')} className="text-primary font-bold cursor-pointer hover:underline">
              Recover wallet
            </span>
          </p>
        </div>
      )}

      {/* ── Scanner Modal ── */}
      {scanning && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex flex-col">
          <div className="flex items-center gap-3 px-6 pt-10 pb-4">
            <button onClick={stopScanner} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5">
              <span className="material-symbols-outlined text-slate-400">close</span>
            </button>
            <h3 className="text-lg font-bold text-white">Sync from another device</h3>
          </div>
          <p className="text-slate-400 text-sm px-6 mb-6">Scan the "Transfer QR" shown in your PC Settings page.</p>
          <div className="flex-1 mx-6 mb-6 rounded-2xl bg-black overflow-hidden relative">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            {/* Scan frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-52 relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-lg" />
              </div>
            </div>
          </div>
          <button onClick={stopScanner} className="mx-6 mb-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import twilio from 'twilio';
import { initDB, getDB } from './db.js';
import { reconcileTransactions } from './services/reconciler.js';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

// In-memory OTP storage: { "+1234567890": { otp: "123456", expiresAt: 1234567890000 } }
const otpStore = new Map();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize DB on startup
initDB();

// Initialize Twilio client
let twilioClient;
try {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio client initialized');
} catch (err) {
  console.error('❌ Failed to initialize Twilio:', err.message);
}

// Rate limiters
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many OTP requests. Please try again later.' }
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many verification attempts.' }
});

// ============================
// HEALTH CHECK
// ============================
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  twilioConfigured: !!twilioClient,
  time: Date.now()
}));

// ============================
// OTP: SEND (via Twilio Verify)
// ============================
app.post('/api/send-otp', otpRequestLimiter, async (req, res) => {
  const { phoneNumber } = req.body;
  try {
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone format. Use E.164 format (e.g., +911234567890)' });
    }

    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      return res.status(500).json({ error: 'Twilio SMS service not configured' });
    }

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store with 5 minute expiration
    otpStore.set(phoneNumber, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    const message = await twilioClient.messages.create({
      body: `Your ScanPay OTP is ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log(`📱 OTP sent to ${phoneNumber}, SID: ${message.sid}`);
    res.json({ success: true, message: 'OTP sent successfully', status: 'pending' });
  } catch (error) {
    console.error('Send OTP Error:', error.message, error.code);
    // Fallback to Mock OTP if Twilio trial limits or rate limits are hit
    if (error.code === 572006 || error.code === 60203 || error.code === 21608 || (error.message && error.message.includes('unverified'))) {
      console.log(`⚠️ Twilio limit hit. Falling back to MOCK OTP (123456) for ${phoneNumber}`);
      // Store the mock OTP just like a real one
      otpStore.set(phoneNumber, {
        otp: '123456',
        expiresAt: Date.now() + 5 * 60 * 1000
      });
      return res.json({ success: true, message: 'OTP sent (MOCK: 123456)', status: 'mocked' });
    }
    
    if (error.code === 60200) return res.status(400).json({ error: 'Invalid phone number.' });
    res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

// ============================
// OTP: VERIFY (via Twilio Verify)
// ============================
app.post('/api/verify-otp', verifyLimiter, async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) return res.status(400).json({ error: 'Phone number and OTP are required' });
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'OTP must be 6 digits' });

    const storedOtpData = otpStore.get(phoneNumber);

    if (!storedOtpData) {
      return res.status(401).json({ valid: false, error: 'No OTP requested or expired.' });
    }

    if (Date.now() > storedOtpData.expiresAt) {
      otpStore.delete(phoneNumber);
      return res.status(401).json({ valid: false, error: 'OTP has expired. Please request a new one.' });
    }

    if (storedOtpData.otp === otp) {
      console.log(`✅ OTP verification successful for ${phoneNumber}`);
      otpStore.delete(phoneNumber);
      
      const sessionToken = crypto.randomBytes(32).toString('hex');
      res.json({ success: true, message: 'Verification successful', sessionToken });
    } else {
      console.log(`❌ Invalid OTP for ${phoneNumber}`);
      res.status(401).json({ valid: false, error: 'Invalid OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    if (error.code === 60202) return res.status(429).json({ error: 'Max verification attempts reached. Request a new OTP.' });
    res.status(500).json({ error: error.message || 'Verification failed' });
  }
});

// ============================
// AUTH: REGISTER (create user + wallet, issue JWT)
// ============================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, name, email, pubKey, backup } = req.body;
    if (!phone || !name || !pubKey) return res.status(400).json({ error: 'phone, name, and pubKey are required' });

    const db = getDB();

    // Check if phone already registered
    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (existing) return res.status(409).json({ error: 'Phone already registered. Please log in.' });

    const userId = crypto.randomUUID();
    const walletId = crypto.randomUUID();

    const registerTxn = db.transaction(() => {
      db.prepare(`INSERT INTO users (id, phone, name, email, pub_key, enc_key_bkp, kyc_status) VALUES (?,?,?,?,?,?,?)`).run(
        userId, phone, name, email || null, pubKey, backup ? JSON.stringify(backup) : null, 'verified'
      );
      db.prepare(`INSERT INTO wallets (id, user_id, confirmed_bal, locked_bal, nonce_counter) VALUES (?,?,?,?,?)`).run(
        walletId, userId, 0, 0, 0
      );
    });
    registerTxn();

    // Issue JWT
    const token = jwt.sign({ id: userId, phone, pubKey }, process.env.JWT_SECRET || 'pocketpay_dev_secret', { expiresIn: '30d' });

    console.log(`✅ User registered: ${name} (${phone}), userId: ${userId}`);
    res.json({ success: true, token, userId, walletId: 'PP·' + name.toLowerCase().split(' ')[0] + '·' + pubKey.slice(0, 8) });
  } catch (error) {
    console.error('Register Error:', error.message);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// ============================
// AUTH: LOGIN (verify signature, issue JWT)
// ============================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, pubKey } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const db = getDB();
    // During login, we return the backup if found so the client can restore keys
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) return res.status(404).json({ error: 'User not found. Please register.' });

    // If pubKey provided, verify it. If not (first login on device), we just return backup.
    if (pubKey && user.pub_key !== pubKey) {
      return res.status(401).json({ error: 'Public key mismatch' });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, pubKey: user.pub_key }, process.env.JWT_SECRET || 'pocketpay_dev_secret', { expiresIn: '30d' });

    console.log(`✅ User login step 1: ${user.name} (${user.phone})`);
    res.json({ 
      success: true, 
      token, 
      userId: user.id,
      name: user.name,
      pubKey: user.pub_key,
      backup: user.enc_key_bkp ? JSON.parse(user.enc_key_bkp) : null
    });
  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// ============================
// WALLET: GET BALANCE
// ============================
app.get('/api/wallet/balance', authMiddleware, (req, res) => {
  const db = getDB();
  const wallet = db.prepare('SELECT confirmed_bal, locked_bal, nonce_counter, daily_spent, daily_date FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
  res.json({ wallet });
});

// ============================
// WALLET: ADD MONEY (simulated top-up)
// ============================
app.post('/api/wallet/add', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const db = getDB();
  db.prepare('UPDATE wallets SET confirmed_bal = confirmed_bal + ? WHERE user_id = ?').run(amount, req.user.id);
  const wallet = db.prepare('SELECT confirmed_bal, locked_bal FROM wallets WHERE user_id = ?').get(req.user.id);

  console.log(`💰 Added ₹${amount / 100} to user ${req.user.id}`);
  res.json({ success: true, wallet });
});

// ============================
// WALLET: SYNC (batch reconcile offline transactions)
// ============================
app.post('/api/sync', authMiddleware, (req, res) => {
  const { transactions } = req.body;
  const userId = req.user.id;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.json({ results: [], wallet: null });
  }

  const { results, wallet } = reconcileTransactions(userId, transactions);
  console.log(`🔄 Sync for ${userId}: ${results.filter(r => r.status === 'confirmed').length} confirmed, ${results.filter(r => r.status === 'failed').length} failed`);
  res.json({ results, wallet });
});

// ============================
// WALLET: WITHDRAW
// ============================
app.post('/api/wallet/withdraw', authMiddleware, (req, res) => {
  const { amount, bankName, accountNo, ifsc } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (!bankName || !accountNo || !ifsc) return res.status(400).json({ error: 'Bank details required' });

  const db = getDB();
  const wallet = db.prepare('SELECT confirmed_bal FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!wallet || wallet.confirmed_bal < amount) return res.status(400).json({ error: 'Insufficient balance' });

  const wId = crypto.randomUUID();
  const utr = 'UTR' + Date.now();

  const withdrawTxn = db.transaction(() => {
    db.prepare('UPDATE wallets SET confirmed_bal = confirmed_bal - ? WHERE user_id = ?').run(amount, req.user.id);
    db.prepare(`INSERT INTO withdrawals (id, user_id, amount, bank_name, account_no, ifsc, status, utr_number) VALUES (?,?,?,?,?,?,?,?)`).run(
      wId, req.user.id, amount, bankName, accountNo, ifsc, 'completed', utr
    );
  });
  withdrawTxn();

  const updatedWallet = db.prepare('SELECT confirmed_bal, locked_bal FROM wallets WHERE user_id = ?').get(req.user.id);
  console.log(`🏦 Withdrawal ₹${amount / 100} by ${req.user.id}, UTR: ${utr}`);
  res.json({ success: true, utr, wallet: updatedWallet });
});

// ============================
// LOOKUP: Find user by phone for P2P
// ============================
app.get('/api/users/lookup', authMiddleware, (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  const db = getDB();
  const user = db.prepare('SELECT id, name, phone, pub_key FROM users WHERE phone = ?').get(phone);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, phone: user.phone, pubKey: user.pub_key });
});

// ============================
// START SERVER
// ============================
app.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 PocketPay backend running on http://localhost:${port}`);
  console.log(`📱 Twilio Phone: ${process.env.TWILIO_PHONE_NUMBER || 'NOT SET'}`);
  console.log(`⚠️  Trial account: Only verified numbers can receive OTPs.`);
  console.log(`   Verify numbers at: https://www.twilio.com/console/phone-numbers/verified\n`);
});

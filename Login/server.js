// server.js - Backend OTP Service with Twilio Verify
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// In-memory OTP storage
const otpStore = new Map();

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER
};

// Initialize Twilio client
let twilioClient;
try {
  twilioClient = require('twilio')(CONFIG.TWILIO_ACCOUNT_SID, CONFIG.TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio client initialized');
} catch (err) {
  console.error('❌ Failed to initialize Twilio:', err.message);
}

// ============================================
// RATE LIMITING
// ============================================
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' }
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many verification attempts.' }
});

// ============================================
// API ROUTES
// ============================================

// Send OTP using Twilio Verify
app.post('/api/send-otp', otpRequestLimiter, async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone format. Use E.164 format (e.g., +911234567890)' });
    }

    if (!twilioClient || !CONFIG.TWILIO_PHONE_NUMBER) {
      return res.status(500).json({ error: 'Twilio SMS service not configured' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(phoneNumber, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    // Send verification code via Twilio SMS
    const message = await twilioClient.messages.create({
      body: `Your ScanPay OTP is ${otp}`,
      from: CONFIG.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log(`📱 OTP sent to ${phoneNumber}, SID: ${message.sid}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      status: 'pending'
    });

  } catch (error) {
    console.error('Send OTP Error:', error.message, error.code);

    if (error.code === 60203) {
      return res.status(429).json({ error: 'Max send attempts reached. Please try again later.' });
    }
    if (error.code === 60200) {
      return res.status(400).json({ error: 'Invalid phone number.' });
    }
    if (error.code === 572006 || error.code === 21608 || (error.message && error.message.includes('unverified'))) {
      return res.status(400).json({
        error: 'This number is not verified on our Twilio trial account, or a trial template restriction was hit.'
      });
    }

    res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

// Verify OTP using Twilio Verify
app.post('/api/verify-otp', verifyLimiter, async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required' });
    }

    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }

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
      res.json({
        success: true,
        message: 'Verification successful',
        sessionToken
      });
    } else {
      res.status(401).json({
        valid: false,
        error: 'Invalid or expired OTP. Please try again.'
      });
    }

  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    if (error.code === 60202) {
      return res.status(429).json({ error: 'Max verification attempts reached. Request a new OTP.' });
    }
    res.status(500).json({ error: error.message || 'Verification failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    twilioConfigured: !!twilioClient,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 OTP Server running on http://localhost:${PORT}`);
  console.log(`📱 Twilio Phone: ${CONFIG.TWILIO_PHONE_NUMBER || 'NOT SET'}`);
  console.log(`\n⚠️  Trial account: Only verified numbers can receive OTPs.`);
  console.log(`   Verify numbers at: https://www.twilio.com/console/phone-numbers/verified\n`);
});
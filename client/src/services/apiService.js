import axios from 'axios';

// Auto-detect protocol: if page is served over HTTPS, API calls must also use HTTPS
// to avoid mixed-content blocking on mobile browsers.
// Falls back to http:// only when the page itself is http://
const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// Attach JWT token to every request if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401s globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pp_token');
    }
    return Promise.reject(err);
  }
);

// ============================
// OTP
// ============================
export async function sendOTP(phoneNumber) {
  const { data } = await api.post('/api/send-otp', { phoneNumber });
  return data;
}

export async function verifyOTP(phoneNumber, otp) {
  const { data } = await api.post('/api/verify-otp', { phoneNumber, otp });
  return data;
}

// ============================
// AUTH
// ============================
export async function registerUser(payload) {
  const { data } = await api.post('/api/auth/register', payload);
  if (data.token) localStorage.setItem('pp_token', data.token);
  return data;
}

export async function loginUser(payload) {
  const { data } = await api.post('/api/auth/login', payload);
  if (data.token) localStorage.setItem('pp_token', data.token);
  return data;
}

// ============================
// WALLET
// ============================
export async function getBalance() {
  const { data } = await api.get('/api/wallet/balance');
  return data.wallet;
}

export async function addMoney(amountPaise) {
  const { data } = await api.post('/api/wallet/add', { amount: amountPaise });
  return data;
}

export async function withdrawMoney({ amount, bankName, accountNo, ifsc }) {
  const { data } = await api.post('/api/wallet/withdraw', { amount, bankName, accountNo, ifsc });
  return data;
}

// ============================
// SYNC
// ============================
export async function batchSync(transactions) {
  const { data } = await api.post('/api/sync', { transactions });
  return data;
}

// ============================
// USER LOOKUP
// ============================
export async function lookupUser(phone) {
  const { data } = await api.get('/api/users/lookup', { params: { phone } });
  return data;
}

export function hasToken() {
  return !!localStorage.getItem('pp_token');
}

export function clearToken() {
  localStorage.removeItem('pp_token');
}

// ============================
// MERCHANT
// ============================
export async function getMerchantQR() {
  const { data } = await api.get('/api/merchant/qr');
  return data; // { payload }
}

export async function payMerchant({ merchantUserId, amount, note }) {
  const { data } = await api.post('/api/merchant/pay', { merchantUserId, amount, note });
  return data; // { success, paymentId, merchantName, amount, wallet }
}

export async function getMerchantCollections() {
  const { data } = await api.get('/api/merchant/collections');
  return data; // { payments, total, todayTotal }
}

export default api;

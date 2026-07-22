/**
 * AudioPay Token Store
 * --------------------
 * Manages offline payment tokens using localStorage.
 * Tokens represent pre-funded wallet balance commitments.
 *
 * In production: replace settlePendingTokens() with a real API call.
 * Everything else stays the same.
 */

const TOKENS_KEY  = 'audiopay:tokens'
const BALANCE_KEY = 'audiopay:balance'
const USER_KEY    = 'audiopay:user'

// ─── User Profile ────────────────────────────────────────────────────────────

export function saveUser(profile) {
  localStorage.setItem(USER_KEY, JSON.stringify(profile))
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null
  } catch {
    return null
  }
}

// ─── Balance ─────────────────────────────────────────────────────────────────

export function getBalance() {
  return parseFloat(localStorage.getItem(BALANCE_KEY) || '500')
}

export function setBalance(amount) {
  localStorage.setItem(BALANCE_KEY, String(amount))
}

export function deductBalance(amount) {
  const current = getBalance()
  if (current < amount) throw new Error('Insufficient balance')
  setBalance(current - amount)
}

export function addBalance(amount) {
  setBalance(getBalance() + amount)
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

function getAllTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || []
  } catch {
    return []
  }
}

function saveAllTokens(tokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

/**
 * Creates a signed outgoing token when sender pays.
 * Deducts from local balance immediately.
 * Returns the token ID (short, to embed in broadcast if needed).
 */
export function createOutgoingToken({ recipientName, amount, pin }) {
  // Deduct from pre-funded balance (money already left bank at top-up)
  deductBalance(amount)

  const token = {
    id:            generateId(),
    type:          'outgoing',
    recipientName,
    amount,
    timestamp:     Date.now(),
    settled:       false,
    // PIN is NEVER stored — only used in-memory to simulate UPI auth
    // In production this would go to NPCI's HSM via USSD/SMS
    authConfirmed: pin.length >= 4,  // basic local validation only
  }

  const all = getAllTokens()
  all.push(token)
  saveAllTokens(all)

  return token
}

/**
 * Records an incoming token on the receiver's device.
 * Does NOT immediately add to balance — waits for settlement.
 */
export function receiveToken({ senderName, amount, tokenId }) {
  const token = {
    id:         tokenId || generateId(),
    type:       'incoming',
    senderName,
    amount,
    timestamp:  Date.now(),
    settled:    false,
  }

  const all = getAllTokens()
  all.push(token)
  saveAllTokens(all)

  return token
}

/**
 * Returns all unsettled tokens (outgoing and incoming).
 */
export function getPendingTokens() {
  return getAllTokens().filter(t => !t.settled)
}

/**
 * Returns full transaction history (settled + pending).
 */
export function getTransactionHistory() {
  return getAllTokens().sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Simulates settlement when internet is available.
 * In production: POST pending tokens to your backend here.
 * Backend verifies cryptographic signatures and moves real money.
 */
export async function settlePendingTokens() {
  const pending = getPendingTokens()
  if (pending.length === 0) return { settled: 0 }

  // ── PRODUCTION: replace this block with a real API call ──
  // const res = await fetch('https://your-backend.com/settle', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ tokens: pending })
  // })
  // const { settled } = await res.json()
  // ─────────────────────────────────────────────────────────

  // Simulate 1.5s network round trip
  await new Promise(r => setTimeout(r, 1500))

  const all = getAllTokens()
  let count = 0
  all.forEach(t => {
    if (!t.settled) {
      t.settled    = true
      t.settledAt  = Date.now()
      // Credit incoming tokens to balance on settlement
      if (t.type === 'incoming') {
        addBalance(t.amount)
      }
      count++
    }
  })
  saveAllTokens(all)

  return { settled: count }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

export function formatAmount(n) {
  return new Intl.NumberFormat('en-IN', {
    style:    'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(n)
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour:   '2-digit',
    minute: '2-digit',
  })
}

/**
 * AudioPay Module — Public API
 * ----------------------------
 * Import from here when integrating into a larger app.
 *
 * Usage:
 *   import { startBroadcasting, startListening, createOutgoingToken } from './audio-pay-module'
 */

export { broadcastPayload, startBroadcasting, getBroadcastDuration, stringToSymbols, symbolsToString } from './encoder.js'
export { startListening } from './decoder.js'
export {
  saveUser, getUser,
  getBalance, setBalance, deductBalance, addBalance,
  createOutgoingToken, receiveToken,
  getPendingTokens, getTransactionHistory,
  settlePendingTokens,
  formatAmount, formatTime,
} from './tokenStore.js'

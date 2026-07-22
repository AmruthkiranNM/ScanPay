/**
 * AudioPay Encoder
 * ----------------
 * Converts a short string payload into a sequence of audio tones
 * and plays them through the device speaker using Web Audio API.
 *
 * Encoding scheme: FSK (Frequency Shift Keying)
 * - 8 data frequencies, each representing 3 bits (one "symbol")
 * - Each character is encoded as 2 symbols (upper 3 bits + lower 3 bits)
 * - Preceded by a START tone and followed by an END tone
 *
 * Frequencies chosen to be audible (1–3kHz range) for maximum
 * microphone compatibility across all phone models.
 */

// --- Frequency Map ---
export const FREQS = {
  START: 2700,
  END:   2900,
  // 8 data symbols: 150Hz apart, well within FFT resolution
  SYMBOLS: [900, 1050, 1200, 1350, 1500, 1650, 1800, 1950],
}

// Timing constants (in seconds)
const TONE_DURATION = 0.20   // each tone plays for 200ms
const GAP_DURATION  = 0.06   // silence gap between tones: 60ms
const FADE_TIME     = 0.010  // 10ms fade in/out to prevent clicks

/**
 * Converts a string to an array of symbol indices (0–7).
 * Each character becomes 2 symbols (3 bits each).
 */
export function stringToSymbols(str) {
  const symbols = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    symbols.push((code >> 3) & 0b111)  // upper 3 bits
    symbols.push(code & 0b111)          // lower 3 bits
  }
  return symbols
}

/**
 * Converts symbol indices back to a string.
 */
export function symbolsToString(symbols) {
  let result = ''
  for (let i = 0; i + 1 < symbols.length; i += 2) {
    const code = (symbols[i] << 3) | symbols[i + 1]
    if (code > 0 && code < 128) {
      result += String.fromCharCode(code)
    }
  }
  return result
}

/**
 * Plays a single tone at the given frequency for the given duration.
 * Returns a promise that resolves when the tone has finished.
 */
function playTone(audioCtx, freq, startTime) {
  const osc  = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.connect(gain)
  gain.connect(audioCtx.destination)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startTime)

  // Smooth envelope to prevent audible clicks
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.85, startTime + FADE_TIME)
  gain.gain.setValueAtTime(0.85, startTime + TONE_DURATION - FADE_TIME)
  gain.gain.linearRampToValueAtTime(0, startTime + TONE_DURATION)

  osc.start(startTime)
  osc.stop(startTime + TONE_DURATION)
}

/**
 * Broadcasts the payload string as an audio tone sequence.
 * Returns a promise that resolves after the full sequence has played.
 *
 * @param {string} payload — max 10 chars recommended
 * @param {function} onProgress — optional callback(currentTone, totalTones)
 */
export async function broadcastPayload(payload, onProgress) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

  const symbols = stringToSymbols(payload)
  const allFreqs = [
    FREQS.START,
    ...symbols.map(s => FREQS.SYMBOLS[s]),
    FREQS.END,
  ]

  const totalTones = allFreqs.length
  const stepTime   = TONE_DURATION + GAP_DURATION
  let   currentTime = audioCtx.currentTime + 0.05  // small buffer before first tone

  allFreqs.forEach((freq, idx) => {
    playTone(audioCtx, freq, currentTime)
    currentTime += stepTime
  })

  // Fire progress callbacks roughly in sync with tone playback
  if (onProgress) {
    allFreqs.forEach((_, idx) => {
      const delay = idx * stepTime * 1000 + 50
      setTimeout(() => onProgress(idx + 1, totalTones), delay)
    })
  }

  // Resolve after all tones finish (+ small buffer)
  const totalDuration = (totalTones * stepTime + 0.1) * 1000
  return new Promise(resolve => {
    setTimeout(() => {
      audioCtx.close()
      resolve()
    }, totalDuration)
  })
}

/**
 * Continuously broadcasts the payload in a loop with a pause between cycles.
 * Returns a { stop } object to cancel broadcasting.
 *
 * @param {string} payload
 * @param {number} pauseBetween — ms to wait between each broadcast cycle (default 1200)
 * @param {function} onCycle — called each time a cycle starts
 */
export function startBroadcasting(payload, pauseBetween = 1200, onCycle) {
  let active = true

  async function loop() {
    while (active) {
      onCycle?.()
      await broadcastPayload(payload)
      if (!active) break
      await new Promise(r => setTimeout(r, pauseBetween))
    }
  }

  loop()

  return {
    stop() { active = false }
  }
}

/**
 * Returns estimated broadcast duration in ms for a given payload string.
 * Useful for UI progress bars.
 */
export function getBroadcastDuration(payload) {
  const symbols   = stringToSymbols(payload)
  const toneCount = symbols.length + 2  // +2 for START and END
  return Math.ceil(toneCount * (TONE_DURATION + GAP_DURATION) * 1000)
}

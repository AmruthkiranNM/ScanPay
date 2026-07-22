/**
 * AudioPay Decoder
 * ----------------
 * Continuously listens to the microphone via Web Audio API.
 * Uses FFT (Fast Fourier Transform) to detect tones in our frequency range.
 * Reconstructs the payload string from the detected symbol sequence.
 *
 * Detection algorithm:
 * - Poll FFT data every 30ms
 * - Find the peak frequency bin in our target range (800–3100 Hz)
 * - Match it to the nearest known frequency (within ±80 Hz tolerance)
 * - A symbol is "committed" when the same frequency is detected 3× consecutively (~90ms)
 * - State machine: IDLE → COLLECTING → DONE
 */

import { FREQS, symbolsToString } from './encoder.js'

// --- Tuning Constants ---
const FFT_SIZE        = 8192   // high resolution: ~5.4 Hz per bin at 44100Hz
const POLL_INTERVAL   = 30     // ms between FFT reads
const MIN_CONFIRM     = 3      // consecutive polls needed to commit a symbol
const FREQ_TOLERANCE  = 80     // Hz — how close detected freq must be to a known freq
const MIN_SIGNAL_DB   = -52    // dBFS — reject weaker signals as noise
const SEARCH_FREQ_MIN = 800    // Hz — bottom of our search window
const SEARCH_FREQ_MAX = 3100   // Hz — top of our search window

/**
 * Returns all known frequencies: START, END, and the 8 data symbols.
 */
function getAllFreqs() {
  return [
    { freq: FREQS.START, label: 'START' },
    { freq: FREQS.END,   label: 'END'   },
    ...FREQS.SYMBOLS.map((f, i) => ({ freq: f, label: String(i) })),
  ]
}

/**
 * Finds the dominant frequency in the FFT data within our search window.
 * Returns { freq, db } or null if signal is too weak.
 */
function getDominantFrequency(analyser, sampleRate) {
  const buffer  = new Float32Array(analyser.frequencyBinCount)
  analyser.getFloatFrequencyData(buffer)

  const binSize = sampleRate / (analyser.fftSize)
  const minBin  = Math.floor(SEARCH_FREQ_MIN / binSize)
  const maxBin  = Math.floor(SEARCH_FREQ_MAX / binSize)

  let maxDb  = -Infinity
  let maxBin2 = minBin

  for (let i = minBin; i <= maxBin && i < buffer.length; i++) {
    if (buffer[i] > maxDb) {
      maxDb   = buffer[i]
      maxBin2 = i
    }
  }

  if (maxDb < MIN_SIGNAL_DB) return null

  const detectedFreq = maxBin2 * binSize
  return { freq: detectedFreq, db: maxDb }
}

/**
 * Matches a detected frequency to the nearest known symbol.
 * Returns the symbol label ('START', 'END', '0'–'7') or null if no match.
 */
function matchSymbol(detectedFreq) {
  const known = getAllFreqs()

  let bestLabel = null
  let bestDist  = Infinity

  for (const { freq, label } of known) {
    const dist = Math.abs(detectedFreq - freq)
    if (dist < bestDist) {
      bestDist  = dist
      bestLabel = label
    }
  }

  return bestDist <= FREQ_TOLERANCE ? bestLabel : null
}

/**
 * Starts listening on the microphone and decodes incoming audio tones.
 *
 * @param {function} onPayload(payload: string) — called when a full payload is decoded
 * @param {function} onStatus(status: string)   — 'listening' | 'signal' | 'receiving' | 'done' | 'error'
 * @param {function} onLevel(db: number)         — called each poll with signal level for visualisation
 *
 * @returns {{ stop: function }} — call stop() to clean up microphone and timers
 */
export async function startListening(onPayload, onStatus, onLevel) {
  let audioCtx, analyser, stream, pollTimer
  let state          = 'IDLE'   // 'IDLE' | 'COLLECTING' | 'DONE'
  let collectedSymbols = []
  let lastSymbol     = null
  let consecutiveCount = 0
  let lastCommitted  = null     // avoid re-committing same symbol at boundary

  onStatus?.('listening')

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,   // keep raw signal
        noiseSuppression: false,
        autoGainControl:  false,
        sampleRate:       44100,
      }
    })
  } catch (err) {
    onStatus?.('error')
    console.error('[AudioPay] Mic access denied:', err)
    return { stop: () => {} }
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  const source = audioCtx.createMediaStreamSource(stream)

  analyser = audioCtx.createAnalyser()
  analyser.fftSize              = FFT_SIZE
  analyser.smoothingTimeConstant = 0.05  // minimal smoothing for fast response

  source.connect(analyser)

  const sampleRate = audioCtx.sampleRate

  // --- Main polling loop ---
  pollTimer = setInterval(() => {
    const detected = getDominantFrequency(analyser, sampleRate)

    if (!detected) {
      // Silence — if we were building a symbol, check if it's done
      onLevel?.(-80)
      if (lastSymbol !== null && consecutiveCount >= MIN_CONFIRM) {
        commitSymbol(lastSymbol)
      }
      lastSymbol       = null
      consecutiveCount = 0
      return
    }

    onLevel?.(detected.db)

    const symbol = matchSymbol(detected.freq)

    if (!symbol) {
      // Detected something but it doesn't match — treat as noise
      lastSymbol       = null
      consecutiveCount = 0
      return
    }

    if (symbol === lastSymbol) {
      consecutiveCount++
    } else {
      // Frequency changed — commit previous if confirmed
      if (lastSymbol !== null && consecutiveCount >= MIN_CONFIRM) {
        commitSymbol(lastSymbol)
      }
      lastSymbol       = symbol
      consecutiveCount = 1
    }
  }, POLL_INTERVAL)

  function commitSymbol(symbol) {
    // Debounce: don't commit same symbol twice in a row without silence gap
    if (symbol === lastCommitted) return
    lastCommitted = symbol

    if (state === 'IDLE') {
      if (symbol === 'START') {
        state            = 'COLLECTING'
        collectedSymbols = []
        onStatus?.('receiving')
      }
    } else if (state === 'COLLECTING') {
      if (symbol === 'END') {
        state = 'DONE'
        onStatus?.('done')
        const payload = symbolsToString(collectedSymbols)
        onPayload?.(payload)
        // Reset so we can catch another broadcast
        setTimeout(() => {
          state            = 'IDLE'
          collectedSymbols = []
          lastCommitted    = null
          onStatus?.('listening')
        }, 2000)
      } else if (symbol !== 'START') {
        collectedSymbols.push(parseInt(symbol, 10))
      }
    }
  }

  function stop() {
    clearInterval(pollTimer)
    stream?.getTracks().forEach(t => t.stop())
    audioCtx?.close()
  }

  return { stop }
}

/**
 * Returns raw FFT data for visualisation (e.g. waveform bars).
 * Call this repeatedly in a requestAnimationFrame loop after startListening.
 */
export function createVisualiser() {
  let analyserRef = null
  let streamRef   = null

  async function init() {
    streamRef = await navigator.mediaDevices.getUserMedia({ audio: true })
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const src  = ctx.createMediaStreamSource(streamRef)
    analyserRef = ctx.createAnalyser()
    analyserRef.fftSize = 256
    src.connect(analyserRef)
    return analyserRef
  }

  function getBarData() {
    if (!analyserRef) return new Uint8Array(0)
    const buf = new Uint8Array(analyserRef.frequencyBinCount)
    analyserRef.getByteFrequencyData(buf)
    return buf
  }

  function stop() {
    streamRef?.getTracks().forEach(t => t.stop())
  }

  return { init, getBarData, stop }
}

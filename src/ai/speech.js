// Browser speech service: plays an AI character's spoken line through the dev-server `/tts`
// proxy (see vite-plugin-edge-tts.js). Best-effort by design — any failure is swallowed so
// the silent speech bubble and gameplay are never affected.

import { getCharacter } from './characters.js'
import { useUiStore } from '../stores/ui.js'

// Used when a character is unknown or has no voiceId.
const DEFAULT_VOICE = 'en-US-AriaNeural'

// One shared element gives single-flight playback for free: assigning a new `src` and
// calling play() stops whatever was playing. Created lazily so this module stays inert in
// non-browser (test) environments.
let audioEl = null
function getAudioEl() {
  if (audioEl) return audioEl
  if (typeof Audio === 'undefined') return null
  audioEl = new Audio()
  return audioEl
}

function isMuted() {
  try {
    return useUiStore().voiceMuted
  } catch {
    // No active Pinia (outside the app) — treat as muted so nothing is requested.
    return true
  }
}

// Synthesize and play `text` in the given character's voice. No-op (and issues no request)
// when muted or outside a browser. A new call replaces any still-playing utterance.
export function speak(characterId, text) {
  if (!text || typeof text !== 'string') return
  if (isMuted()) return
  const el = getAudioEl()
  if (!el) return

  const voice = getCharacter(characterId)?.voiceId || DEFAULT_VOICE
  const url = `/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`
  try {
    el.pause()
    el.src = url
    el.currentTime = 0
    const playback = el.play()
    if (playback?.catch) playback.catch(() => { /* autoplay/playback failure — swallow */ })
  } catch {
    /* never let TTS break gameplay */
  }
}

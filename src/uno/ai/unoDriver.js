import { streamChat } from '../../ai/llmClient.js'
import { splitThink } from '../../ai/thinkSplitter.js'
import { getCharacter } from '../../ai/characters.js'
import { isWild, cardValue } from '../engine/cards.js'
import { UNO_EVENTS } from '../engine/events.js'
import {
  buildUnoPrompt,
  parseUnoActionJson,
} from './unoPromptBuilder.js'

// Create a per-seat Uno driver. Returns an async function `(view) => action`.
//
// Options:
//   characterId — used for persona + research-panel attribution
//   eventBus    — shared bus from useAiStore().eventBus() (optional)
//   degraded    — when true, skip the LLM call and pick a heuristic legal action
export function createUnoDriver({ characterId, eventBus, degraded = false } = {}) {
  const character = getCharacter(characterId) ?? { id: characterId, name: characterId, playStyle: {} }
  let abortCtrl = null

  function emit(event) {
    if (eventBus) eventBus.emit({ ...event, characterId })
  }

  async function callLlm(view) {
    abortCtrl = new AbortController()
    const signal = abortCtrl.signal
    const messages = buildUnoPrompt({ view, character })
    let thinkText = ''
    let contentText = ''
    emit({ type: 'think-start' })
    try {
      const deltas = streamChat({ messages, signal })
      for await (const evt of splitThink(deltas)) {
        if (evt.type === 'think') {
          thinkText += evt.text
          emit({ type: 'think-chunk', text: evt.text })
        } else {
          contentText += evt.text
          emit({ type: 'content-chunk', text: evt.text })
        }
      }
    } finally {
      abortCtrl = null
    }
    return { thinkText, contentText }
  }

  return async function unoDriver(view /* , character, opts */) {
    if (degraded) {
      const decision = pickDegradedAction(view)
      emit({ type: 'decision', decision })
      return decision
    }
    try {
      const { contentText } = await callLlm(view)
      let parsed
      try {
        parsed = parseUnoActionJson(contentText)
      } catch (e) {
        // Malformed JSON — pick the safest legal action.
        const fallback = pickDegradedAction(view)
        emit({ type: 'error', error: `Parse failed: ${e.message}` })
        emit({ type: 'decision', decision: fallback })
        emit({ type: UNO_EVENTS.ACTION_CORRECTED, reason: 'parse_failed', original: contentText, fallback })
        return fallback
      }
      const corrected = correctAgainstLegal(parsed, view)
      if (corrected !== parsed) {
        emit({ type: UNO_EVENTS.ACTION_CORRECTED, reason: 'illegal_action', original: parsed, corrected })
      }
      emit({ type: 'decision', decision: corrected })
      return corrected
    } catch (e) {
      emit({ type: 'error', error: e.message })
      const fallback = pickDegradedAction(view)
      emit({ type: 'decision', decision: fallback })
      return fallback
    }
  }
}

// Validate the model's action against view.legalActions. If illegal, rewrite to the closest
// legal action. Returns the (possibly rewritten) action.
export function correctAgainstLegal(action, view) {
  const la = view.legalActions

  // Starting-color gate.
  if (la.mustChooseStartingColor) {
    if (action.action === 'chooseStartingColor') {
      const c = isPlayableColor(action.color) ? action.color
        : isPlayableColor(action.wildColor) ? action.wildColor
        : pickPreferredColor(view)
      return { action: 'chooseStartingColor', color: c, say: action.say ?? null }
    }
    return { action: 'chooseStartingColor', color: pickPreferredColor(view), say: action.say ?? null }
  }

  // WD4 challenge gate.
  if (la.canAccept || la.canChallenge) {
    if (action.action === 'challenge' && la.canChallenge) return action
    if (action.action === 'accept' && la.canAccept) return action
    // Default: accept (v1 AI never challenges).
    return { action: 'accept', say: action.say ?? null }
  }

  // Out-of-turn catchMissedUno.
  if (action.action === 'catchMissedUno') {
    if (la.canCatchMissedUno) return action
    // Not legal — fall through to in-turn handling.
  }

  // Play action.
  if (action.action === 'play') {
    const legalPlay = la.plays.find((p) => p.cardIndex === action.cardIndex)
    if (legalPlay) {
      const out = { action: 'play', cardIndex: action.cardIndex, say: action.say ?? null }
      if (legalPlay.requiresWildColor) {
        out.wildColor = isPlayableColor(action.wildColor) ? action.wildColor : pickPreferredColor(view)
      }
      // Auto-include callUno when this play takes the seat to 1 card.
      if (view.self.handSize - 1 === 1) out.callUno = action.callUno !== false
      return out
    }
    // Illegal — fall through.
  }

  // Draw / pass.
  if (action.action === 'draw' && la.canDraw) return { action: 'draw', say: action.say ?? null }
  if (action.action === 'pass' && la.canPass) return { action: 'pass', say: action.say ?? null }

  // Final fallback.
  return pickDegradedAction(view, action.say ?? null)
}

// Heuristic that always returns a legal action.
//
// Priority:
//   1. mustChooseStartingColor → chooseStartingColor with preferred color.
//   2. WD4 against viewer → accept (v1 never challenges).
//   3. canPass → pass (after drawing an unplayable card, this is the only legal action).
//   4. legalActions.plays exists → play the lowest-value playable card, Wilds last.
//   5. canDraw → draw.
//   6. nothing legal → draw as a safe default (engine throws if even that is illegal).
export function pickDegradedAction(view, say = null) {
  const la = view.legalActions
  if (la.mustChooseStartingColor) {
    return { action: 'chooseStartingColor', color: pickPreferredColor(view), say }
  }
  if (la.canAccept) return { action: 'accept', say }
  if (la.canPass && la.plays.length === 0) return { action: 'pass', say }
  if (la.plays.length > 0) {
    const hand = view.self.hand
    // Sort plays by value ascending, Wilds last.
    const ranked = [...la.plays].sort((a, b) => {
      const ca = hand[a.cardIndex]
      const cb = hand[b.cardIndex]
      const wa = isWild(ca) ? 1 : 0
      const wb = isWild(cb) ? 1 : 0
      if (wa !== wb) return wa - wb
      return cardValue(ca) - cardValue(cb)
    })
    const choice = ranked[0]
    const out = { action: 'play', cardIndex: choice.cardIndex, say }
    if (choice.requiresWildColor) out.wildColor = pickPreferredColor(view)
    if (view.self.handSize - 1 === 1) out.callUno = true
    return out
  }
  if (la.canDraw) return { action: 'draw', say }
  if (la.canPass) return { action: 'pass', say }
  return { action: 'draw', say }
}

// Pick the most-represented non-Wild color in the viewer's hand. Defaults to 'red' on ties.
function pickPreferredColor(view) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 }
  for (const c of view.self.hand) {
    if (c.color !== 'wild' && counts[c.color] !== undefined) counts[c.color]++
  }
  let best = 'red'
  let bestCount = -1
  for (const c of ['red', 'yellow', 'green', 'blue']) {
    if (counts[c] > bestCount) { best = c; bestCount = counts[c] }
  }
  return best
}

function isPlayableColor(c) {
  return c === 'red' || c === 'yellow' || c === 'green' || c === 'blue'
}

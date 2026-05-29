import { streamChat } from './llmClient.js'
import { splitThink } from './thinkSplitter.js'
import { buildPrompt, buildRetryPrompt, parseActionJson, fmtCards } from './promptBuilder.js'
import { getCharacter } from './characters.js'
import { formatForPrompt } from './characterMemory.js'
import { requestTableTalk, shouldSpeak, seededRoll } from './tableTalk.js'

// Create an LLM-backed driver for one AI player. Subscribers can listen for streaming events:
//   driver.onEvent((e) => ...)
// Event shapes:
//   { type: 'think-start', characterId }
//   { type: 'think-chunk', characterId, text }
//   { type: 'content-chunk', characterId, text }
//   { type: 'decision', characterId, decision }
//   { type: 'error', characterId, error }
//
// A turn is two passes: a focused DECISION pass that returns {action, amount}, then an
// optional TABLE-TALK pass (see tableTalk.js) that generates the spoken line conditioned on
// the chosen action. The spoken line is attached to the decision as `decision.say` so existing
// consumers (speech bubbles, reveal timing) are unchanged.
export function createLlmDriver(characterId, { eventBus } = {}) {
  const character = getCharacter(characterId) ?? {
    id: characterId, name: characterId, personality: '', playStyle: '',
  }
  let abortCtrl = null

  function emit(event) {
    if (eventBus) eventBus.emit({ ...event, characterId })
  }

  async function consumeOnce(messages, signal) {
    let thinkText = ''
    let contentText = ''
    const deltas = streamChat({ messages, signal })
    emit({ type: 'think-start' })
    for await (const evt of splitThink(deltas)) {
      if (evt.type === 'think') {
        thinkText += evt.text
        emit({ type: 'think-chunk', text: evt.text })
      } else {
        contentText += evt.text
        emit({ type: 'content-chunk', text: evt.text })
      }
    }
    return { thinkText, contentText }
  }

  // Does `text` address the player by their (first) name? Word-boundary, case-insensitive.
  function mentionsName(text, name) {
    if (!text || !name) return false
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return re.test(text)
  }

  // Build the table-talk context from the view + the action just chosen.
  function buildTalkContext(view, decision) {
    const chat = view.tableChat ?? []
    const selfId = view.self?.id
    const selfName = view.self?.name
    const ownRecentLines = chat.filter((c) => c.playerId === selfId).slice(-6).map((c) => c.text)
    const others = chat.filter((c) => c.playerId !== selfId).slice(-8)
    let addressedBy = null
    for (let i = others.length - 1; i >= 0; i--) {
      if (mentionsName(others[i].text, selfName)) { addressedBy = others[i].name; break }
    }
    return {
      action: decision.action,
      amount: decision.amount,
      street: view.street,
      board: view.communityCards?.length ? fmtCards(view.communityCards) : '',
      potTotal: view.potTotal,
      recentChat: others.map((c) => ({ name: c.name, text: c.text })),
      ownRecentLines,
      addressedBy,
    }
  }

  // Run the gated table-talk pass. Returns the spoken line or null. Never throws — any
  // failure / abort degrades to silence so the already-decided action still stands.
  async function generateTalk(view, decision, signal) {
    try {
      const ctx = buildTalkContext(view, decision)
      const seed = `${characterId}|${view.handNumber}|${view.street}|${decision.action}`
      if (!shouldSpeak(character, { addressed: !!ctx.addressedBy, roll: seededRoll(seed) })) {
        return null
      }
      return (await requestTableTalk(characterId, ctx, { signal })) ?? null
    } catch {
      return null
    }
  }

  return {
    async decide(view) {
      abortCtrl = new AbortController()
      const signal = abortCtrl.signal
      const memory = formatForPrompt(characterId)
      const messages = buildPrompt({ view, character, memory })

      let decision = null
      try {
        const { contentText } = await consumeOnce(messages, signal)
        try {
          decision = parseActionJson(contentText)
        } catch (firstErr) {
          // Retry once with a corrective prompt.
          const retryMessages = buildRetryPrompt({ view, character, badReply: contentText, memory })
          const { contentText: retryContent } = await consumeOnce(retryMessages, signal)
          try {
            decision = parseActionJson(retryContent)
          } catch (secondErr) {
            emit({ type: 'error', error: `Two parse failures: ${firstErr.message}; ${secondErr.message}` })
          }
        }
      } catch (err) {
        emit({ type: 'error', error: err.message })
      }

      if (!decision) {
        const fallback = { action: 'fold', amount: 0, say: null }
        emit({ type: 'decision', decision: fallback })
        abortCtrl = null
        return fallback
      }

      // Decision is valid. The spoken line comes from the dedicated table-talk pass; any
      // legacy `say` in the decision JSON is ignored.
      decision.say = await generateTalk(view, decision, signal)
      emit({ type: 'decision', decision })
      abortCtrl = null
      return decision
    },

    cancel() {
      if (abortCtrl) abortCtrl.abort()
    },
  }
}

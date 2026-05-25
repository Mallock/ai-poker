import { streamChat } from './llmClient.js'
import { splitThink } from './thinkSplitter.js'
import { buildPrompt, buildRetryPrompt, parseActionJson } from './promptBuilder.js'
import { getCharacter } from './characters.js'
import { formatForPrompt } from './characterMemory.js'

// Create an LLM-backed driver for one AI player. Subscribers can listen for streaming events:
//   driver.onEvent((e) => ...)
// Event shapes:
//   { type: 'think-start', characterId }
//   { type: 'think-chunk', characterId, text }
//   { type: 'content-chunk', characterId, text }
//   { type: 'decision', characterId, decision }
//   { type: 'error', characterId, error }
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

  return {
    async decide(view) {
      abortCtrl = new AbortController()
      const signal = abortCtrl.signal
      const memory = formatForPrompt(characterId)
      const messages = buildPrompt({ view, character, memory })

      try {
        const { contentText } = await consumeOnce(messages, signal)
        try {
          const decision = parseActionJson(contentText)
          emit({ type: 'decision', decision })
          return decision
        } catch (firstErr) {
          // Retry once with a corrective prompt.
          const retryMessages = buildRetryPrompt({ view, character, badReply: contentText, memory })
          const { contentText: retryContent } = await consumeOnce(retryMessages, signal)
          try {
            const decision = parseActionJson(retryContent)
            emit({ type: 'decision', decision })
            return decision
          } catch (secondErr) {
            emit({ type: 'error', error: `Two parse failures: ${firstErr.message}; ${secondErr.message}` })
            const fallback = { action: 'fold', amount: 0, say: null }
            emit({ type: 'decision', decision: fallback })
            return fallback
          }
        }
      } catch (err) {
        emit({ type: 'error', error: err.message })
        const fallback = { action: 'fold', amount: 0, say: null }
        emit({ type: 'decision', decision: fallback })
        return fallback
      } finally {
        abortCtrl = null
      }
    },

    cancel() {
      if (abortCtrl) abortCtrl.abort()
    },
  }
}

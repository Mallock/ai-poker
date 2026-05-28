import { defineStore } from 'pinia'
import { createEventBus } from '../ai/eventBus.js'
import { speak } from '../ai/speech.js'
import { useUiStore } from './ui.js'

// Per-hand reasoning entries: { id, characterId, name, think, content, decision, error, complete }
// The research panel reads `currentHandReasoning` directly.

const eventBus = createEventBus()
let unsubscribe = null

export const useAiStore = defineStore('ai', {
  state: () => ({
    currentHandReasoning: [],
    // The active entry for the AI currently thinking — null when idle.
    activeEntryId: null,
    _nextEntryId: 1,
  }),
  actions: {
    init() {
      if (unsubscribe) return
      unsubscribe = eventBus.on((evt) => this._handleEvent(evt))
    },
    eventBus() { return eventBus },
    clearForNewHand() {
      this.currentHandReasoning = []
      this.activeEntryId = null
    },
    _handleEvent(evt) {
      switch (evt.type) {
        case 'think-start': {
          const id = this._nextEntryId++
          this.currentHandReasoning.push({
            id, characterId: evt.characterId,
            think: '', content: '', decision: null, error: null, complete: false,
          })
          this.activeEntryId = id
          break
        }
        case 'think-chunk': {
          const entry = this._activeEntry()
          if (entry) entry.think += evt.text
          break
        }
        case 'content-chunk': {
          const entry = this._activeEntry()
          if (entry) entry.content += evt.text
          break
        }
        case 'decision': {
          const entry = this._activeEntry()
          if (entry) {
            entry.decision = evt.decision
            entry.complete = true
            // Speech bubble side-effect — handled in UI store, decoupled here.
            const ui = useUiStore()
            if (evt.decision?.say) {
              ui.showBubble(evt.characterId, evt.decision.say)
              // Voice the AI's table talk (Uno comes along for free — same decision event).
              speak(evt.characterId, evt.decision.say)
            }
          }
          this.activeEntryId = null
          break
        }
        case 'error': {
          const entry = this._activeEntry()
          if (entry) entry.error = evt.error
          break
        }
      }
    },
    _activeEntry() {
      return this.currentHandReasoning.find((e) => e.id === this.activeEntryId) ?? null
    },
  },
})

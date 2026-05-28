import { defineStore } from 'pinia'

function bubbleDurationMs(text) {
  const min = 4000
  const max = 14000
  return Math.max(min, Math.min(max, text.length * 130))
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    researchPanelOpen: true,
    activeBubbles: {}, // characterId → { text, expiresAt, timeoutId }
    // Character voices start muted: browser autoplay policy needs a user gesture, and the
    // first unmute click supplies it. The speech service reads this flag.
    voiceMuted: true,
  }),
  actions: {
    toggleResearchPanel() {
      this.researchPanelOpen = !this.researchPanelOpen
    },
    toggleVoiceMuted() {
      this.voiceMuted = !this.voiceMuted
    },
    showBubble(characterId, text) {
      if (!characterId || !text) return
      // Replace any existing bubble for this character.
      const existing = this.activeBubbles[characterId]
      if (existing?.timeoutId) clearTimeout(existing.timeoutId)
      const duration = bubbleDurationMs(text)
      const timeoutId = setTimeout(() => {
        delete this.activeBubbles[characterId]
      }, duration)
      this.activeBubbles[characterId] = {
        text,
        expiresAt: Date.now() + duration,
        timeoutId,
      }
    },
    clearBubble(characterId) {
      const existing = this.activeBubbles[characterId]
      if (existing?.timeoutId) clearTimeout(existing.timeoutId)
      delete this.activeBubbles[characterId]
    },
    clearAllBubbles() {
      for (const id of Object.keys(this.activeBubbles)) this.clearBubble(id)
    },
  },
})

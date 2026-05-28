import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { createInitialState, startRound, recordChat } from '../uno/engine/state.js'
import { applyAction, legalActions } from '../uno/engine/rules.js'
import { getPlayerView } from '../uno/engine/view.js'
import { advanceMatch, startNextRound } from '../uno/engine/match.js'
import { UNO_EVENTS } from '../uno/engine/events.js'
import { cardLabel } from '../uno/engine/cards.js'
import { useAiStore } from './ai.js'
import { useUiStore } from './ui.js'
import { getCharacter } from '../ai/characters.js'
import { recordHandNote, resetAll as resetAllMemory } from '../ai/characterMemory.js'

const HUMAN_ID = 'human'

// Default no-op driver — replaced by `unoDriver` once the AI module is loaded. Kept as a
// fallback so the store is testable in isolation. Picks the first legal action; falls back
// to draw.
function defaultDriver(view) {
  const la = view.legalActions
  if (la.mustChooseStartingColor) return { action: 'chooseStartingColor', color: 'red' }
  if (la.canAccept) return { action: 'accept' }
  if (la.plays.length > 0) {
    const p = la.plays[0]
    const action = { action: 'play', cardIndex: p.cardIndex }
    if (p.requiresWildColor) action.wildColor = 'red'
    if (view.self.handSize - 1 === 1) action.callUno = true
    return action
  }
  if (la.canDraw) return { action: 'draw' }
  if (la.canPass) return { action: 'pass' }
  return { action: 'draw' }
}

export const useUnoGameStore = defineStore('unoGame', {
  state: () => ({
    matchState: null,
    paused: false,
    scorecardPending: false,
    degradedMode: false,
    pendingHumanTurn: false,
    pendingHumanWildCard: null, // when human clicks a Wild and needs to pick a color
    humanId: HUMAN_ID,
    // Timing (ms).
    aiThinkPauseMs: 350,
    aiDecisionRevealMs: 700,
    aiDecisionRevealWithSayMs: 1500,
    roundEndDelayMs: 900,
    driverFactory: () => async (view) => defaultDriver(view),
    error: null,
    _loopActive: false,
    _busUnsub: null,
  }),

  getters: {
    state(s) { return s.matchState }, // alias used by App.vue
    matchComplete(s) { return !!s.matchState?.matchComplete },
    roundComplete(s) { return !!s.matchState?.roundComplete },
    activeSeat(s) { return s.matchState ? s.matchState.currentSeatIndex : null },
    humanSeatIndex(s) {
      if (!s.matchState) return -1
      return s.matchState.seats.findIndex((seat) => seat.isHuman)
    },
    humanLegalActions(s) {
      if (!s.matchState) return null
      const idx = s.matchState.seats.findIndex((seat) => seat.isHuman)
      if (idx < 0) return null
      return legalActions(s.matchState, idx)
    },
    humanView(s) {
      if (!s.matchState) return null
      const idx = s.matchState.seats.findIndex((seat) => seat.isHuman)
      if (idx < 0) return null
      return getPlayerView(s.matchState, idx)
    },
  },

  actions: {
    startMatch(config) {
      const seats = [...config.seats]
      const totalRounds = config.totalRounds ?? 7
      this.degradedMode = !!config.degradedMode
      const ai = useAiStore()
      ai.init()
      resetAllMemory()
      // Subscribe Uno engine events to UI side-effects (speech bubbles for UNO call /
      // missed-uno stingers) and character memory hooks. The shared `decision` event
      // already routes `say` lines through ai.js → ui.showBubble; this hook adds Uno-specific
      // bubble triggers + per-round memory notes.
      if (this._busUnsub) { this._busUnsub(); this._busUnsub = null }
      this._busUnsub = ai.eventBus().on((evt) => this._onUnoEvent(evt))

      // Driver factory: when degraded → always defaultDriver; otherwise the caller-supplied
      // factory (typically `createUnoDriver` wired through App.vue with the shared event bus).
      // The factory receives a seat id and returns an async function `(view) => UnoAction`.
      const seatById = new Map(seats.map((s) => [s.id, s]))
      const baseFactory = config.driverFactory ?? ((seatId) => {
        const seat = seatById.get(seatId)
        if (!seat || seat.isHuman || this.degradedMode) {
          return async (view) => defaultDriver(view)
        }
        return async (view) => defaultDriver(view)
      })

      this.driverFactory = baseFactory
      this.matchState = reactive(createInitialState({
        seats,
        totalRounds,
        rngSeed: config.rngSeed ?? Date.now(),
      }))
      startRound(this.matchState)
      this._emitEvents([{ type: 'uno:round_started', roundNumber: this.matchState.roundNumber }])
      this.scorecardPending = false
      this.pendingHumanTurn = false
      this.pendingHumanWildCard = null
      this.error = null
      this.paused = false
      this._runLoop()
    },

    submitHumanAction(action) {
      if (!this.matchState) return
      const idx = this.humanSeatIndex
      if (idx < 0) return
      try {
        const events = applyAction(this.matchState, idx, action)
        recordChat(this.matchState, idx, action?.say)
        this._emitEvents(events)
      } catch (e) {
        this.error = e.message
        return
      }
      const say = typeof action?.say === 'string' ? action.say.trim() : ''
      if (say) useUiStore().showBubble(this.matchState.seats[idx].id, say)
      this.pendingHumanTurn = false
      this.pendingHumanWildCard = null
      this._runLoop()
    },

    // Called from the UI when the human clicks a Wild card and we want to open the picker
    // before committing the play. Stored so the picker knows which card index to bundle.
    requestWildColor(cardIndex) {
      this.pendingHumanWildCard = { cardIndex }
    },
    cancelWildColor() {
      this.pendingHumanWildCard = null
    },

    dismissScorecard() {
      if (!this.scorecardPending) return
      this.scorecardPending = false
      if (this.matchState.matchComplete) return
      startNextRound(this.matchState)
      this._emitEvents([{ type: 'uno:round_started', roundNumber: this.matchState.roundNumber }])
      this._runLoop()
    },

    pause() { this.paused = true },
    resume() {
      if (!this.paused) return
      this.paused = false
      this._runLoop()
    },

    _emitEvents(events) {
      const ai = useAiStore()
      const bus = ai.eventBus()
      for (const e of events) bus.emit(e)
    },

    _onUnoEvent(evt) {
      if (!evt || !evt.type || !evt.type.startsWith('uno:')) return
      const ui = useUiStore()
      const seatCharacter = (idx) => {
        const seat = this.matchState?.seats?.[idx]
        return seat?.characterId ?? null
      }
      switch (evt.type) {
        case UNO_EVENTS.UNO_CALLED: {
          const cid = seatCharacter(evt.seatIndex)
          if (cid) ui.showBubble(cid, 'UNO!')
          break
        }
        case UNO_EVENTS.UNO_CAUGHT: {
          const cid = seatCharacter(evt.catcherSeatIndex)
          if (cid) ui.showBubble(cid, 'Gotcha — that\'s a missed UNO!')
          break
        }
        case UNO_EVENTS.CARD_PLAYED: {
          // Speech bubbles for AI `say` lines are emitted via the `decision` event in
          // ai.js (`ui.showBubble` is triggered there). Nothing to do here — kept as a
          // hook for future spotlight effects.
          break
        }
        case UNO_EVENTS.ROUND_WON: {
          if (!this.matchState) break
          // Record a one-line memory note for every AI character at the table.
          const winnerSeat = this.matchState.seats[evt.seatIndex]
          const winnerName = winnerSeat?.name ?? `Seat ${evt.seatIndex}`
          for (const seat of this.matchState.seats) {
            if (!seat.characterId || seat.isHuman) continue
            const isWinner = seat.id === winnerSeat?.id
            const handLeft = this.matchState.hands[this.matchState.seats.indexOf(seat)].length
            const text = isWinner
              ? `Won round ${this.matchState.roundNumber} of Uno.`
              : `Lost round ${this.matchState.roundNumber} of Uno to ${winnerName} (held ${handLeft} cards).`
            recordHandNote(seat.characterId, { handNumber: this.matchState.roundNumber, text }, { character: getCharacter(seat.characterId) })
              .catch(() => { /* memory failures are non-fatal */ })
          }
          break
        }
      }
    },

    async _runLoop() {
      if (this._loopActive) return
      this._loopActive = true
      try {
        while (
          this.matchState
          && !this.paused
          && !this.matchState.matchComplete
        ) {
          if (this.matchState.roundComplete) {
            const events = advanceMatch(this.matchState)
            this._emitEvents(events)
            if (this.matchState.matchComplete) break
            // Show scorecard and halt until human dismisses.
            this.scorecardPending = true
            break
          }
          const idx = this.matchState.currentSeatIndex
          const seat = this.matchState.seats[idx]
          if (seat.isHuman) {
            this.pendingHumanTurn = true
            break
          }
          await this._runAiTurn(idx)
        }
      } finally {
        this._loopActive = false
      }
    },

    async _runAiTurn(seatIndex) {
      const seat = this.matchState.seats[seatIndex]
      const driver = this.driverFactory(seat.id) || (async (v) => defaultDriver(v))
      const view = getPlayerView(this.matchState, seatIndex)
      let action
      try {
        action = await driver(view, getCharacter(seat.characterId), { degraded: this.degradedMode })
      } catch (e) {
        this.error = e.message
        action = defaultDriver(view)
      }
      try {
        const events = applyAction(this.matchState, seatIndex, action)
        recordChat(this.matchState, seatIndex, action?.say)
        this._emitEvents(events)
      } catch (e) {
        // Driver returned an illegal action despite the legal-action contract — fall back.
        const fallback = defaultDriver(view)
        const events = applyAction(this.matchState, seatIndex, fallback)
        this._emitEvents(events)
      }
      // Animation pause so the human can read the action.
      const sayDelay = (action && action.say) ? this.aiDecisionRevealWithSayMs : this.aiDecisionRevealMs
      await sleep(this.aiThinkPauseMs + sayDelay)
    },
  },
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

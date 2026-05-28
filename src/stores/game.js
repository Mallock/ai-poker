import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { createInitialState, startHand, getHoleCards } from '../engine/state.js'
import { applyAction, legalActions } from '../engine/betting.js'
import { getPlayerView, getHandSummaryView } from '../engine/view.js'
import { defaultBlindSchedule } from '../engine/blindSchedule.js'
import { defaultStudLimitSchedule } from '../engine/limitSchedule.js'
import { createStubDriver } from '../ai/stubDriver.js'
import { createLlmDriver } from '../ai/llmDriver.js'
import { requestWinningQuip } from '../ai/winningQuip.js'
import { getCharacter, pickWinningQuip } from '../ai/characters.js'
import { summarizeHandFor, recordHandNote, resetAll as resetAllMemory } from '../ai/characterMemory.js'
import { useAiStore } from './ai.js'
import { useUiStore } from './ui.js'

const HUMAN_ID = 'human'

export const useGameStore = defineStore('game', {
  state: () => ({
    engineState: null,
    phase: 'setup', // 'setup' | 'playing' | 'tournamentComplete'
    humanId: HUMAN_ID,
    handCompleteShowdownMs: 4200, // pause so the winner panel + revealed cards are readable
    handCompleteFoldAroundMs: 2000, // shorter pause when nobody saw showdown
    winningQuipDelayMs: 600, // delay before the AI winner's quip pops, so the winner panel lands first
    degradedMode: false, // when true, skip LLM calls entirely and use hardcoded fallbacks
    aiThinkPauseMs: 350, // small pause before stub-AI plays for readability
    aiDecisionRevealMs: 700, // pause after AI commits so the user reads the decision in the spotlight
    aiDecisionRevealWithSayMs: 1600, // longer pause when the AI also said something
    streetTransitionMs: 900, // pause after a street advances so new community cards register
    spectatorPaceMultiplier: 2.4, // slow everything down when the human isn't in the hand
    paused: false,
    aiDriverFactory: () => createStubDriver(),
    activeDriver: null,
    memoryAbortCtrl: null,
    error: null,
  }),

  getters: {
    currentPlayerId(state) {
      return state.engineState?.toAct ?? null
    },
    humanLegalActions(state) {
      if (!state.engineState) return {}
      return legalActions(state.engineState, state.humanId)
    },
    isHumanTurn(state) {
      return state.engineState?.toAct === state.humanId
    },
    handComplete(state) {
      return state.engineState?.street === 'handComplete'
    },
    tournamentComplete(state) {
      return state.engineState?.street === 'tournamentComplete' || state.phase === 'tournamentComplete'
    },
    humanInHand(state) {
      const h = state.engineState?.players.find((p) => p.id === state.humanId)
      return !!h && !h.folded && !h.eliminated
    },
  },

  actions: {
    startTournament(config) {
      const seats = [...config.seats]
      const gameType = config.gameType ?? 'holdem'
      const limitStructure = config.limitStructure
        ?? (gameType === 'stud' ? 'fixed-limit' : 'no-limit')
      const blindSchedule = config.blindSchedule
        ?? defaultBlindSchedule(12, config.handsPerLevel ?? 10)
      const limitSchedule = config.limitSchedule
        ?? (gameType === 'stud' ? defaultStudLimitSchedule(12, config.handsPerLevel ?? 10) : null)
      const startingStack = config.startingStack ?? 10000
      const ai = useAiStore()
      ai.init()
      // Fresh game: wipe per-character memory from any prior session.
      this._abortPendingMemoryWork()
      resetAllMemory()
      // Build per-seat driver factory: degraded mode → stub; otherwise LLM driver per character.
      const seatById = new Map(seats.map((s) => [s.id, s]))
      const aiDriverFactory = config.aiDriverFactory ?? ((seatId) => {
        const seat = seatById.get(seatId)
        if (!seat) return createStubDriver()
        if (config.degradedMode || seat.isHuman) return createStubDriver()
        return createLlmDriver(seat.characterId, { eventBus: ai.eventBus() })
      })

      this.engineState = reactive(createInitialState({
        seats,
        startingStack,
        blindSchedule,
        limitSchedule,
        gameType,
        limitStructure,
        rngSeed: config.rngSeed ?? Date.now(),
      }))
      this.aiDriverFactory = aiDriverFactory
      this.humanId = seats.find((s) => s.isHuman)?.id ?? HUMAN_ID
      this.degradedMode = !!config.degradedMode
      this.phase = 'playing'
      this.error = null
      this.startNextHand()
    },

    startNextHand() {
      if (!this.engineState) return
      const ai = useAiStore()
      ai.clearForNewHand()
      startHand(this.engineState)
      if (this.engineState.street === 'tournamentComplete') {
        this.phase = 'tournamentComplete'
        return
      }
      // Drive the turn loop.
      this.advanceTurn()
    },

    submitHumanAction(actionObj) {
      if (!this.engineState) return
      if (this.engineState.toAct !== this.humanId) return
      applyAction(this.engineState, this.humanId, actionObj)
      const say = typeof actionObj?.say === 'string' ? actionObj.say.trim() : ''
      if (say) useUiStore().showBubble(this.humanId, say)
      this.advanceTurn()
    },

    async advanceTurn() {
      if (!this.engineState) return
      // If hand ended, schedule next hand. Pause longer at showdown so the winner panel + revealed cards are readable.
      if (this.engineState.street === 'handComplete') {
        // Fire-and-forget LLM victory quip for each AI winner. We don't await — the bubble
        // pops in whenever the model finishes, ideally inside the post-hand pause below.
        this._dispatchAiWinningQuips()
        // Fire-and-forget per-AI memory summarization. Each AI's note is written into the
        // memory store when its summarizer resolves. We don't block hand transitions on it.
        this._dispatchAiHandMemories()

        const lastAward = [...this.engineState.actionHistory].reverse().find((a) => a.action === 'award')
        const wasShowdown = !!(lastAward && !lastAward.uncontested)
        const pauseMs = wasShowdown ? this.handCompleteShowdownMs : this.handCompleteFoldAroundMs
        await new Promise((r) => setTimeout(r, this.scaledMs(pauseMs)))
        if (this.paused) return
        this.startNextHand()
        return
      }
      if (this.engineState.street === 'tournamentComplete') {
        this.phase = 'tournamentComplete'
        return
      }
      // If it's the human, wait for input — UI will call submitHumanAction.
      if (this.engineState.toAct === this.humanId) return

      // AI turn: build view, ask driver, apply action, recurse.
      const aiId = this.engineState.toAct
      const driver = this.aiDriverFactory(aiId)
      this.activeDriver = driver
      const streetBefore = this.engineState.street
      const communityBefore = this.engineState.communityCards.length
      try {
        const view = getPlayerView(this.engineState, aiId)
        // Small pause so the user can perceive the turn.
        await new Promise((r) => setTimeout(r, this.scaledMs(this.aiThinkPauseMs)))
        if (this.paused) return
        const decision = await driver.decide(view)
        if (this.paused) return
        // Give the user time to see the decision (and any speech bubble) in the spotlight
        // before the turn moves on and the spotlight transitions to the next actor.
        const revealMs = decision?.say ? this.aiDecisionRevealWithSayMs : this.aiDecisionRevealMs
        await new Promise((r) => setTimeout(r, this.scaledMs(revealMs)))
        if (this.paused) return
        // Coerce to a legal action: if the chosen one is illegal, fall back to check/fold.
        const safe = coerceLegal(this.engineState, aiId, decision)
        applyAction(this.engineState, aiId, safe)
      } catch (err) {
        this.error = err.message
        // Fall back to fold so the loop doesn't deadlock.
        try {
          applyAction(this.engineState, aiId, { action: 'fold' })
        } catch { /* nothing more we can do */ }
      } finally {
        this.activeDriver = null
      }
      // Pause after a street advances (or community cards otherwise revealed via cascade)
      // so the user has a chance to read the new board before the next AI moves.
      const communityAfter = this.engineState.communityCards.length
      const streetAfter = this.engineState.street
      if (streetAfter !== streetBefore && streetAfter !== 'tournamentComplete') {
        const cardsRevealed = communityAfter - communityBefore
        const base = this.streetTransitionMs * Math.max(1, cardsRevealed)
        await new Promise((r) => setTimeout(r, this.scaledMs(base)))
        if (this.paused) return
      }
      this.advanceTurn()
    },

    scaledMs(ms) {
      return this.humanInHand ? ms : Math.round(ms * this.spectatorPaceMultiplier)
    },

    // Fire off a per-AI-winner victory quip request. Each request is async and resolves
    // independently — when the LLM returns, we push the result into the UI bubble pipeline.
    // On failure or in degraded mode we fall back to the hardcoded pool in characters.js so
    // the winner always has SOMETHING to say.
    _dispatchAiWinningQuips() {
      const state = this.engineState
      if (!state) return
      const awards = state.actionHistory.filter(
        (a) => a.action === 'award' && a.handNumber === state.handNumber,
      )
      if (awards.length === 0) return
      const ui = useUiStore()
      const announced = new Set()
      for (const a of awards) {
        for (const winnerId of a.winners) {
          if (announced.has(winnerId)) continue
          announced.add(winnerId)
          const winner = state.players.find((pl) => pl.id === winnerId)
          if (!winner || !winner.characterId) continue // skip human + unknown

          const context = {
            uncontested: !!a.uncontested,
            amount: a.potAmount,
            handDescr: a.winningHand?.descr ?? null,
            holeCards: a.uncontested ? null : getHoleCards(winner), // private until showdown
            communityCards: state.communityCards,
            opponents: state.players
              .filter((pl) => pl.id !== winnerId && !pl.eliminated && !pl.folded)
              .map((pl) => pl.name),
          }

          const handNumberAtRequest = state.handNumber
          const characterId = winner.characterId
          const delay = this.winningQuipDelayMs
          const pushQuip = (text) => {
            if (!text) return
            // Drop the quip if a new hand has already started — it would be stale.
            if (!this.engineState || this.engineState.handNumber !== handNumberAtRequest) return
            setTimeout(() => ui.showBubble(characterId, text), delay)
          }

          if (this.degradedMode) {
            pushQuip(pickWinningQuip(characterId))
            continue
          }

          requestWinningQuip(characterId, context)
            .then((quip) => pushQuip(quip ?? pickWinningQuip(characterId)))
            .catch(() => pushQuip(pickWinningQuip(characterId)))
        }
      }
    },

    // Per-AI hand-end summarizer dispatch. Skips the human, skips degraded mode (no LLM in
    // degraded mode means no notes), and runs all summarizers in parallel under a single
    // AbortController so they can be cancelled together on game reset / pause.
    _dispatchAiHandMemories() {
      if (this.degradedMode) return
      const state = this.engineState
      if (!state) return
      const handNumberAtRequest = state.handNumber

      // Eligible: non-human, has a characterId, still in the game.
      const seats = state.players.filter(
        (p) => !p.isHuman && p.characterId && !p.eliminated,
      )
      if (seats.length === 0) return

      // Each hand gets its own controller. The previous hand's pending work is aborted; this
      // shouldn't normally happen since prior summarizers should have settled during the
      // post-hand pause, but it keeps things tidy.
      this._abortPendingMemoryWork()
      const ctrl = new AbortController()
      this.memoryAbortCtrl = ctrl
      const signal = ctrl.signal

      const tasks = seats.map(async (seat) => {
        const character = getCharacter(seat.characterId)
        if (!character) return
        const view = getHandSummaryView(state, seat.id)
        const text = await summarizeHandFor(character, view, { signal })
        if (signal.aborted || !text) return
        // Re-check: if a new game has started in the meantime, drop this note silently.
        if (!this.engineState || this.engineState.handNumber < handNumberAtRequest) return
        await recordHandNote(
          seat.characterId,
          { handNumber: handNumberAtRequest, text },
          { signal, character },
        )
      })

      Promise.allSettled(tasks).finally(() => {
        if (this.memoryAbortCtrl === ctrl) this.memoryAbortCtrl = null
      })
    },

    _abortPendingMemoryWork() {
      if (this.memoryAbortCtrl) {
        try { this.memoryAbortCtrl.abort() } catch { /* ignore */ }
        this.memoryAbortCtrl = null
      }
    },

    pause() {
      this.paused = true
      if (this.activeDriver?.cancel) this.activeDriver.cancel()
    },
    resume() {
      this.paused = false
      this.advanceTurn()
    },
  },
})

function coerceLegal(state, playerId, decision) {
  const la = legalActions(state, playerId)
  const say = typeof decision?.say === 'string' ? decision.say : null
  const withSay = (obj) => (say ? { ...obj, say } : obj)
  switch (decision.action) {
    case 'fold':
      return withSay(la.canFold ? { action: 'fold', amount: 0 } : { action: 'check', amount: 0 })
    case 'check':
      return withSay(la.canCheck ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 })
    case 'call':
      if (la.canCall) return withSay({ action: 'call', amount: la.callAmount })
      if (la.canCheck) return withSay({ action: 'check', amount: 0 })
      return withSay({ action: 'fold', amount: 0 })
    case 'raise': {
      if (!la.canRaise) {
        if (la.canCall) return withSay({ action: 'call', amount: la.callAmount })
        if (la.canCheck) return withSay({ action: 'check', amount: 0 })
        return withSay({ action: 'fold', amount: 0 })
      }
      const amt = Math.max(la.minRaise, Math.min(la.maxRaise, decision.amount || la.minRaise))
      return withSay({ action: 'raise', amount: amt })
    }
    case 'all-in':
      if (la.canAllIn) return withSay({ action: 'all-in', amount: la.allInAmount })
      if (la.canCall) return withSay({ action: 'call', amount: la.callAmount })
      if (la.canCheck) return withSay({ action: 'check', amount: 0 })
      return withSay({ action: 'fold', amount: 0 })
    default:
      return withSay({ action: 'fold', amount: 0 })
  }
}

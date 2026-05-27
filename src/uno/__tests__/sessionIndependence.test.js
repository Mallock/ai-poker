import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUnoGameStore } from '../../stores/unoGame.js'
import { useGameStore } from '../../stores/game.js'

// Light regression: starting an Uno match must not initialize / mutate the poker engine
// state. (Catches accidental cross-imports between the two engines.)
describe('Uno / poker session independence', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starting an Uno match does not touch the poker store', () => {
    const uno = useUnoGameStore()
    const poker = useGameStore()
    expect(poker.engineState).toBeNull()

    uno.aiThinkPauseMs = 0
    uno.aiDecisionRevealMs = 0
    uno.aiDecisionRevealWithSayMs = 0
    uno.startMatch({
      seats: [
        { id: 'human', name: 'You', isHuman: true },
        { id: 'ai1', name: 'AI 1', isHuman: false },
      ],
      totalRounds: 3,
      rngSeed: 1,
      degradedMode: true,
    })

    expect(uno.matchState).toBeTruthy()
    expect(poker.engineState).toBeNull()
    expect(poker.phase).toBe('setup')
  })
})

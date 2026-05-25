import { describe, it, expect } from 'vitest'
import { defaultBlindSchedule, currentBlinds, advanceLevelIfNeeded } from '../blindSchedule.js'

describe('blindSchedule', () => {
  it('default starts at 50/100', () => {
    const sched = defaultBlindSchedule()
    expect(sched[0]).toMatchObject({ level: 1, smallBlind: 50, bigBlind: 100 })
  })

  it('default doubles each level', () => {
    const sched = defaultBlindSchedule()
    expect(sched[1]).toMatchObject({ level: 2, smallBlind: 100, bigBlind: 200 })
    expect(sched[2]).toMatchObject({ level: 3, smallBlind: 200, bigBlind: 400 })
  })

  it('does not advance mid-level', () => {
    const state = {
      blindSchedule: defaultBlindSchedule(),
      blindLevel: 0,
      handsAtCurrentLevel: 5,
    }
    advanceLevelIfNeeded(state)
    expect(state.blindLevel).toBe(0)
    expect(currentBlinds(state).bigBlind).toBe(100)
  })

  it('advances at level boundary', () => {
    const state = {
      blindSchedule: defaultBlindSchedule(),
      blindLevel: 0,
      handsAtCurrentLevel: 10,
    }
    advanceLevelIfNeeded(state)
    expect(state.blindLevel).toBe(1)
    expect(state.handsAtCurrentLevel).toBe(0)
    expect(currentBlinds(state).bigBlind).toBe(200)
  })

  it('caps at last level', () => {
    const sched = defaultBlindSchedule(3)
    const state = { blindSchedule: sched, blindLevel: 2, handsAtCurrentLevel: 50 }
    advanceLevelIfNeeded(state)
    expect(state.blindLevel).toBe(2)
  })
})

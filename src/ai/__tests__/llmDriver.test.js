import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the LLM client so both the decision pass and the table-talk pass are deterministic.
vi.mock('../llmClient.js', () => ({ streamChat: vi.fn() }))

import { streamChat } from '../llmClient.js'
import { createEventBus } from '../eventBus.js'
import { createLlmDriver } from '../llmDriver.js'

// A 2-player hold'em view, minimal but sufficient for buildPrompt. Wade (the-cowboy) is to act.
function makeView() {
  return {
    gameType: 'holdem',
    handNumber: 1,
    street: 'flop',
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    limits: null,
    dealerId: 'p0',
    toAct: 'p1',
    communityCards: ['AS', 'KH', '7D'],
    potTotal: 600,
    currentBet: 0,
    actionHistory: [],
    // A line addressed to Wade by name → the gate always runs the talk pass.
    tableChat: [
      { handNumber: 1, street: 'flop', playerId: 'p0', name: 'Reggie', text: 'Wade, you in or what?' },
    ],
    self: {
      id: 'p1', name: 'Wade', seatIndex: 1, stack: 1000, currentBet: 0,
      totalContributed: 200, folded: false, allIn: false, eliminated: false,
      cards: [{ card: 'JH', visibility: 'private' }, { card: 'TC', visibility: 'private' }],
    },
    opponents: [
      { id: 'p0', name: 'Reggie', seatIndex: 0, stack: 1000, currentBet: 0,
        totalContributed: 200, folded: false, allIn: false, eliminated: false, upCards: [] },
    ],
    legalActions: { canFold: true, canCheck: true, canCall: false, callAmount: 0, canRaise: true, minRaise: 100, maxRaise: 1000, canAllIn: true, allInAmount: 1000 },
  }
}

beforeEach(() => {
  streamChat.mockReset()
})

describe('createLlmDriver — two-pass turn', () => {
  it('sources the spoken line from the table-talk pass (not the decision JSON)', async () => {
    streamChat
      // Decision pass: a legacy `say` here must be ignored.
      .mockImplementationOnce(async function* () { yield '{"action":"check","amount":0,"say":"IGNORED legacy line"}' })
      // Table-talk pass.
      .mockImplementationOnce(async function* () { yield 'Bring it, Reggie.' })

    const bus = createEventBus()
    const events = []
    bus.on((e) => events.push(e))
    const driver = createLlmDriver('the-cowboy', { eventBus: bus })

    const decision = await driver.decide(makeView())
    expect(decision.action).toBe('check')
    expect(decision.say).toBe('Bring it, Reggie.')

    const decisionEvent = events.find((e) => e.type === 'decision')
    expect(decisionEvent.decision.say).toBe('Bring it, Reggie.')
    expect(streamChat).toHaveBeenCalledTimes(2)
  })

  it('applies the action even when the table-talk pass fails (line resolves to null)', async () => {
    streamChat
      .mockImplementationOnce(async function* () { yield '{"action":"raise","amount":300}' })
      .mockImplementationOnce(async function* () { throw new Error('talk boom'); yield '' }) // eslint-disable-line no-unreachable

    const driver = createLlmDriver('the-cowboy', {})
    const decision = await driver.decide(makeView())
    expect(decision.action).toBe('raise')
    expect(decision.amount).toBe(300)
    expect(decision.say).toBe(null)
  })

  it('cancellation aborts the in-flight table-talk call', async () => {
    let driver
    streamChat
      .mockImplementationOnce(async function* () { yield '{"action":"call","amount":0}' })
      .mockImplementationOnce(async function* (opts) {
        // Simulate the user cancelling while the talk pass is in flight.
        driver.cancel()
        if (opts.signal?.aborted) throw new Error('aborted')
        yield 'this line should never be produced'
      })

    driver = createLlmDriver('the-cowboy', {})
    const decision = await driver.decide(makeView())
    expect(decision.action).toBe('call')
    expect(decision.say).toBe(null)
  })

  it('falls back to fold with no talk pass when both decision parses fail', async () => {
    streamChat
      .mockImplementationOnce(async function* () { yield 'not json' })
      .mockImplementationOnce(async function* () { yield 'still not json' })

    const driver = createLlmDriver('the-cowboy', {})
    const decision = await driver.decide(makeView())
    expect(decision).toEqual({ action: 'fold', amount: 0, say: null })
    // Two decision attempts, and NO table-talk call on the fallback path.
    expect(streamChat).toHaveBeenCalledTimes(2)
  })
})

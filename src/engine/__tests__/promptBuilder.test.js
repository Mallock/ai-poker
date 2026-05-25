import { describe, it, expect } from 'vitest'
import { parseActionJson, buildPrompt } from '../../ai/promptBuilder.js'

describe('parseActionJson', () => {
  it('parses a clean object', () => {
    const got = parseActionJson('{"action":"raise","amount":300,"say":"bring it"}')
    expect(got).toEqual({ action: 'raise', amount: 300, say: 'bring it' })
  })

  it('strips markdown fences', () => {
    const got = parseActionJson('```json\n{"action":"check","amount":0,"say":null}\n```')
    expect(got).toEqual({ action: 'check', amount: 0, say: null })
  })

  it('tolerates surrounding whitespace and chatter', () => {
    const got = parseActionJson('Final answer:\n{"action":"fold","amount":0,"say":null}\n')
    expect(got.action).toBe('fold')
  })

  it('coerces missing amount to 0', () => {
    const got = parseActionJson('{"action":"all-in","say":null}')
    expect(got.amount).toBe(0)
  })

  it('coerces non-string say to null', () => {
    const got = parseActionJson('{"action":"check","amount":0,"say":42}')
    expect(got.say).toBe(null)
  })

  it('rejects unknown action', () => {
    expect(() => parseActionJson('{"action":"surrender","amount":0,"say":null}')).toThrow()
  })

  it('rejects malformed JSON', () => {
    expect(() => parseActionJson('not json at all')).toThrow()
  })
})

describe('buildPrompt', () => {
  function makeView() {
    return {
      handNumber: 1, street: 'flop',
      blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
      dealerId: 'p0', toAct: 'p1',
      communityCards: ['AS', 'KH', '7D'],
      pots: [{ amount: 600, eligible: ['p0', 'p1', 'p2'] }],
      potTotal: 600, currentBet: 0, minRaiseIncrement: 100,
      actionHistory: [],
      self: { id: 'p1', name: 'Me', seatIndex: 1, characterId: 'the-cowboy', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 200, folded: false, allIn: false, eliminated: false, holeCards: ['AH', 'AD'] },
      opponents: [
        { id: 'p0', name: 'Op0', seatIndex: 0, characterId: 'the-old-pro', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 200, folded: false, allIn: false, eliminated: false },
      ],
      legalActions: { canFold: true, canCheck: true, canCall: false, callAmount: 0, canRaise: true, minRaise: 100, maxRaise: 1000, canAllIn: true, allInAmount: 1000 },
    }
  }

  const character = { id: 'the-cowboy', name: 'The Cowboy', personality: 'p', playStyle: 's' }

  it('does not include any other-player hole cards in serialized messages', () => {
    const messages = buildPrompt({ view: makeView(), character })
    const json = JSON.stringify(messages)
    expect(json).toContain('AH') // own card
    expect(json).toContain('AD') // own card
    expect(json).not.toMatch(/"holeCards"\s*:/) // opponents shouldn't have any holeCards field
  })

  it('omits the TABLE MEMORY section entirely when memory is empty', () => {
    const messages = buildPrompt({ view: makeView(), character, memory: '' })
    const system = messages[0].content
    expect(system).not.toContain('=== TABLE MEMORY ===')
  })

  it('inserts TABLE MEMORY between YOUR CHARACTER and OUTPUT FORMAT when present', () => {
    const memory = '=== TABLE MEMORY ===\nLasting impressions: Reggie tilts loud.'
    const messages = buildPrompt({ view: makeView(), character, memory })
    const system = messages[0].content
    const charIdx = system.indexOf('=== YOUR CHARACTER ===')
    const memIdx = system.indexOf('=== TABLE MEMORY ===')
    const outIdx = system.indexOf('=== OUTPUT FORMAT ===')
    expect(charIdx).toBeGreaterThanOrEqual(0)
    expect(memIdx).toBeGreaterThan(charIdx)
    expect(outIdx).toBeGreaterThan(memIdx)
    expect(system).toContain('Reggie tilts loud.')
  })

  it('only includes the requesting character\'s memory (never another character\'s)', () => {
    const memoryA = '=== TABLE MEMORY ===\nLasting impressions: Wade is bluffy.'
    const messages = buildPrompt({ view: makeView(), character, memory: memoryA })
    const system = messages[0].content
    expect(system).toContain('Wade is bluffy.')
    // A separate character's memory string is never passed in this call, so it can't leak.
    expect(system).not.toContain('Vera slow-plays')
  })

  it('omits TABLE CHAT section when chat log is empty', () => {
    const messages = buildPrompt({ view: makeView(), character })
    const user = messages[1].content
    expect(user).not.toContain('=== TABLE CHAT')
  })

  it('renders TABLE CHAT with opponent names and own lines marked "You (...)"', () => {
    const view = makeView()
    view.tableChat = [
      { handNumber: 1, street: 'preflop', playerId: 'p0', name: 'Op0', characterId: 'the-old-pro', text: 'Your bet.' },
      { handNumber: 1, street: 'flop', playerId: 'p1', name: 'Me', characterId: 'the-cowboy', text: 'Reckon I will see it.' },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toContain('=== TABLE CHAT')
    expect(user).toContain('Op0: Your bet.')
    expect(user).toContain('You (Me): Reckon I will see it.')
  })

  it('labels UTG/MP/HJ/CO at a 9-handed table (not just BTN/SB/BB)', () => {
    // Build a 9-seat view, dealer at seat 0. Expected positions walking forward from BTN:
    //   0: BTN, 1: SB, 2: BB, 3: UTG, 4: UTG+1, 5: MP, 6: MP+1, 7: HJ, 8: CO
    const self = { id: 'p5', name: 'Me', seatIndex: 5, characterId: 'the-cowboy', isHuman: false, stack: 10000, currentBet: 0, totalContributed: 0, folded: false, allIn: false, eliminated: false, holeCards: ['AS', '2H'] }
    const opponents = [0, 1, 2, 3, 4, 6, 7, 8].map((i) => ({
      id: `p${i}`, name: `Op${i}`, seatIndex: i, characterId: null, isHuman: false,
      stack: 10000, currentBet: 0, totalContributed: 0,
      folded: false, allIn: false, eliminated: false,
    }))
    const view = {
      handNumber: 1, street: 'preflop',
      blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
      dealerId: 'p0', toAct: 'p5',
      communityCards: [], pots: [], potTotal: 150, currentBet: 100, minRaiseIncrement: 100,
      actionHistory: [], self, opponents,
      legalActions: { canFold: true, canCheck: false, canCall: true, callAmount: 100, canRaise: true, minRaise: 200, maxRaise: 10000, canAllIn: true, allInAmount: 10000 },
    }
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    // Seat 0 is BTN, seat 5 is self → expect MP
    expect(user).toContain('Op0 (seat 0) [BTN]')
    expect(user).toContain('Op1 (seat 1) [SB]')
    expect(user).toContain('Op2 (seat 2) [BB]')
    expect(user).toContain('Op3 (seat 3) [UTG]')
    expect(user).toContain('Op4 (seat 4) [UTG+1]')
    expect(user).toContain('Op6 (seat 6) [MP+1]')
    expect(user).toContain('Op7 (seat 7) [HJ]')
    expect(user).toContain('Op8 (seat 8) [CO]')
    expect(user).toContain('position MP')
  })

  it('reports effective stack in big blinds in the YOUR HAND section', () => {
    const view = makeView()
    // self.stack = 1000, opponent stack = 1000, BB=100 → effective ~10bb
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Effective stack vs the smallest live opponent: ~10bb/)
  })

  it('only includes the most recent 12 chat entries', () => {
    const view = makeView()
    view.tableChat = Array.from({ length: 20 }, (_, i) => ({
      handNumber: 1, street: 'preflop', playerId: 'p0', name: 'Op0', characterId: 'the-old-pro',
      text: `line ${i}`,
    }))
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('line 7') // dropped
    expect(user).toContain('line 8')     // 12th from the end
    expect(user).toContain('line 19')    // most recent
  })
})

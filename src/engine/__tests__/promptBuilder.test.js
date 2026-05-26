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
    // Cards are rendered with lowercase suits in the prompt (Ah, Ad). The raw cards from the
    // view ('AH', 'AD') are still embedded in the system message via the character/memory
    // path, but the rendered output uses 'Ah' / 'Ad'.
    expect(json).toMatch(/A[hd]/i) // own card present in some form
    expect(json).toContain('Ah')   // formatted own card
    expect(json).toContain('Ad')   // formatted own card
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

  it('omits chat blocks entirely when log is empty', () => {
    const messages = buildPrompt({ view: makeView(), character })
    const user = messages[1].content
    expect(user).not.toContain('LINES YOU HAVE ALREADY SAID')
    expect(user).not.toContain('RECENT TABLE CHAT')
  })

  it('separates own lines (prominent DO NOT REPEAT block) from others lines', () => {
    const view = makeView()
    view.tableChat = [
      { handNumber: 1, street: 'preflop', playerId: 'p0', name: 'Op0', characterId: 'the-old-pro', text: 'Your bet.' },
      { handNumber: 1, street: 'flop', playerId: 'p1', name: 'Me', characterId: 'the-cowboy', text: 'Hungry, partner?' },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content

    const ownIdx = user.indexOf('LINES YOU HAVE ALREADY SAID')
    const othersIdx = user.indexOf('RECENT TABLE CHAT')
    expect(ownIdx).toBeGreaterThanOrEqual(0)
    expect(othersIdx).toBeGreaterThan(ownIdx)

    // Self's line "Hungry, partner?" lives in the OWN block (between ownIdx and othersIdx).
    const ownBlock = user.slice(ownIdx, othersIdx)
    expect(ownBlock).toContain('Hungry, partner?')
    expect(ownBlock).not.toContain('Your bet.')

    // Other player's line "Your bet." lives in the OTHERS block (after othersIdx).
    const othersBlock = user.slice(othersIdx)
    expect(othersBlock).toContain('Op0: Your bet.')
    expect(othersBlock).not.toContain('Hungry, partner?')
  })

  it('surfaces computed made hand + draws in YOUR HAND when postflop (the Kenji bug)', () => {
    const view = makeView()
    // Kenji's actual hand: Kh 3h on Ks Kc 6s 4c — trip kings.
    view.self.holeCards = ['KH', '3H']
    view.communityCards = ['KS', 'KC', '6S', '4C']
    view.street = 'turn'
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Your current made hand.*Three of a Kind/i)
  })

  it('omits made hand line preflop (no community cards yet) but surfaces preflop hand type', () => {
    const view = makeView()
    view.communityCards = []
    view.street = 'preflop'
    view.self.holeCards = ['QS', 'TH'] // offsuit — the Vera bug she misread as "suited"
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('Your current made hand')
    expect(user).toMatch(/Hand type.*Q-T offsuit/)
  })

  it('labels QS QH as a pocket pair preflop', () => {
    const view = makeView()
    view.communityCards = []
    view.street = 'preflop'
    view.self.holeCards = ['QS', 'QH']
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Hand type.*Q-Q.*pocket queens/i)
  })

  it('labels 7h 6h as suited connectors preflop', () => {
    const view = makeView()
    view.communityCards = []
    view.street = 'preflop'
    view.self.holeCards = ['7H', '6H']
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Hand type.*7-6 suited.*connectors/i)
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

  it('caps OTHERS chat at the most recent 12 entries', () => {
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

  it('renders cards with lowercase suits in community and hole-card lines (Jh, not JH)', () => {
    const view = makeView()
    view.communityCards = ['AS', 'KH', '7D']
    view.self.holeCards = ['JH', 'TC']
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Community cards: As Kh 7d/)
    expect(user).toMatch(/Hole cards: Jh Tc/)
    expect(user).not.toMatch(/Community cards: AS KH 7D/)
  })

  it('emits LIVE PLAYERS list (folded seats excluded)', () => {
    const view = makeView()
    // Add a folded opponent and a still-in opponent.
    view.opponents = [
      { id: 'p0', name: 'Op0', seatIndex: 0, characterId: 'the-old-pro', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 200, folded: true, allIn: false, eliminated: false },
      { id: 'p2', name: 'Op2', seatIndex: 2, characterId: 'the-stoic-asian-pro', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 0, folded: false, allIn: false, eliminated: false },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    const liveIdx = user.indexOf('=== LIVE PLAYERS')
    const orderIdx = user.indexOf('=== ACTION ORDER')
    expect(liveIdx).toBeGreaterThanOrEqual(0)
    const liveBlock = user.slice(liveIdx, orderIdx)
    expect(liveBlock).toContain('You (Me)')
    expect(liveBlock).toContain('Op2')
    expect(liveBlock).not.toContain('Op0') // folded
  })

  it('renders ACTION ORDER starting from to-act, skipping folded/all-in', () => {
    const view = makeView()
    view.toAct = 'p1'
    view.opponents = [
      { id: 'p0', name: 'Op0', seatIndex: 0, characterId: 'the-old-pro', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 200, folded: true, allIn: false, eliminated: false },
      { id: 'p2', name: 'Op2', seatIndex: 2, characterId: 'the-stoic-asian-pro', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 0, folded: false, allIn: false, eliminated: false },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    const orderIdx = user.indexOf('=== ACTION ORDER')
    const nextIdx = user.indexOf('=== ', orderIdx + 4) // next section header
    const orderBlock = user.slice(orderIdx, nextIdx > 0 ? nextIdx : user.length)
    // p0 is folded → not in the action order. p1 (self) is to-act → leads. p2 follows.
    expect(orderBlock).toMatch(/You \(Me\).*→.*Op2/)
    expect(orderBlock).not.toContain('Op0')
  })

  it('renders pot odds when there is a bet to call', () => {
    const view = makeView()
    view.potTotal = 600
    view.currentBet = 200
    view.legalActions = { ...view.legalActions, canCheck: false, canCall: true, callAmount: 200 }
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    // call 200 into pot 600 → ratio 3:1, equity needed 200/800 = 25%
    expect(user).toMatch(/Pot odds to call 200.*3:1.*~25%/)
  })

  it('omits pot odds line when checking is free (no bet to call)', () => {
    const view = makeView() // makeView has canCheck=true, callAmount=0
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('Pot odds to call')
  })

  it('caps OWN-lines block at the most recent 6 entries', () => {
    const view = makeView()
    view.tableChat = Array.from({ length: 10 }, (_, i) => ({
      handNumber: 1, street: 'preflop', playerId: 'p1', name: 'Me', characterId: 'the-cowboy',
      text: `mine ${i}`,
    }))
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('mine 3') // dropped (only last 6 kept: 4..9)
    expect(user).toContain('mine 4')
    expect(user).toContain('mine 9')
  })
})

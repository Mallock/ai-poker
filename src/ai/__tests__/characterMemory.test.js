import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the LLM client BEFORE importing the module under test so the singleton picks up the mock.
vi.mock('../llmClient.js', () => {
  return {
    streamChat: vi.fn(),
  }
})

import { streamChat } from '../llmClient.js'
import {
  memoryState,
  getMemory,
  recordHandNote,
  setLongTerm,
  resetAll,
  formatForPrompt,
  summarizeHandFor,
  MAX_HAND_NOTES,
  MAX_NOTE_CHARS,
} from '../characterMemory.js'

function mockStream(chunks) {
  // streamChat returns an async iterable of string deltas. Build a minimal one.
  streamChat.mockImplementationOnce(async function* () {
    for (const c of chunks) yield c
  })
}

function mockStreamThrows(err = new Error('boom')) {
  streamChat.mockImplementationOnce(async function* () {
    // eslint-disable-next-line no-unused-vars
    if (true) throw err
    yield ''
  })
}

const cowboy = { id: 'the-cowboy', name: 'Wade', archetype: 'The Cowboy', voice: 'drawl' }
const vera = { id: 'the-femme-fatale', name: 'Vera', archetype: 'The Femme Fatale', voice: 'clipped' }

beforeEach(() => {
  resetAll()
  streamChat.mockReset()
})

describe('characterMemory store', () => {
  it('is per-character: writes to A do not appear under B', async () => {
    await recordHandNote('the-cowboy', { handNumber: 1, text: 'Bluffed Reggie off TP.' })
    await recordHandNote('the-femme-fatale', { handNumber: 1, text: 'Slow-played AA against Maxim.' })

    const a = getMemory('the-cowboy')
    const b = getMemory('the-femme-fatale')
    expect(a.handNotes).toHaveLength(1)
    expect(b.handNotes).toHaveLength(1)
    expect(a.handNotes[0].text).toContain('Reggie')
    expect(b.handNotes[0].text).toContain('Maxim')
    expect(a.handNotes[0].text).not.toContain('Maxim')
  })

  it('resetAll() empties every character\'s state', async () => {
    await recordHandNote('the-cowboy', { handNumber: 1, text: 'note' })
    setLongTerm('the-femme-fatale', 'reads')
    expect(getMemory('the-cowboy').handNotes).toHaveLength(1)
    expect(getMemory('the-femme-fatale').longTerm).toBe('reads')

    resetAll()

    expect(getMemory('the-cowboy').handNotes).toHaveLength(0)
    expect(getMemory('the-femme-fatale').longTerm).toBe('')
    expect(Object.keys(memoryState)).toHaveLength(0)
  })

  it('truncates long notes to ~200 characters on store', async () => {
    const longText = 'x'.repeat(500)
    await recordHandNote('the-cowboy', { handNumber: 1, text: longText })
    const stored = getMemory('the-cowboy').handNotes[0].text
    expect(stored.length).toBeLessThanOrEqual(MAX_NOTE_CHARS)
  })

  it('formatForPrompt renders empty string when memory is empty', () => {
    expect(formatForPrompt('the-cowboy')).toBe('')
  })

  it('formatForPrompt includes header, long-term, and hand notes when populated', async () => {
    setLongTerm('the-cowboy', 'Reggie tilts loud.')
    await recordHandNote('the-cowboy', { handNumber: 3, text: '3-bet Vera, she folded.' })

    const block = formatForPrompt('the-cowboy')
    expect(block).toContain('=== TABLE MEMORY ===')
    expect(block).toContain('Reggie tilts loud.')
    expect(block).toContain('Hand 3:')
    expect(block).toContain('3-bet Vera')
  })

  it('rolling window stays at MAX_HAND_NOTES with compaction firing as needed', async () => {
    // Every record beyond the cap triggers one compaction call. Mock 100 compaction responses.
    streamChat.mockImplementation(async function* () {
      yield 'Reggie still tilted, Maxim chasing.'
    })

    for (let i = 1; i <= 20; i++) {
      await recordHandNote('the-cowboy', { handNumber: i, text: `Hand ${i} note.`, character: cowboy }, { character: cowboy })
    }

    const m = getMemory('the-cowboy')
    expect(m.handNotes.length).toBeLessThanOrEqual(MAX_HAND_NOTES)
    // The window should hold the most recent notes (hand numbers 13..20).
    const hands = m.handNotes.map((n) => n.handNumber)
    expect(hands[0]).toBeGreaterThan(1)
    expect(hands[hands.length - 1]).toBe(20)
    // Long-term should have been updated by the compactor.
    expect(m.longTerm.length).toBeGreaterThan(0)
  })
})

describe('summarizeHandFor', () => {
  it('returns a clean string and recordHandNote stores it', async () => {
    mockStream(['Bluffed Reggie off top pair on river.'])
    const view = makeSummaryView()
    const note = await summarizeHandFor(cowboy, view)
    expect(note).toBe('Bluffed Reggie off top pair on river.')

    await recordHandNote('the-cowboy', { handNumber: view.handNumber, text: note }, { character: cowboy })
    expect(getMemory('the-cowboy').handNotes).toHaveLength(1)
  })

  it('returns null on stream error and memory is unchanged', async () => {
    mockStreamThrows()
    const view = makeSummaryView()
    const note = await summarizeHandFor(cowboy, view)
    expect(note).toBeNull()
    expect(getMemory('the-cowboy').handNotes).toHaveLength(0)
  })

  it('strips <think> blocks and quotes from the model output', async () => {
    mockStream(['<think>weighing options</think>', '"Reggie tilted again."'])
    const note = await summarizeHandFor(vera, makeSummaryView())
    expect(note).toBe('Reggie tilted again.')
  })

  it('clamps very long model output to MAX_NOTE_CHARS', async () => {
    mockStream(['y'.repeat(800)])
    const note = await summarizeHandFor(cowboy, makeSummaryView())
    expect(note.length).toBeLessThanOrEqual(MAX_NOTE_CHARS)
  })
})

function makeSummaryView() {
  return {
    gameType: 'holdem',
    handNumber: 4,
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    dealerId: 'p0',
    communityCards: ['AS', 'KH', '7D', '2C', '4S'],
    wentToShowdown: true,
    self: {
      id: 'p1', seatIndex: 1, name: 'Wade', characterId: 'the-cowboy', isHuman: false,
      folded: false, allIn: false, eliminated: false,
      cards: [
        { card: 'AH', visibility: 'private' },
        { card: 'KD', visibility: 'private' },
      ],
    },
    opponents: [
      {
        id: 'p2', seatIndex: 2, name: 'Reggie', characterId: 'the-wild-card', isHuman: false,
        folded: false, allIn: false, eliminated: false,
        cards: [
          { card: 'QH', visibility: 'private' },
          { card: 'JH', visibility: 'private' },
        ],
        upCards: [],
      },
    ],
    actionHistory: [
      { handNumber: 4, street: 'preflop', playerId: 'p1', action: 'raise', amount: 300 },
      { handNumber: 4, street: 'preflop', playerId: 'p2', action: 'call', amount: 200 },
      { handNumber: 4, street: 'showdown', action: 'award', potAmount: 600, winners: ['p1'], winningHand: { name: 'Pair', descr: 'two pair, aces and kings' } },
    ],
    potOutcomes: [{ potAmount: 600, winners: ['p1'], winningHand: { name: 'Pair', descr: 'two pair, aces and kings' }, uncontested: false }],
  }
}

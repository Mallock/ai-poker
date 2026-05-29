import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the LLM client BEFORE importing the module under test.
vi.mock('../llmClient.js', () => ({ streamChat: vi.fn() }))

import { streamChat } from '../llmClient.js'
import {
  requestTableTalk,
  buildTableTalkPrompt,
  shouldSpeak,
  seededRoll,
  mentionsAbsentStreet,
  looksLikeMeta,
} from '../tableTalk.js'
import { cleanLine, normalizeLine, isNearDuplicate } from '../lineClean.js'

function mockStream(chunks) {
  streamChat.mockImplementationOnce(async function* () {
    for (const c of chunks) yield c
  })
}
function mockStreamThrows(err = new Error('boom')) {
  streamChat.mockImplementationOnce(async function* () {
    if (true) throw err
    yield ''
  })
}

beforeEach(() => {
  streamChat.mockReset()
})

describe('cleanLine', () => {
  it('strips <think> blocks, quotes, and extra lines', () => {
    expect(cleanLine('<think>plan</think>\n"Call."')).toBe('Call.')
  })
  it('returns null on empty input', () => {
    expect(cleanLine('')).toBe(null)
    expect(cleanLine('<think>only reasoning</think>')).toBe(null)
  })
  it('clamps to maxLen', () => {
    const long = 'x'.repeat(200)
    const out = cleanLine(long, { maxLen: 20 })
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })
  it('takes the spoken answer after the last <|message|> in harmony/channel output', () => {
    expect(cleanLine('<|channel|>analysis<|message|>plan it<|channel|>final<|message|>Call it.<|end|>')).toBe('Call it.')
  })
  it('drops a bare leaked channel keyword to null', () => {
    expect(cleanLine('<|channel>think')).toBe(null)
  })
  it('strips stray control tokens from an otherwise normal line', () => {
    expect(cleanLine('Bold move, Reggie.<|end|>')).toBe('Bold move, Reggie.')
  })
})

describe('normalizeLine / isNearDuplicate', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeLine('  Bring IT, partner! ')).toBe('bring it partner')
  })
  it('flags exact normalized duplicates', () => {
    expect(isNearDuplicate('Your bet.', ['your bet'])).toBe(true)
  })
  it('flags a longer line that contains a non-trivial prior line', () => {
    expect(isNearDuplicate("Well, let's see what you got partner", ["let's see what you got"])).toBe(true)
  })
  it('does not flag a fresh line', () => {
    expect(isNearDuplicate('Bold move, Reggie.', ['Your bet.', 'I fold.'])).toBe(false)
  })
})

describe('buildTableTalkPrompt', () => {
  const cowboy = { id: 'the-cowboy', name: 'Wade', archetype: 'The Cowboy', voice: 'drawl', chattinessBase: 0.6 }

  it('includes the chosen action and recent chat, but NOT the poker strategy section', () => {
    const [, user] = buildTableTalkPrompt(cowboy, {
      action: 'raise', amount: 600, street: 'flop', board: 'King of Hearts',
      recentChat: [{ name: 'Reggie', text: 'You bluffing again?' }],
      ownRecentLines: ['Howdy.'],
    })
    expect(user.content).toContain('raised to 600')
    expect(user.content).toContain('Reggie: You bluffing again?')
    expect(user.content).toContain('Lines you already said')
    expect(user.content).toContain('Howdy.')
    // The strategy section never leaks into the talk prompt.
    const joined = buildTableTalkPrompt(cowboy, { action: 'raise', amount: 600 }).map((m) => m.content).join('\n')
    expect(joined).not.toContain('PREFLOP FUNDAMENTALS')
    expect(joined).not.toContain('Opening ranges')
  })

  it('flags a directly addressed remark', () => {
    const [, user] = buildTableTalkPrompt(cowboy, { action: 'call', addressedBy: 'Reggie' })
    expect(user.content).toContain('Reggie just spoke to you directly')
  })

  it('carries the never-reveal hard rule into the system message', () => {
    const [system] = buildTableTalkPrompt(cowboy, { action: 'all-in', amount: 5000 })
    expect(system.content).toContain('NEVER reveal your hand')
  })
})

describe('requestTableTalk', () => {
  const charId = 'the-cowboy'

  it('returns a cleaned line conditioned on the action', async () => {
    mockStream(['<think>x</think>', '"Reckon I\'ll lean on ya, partner."'])
    const line = await requestTableTalk(charId, { action: 'raise', amount: 300 })
    expect(line).toBe("Reckon I'll lean on ya, partner.")
  })

  it('returns null on stream failure / abort', async () => {
    mockStreamThrows()
    const line = await requestTableTalk(charId, { action: 'check' })
    expect(line).toBe(null)
  })

  it('suppresses a near-duplicate of an own recent line', async () => {
    mockStream(['Your bet.'])
    const line = await requestTableTalk(charId, { action: 'check', ownRecentLines: ['your bet'] })
    expect(line).toBe(null)
  })

  it('returns null for an unknown character', async () => {
    const line = await requestTableTalk('nobody', { action: 'fold' })
    expect(line).toBe(null)
    expect(streamChat).not.toHaveBeenCalled()
  })

  it('suppresses a preflop line that invents the river', async () => {
    mockStream(['Reckon that river is gonna be rough.'])
    const line = await requestTableTalk(charId, { action: 'raise', amount: 250, street: 'preflop' })
    expect(line).toBe(null)
  })

  it('allows a river mention on the river', async () => {
    mockStream(['That river was a kick in the teeth.'])
    const line = await requestTableTalk(charId, { action: 'call', street: 'river' })
    expect(line).toBe('That river was a kick in the teeth.')
  })
})

describe('looksLikeMeta', () => {
  const wade = { name: 'Wade' }
  it('flags leaked planning / meta lines', () => {
    expect(looksLikeMeta('The user wants me to respond as Wade, the cowboy.', wade)).toBe(true)
    expect(looksLikeMeta('I need to react to Reggie here.', wade)).toBe(true)
    expect(looksLikeMeta('Let me craft a dry one-liner.', wade)).toBe(true)
  })
  it('flags third-person self-narration', () => {
    expect(looksLikeMeta('Wade needs to respond to the needle.', wade)).toBe(true)
    expect(looksLikeMeta('Wade just called 250 on the flop.', wade)).toBe(true)
  })
  it('passes a normal in-character spoken line', () => {
    expect(looksLikeMeta("Reckon I'll lean on ya, partner.", wade)).toBe(false)
    expect(looksLikeMeta('Bold move, Reggie.', wade)).toBe(false)
  })
})

describe('mentionsAbsentStreet', () => {
  it('flags flop/river preflop', () => {
    expect(mentionsAbsentStreet('Nice river there.', 'preflop')).toBe(true)
    expect(mentionsAbsentStreet('Big flop coming.', 'preflop')).toBe(true)
    expect(mentionsAbsentStreet('Nice river there.', undefined)).toBe(true)
  })
  it('does NOT guard once a board exists (postflop river mentions allowed)', () => {
    expect(mentionsAbsentStreet('That river though.', 'flop')).toBe(false)
    expect(mentionsAbsentStreet('That river was brutal.', 'river')).toBe(false)
  })
  it('does not ban the common word "turn"', () => {
    expect(mentionsAbsentStreet('Your turn, partner.', 'preflop')).toBe(false)
  })
})

describe('shouldSpeak gate', () => {
  const quiet = { chattinessBase: 0.2 }
  const chatty = { chattinessBase: 0.9 }

  it('always speaks when directly addressed', () => {
    expect(shouldSpeak(quiet, { addressed: true, roll: 0.99 })).toBe(true)
  })
  it('stays silent for a quiet character on a high roll', () => {
    expect(shouldSpeak(quiet, { addressed: false, roll: 0.5 })).toBe(false)
  })
  it('speaks for a chatty character on a mid roll', () => {
    expect(shouldSpeak(chatty, { addressed: false, roll: 0.5 })).toBe(true)
  })
  it('defaults missing chattiness to 0.5', () => {
    expect(shouldSpeak({}, { roll: 0.4 })).toBe(true)
    expect(shouldSpeak({}, { roll: 0.6 })).toBe(false)
  })
})

describe('seededRoll', () => {
  it('is deterministic for the same seed and in [0,1)', () => {
    const a = seededRoll('the-cowboy|3|flop|raise')
    const b = seededRoll('the-cowboy|3|flop|raise')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })
  it('varies across seeds', () => {
    expect(seededRoll('a|1|flop|call')).not.toBe(seededRoll('a|2|flop|call'))
  })
})

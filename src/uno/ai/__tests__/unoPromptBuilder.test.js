import { describe, it, expect } from 'vitest'
import {
  buildUnoSystemMessage,
  buildUnoUserMessage,
  parseUnoActionJson,
} from '../unoPromptBuilder.js'
import { getCharacter } from '../../../ai/characters.js'
import { createInitialState, startRound } from '../../engine/state.js'
import { getPlayerView } from '../../engine/view.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0,
    characterId: i === 1 ? 'the-cowboy' : (i === 2 ? 'the-femme-fatale' : null),
  }))
}

describe('buildUnoSystemMessage', () => {
  it('includes the rules block, strategy block, persona, and JSON schema', () => {
    const wade = { ...getCharacter('the-cowboy'), playStyle: { ...getCharacter('the-cowboy').playStyle, uno: 'leads with high numerics' } }
    const sys = buildUnoSystemMessage(wade)
    expect(sys).toMatch(/108-card deck/i)
    expect(sys).toMatch(/Shed high-value cards first/i)
    expect(sys).toMatch(/Name: Wade/)
    expect(sys).toMatch(/leads with high numerics/)
    expect(sys).toMatch(/OUTPUT FORMAT/)
    expect(sys).toMatch(/"action"/)
  })

  it('is byte-equal across two builds for the same character (cache stability)', () => {
    const wade = { ...getCharacter('the-cowboy'), playStyle: { ...getCharacter('the-cowboy').playStyle, uno: 'leads with high numerics' } }
    const a = buildUnoSystemMessage(wade)
    const b = buildUnoSystemMessage(wade)
    expect(a).toBe(b)
  })
})

describe('buildUnoUserMessage', () => {
  it('contains all required state fields', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    startRound(s)
    const view = getPlayerView(s, s.currentSeatIndex)
    const msg = buildUnoUserMessage(view)
    expect(msg).toMatch(/TABLE STATE/)
    expect(msg).toMatch(/Round \d+ of 7/)
    expect(msg).toMatch(/Direction of play/)
    expect(msg).toMatch(/Discard top/)
    expect(msg).toMatch(/Active color/)
    expect(msg).toMatch(/YOUR HAND/)
    expect(msg).toMatch(/OPPONENTS/)
    expect(msg).toMatch(/YOUR LEGAL ACTIONS/)
    expect(msg).toMatch(/Respond with ONE JSON object/)
  })
})

describe('parseUnoActionJson', () => {
  it('parses a valid play', () => {
    const o = parseUnoActionJson('{"action":"play","cardIndex":3,"say":"Well alright then."}')
    expect(o.action).toBe('play')
    expect(o.cardIndex).toBe(3)
    expect(o.say).toBe('Well alright then.')
  })

  it('parses a Wild play with color', () => {
    const o = parseUnoActionJson('{"action":"play","cardIndex":2,"wildColor":"green"}')
    expect(o.wildColor).toBe('green')
  })

  it('extracts JSON from a <think> wrapped reply', () => {
    const raw = '<think>I will play the red 5</think>\n{"action":"play","cardIndex":0}'
    const o = parseUnoActionJson(raw)
    expect(o.action).toBe('play')
  })

  it('throws on garbage', () => {
    expect(() => parseUnoActionJson('not json at all')).toThrow()
  })
})

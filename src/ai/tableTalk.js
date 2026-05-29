import { streamChat } from './llmClient.js'
import { getCharacter, chattinessDescriptor } from './characters.js'
import { cleanLine, isNearDuplicate } from './lineClean.js'

// Dedicated, second-pass table-talk generation. Decoupled from the action decision so the
// spoken line gets a focused prompt (voice + this moment) instead of being squeezed out of
// the poker-reasoning JSON. Mirrors winningQuip.js: own compact prompt, hotter temperature,
// shared cleaner. Returns the cleaned line, or null on any failure / abort — callers must
// always be prepared to stay silent.
//
// context shape:
//   { action, amount, street, board, potTotal, recentChat:[{name,text}], ownRecentLines:[str], addressedBy }
export async function requestTableTalk(characterId, context, { signal, model, temperature = 0.95, maxTokens = 512 } = {}) {
  const character = getCharacter(characterId)
  if (!character) return null

  const messages = buildTableTalkPrompt(character, context)
  let raw = ''
  try {
    const deltas = streamChat({
      messages,
      signal,
      model,
      temperature,
      // A reasoning model burns the budget inside <think> first; leave room for the line after.
      max_tokens: maxTokens,
    })
    for await (const delta of deltas) raw += delta
  } catch {
    return null
  }

  const line = cleanLine(raw, { maxLen: 120 })
  if (!line) return null
  // Code-level anti-repetition backstop: the prompt asks for novelty and the model still
  // recycles lines. Drop a near-duplicate of something this character recently said AND of
  // its own voice samples / catchphrases — weak models parrot the sample lines verbatim
  // (e.g. echoing a "river" catchphrase preflop), which the prompt alone does not prevent.
  const avoid = [...(context?.ownRecentLines ?? []), ...sampleLinesOf(character)]
  if (isNearDuplicate(line, avoid)) return null
  // Street-accuracy guard: a line must not name a community-card street that hasn't happened
  // yet. River-heavy personas (e.g. the cowboy's weather metaphors) drag a weak model into
  // saying "river" preflop; better silent than confusingly wrong. Guards the poker-specific
  // words "flop"/"river" only — "turn" is too common in ordinary speech to ban safely.
  if (mentionsAbsentStreet(line, context?.street)) return null
  // Meta/analysis guard: weak models often dump their reasoning as the answer with no <think>
  // tags ("The user wants me to respond as Wade…", "Wade needs to react to Reggie…"). That is
  // narration, not a spoken line — drop it to silence rather than leak it onto the table.
  if (looksLikeMeta(line, character)) return null
  return line
}

// Heuristic: does `line` read like leaked reasoning/narration rather than a spoken line?
export function looksLikeMeta(line, character) {
  if (typeof line !== 'string') return false
  // Planning / meta vocabulary that a real table line never contains.
  if (/\b(the user|the assistant|in[- ]character|respond as|my response|i (need|should|must|have) to|i'?ll respond|let me (think|craft|respond))\b/i.test(line)) {
    return true
  }
  // Third-person self-narration: the character talking ABOUT themselves by name.
  const name = character?.name
  if (name) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s+(needs?|should|must|wants?|has to|is going to|will|just)\\b`, 'i')
    if (re.test(line)) return true
  }
  return false
}

// True if a PREFLOP line names a community-card street ("flop"/"river") that does not exist
// yet — the reported failure (a weather-metaphor cowboy musing about "the river" before any
// board is dealt). Scoped to preflop on purpose: postflop, "river" is usually metaphor or
// anticipation ("the river's coming"), and banning it on every street muted river-heavy
// personas entirely. "turn" is never guarded — too common in ordinary speech.
export function mentionsAbsentStreet(line, street) {
  if (street && street !== 'preflop') return false
  return /\b(flop|river)\b/i.test(line)
}

// The literal sample lines baked into a character's voice/catchphrases — these are TONE
// samples, never lines to emit verbatim, so we treat an echo of one as a repeat.
function sampleLinesOf(character) {
  const out = []
  for (const c of character?.catchphrases ?? []) out.push(c)
  if (typeof character?.voice === 'string') {
    const quoted = character.voice.match(/["“”']([^"“”']{4,})["“”']/g)
    if (quoted) out.push(...quoted)
  }
  return out
}

export function buildTableTalkPrompt(character, context = {}) {
  const archetype = character.archetype ? `, "${character.archetype}"` : ''
  const sys = [
    `You are ${character.name}${archetype}, a player at a live poker table. You are speaking out loud at the table — banter, needle, react. This is ONLY about what you SAY, not how you play.`,
  ]
  if (character.personality) sys.push(`Personality: ${character.personality}`)
  if (character.voice) sys.push(`Voice: ${character.voice}`)
  if (character.tells) sys.push(`Your tells (NEVER narrate these — just let them color how much you talk): ${character.tells}`)
  if (character.tiltProfile) sys.push(`How you react to losing: ${character.tiltProfile}`)
  if (character.rivalries) sys.push(`Relationships at the table: ${character.rivalries}`)
  if (character.catchphrases?.length) {
    sys.push(`Voice samples for rhythm and register (NOT a menu — never echo them verbatim): ${character.catchphrases.join(' | ')}`)
  }
  if (typeof character.chattinessBase === 'number') {
    sys.push(`Chattiness: ${chattinessDescriptor(character.chattinessBase)}.`)
  }
  sys.push(
    '',
    'Reply with ONE short, punchy beat of in-character table talk (under 100 characters) that fits THIS exact moment — the action you just took, the board, and what others just said. Prefer answering a player by name when they spoke to you. If you are a quiet character, MAKE THE RARE LINE LAND: lead with a clipped word or a dry needle ("Different." / "Why now, Reggie?" / "Mm."). A brief gesture in parentheses is an OCCASIONAL option, not your default — never fall back on the same nod twice.',
    'HARD RULES:',
    '- Output ONLY what you do at the table: a spoken line, OR — sparingly — a SHORT physical gesture in parentheses like "(a slow nod)" or "(a dry chuckle)" when silence-with-a-tell beats words. Nothing else — no longer narration, no JSON, no markdown, no surrounding quotes.',
    '- You MAY reason inside <think>...</think> first, but everything after </think> must be just the line.',
    '- NEVER reveal your hand, your read, your equity, or your strategy. No "I have top pair", "I\'m bluffing", "I\'m pot committed", "I have the nuts/nothing". Emotion is fine; specifics are not.',
    '- Talk ONLY about what has actually happened so far. Do NOT mention or invent a flop, turn, river, or any board cards that have not been dealt yet — read the "Where the hand is" line below and respect it exactly.',
    '- Do NOT repeat or paraphrase anything in "Lines you already said", and do NOT recite your voice samples / catchphrases verbatim. Find a fresh angle every time.',
    '- Stay in character. Never mention you are an AI, a model, or a prompt.',
  )

  const user = []
  user.push(`The action you just took this turn: ${describeAction(context)}.`)
  user.push(boardAwareness(context))
  if (typeof context.potTotal === 'number') user.push(`Pot: ${context.potTotal}.`)
  if (context.addressedBy) {
    user.push(`${context.addressedBy} just spoke to you directly — answer them by name.`)
  }
  if (context.recentChat?.length) {
    user.push('', 'Recent table chat (everyone heard these):')
    for (const c of context.recentChat) user.push(`  - ${c.name}: ${c.text}`)
  }
  if (context.ownRecentLines?.length) {
    user.push('', 'Lines you already said (DO NOT repeat or paraphrase any of these):')
    for (const t of context.ownRecentLines) user.push(`  - "${t}"`)
  }
  user.push('', 'Your line:')

  return [
    { role: 'system', content: sys.join('\n') },
    { role: 'user', content: user.join('\n') },
  ]
}

// One unambiguous line about where the hand is, so a weak model cannot invent later streets.
// Preflop: say there is no board at all. Postflop: name the street, the exact board, and the
// streets still to come, so it doesn't reference cards that aren't out.
function boardAwareness(context) {
  const street = context.street || 'preflop'
  if (street === 'preflop' || !context.board) {
    return 'Where the hand is: PREFLOP — no community cards have been dealt. There is NO flop and NO river yet. Do NOT use the words "flop" or "river" at all, not even as a weather or water metaphor — mentioning a river now makes you look confused.'
  }
  const remaining = {
    flop: 'The turn and river are still to come — do NOT mention the "river" yet.',
    turn: 'The river is still to come — do NOT mention the "river" yet.',
    river: 'This is the final street.',
  }[street] ?? ''
  return `Where the hand is: ${street.toUpperCase()}. The only community cards on the table are: ${context.board}. ${remaining}`.trim()
}

function describeAction(context) {
  const { action, amount } = context
  switch (action) {
    case 'fold': return 'you folded'
    case 'check': return 'you checked'
    case 'call': return amount ? `you called ${amount}` : 'you called'
    case 'raise': return amount ? `you raised to ${amount}` : 'you raised'
    case 'all-in': return amount ? `you moved all-in for ${amount}` : 'you moved all-in'
    default: return action ? `you chose ${action}` : 'it is your turn'
  }
}

// --- Gating ----------------------------------------------------------------
// Decide whether to even make the table-talk call. A directly addressed remark always speaks;
// otherwise roll against the character's chattiness. `roll` is a 0..1 value — pass a seeded
// value (see seededRoll) for reproducibility under the harness; omit for live Math.random.
export function shouldSpeak(character, { addressed = false, roll } = {}) {
  if (addressed) return true
  const base = typeof character?.chattinessBase === 'number' ? character.chattinessBase : 0.5
  const r = typeof roll === 'number' ? roll : Math.random()
  return r < base
}

// Deterministic 0..1 value derived from a seed string (mulberry32 over a cheap string hash),
// so the gate is reproducible per turn / under the harness while still varying turn-to-turn.
export function seededRoll(seed) {
  let h = 1779033703 ^ String(seed).length
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let t = (h ^= h >>> 16) >>> 0
  t = (t + 0x6d2b79f5) | 0
  let x = Math.imul(t ^ (t >>> 15), 1 | t)
  x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}

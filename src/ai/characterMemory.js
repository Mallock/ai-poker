import { reactive } from 'vue'
import { streamChat } from './llmClient.js'
import { getCharacter } from './characters.js'

// Per-character session memory.
//
// Each character's state is { handNotes: [{handNumber, text}], longTerm: '' }.
// - handNotes is a rolling FIFO list capped at MAX_HAND_NOTES; when it overflows, the oldest
//   note is folded into `longTerm` via a compaction LLM call.
// - longTerm is a short prose string that distills observations dropped out of the window.
//
// Memory lives only for the current game session. resetAll() wipes everything on new-game.
//
// The store is exported as `memoryState` (a Vue reactive object). The Research Panel reads it
// directly; pure AI code uses the functional API (getMemory, recordHandNote, ...).

export const MAX_HAND_NOTES = 8
export const MAX_NOTE_CHARS = 200
export const MAX_LONG_TERM_CHARS = 600

// reactive map keyed by characterId -> MemoryState
export const memoryState = reactive({})

function emptyState() {
  return { handNotes: [], longTerm: '' }
}

function ensure(characterId) {
  if (!memoryState[characterId]) memoryState[characterId] = emptyState()
  return memoryState[characterId]
}

function clampText(text, max) {
  if (typeof text !== 'string') return ''
  const t = text.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + '…'
}

export function getMemory(characterId) {
  return memoryState[characterId] ?? emptyState()
}

export function setLongTerm(characterId, text) {
  const m = ensure(characterId)
  m.longTerm = clampText(text, MAX_LONG_TERM_CHARS)
}

// Append a hand note. If the window would overflow, compacts the oldest note into long-term
// (via an LLM call) before dropping it. The compaction is awaited so memory is consistent.
export async function recordHandNote(characterId, note, { signal, character } = {}) {
  const m = ensure(characterId)
  const entry = {
    handNumber: typeof note.handNumber === 'number' ? note.handNumber : null,
    text: clampText(note.text ?? '', MAX_NOTE_CHARS),
  }
  if (!entry.text) return

  if (m.handNotes.length >= MAX_HAND_NOTES) {
    const oldest = m.handNotes[0]
    const persona = character ?? getCharacter(characterId)
    try {
      const newLongTerm = await compactLongTerm(persona, m.longTerm, oldest, { signal })
      if (typeof newLongTerm === 'string' && newLongTerm.length > 0) {
        m.longTerm = clampText(newLongTerm, MAX_LONG_TERM_CHARS)
      }
    } catch {
      // Compaction failure: keep the previous longTerm. The oldest note is still dropped so
      // the window stays bounded.
    }
    m.handNotes.shift()
  }
  m.handNotes.push(entry)
}

// Wipe all memory. Called on new-game / game-reset.
export function resetAll() {
  for (const id of Object.keys(memoryState)) {
    delete memoryState[id]
  }
}

// Build the `=== TABLE MEMORY ===` block for the prompt. Returns an empty string when memory is
// empty (caller should omit the section entirely in that case).
export function formatForPrompt(characterId) {
  const m = memoryState[characterId]
  if (!m) return ''
  const hasNotes = m.handNotes.length > 0
  const hasLongTerm = !!m.longTerm
  if (!hasNotes && !hasLongTerm) return ''

  const lines = ['=== TABLE MEMORY ===',
    'What you remember from earlier in this session at this table. Use this to react in character — call back to specific hands, hold grudges, exploit reads. Do NOT invent cards or facts not listed here.',
    '']
  if (hasLongTerm) {
    lines.push(`Lasting impressions: ${m.longTerm}`)
    lines.push('')
  }
  if (hasNotes) {
    lines.push('Recent hand notes:')
    for (const n of m.handNotes) {
      const prefix = n.handNumber != null ? `Hand ${n.handNumber}: ` : '- '
      lines.push(`- ${prefix}${n.text}`)
    }
  }
  return lines.join('\n')
}

// --- Summarizer & compaction (LLM calls) -----------------------------------

// Produce one short in-voice hand note for `character` from their own post-hand view.
// Returns the cleaned note string on success, or null on any failure/abort.
export async function summarizeHandFor(character, handSummaryView, { signal } = {}) {
  if (!character || !handSummaryView) return null
  const messages = buildSummarizerPrompt(character, handSummaryView)
  let raw = ''
  try {
    const deltas = streamChat({
      messages,
      signal,
      temperature: 0.8,
      // Reasoning models spend tokens inside <think> before the answer; a tight cap leaves no
      // room for the actual sentence, yielding an empty note. Give think + one sentence room.
      max_tokens: 1024,
    })
    for await (const delta of deltas) raw += delta
  } catch {
    return null
  }
  const cleaned = cleanSummarizerOutput(raw)
  if (!cleaned) return null
  return clampText(cleaned, MAX_NOTE_CHARS)
}

// Rewrite the long-term impressions string given the previous long-term plus the oldest hand
// note about to be dropped. Returns the new long-term string, or the previous one on failure.
export async function compactLongTerm(character, oldLongTerm, droppedNote, { signal } = {}) {
  if (!character) return oldLongTerm ?? ''
  const messages = buildCompactionPrompt(character, oldLongTerm, droppedNote)
  let raw = ''
  try {
    const deltas = streamChat({
      messages,
      signal,
      temperature: 0.5,
      // Headroom for a reasoning model's <think> block plus the short impressions text.
      max_tokens: 1024,
    })
    for await (const delta of deltas) raw += delta
  } catch {
    return oldLongTerm ?? ''
  }
  const cleaned = cleanSummarizerOutput(raw)
  if (!cleaned) return oldLongTerm ?? ''
  return clampText(cleaned, MAX_LONG_TERM_CHARS)
}

// --- Prompt builders -------------------------------------------------------

function buildSummarizerPrompt(character, view) {
  const sysLines = [
    `You are ${character.name}${character.archetype ? `, "${character.archetype}"` : ''}, a player at a Texas Hold'em table.`,
  ]
  if (character.personality) sysLines.push(`Personality: ${character.personality}`)
  if (character.voice) sysLines.push(`Voice: ${character.voice}`)
  if (character.rivalries) sysLines.push(`Relationships at the table: ${character.rivalries}`)
  sysLines.push(
    '',
    "A hand just ended. Write ONE short sentence (max ~30 words) in your own voice describing what you'd remember about that hand for future hands — a read on an opponent, a notable line, a tilt note, a grudge. Use the opponent names in the input.",
    'Rules:',
    '- Output ONLY the sentence. No JSON, no markdown, no quotes, no narration.',
    '- This is a trivial one-line task: answer directly. You do NOT need a <think> block — skip it or keep it to a few words. Everything after </think> (if you use one) must be just the sentence.',
    "- Do NOT invent facts, cards, or actions that are not in the input. If an opponent's cards are not listed, you did not see them.",
    "- If nothing memorable happened (e.g. you folded preflop), write a short throwaway line like \"Folded ${formatHole(view)} preflop, no read.\"",
  )

  const userLines = [`Hand #${view.handNumber}.`]
  userLines.push(`Your hole cards: ${formatHole(view)}`)
  if (view.communityCards.length > 0) {
    userLines.push(`Board: ${view.communityCards.join(' ')}`)
  } else {
    userLines.push('Board: (preflop only — no flop seen)')
  }
  userLines.push(`You ${view.self.folded ? 'folded' : (view.self.eliminated ? 'were eliminated' : 'were in at the end')}.`)
  if (view.actionHistory.length > 0) {
    userLines.push('', 'Action history (this hand):')
    for (const a of view.actionHistory) {
      const who = nameOf(view, a.playerId) ?? '(table)'
      if (a.action === 'award') {
        const winners = (a.winners ?? []).map((id) => nameOf(view, id) ?? id).join(', ')
        const handDescr = a.winningHand?.descr ? ` with ${a.winningHand.descr}` : (a.uncontested ? ' (uncontested)' : '')
        userLines.push(`  - [${a.street}] award ${a.potAmount} to ${winners}${handDescr}`)
      } else {
        const amt = a.amount ? ` ${a.amount}` : ''
        userLines.push(`  - [${a.street}] ${who}: ${a.action}${amt}`)
      }
    }
  }
  const revealed = view.opponents.filter((o) => Array.isArray(o.cards) || Array.isArray(o.holeCards))
  if (revealed.length > 0) {
    userLines.push('', 'Showdown reveals:')
    for (const o of revealed) {
      const cards = Array.isArray(o.cards)
        ? o.cards.map((c) => c.card)
        : (o.holeCards ?? [])
      userLines.push(`  - ${o.name}: ${cards.join(' ')}`)
    }
  }

  userLines.push('', 'Your one-sentence memory:')
  return [
    { role: 'system', content: sysLines.join('\n') },
    { role: 'user', content: userLines.join('\n') },
  ]
}

function buildCompactionPrompt(character, oldLongTerm, droppedNote) {
  const sysLines = [
    `You are ${character.name}${character.archetype ? `, "${character.archetype}"` : ''}, a player at a Texas Hold'em table.`,
  ]
  if (character.voice) sysLines.push(`Voice: ${character.voice}`)
  sysLines.push(
    '',
    'Your memory of this session is being compacted. You will receive (a) your existing lasting impressions of the table and (b) the oldest specific hand note that is about to be forgotten.',
    'Rewrite the lasting impressions in 1–2 short sentences (max ~60 words), keeping what is most useful for future hands: reads on opponents, rivalries, tilt status, recurring patterns. Drop trivia.',
    'Rules:',
    '- Output ONLY the new lasting-impressions text. No JSON, no markdown, no quotes, no narration.',
    '- You MAY reason inside <think>...</think> first; everything after </think> must be just the impressions text.',
    '- Do NOT invent facts beyond what the inputs say.',
  )
  const userLines = []
  userLines.push(`Existing lasting impressions: ${oldLongTerm ? oldLongTerm : '(none yet)'}`)
  userLines.push(`Oldest hand note (about to be forgotten): ${droppedNote.text}`)
  userLines.push('', 'Your new lasting impressions:')
  return [
    { role: 'system', content: sysLines.join('\n') },
    { role: 'user', content: userLines.join('\n') },
  ]
}

// --- Helpers ---------------------------------------------------------------

function formatHole(view) {
  if (Array.isArray(view?.self?.cards) && view.self.cards.length > 0) {
    return view.self.cards.map((c) => c.card).join(' ')
  }
  if (Array.isArray(view?.self?.holeCards) && view.self.holeCards.length > 0) {
    return view.self.holeCards.join(' ')
  }
  return '(unknown)'
}

function nameOf(view, id) {
  if (!id) return null
  if (view.self.id === id) return 'You'
  const opp = view.opponents.find((o) => o.id === id)
  return opp ? opp.name : null
}

function cleanSummarizerOutput(raw) {
  if (!raw) return null
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const lastClose = text.lastIndexOf('</think>')
  if (lastClose >= 0) text = text.slice(lastClose + '</think>'.length).trim()
  text = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0).join(' ')
  text = text.replace(/^[`'"‘’“”«»]+/, '').replace(/[`'"‘’“”«»]+$/, '').trim()
  return text || null
}

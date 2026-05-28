import { streamChat } from './llmClient.js'
import { getCharacter, chattinessDescriptor } from './characters.js'

// Request a single in-character victory line from the LLM. The model sees the character
// voice + a compact summary of how the hand ended, and returns one short line of table talk.
// Returns the cleaned quip text on success, or null on any failure / abort — callers should
// always be prepared to fall back (e.g. to the hardcoded pool in characters.js).
//
// context shape: { uncontested, amount, handDescr, holeCards, communityCards, opponents }
export async function requestWinningQuip(characterId, context, { signal, model } = {}) {
  const character = getCharacter(characterId)
  if (!character) return null

  const messages = buildQuipPrompt(character, context)
  let raw = ''
  try {
    const deltas = streamChat({
      messages,
      signal,
      model,
      temperature: 0.95,
      // A reasoning model burns the budget inside <think> first; leave room for the quip after.
      max_tokens: 1024,
    })
    for await (const delta of deltas) raw += delta
  } catch {
    return null
  }

  return cleanQuip(raw)
}

function buildQuipPrompt(character, context) {
  const sysLines = [
    `You are ${character.name}${character.archetype ? `, "${character.archetype}"` : ''}, a player at a Texas Hold'em table.`,
  ]
  if (character.personality) sysLines.push(`Personality: ${character.personality}`)
  if (character.voice) sysLines.push(`Voice: ${character.voice}`)
  if (character.tiltProfile) sysLines.push(`How you react to wins/losses: ${character.tiltProfile}`)
  if (character.rivalries) sysLines.push(`Relationships at the table: ${character.rivalries}`)
  if (character.catchphrases?.length) {
    sysLines.push(`Voice samples (for rhythm, NOT a menu): ${character.catchphrases.join(' | ')}`)
  }
  if (typeof character.chattinessBase === 'number') {
    sysLines.push(`Chattiness: ${chattinessDescriptor(character.chattinessBase)}.`)
  }
  sysLines.push(
    '',
    'You just WON the pot. The user will describe how. Reply with ONE short line of in-character table talk (under 100 characters) reacting to the win — a quip, a reaction, a needle at an opponent, a quiet acknowledgement, whatever fits your voice and the situation.',
    'Rules:',
    '- Output ONLY the spoken line. No narration, no stage directions, no JSON, no markdown, no surrounding quotes.',
    '- You MAY reason inside <think>...</think> first if you want, but everything after </think> must be just the line.',
    '- Stay in character. Do not mention you are an AI.',
    '- A quiet/short character can output a single word or a small gesture like "(small nod)".',
  )

  const userLines = [`Pot won: ${context.amount?.toLocaleString?.() ?? context.amount}`]
  if (context.uncontested) {
    userLines.push("Everyone folded to you — you took it without showdown. Nobody saw your cards.")
  } else if (context.handDescr) {
    userLines.push(`You won at showdown with: ${context.handDescr}.`)
    if (context.holeCards?.length) userLines.push(`Your hole cards: ${context.holeCards.join(' ')}`)
    if (context.communityCards?.length) userLines.push(`Board: ${context.communityCards.join(' ')}`)
  } else {
    userLines.push('You won at showdown.')
  }
  if (context.opponents?.length) {
    userLines.push(`Other players still in the hand at the end: ${context.opponents.join(', ')}`)
  }
  userLines.push('', 'Your line:')

  return [
    { role: 'system', content: sysLines.join('\n') },
    { role: 'user', content: userLines.join('\n') },
  ]
}

function cleanQuip(raw) {
  if (!raw) return null
  // Strip <think>...</think> blocks the model may emit (we don't show reasoning here).
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Some models forget the closing tag — drop everything up to the last </think> if present.
  const lastClose = text.lastIndexOf('</think>')
  if (lastClose >= 0) text = text.slice(lastClose + '</think>'.length).trim()
  // First non-empty line only.
  text = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  // Strip wrapping quotes / smart quotes the model loves to add.
  text = text.replace(/^[`'"‘’“”«»]+/, '')
             .replace(/[`'"‘’“”«»]+$/, '')
             .trim()
  if (!text) return null
  if (text.length > 140) text = text.slice(0, 137).trimEnd() + '…'
  return text
}

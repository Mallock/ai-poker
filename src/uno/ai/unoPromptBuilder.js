import { chattinessDescriptor } from '../../ai/characters.js'
import { cardLabel } from '../engine/cards.js'
import { describeUnoHand } from './unoHandStrength.js'

// Build the chat-completion messages array for one Uno turn. Mirrors the poker prompt
// builder's `buildPrompt` shape so the rest of the driver code can reuse parsing helpers.
export function buildUnoPrompt({ view, character }) {
  return [
    { role: 'system', content: buildUnoSystemMessage(character) },
    { role: 'user', content: buildUnoUserMessage(view) },
  ]
}

// Cache-stable for the entire match. Contains persona, rules, strategy, and the JSON
// output schema. Nothing about the current table state belongs here.
export function buildUnoSystemMessage(character) {
  const lines = []
  lines.push(buildUnoStrategy())
  lines.push(buildPersonaBlock(character))
  lines.push(buildOutputSchema())
  return lines.join('\n\n')
}

function buildUnoStrategy() {
  return `You are a real Uno player at a friendly but competitive table. You think about SHEDDING TACTICS, COLOR CONTROL, OPPONENT HAND SIZES, and the strategic timing of Wild Draw 4. Every turn you either play a card or draw — the goal is to empty your hand while disrupting opponents.

=== UNO RULES (REFRESH) ===

- 108-card deck: 4 colors (red, yellow, green, blue) × {one 0, two each 1–9, two Skip, two Reverse, two Draw 2} plus 4 Wild and 4 Wild Draw 4.
- Each player starts with 7 cards. Play matches the top of the discard pile by COLOR, by VALUE, or by playing a Wild / Wild Draw 4 (which let you choose the new color).
- Skip: next player loses their turn. Reverse: direction flips (in 2-player it acts as a Skip). Draw 2: next player draws 2 and is skipped. Wild Draw 4: next player either draws 4 and is skipped, or challenges; on a successful challenge the player who played the WD4 draws 4 instead, on a failed challenge the challenger draws 6.
- You may only legally play Wild Draw 4 if you have no matching color card. (The engine still lets you, but the opponent can challenge.)
- If you cannot play, draw 1 card. If it is playable you may play it immediately or pass; if not, your turn ends.
- You MUST declare "UNO" the same turn you go from 2 cards down to 1. If you forget and another seat catches you, you draw 2.
- Round ends when any player plays their last card. Round winner scores all opponents' remaining card values: numerics by face, action cards 20 each, Wild / Wild Draw 4 50 each.
- Match is best-of-N (configurable). Highest cumulative score wins. Ties go to a sudden-death round.

=== UNO STRATEGY FUNDAMENTALS ===

1. **Shed high-value cards first.** Wild and Wild Draw 4 are 50 points each if you get caught holding them at round end. Action cards are 20. Numerics are 0–9. When your hand size is healthy, dump high-value playable numerics and action cards; save 0s and low numerics for when you're stuck.

2. **Hoard Wild Draw 4 for impact, not for stuckness.** A Wild Draw 4 played to "dump it" because you're losing is fine. A Wild Draw 4 played at the seat who just called UNO is devastating. The best time to play it is against a low-hand opponent — they have to draw 4 they don't want, in a color you choose.

3. **Track opponent hand sizes.** The seat with 1 card is the threat. The seat with 8 cards is the dump target. Skip / Reverse / Draw 2 / WD4 are weapons against low-hand opponents — use them to slow the seat about to win.

4. **Color control.** When you play a Wild, pick the color you have the MOST of in remaining hand (so your next play is easier). Exception: when an opponent is at 1–2 cards and you can see they avoided certain colors, switch AWAY from the color they probably hold.

5. **Hold a re-roll.** A spare Wild in hand is a "get out of jail free" card — keeps you from being forced to draw when the table runs cold for your colors. Don't play Wilds the moment you can; play them when you genuinely need a color switch or to dump value.

6. **Don't call UNO too early.** Calling UNO on the turn that takes you to 1 card is the rule. Calling before then signals nothing. Pay attention to whether OTHER seats are at 1 card and forget to call — catching a missed UNO is +2 cards of damage.

7. **Direction matters.** Reverse changes who acts next, which can swing the round. In a 4-player game, playing Reverse when the opponent to your left is at 1 card is a defensive masterstroke. In 2-player, Reverse is just a Skip — treat it as such.

8. **Trust the engine's "playable" list.** Your prompt includes a list of legal plays computed from the current state. If a card isn't listed, it's NOT playable — don't try to play it. If you have no playable card, draw.`
}

function buildPersonaBlock(character) {
  const archetypeLabel = character?.archetype ? `, "${character.archetype}"` : ''
  const lines = []
  lines.push(`=== HOW YOUR CHARACTER FITS IN ===

You play under a specific character (defined below). The character's playStyle.uno is your DEFAULT FREQUENCY DIAL — it shapes your tendencies (chatty vs silent, cautious vs aggressive, generous with WD4s vs hoarding them). Voice and catchphrases shape your "say" line, NOT your action. The fundamentals above always override flavor.

=== YOUR CHARACTER ===

Name: ${character?.name ?? '(unknown)'}${archetypeLabel}`)

  if (character?.personality) lines.push(`Personality: ${character.personality}`)
  if (character?.backstory) lines.push(`Backstory: ${character.backstory}`)
  const playStyle = character?.playStyle?.uno
  if (playStyle) lines.push(`Play style (default frequency dial): ${playStyle}`)
  if (character?.voice) lines.push(`Voice (shapes your "say" line, NOT your action): ${character.voice}`)
  if (character?.tells) lines.push(`Your tells (keep in mind, never reveal): ${character.tells}`)
  if (character?.tiltProfile) lines.push(`How you react to losing: ${character.tiltProfile}`)
  if (character?.rivalries) lines.push(`Relationships at the table: ${character.rivalries}`)
  if (character?.catchphrases?.length) {
    lines.push(`Voice samples for rhythm (NOT a menu of lines to use verbatim): ${character.catchphrases.join(' | ')}`)
  }
  if (typeof character?.chattinessBase === 'number') {
    lines.push(`Chattiness: ${character.chattinessBase} — ${chattinessDescriptor(character.chattinessBase)}.`)
  }
  return lines.join('\n\n')
}

function buildOutputSchema() {
  return `=== OUTPUT FORMAT ===

You will be given the current Uno table state. Decide ONE action.

- You MAY reason inside <think>...</think> before answering. Inside <think>, name what's playable, what your priorities are this turn, and what you choose. Then output the JSON.
- After </think> (or with no <think> block at all), output EXACTLY one JSON object — nothing else, no markdown fences, no commentary:

{
  "action": "play" | "draw" | "pass" | "challenge" | "accept" | "chooseStartingColor",
  "cardIndex": <number, required when action === "play">,
  "wildColor": "red" | "yellow" | "green" | "blue",  // required when playing a Wild or Wild Draw 4, also for chooseStartingColor
  "color":     "red" | "yellow" | "green" | "blue",  // alias accepted for chooseStartingColor
  "callUno":   true | false,                          // include true if this play takes you to 1 card
  "say":       "<short in-voice line>" | null         // table talk; null is fine
}

Rules:
- Only choose an action from the LEGAL ACTIONS list provided in the input.
- For "play", the cardIndex MUST be an index that appears in legalActions.plays.
- For Wild plays, you MUST include "wildColor".
- For "challenge" / "accept", these are only legal when the previous play was a Wild Draw 4 against you.
- "draw" is only legal when no playable card exists.
- "pass" is only legal after you drew this turn.

=== TABLE TALK ("say" field) ===

The table is live chat. The TABLE CHAT block (when present) is what's been said. Use "say" to react in character.

- React to specific lines when relevant, or set "say": null when silence fits.
- Never reveal your hand, your color plans, or whether you're about to play a Wild Draw 4.
- Stay in character. Never mention being an AI, a model, or a prompt.
- Under 100 characters. One short line. Set "say": null when in doubt.`
}

// Per-turn user message. Carries all state that changes turn-to-turn — keep it OUT of the
// system message to preserve prompt-cache hits across a long match.
export function buildUnoUserMessage(view) {
  if (!view) return ''
  const lines = []
  lines.push('=== TABLE STATE ===')
  lines.push(`Round ${view.roundNumber} of ${view.totalRounds}.`)
  lines.push(`Direction of play: ${view.direction === 1 ? 'clockwise (→)' : 'counter-clockwise (←)'}.`)
  const top = view.discardTop
  if (top) {
    lines.push(`Discard top: ${cardLabel(top)}${top.value === 'wild' || top.value === 'wild_draw4' ? ` — chosen color: ${view.activeColor ?? '(not yet chosen)'}` : ''}.`)
  } else {
    lines.push('Discard top: (none)')
  }
  lines.push(`Active color: ${view.activeColor ?? '(not yet chosen)'}.`)
  lines.push(`Draw pile: ${view.drawPileSize} cards remaining.`)
  lines.push('')

  lines.push('=== YOUR HAND ===')
  lines.push(`You are ${view.self.name} in seat ${view.self.seatIndex}.`)
  view.self.hand.forEach((c, i) => {
    lines.push(`  [${i}] ${cardLabel(c)}`)
  })
  lines.push('')
  lines.push(`Quick read: ${describeUnoHand(view)}`)
  lines.push('')

  lines.push('=== OPPONENTS (seat order) ===')
  for (const opp of view.opponents) {
    lines.push(`  - ${opp.name} (seat ${opp.seatIndex})${opp.isHuman ? ' [HUMAN]' : ''}: ${opp.handSize} card(s)`)
  }
  lines.push('')

  if (view.pendingWildDraw4Challenge && view.pendingWildDraw4Challenge.victimSeatIndex === view.viewerSeatIndex) {
    const p = view.pendingWildDraw4Challenge
    lines.push('=== WILD DRAW 4 LANDED ON YOU ===')
    lines.push(`Seat ${p.playerSeatIndex} just played a Wild Draw 4 on you. You may "challenge" or "accept" (accept = draw 4 and be skipped). Previous color was ${p.previousColor}.`)
    lines.push('')
  }

  if (view.pendingUnoCatch && view.pendingUnoCatch.seatIndex !== view.viewerSeatIndex) {
    lines.push('=== MISSED-UNO WINDOW OPEN ===')
    lines.push(`Seat ${view.pendingUnoCatch.seatIndex} just dropped to 1 card without calling UNO. You may include action "catchMissedUno" out of turn to penalize them.`)
    lines.push('')
  }

  if (view.recentActions?.length) {
    lines.push('=== RECENT ACTIONS (last events, oldest first) ===')
    for (const a of view.recentActions) {
      lines.push(`  - ${describeRecentAction(a)}`)
    }
    lines.push('')
  }

  lines.push('=== YOUR LEGAL ACTIONS ===')
  const la = view.legalActions
  if (la.mustChooseStartingColor) {
    lines.push('You must choose the starting color (round opener was a Wild). Respond with action "chooseStartingColor" and a "color".')
  } else if (la.canChallenge || la.canAccept) {
    lines.push('You face a Wild Draw 4. Respond with action "challenge" OR action "accept".')
  } else if (la.plays.length > 0) {
    const playable = la.plays.map((p) => `[${p.cardIndex}]${p.requiresWildColor ? ' (Wild — needs wildColor)' : ''}`).join(', ')
    lines.push(`Playable card indices: ${playable}.`)
    if (la.canPass) lines.push('You just drew. You may play the drawn card or "pass".')
    if (la.canCallUno) lines.push('NOTE: any play here takes you to 1 card — include "callUno": true.')
  } else if (la.canDraw) {
    lines.push('No playable card. Respond with action "draw".')
  } else if (la.canPass) {
    lines.push('You just drew an unplayable card. Respond with action "pass".')
  }
  lines.push('')
  lines.push('Respond with ONE JSON object as specified.')
  return lines.join('\n')
}

function describeRecentAction(a) {
  switch (a.type) {
    case 'play':
      return `Seat ${a.seatIndex} played ${cardLabel(a.card)}${a.chosenColor ? ` (chose ${a.chosenColor})` : ''}`
    case 'draw':
      return `Seat ${a.seatIndex} drew ${a.count}`
    case 'draw2':
      return `Seat ${a.seatIndex} played Draw 2 — seat ${a.victimSeatIndex} drew ${a.drew} and was skipped`
    case 'skip':
      return `Seat ${a.seatIndex} skipped the next player`
    case 'reverse':
      return `Seat ${a.seatIndex} reversed — direction now ${a.direction === 1 ? 'clockwise' : 'counter-clockwise'}`
    case 'uno_called':
      return `Seat ${a.seatIndex} called UNO`
    case 'uno_caught':
      return `Seat ${a.catcherSeatIndex} caught seat ${a.missedSeatIndex} on a missed UNO (penalty ${a.drew})`
    case 'wd4_accepted':
      return `Seat ${a.seatIndex} accepted the Wild Draw 4 (drew ${a.drew}, skipped)`
    case 'challenge_success':
      return `Seat ${a.challengerSeatIndex} successfully challenged seat ${a.playerSeatIndex}'s Wild Draw 4`
    case 'challenge_failed':
      return `Seat ${a.challengerSeatIndex} failed a Wild Draw 4 challenge`
    case 'choose_starting_color':
      return `Seat ${a.seatIndex} chose starting color ${a.color}`
    default:
      return JSON.stringify(a)
  }
}

// Parse JSON output from the model. Returns the parsed object or throws.
export function parseUnoActionJson(raw) {
  const trimmed = (raw || '').trim()
  const unfenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON object found in reply')
  const slice = unfenced.slice(start, end + 1)
  const obj = JSON.parse(slice)
  if (!obj || typeof obj !== 'object') throw new Error('Reply JSON is not an object')
  // Normalize chooseStartingColor's color alias.
  if (obj.action === 'chooseStartingColor' && !obj.color && obj.wildColor) obj.color = obj.wildColor
  if (typeof obj.callUno !== 'boolean') obj.callUno = !!obj.callUno
  if (obj.say != null && typeof obj.say !== 'string') obj.say = null
  return obj
}

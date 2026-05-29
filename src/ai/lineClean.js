// Shared cleaner for one-line LLM table talk (both in-hand table talk and hand-end victory
// quips). Models wrap lines in <think> reasoning, smart quotes, stage directions, and extra
// newlines; this strips all of that down to a single spoken line.
//
// Returns the cleaned line, or null if nothing usable remains.
// Bare reasoning-channel keywords that leak as their own line when a model's harmony/channel
// tokens are stripped (e.g. "<|channel>think" → "think"). Never a real spoken line.
const CHANNEL_WORDS = new Set(['think', 'analysis', 'final', 'commentary', 'assistant', 'channel'])

export function cleanLine(raw, { maxLen = 140 } = {}) {
  if (!raw) return null
  let text = String(raw)
  // Harmony/channel format (some reasoning models, e.g. via LM Studio templates): the spoken
  // answer is whatever follows the LAST <|message|>. Take that so we don't glue "final" etc.
  // onto the line.
  const lastMsg = text.lastIndexOf('<|message|>')
  if (lastMsg >= 0) text = text.slice(lastMsg + '<|message|>'.length)
  // Strip well-formed <think>...</think> blocks (we never speak reasoning).
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  // Some models forget the closing tag — drop everything up to the last </think> if present.
  const lastClose = text.lastIndexOf('</think>')
  if (lastClose >= 0) text = text.slice(lastClose + '</think>'.length)
  // Strip any remaining control tokens like <|channel|>, <|channel>, <|end|>, <|return|>.
  text = text.replace(/<\|[^|>]*\|?>/g, ' ')
  // First non-empty line that isn't a bare reasoning-channel keyword.
  text = text.split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !CHANNEL_WORDS.has(l.toLowerCase())) ?? ''
  // Strip wrapping quotes / smart quotes the model loves to add.
  text = text.replace(/^[`'"‘’“”«»]+/, '')
             .replace(/[`'"‘’“”«»]+$/, '')
             .trim()
  if (!text) return null
  if (text.length > maxLen) text = text.slice(0, maxLen - 3).trimEnd() + '…'
  return text
}

// Normalize a spoken line for repetition comparison: lowercase, strip punctuation/quotes,
// collapse whitespace. Two lines that normalize to the same string are treated as repeats.
export function normalizeLine(text) {
  if (typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// True if `line` duplicates or trivially paraphrases any entry in `recentLines`.
// Catches exact normalized matches and the common "one is a prefix/substring of the other"
// paraphrase (e.g. "Call." vs "I'll call.").
export function isNearDuplicate(line, recentLines = []) {
  const norm = normalizeLine(line)
  if (!norm) return false
  for (const prev of recentLines) {
    const p = normalizeLine(prev)
    if (!p) continue
    if (p === norm) return true
    // Substring containment only counts when the shorter side is non-trivial (≥3 words),
    // so a stock short interjection ("call") doesn't nuke every line that contains it.
    const shorter = norm.length <= p.length ? norm : p
    const longer = shorter === norm ? p : norm
    if (shorter.split(' ').length >= 3 && longer.includes(shorter)) return true
  }
  return false
}
